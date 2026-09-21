"""The API's actual behaviour, with no web framework in sight.

Every route is a thin wrapper over a function here. The reason is testability:
these functions are called directly by the unit and integration suites, which
therefore run whether or not FastAPI is installed — and FastAPI is an optional
dependency, because the deterministic chain does not need it and a deployment
that cannot import it must still be able to run the training commands.

The service object holds the pipeline, the registry and the feedback store, and
is constructed once per process. It is deliberately not a global: the tests
build their own with a fixed configuration, which is the only way to test the
shadow, canary and production modes without mutating the environment.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..core.capability import capability_report
from ..core.config import Settings, settings as global_settings
from ..core.errors import MLServiceError, Unauthorized
from ..core.timeutil import iso, now as utc_now
from ..core.versions import version_block
from ..explanation.shap_explainer import SHAP_CAVEAT
from ..inference.pipeline import InferencePipeline
from ..knowledge.loader import knowledge
from ..labels.events import MaintenanceFeedback
from ..models.temporal.runtime import TemporalRuntime
from ..models.trees.ensemble import TreeEnsemble
from ..registry.registry import ModelRegistry
from ..schemas.telemetry import BatchInferenceRequest, InferenceRequest


@dataclass
class FeedbackStore:
    """Engineer feedback, held until it is reviewed into a dataset.

    Deliberately a queue and not a training input. DOC-06's continuous learning
    loop runs through a *versioned dataset* and an approval; feedback that
    trained a model the moment it was submitted would let whoever clicks most
    steer the system.
    """

    directory: Path
    records: list[dict[str, Any]] = field(default_factory=list)

    def add(self, feedback: MaintenanceFeedback) -> dict[str, Any]:
        record = {
            "feedback_id": feedback.feedback_id,
            "prediction_id": feedback.prediction_id,
            "machine_id": feedback.machine_id,
            "submitted_at": iso(feedback.submitted_at),
            "submitted_by": feedback.submitted_by,
            "diagnosis_correct": feedback.diagnosis_correct,
            "actual_fault_id": feedback.actual_fault_id,
            "actual_location": feedback.actual_location,
            "actual_root_cause": feedback.actual_root_cause,
            "action_taken": feedback.action_taken,
            "post_action_result": feedback.post_action_result,
            "primary_anomaly_cleared": feedback.primary_anomaly_cleared,
            "false_positive": feedback.false_positive,
            "false_negative": feedback.false_negative,
            "confirmation_source": feedback.confirmation_source,
            "label_quality": feedback.label_quality,
            "notes": feedback.notes,
            "review_status": "PENDING_REVIEW",
        }
        self.records.append(record)
        self._persist()
        return record

    def _persist(self) -> None:
        import json

        self.directory.mkdir(parents=True, exist_ok=True)
        (self.directory / "feedback.json").write_text(
            json.dumps(self.records, indent=2), encoding="utf-8"
        )

    def pending(self) -> list[dict[str, Any]]:
        return [row for row in self.records if row["review_status"] == "PENDING_REVIEW"]


class MLService:
    """Everything the API routes need, in one object."""

    def __init__(self, config: Settings | None = None) -> None:
        self.settings = config or global_settings()
        self.registry = ModelRegistry(self.settings.registry_dir)
        self.feedback = FeedbackStore(self.settings.artifacts_dir / "feedback")
        self.pipeline = InferencePipeline(
            config=self.settings,
            temporal=self._load_temporal(),
            ensemble=self._load_champion(),
        )
        self._counters: dict[str, int] = {}
        self._latencies: list[float] = []

    # -- model loading ------------------------------------------------------

    def _load_champion(self) -> TreeEnsemble:
        entry = self.registry.champion("LIGHTGBM") or self.registry.champion("XGBOOST")
        if entry is None:
            return TreeEnsemble.unavailable(
                "lightgbm",
                "No champion model has been promoted. The deterministic chain answers alone.",
            )
        ensemble = TreeEnsemble.load(Path(entry.artifact_path))
        return ensemble

    def _load_temporal(self) -> TemporalRuntime:
        entry = self.registry.champion("TEMPORAL_LSTM")
        if entry is None:
            return TemporalRuntime.unavailable("No temporal model has been promoted.")
        return TemporalRuntime.load(Path(entry.artifact_path))

    def reload_models(self) -> dict[str, Any]:
        """Pick up a newly promoted model without a restart."""
        self.pipeline.ensemble = self._load_champion()
        self.pipeline.temporal = self._load_temporal()
        return self.describe_models()

    # -- routes -------------------------------------------------------------

    def health(self) -> dict[str, Any]:
        """Liveness plus an honest account of what is and is not working."""
        book_ok = True
        book: dict[str, Any] = {}
        try:
            book = knowledge().describe()
        except MLServiceError as error:
            book_ok = False
            book = error.payload()

        return {
            "status": "ok" if book_ok else "degraded",
            "at": iso(utc_now()),
            "mode": self.settings.ml_mode,
            "publishes_alerts": self.settings.publishes_alerts,
            "knowledge": book,
            "models": self.describe_models(),
            "capabilities": capability_report(),
            "versions": version_block(),
            "counters": dict(self._counters),
            "latency_ms": self._latency_summary(),
        }

    def describe_models(self) -> dict[str, Any]:
        return {
            "champion": self.pipeline.ensemble.describe(),
            "temporal": self.pipeline.temporal.describe(),
            "registered": self.registry.describe(),
        }

    def champion(self) -> dict[str, Any]:
        entry = self.registry.champion("LIGHTGBM") or self.registry.champion("XGBOOST")
        if entry is None:
            return {
                "champion": None,
                "reason": (
                    "No model has been promoted. Every finding comes from the deterministic "
                    "rules, which is the correct state before confirmed fault history exists."
                ),
            }
        return {
            "champion": {
                "model_id": entry.model_id,
                "version": entry.version,
                "kind": entry.model_kind,
                "promoted_at": entry.promoted_at,
                "approved_by": entry.approved_by,
                "trained_on_real_data": entry.trained_on_real_data,
                "test_metrics": entry.test_metrics,
                "golden_results": entry.golden_results,
            }
        }

    def infer(self, request: InferenceRequest) -> dict[str, Any]:
        self._count("inference")
        if not self.pipeline.should_run(request.frame, force=request.force):
            self.pipeline.ingest_only(request.frame)
            latest = self.pipeline.latest(request.frame.machine_id)
            self._count("inference_skipped_cadence")
            if latest is not None:
                return latest.model_dump(mode="json")
        response = self.pipeline.process(request.frame, explain=request.explain)
        if response.ml.inference_latency_ms is not None:
            self._latencies.append(response.ml.inference_latency_ms)
            del self._latencies[:-1000]
        return response.model_dump(mode="json")

    def infer_batch(self, request: BatchInferenceRequest) -> dict[str, Any]:
        responses = []
        for index, frame in enumerate(request.frames):
            if index % max(1, request.emit_every) != 0:
                self.pipeline.ingest_only(frame)
                continue
            response = self.pipeline.process(frame, explain=request.explain)
            responses.append(response.model_dump(mode="json"))
        self._count("inference_batch")
        return {"count": len(responses), "responses": responses}

    def diagnosis(self, machine_id: str) -> dict[str, Any]:
        latest = self.pipeline.latest(machine_id)
        if latest is None:
            return {
                "machine_id": machine_id,
                "diagnosis": None,
                "reason": "No telemetry has been processed for this machine yet.",
            }
        return latest.model_dump(mode="json")

    def diagnosis_history(self, machine_id: str, limit: int = 50) -> dict[str, Any]:
        history = self.pipeline.history(machine_id, limit=limit)
        return {
            "machine_id": machine_id,
            "count": len(history),
            "history": [response.model_dump(mode="json") for response in history],
        }

    def prognosis(self, machine_id: str) -> dict[str, Any]:
        """Risk per fault per horizon, separated from the current condition.

        A separate route rather than a field on the diagnosis, because the
        Analyzer renders them in different places and must never let a reader
        mistake a predictive risk for a present alarm.
        """
        latest = self.pipeline.latest(machine_id)
        if latest is None:
            return {"machine_id": machine_id, "prognosis": [], "reason": "No telemetry processed."}

        return {
            "machine_id": machine_id,
            "timestamp": iso(latest.timestamp),
            "ml": latest.ml.model_dump(mode="json"),
            "current_condition": latest.current_condition.model_dump(mode="json"),
            "prognosis": [
                {
                    "fault_id": entry.fault_id,
                    "diagnosis": entry.diagnosis,
                    "diagnosis_state": entry.diagnosis_state,
                    "horizons": [horizon.model_dump(mode="json") for horizon in entry.risk],
                    "trend": entry.progression,
                    "surfaced": entry.surfaced,
                }
                for entry in latest.diagnoses
                if entry.risk
            ],
            "note": (
                "Predictive risk is not an alarm. A crossed risk with a NORMAL rule state "
                "means no approved limit has been reached."
            ),
        }

    def explanation(self, prediction_id: str) -> dict[str, Any]:
        stored = self.pipeline.explanation(prediction_id)
        if stored is None:
            return {
                "prediction_id": prediction_id,
                "available": False,
                "reason": (
                    "No stored explanation. Explanations are computed when a risk crosses a "
                    "threshold, when the diagnosis changes, or on request."
                ),
            }
        return {"prediction_id": prediction_id, "available": True, "caveat": SHAP_CAVEAT, **stored}

    def submit_feedback(self, payload: dict[str, Any]) -> dict[str, Any]:
        feedback = MaintenanceFeedback(
            feedback_id=payload.get("feedback_id") or str(uuid.uuid4()),
            prediction_id=str(payload.get("prediction_id", "")),
            machine_id=str(payload.get("machine_id", "")),
            submitted_at=utc_now(),
            submitted_by=payload.get("submitted_by"),
            diagnosis_correct=payload.get("diagnosis_correct", "UNKNOWN"),
            actual_fault_id=payload.get("actual_fault_id"),
            actual_location=payload.get("actual_location"),
            actual_root_cause=payload.get("actual_root_cause"),
            action_taken=payload.get("action_taken"),
            post_action_result=payload.get("post_action_result", "UNKNOWN"),
            primary_anomaly_cleared=payload.get("primary_anomaly_cleared", "UNKNOWN"),
            false_positive=bool(payload.get("false_positive", False)),
            false_negative=bool(payload.get("false_negative", False)),
            confirmation_source=payload.get("confirmation_source"),
            label_quality=payload.get("label_quality", "UNVERIFIED"),
            notes=str(payload.get("notes", "")),
        )
        record = self.feedback.add(feedback)
        self._count("feedback")
        return {
            "accepted": True,
            "feedback_id": record["feedback_id"],
            "review_status": record["review_status"],
            "note": (
                "Recorded for review. Feedback becomes training data only through a "
                "versioned dataset and an approved training run, never directly."
            ),
        }

    def metrics(self) -> dict[str, Any]:
        latest_by_machine = {
            machine_id: self.pipeline.latest(machine_id)
            for machine_id in self.pipeline._machines  # noqa: SLF001 - same package
        }
        return {
            "counters": dict(self._counters),
            "latency_ms": self._latency_summary(),
            "machines": {
                machine_id: {
                    "ml_status": response.ml.status,
                    "eligibility_reason": response.ml.eligibility_reason,
                    "data_quality": response.data_quality.overall,
                    "signals_reporting": response.data_quality.signals_reporting,
                    "bad_or_missing": response.data_quality.bad_or_missing_count,
                    "operating_state": response.context.operating_state,
                    "rule_state": response.current_condition.rule_state,
                    "condition": response.current_condition.verdict,
                    "diagnoses": len(response.diagnoses),
                }
                for machine_id, response in latest_by_machine.items()
                if response is not None
            },
        }

    # -- helpers ------------------------------------------------------------

    def _count(self, name: str) -> None:
        self._counters[name] = self._counters.get(name, 0) + 1

    def _latency_summary(self) -> dict[str, float | None]:
        if not self._latencies:
            return {"count": 0, "p50": None, "p95": None, "p99": None}
        ordered = sorted(self._latencies)

        def percentile(fraction: float) -> float:
            index = min(len(ordered) - 1, int(fraction * len(ordered)))
            return round(ordered[index], 2)

        return {
            "count": len(ordered),
            "p50": percentile(0.50),
            "p95": percentile(0.95),
            "p99": percentile(0.99),
        }


def require_internal_token(provided: str | None, config: Settings | None = None) -> None:
    """Guard the training and promotion routes.

    Fails closed: with no token configured the internal routes are refused
    outright rather than left open. An unauthenticated training endpoint is a
    way to burn a machine's worth of compute on somebody else's schedule, and
    an unauthenticated promotion endpoint is considerably worse.
    """
    settings_ = config or global_settings()
    expected = settings_.internal_api_token
    if not expected:
        raise Unauthorized(
            "ML_INTERNAL_TOKEN is not configured, so the internal routes are closed. "
            "Set it to enable training and promotion over HTTP."
        )
    if provided != expected:
        raise Unauthorized("A valid internal token is required for this route.")
