"""The online inference pipeline — telemetry in, diagnosis object out.

The whole chain, in order, with the gates between stages doing the work:

    validate -> quality -> state -> context -> window -> features
             -> baselines -> deterministic rules
             -> [eligibility gate]
             -> temporal inference -> residuals -> feature union
             -> champion classifier -> calibration
             -> persistence / hysteresis / cooldown
             -> DOC-04 resolution -> DOC-05 decision
             -> SHAP (only where it will be read)
             -> versioned response

The property that matters most: **everything before the eligibility gate runs
unconditionally, and everything after it may fail without taking the response
down.** A TensorFlow that will not import, a corrupt booster, an inference
timeout — each degrades the response to ``ML_STATUS = DEGRADED`` with a reason,
and the operator still gets the deterministic verdict, the anomalies, the
severity and the recommended action. That is the fallback requirement made
structural rather than promised.

Second property: the pipeline is stateful per machine, on purpose. Rolling
windows, filter state and the previous diagnosis are what make persistence,
hysteresis and "the diagnosis changed" possible at all, and a stateless
reimplementation of this is the single-frame pipeline the console already has.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Mapping, Sequence

from ..baseline.engine import BaselineSelector, BaselineStore
from ..context.engine import ContextEngine, ContextObject, context_changed
from ..core.config import Settings, settings as global_settings
from ..core.errors import MLStatus
from ..core.timeutil import iso, seconds_between
from ..core.versions import version_block
from ..decision.engine import DecisionEngine, DecisionResult
from ..diagnosis.resolver import DiagnosisResolver, ResolvedDiagnosis, ResolutionResult
from ..explanation.shap_explainer import Explanation, explain_output, should_explain
from ..features.engine import FeatureEngine, FeatureFrame, union_feature_ids
from ..features.registry import reset_registry_cache
from ..knowledge.loader import knowledge
from ..models.base import parse_output_key
from ..models.temporal.runtime import TemporalOutput, TemporalRuntime, UNAVAILABLE
from ..models.trees.ensemble import TreeEnsemble
from ..persistence.filters import DecisionFilter, FilterVerdict
from ..quality.engine import DataQualityEngine, FrameQuality
from ..rules.limits import LimitRegistry, RuleEngine, RuleResult
from ..schemas.diagnosis import (
    AnomalyReport,
    ContextBlock,
    CurrentCondition,
    DataQualityBlock,
    DataQualityIssue,
    DiagnosisEntry,
    DiagnosisResponse,
    Evidence,
    ConfidenceScore,
    ImpactBlock,
    MLBlock,
    ModelBlock,
    RecommendedAction,
    RiskHorizon,
    ShapContribution,
)
from ..schemas.telemetry import TelemetryFrame
from ..state.engine import OperatingStateEngine, StateRecord, StateTrends
from ..windows.store import SequenceWindow, WindowStore, build_window_store
from .eligibility import EligibilityResult, evaluate_eligibility, surfacing_decision


@dataclass
class MachineState:
    """What the pipeline remembers between frames, per machine."""

    last_inference_at: datetime | None = None
    last_context: ContextObject | None = None
    last_diagnosis_ids: tuple[str, ...] = ()
    last_response: DiagnosisResponse | None = None
    last_vector: list[float | None] = field(default_factory=list)
    """The feature union from the most recent inference.

    Exposed so the dataset builder can record exactly the vector that was
    served, rather than recomputing the chain and getting a subtly different
    one — the state engine is stateful, and running it twice over one frame
    advances its transition tracking a second time.
    """

    history: list[DiagnosisResponse] = field(default_factory=list)
    explanations: dict[str, dict[str, Any]] = field(default_factory=dict)

    def remember(self, response: DiagnosisResponse, limit: int = 240) -> None:
        self.last_response = response
        self.history.append(response)
        if len(self.history) > limit:
            del self.history[: len(self.history) - limit]


class InferencePipeline:
    """One instance per process. Holds every engine and the per-machine state."""

    def __init__(
        self,
        *,
        config: Settings | None = None,
        window_store: WindowStore | None = None,
        temporal: TemporalRuntime | None = None,
        ensemble: TreeEnsemble | None = None,
        baseline_store: BaselineStore | None = None,
        limit_registry: LimitRegistry | None = None,
        decision_filter: DecisionFilter | None = None,
    ) -> None:
        self.settings = config or global_settings()
        self.windows = window_store or build_window_store()
        self.quality_engine = DataQualityEngine()
        self.state_engine = OperatingStateEngine()
        self.context_engine = ContextEngine()
        self.baseline_store = baseline_store or BaselineStore()
        self.feature_engine = FeatureEngine(self.windows, BaselineSelector(self.baseline_store))
        self.rule_engine = RuleEngine(limit_registry or LimitRegistry())
        self.resolver = DiagnosisResolver()
        self.decision_engine = DecisionEngine()
        self.filter = decision_filter or DecisionFilter()
        self.temporal = temporal or TemporalRuntime.unavailable("No temporal model configured.")
        self.ensemble = ensemble or TreeEnsemble.unavailable(
            "lightgbm", "No champion classifier configured."
        )
        self._machines: dict[str, MachineState] = {}
        self._feature_ids = union_feature_ids()

    # -- public -------------------------------------------------------------

    def process(
        self, frame: TelemetryFrame, *, explain: bool = False, force: bool = False
    ) -> DiagnosisResponse:
        """Run the chain over one frame and return the versioned response."""
        started = time.perf_counter()
        machine = self._machines.setdefault(frame.machine_id, MachineState())

        # 1 — data quality, before anything reads a value.
        quality = self.quality_engine.evaluate(frame)

        # 2 — the window store. Only usable values are admitted; a BAD reading
        # is recorded as a gap so no statistic is ever computed over it.
        for tag in knowledge().known_tags():
            entry = quality.per_signal.get(tag)
            self.windows.append(
                frame.machine_id, tag, frame.timestamp, entry.usable_value if entry and entry.usable else None
            )

        # 3 — state and context. The state engine is given the trends it needs
        # to tell steady production from a ramp; without them a startup ramp
        # classifies as steady and the steady-state fault rules run through a
        # transient.
        state = self.state_engine.evaluate(frame, quality, self._state_trends(frame))
        context = self.context_engine.build(frame, state)

        if context_changed(machine.last_context, context):
            frozen = self.baseline_store.freeze_context(
                frame.machine_id,
                machine.last_context.comparison_id() if machine.last_context else "",
                f"Context moved to {context.comparison_id()} at {iso(frame.timestamp)}.",
            )
            if frozen:
                self.filter.reset(frame.machine_id)
        machine.last_context = context

        # 4 — features, against the selected baselines.
        limits = self.rule_engine.registry.boundaries()
        features = self.feature_engine.compute(frame, quality, state, context, limits=limits)

        # 5 — the deterministic layer. This is the answer that survives every
        # model failure below it.
        channel_limits = {
            tag: {
                "alert": reading.alert_active,
                "danger": reading.danger_active,
                "trip": reading.trip_active,
            }
            for tag, reading in frame.channels.items()
        }
        rules = self.rule_engine.evaluate(
            machine_id=frame.machine_id,
            features=features,
            quality=quality,
            state=state,
            context_confidence=context.confidence,
            commanded_change=frame.context.commanded_change,
            channel_limits=channel_limits,
        )

        # 6 — the eligibility gate.
        sequence = self._sequence_for(frame)
        eligibility = evaluate_eligibility(
            settings=self.settings,
            quality=quality,
            state=state,
            context_confidence=context.confidence,
            context_id=context.context_id,
            context_missing=tuple(context.missing),
            features=features,
            sequence=sequence,
            required_lookback_steps=self.temporal.lookback_steps,
            model_available=self.ensemble.available,
            model_reason=self.ensemble.reason,
            configuration_version=frame.configuration_version,
            model_configuration=None,
        )

        # 7 — the learned layer, every part of which may fail without a 500.
        degraded: list[str] = []
        temporal_output = UNAVAILABLE
        vector: list[float | None] = []
        risks: dict[str, FilterVerdict] = {}

        if eligibility.eligible:
            temporal_output = self._run_temporal(frame, quality, sequence)
            # A temporal model that was never configured is absent, not
            # degraded. DEGRADED means something that should work does not, and
            # applying it to an optional component nobody installed would make
            # every healthy deployment report itself unwell.
            if (
                not temporal_output.available
                and temporal_output.reason
                and self.temporal.contract is not None
            ):
                degraded.append(f"temporal: {temporal_output.reason}")

            vector = self._build_vector(features, temporal_output)
            risks = self._run_classifier(frame, vector, rules, eligible=True)
            if not self.ensemble.available and self.ensemble.reason:
                degraded.append(f"classifier: {self.ensemble.reason}")
        else:
            # An ineligible cycle still passes through the filter so an active
            # alert is held rather than silently dropped by a data gap.
            risks = self._run_classifier(frame, [], rules, eligible=False)

        # 8 — resolve through the knowledge, then decide.
        resolution = self.resolver.resolve(
            rules=rules, quality=quality, risks=risks, ml_eligible=eligibility.eligible
        )

        diagnosis_changed = tuple(entry.fault_id for entry in resolution.diagnoses) != machine.last_diagnosis_ids
        entries = self._build_entries(
            frame=frame,
            resolution=resolution,
            rules=rules,
            quality=quality,
            context=context,
            state=state,
            features=features,
            vector=vector,
            explain=explain,
            diagnosis_changed=diagnosis_changed,
            machine=machine,
        )
        machine.last_diagnosis_ids = tuple(entry.fault_id for entry in resolution.diagnoses)

        latency_ms = (time.perf_counter() - started) * 1000.0
        response = self._build_response(
            frame=frame,
            quality=quality,
            state=state,
            context=context,
            rules=rules,
            resolution=resolution,
            eligibility=eligibility,
            entries=entries,
            temporal_output=temporal_output,
            degraded=degraded,
            latency_ms=latency_ms,
            features=features,
        )
        machine.remember(response)
        machine.last_vector = vector or [None] * len(self._feature_ids)
        machine.last_inference_at = frame.timestamp
        return response

    def should_run(self, frame: TelemetryFrame, *, force: bool = False) -> bool:
        """Whether the cadence permits a model run for this frame.

        Telemetry may arrive at 10 Hz; running a tree ensemble and a recurrent
        network on every packet buys nothing on a process whose fault
        signatures develop over minutes. Windows are still updated on every
        frame regardless — the cadence governs inference, never ingestion.
        """
        if force:
            return True
        machine = self._machines.get(frame.machine_id)
        if machine is None or machine.last_inference_at is None:
            return True
        elapsed = seconds_between(machine.last_inference_at, frame.timestamp)
        return elapsed >= self.settings.inference_interval_seconds

    def ingest_only(self, frame: TelemetryFrame) -> None:
        """Update windows without running a model. The between-cadence path."""
        quality = self.quality_engine.evaluate(frame)
        for tag in knowledge().known_tags():
            entry = quality.per_signal.get(tag)
            self.windows.append(
                frame.machine_id, tag, frame.timestamp, entry.usable_value if entry and entry.usable else None
            )

    def last_vector(self, machine_id: str) -> list[float | None]:
        """The feature union from this machine's most recent inference."""
        machine = self._machines.get(machine_id)
        return list(machine.last_vector) if machine else []

    def feature_ids(self) -> tuple[str, ...]:
        return self._feature_ids

    def latest(self, machine_id: str) -> DiagnosisResponse | None:
        machine = self._machines.get(machine_id)
        return machine.last_response if machine else None

    def history(self, machine_id: str, limit: int = 50) -> list[DiagnosisResponse]:
        machine = self._machines.get(machine_id)
        return list(machine.history[-limit:]) if machine else []

    def explanation(self, prediction_id: str) -> dict[str, Any] | None:
        for machine in self._machines.values():
            if prediction_id in machine.explanations:
                return machine.explanations[prediction_id]
        return None

    def reset(self, machine_id: str | None = None) -> None:
        self.quality_engine.reset(machine_id)
        self.state_engine.reset(machine_id)
        self.windows.reset(machine_id)
        self.filter.reset(machine_id)
        if machine_id is None:
            self._machines.clear()
        else:
            self._machines.pop(machine_id, None)
        reset_registry_cache()
        self._feature_ids = union_feature_ids()

    def describe(self) -> dict[str, Any]:
        return {
            "mode": self.settings.ml_mode,
            "feature_count": len(self._feature_ids),
            "temporal": self.temporal.describe(),
            "classifier": self.ensemble.describe(),
            "machines_tracked": len(self._machines),
            "knowledge": knowledge().describe(),
            "versions": version_block(),
        }

    # -- stages -------------------------------------------------------------

    def _state_trends(self, frame: TelemetryFrame) -> StateTrends:
        """Feed, speed and pressure slopes over the trend window.

        Read straight from the window store rather than from the feature frame,
        because the state engine runs *before* features are computed — the
        features need the state to select a baseline.
        """
        from ..features import families

        def slope(tag: str) -> float | None:
            window = self.windows.window(frame.machine_id, tag, seconds=120, end=frame.timestamp)
            if not window.sufficient(min_samples=4):
                return None
            return families.slope_per_minute(window.values, window.timestamps)

        zone_slopes = [
            value
            for value in (slope(f"TS-TZ{index}") for index in range(1, 10))
            if value is not None
        ]
        return StateTrends(
            feed_slope_per_min=slope("TS-F1"),
            screw_slope_per_min=slope("TS-S1"),
            pressure_slope_per_min=slope("TS-P3"),
            zone_slope_deg_c_per_min=(
                sum(zone_slopes) / len(zone_slopes) if zone_slopes else None
            ),
        )

    def _sequence_for(self, frame: TelemetryFrame) -> SequenceWindow | None:
        if not self.temporal.available or not self.temporal.input_columns:
            return None
        lookback_seconds = self.temporal.contract.lookback_seconds if self.temporal.contract else 0
        if not lookback_seconds:
            return None
        return self.windows.sequence(
            frame.machine_id,
            list(self.temporal.input_columns),
            seconds=float(lookback_seconds),
            end=frame.timestamp,
            step_seconds=float(self.temporal.contract.step_seconds or 1.0),
        )

    def _run_temporal(
        self, frame: TelemetryFrame, quality: FrameQuality, sequence: SequenceWindow | None
    ) -> TemporalOutput:
        if sequence is None or not self.temporal.available:
            return TemporalOutput(
                available=False, reason=self.temporal.reason or "No temporal model is loaded."
            )
        actual = {
            channel: (
                quality.per_signal[channel].usable_value
                if channel in quality.per_signal and quality.per_signal[channel].usable
                else None
            )
            for channel in self.temporal.forecast_channels
        }
        return self.temporal.infer(list(sequence.rows), actual=actual)

    def _build_vector(
        self, features: FeatureFrame, temporal: TemporalOutput
    ) -> list[float | None]:
        """The feature union, in the fixed registry order.

        Residual and embedding columns are always present and are null when no
        temporal model ran. A vector whose width depends on which libraries
        imported is not a contract, and a tree indexing into it would be
        reading the wrong column.
        """
        residuals = temporal.residual_features()
        embedding = temporal.embedding_features()
        out: list[float | None] = []
        for feature_id in self._feature_ids:
            if feature_id.startswith("r."):
                out.append(residuals.get(feature_id))
            elif feature_id.startswith("e."):
                out.append(embedding.get(feature_id))
            else:
                out.append(features.value_of(feature_id))
        return out

    def _run_classifier(
        self,
        frame: TelemetryFrame,
        vector: Sequence[float | None],
        rules: RuleResult,
        *,
        eligible: bool,
    ) -> dict[str, FilterVerdict]:
        hard_limit = rules.danger_reached or rules.trip_active
        predictions = self.ensemble.predict(vector) if (eligible and vector) else []

        verdicts: dict[str, FilterVerdict] = {}
        for prediction in predictions:
            verdicts[prediction.output] = self.filter.apply(
                machine_id=frame.machine_id,
                key=prediction.output,
                probability=prediction.probability,
                at=frame.timestamp,
                eligible=eligible,
                hard_limit_active=hard_limit,
            )

        if not eligible:
            # Hold any output that was already active, so a data-quality gap
            # does not silently clear a confirmed alert.
            for key, state in self.filter.snapshot(frame.machine_id).items():
                if state.active and key not in verdicts:
                    verdicts[key] = self.filter.apply(
                        machine_id=frame.machine_id,
                        key=key,
                        probability=state.peak_probability,
                        at=frame.timestamp,
                        eligible=False,
                        hard_limit_active=hard_limit,
                    )
        return verdicts

    # -- assembly -----------------------------------------------------------

    def _build_entries(
        self,
        *,
        frame: TelemetryFrame,
        resolution: ResolutionResult,
        rules: RuleResult,
        quality: FrameQuality,
        context: ContextObject,
        state: StateRecord,
        features: FeatureFrame,
        vector: Sequence[float | None],
        explain: bool,
        diagnosis_changed: bool,
        machine: MachineState,
    ) -> list[DiagnosisEntry]:
        good_fraction = (
            sum(1 for entry in quality.per_signal.values() if entry.verdict == "GOOD")
            / max(1, quality.signals_expected)
        )
        baseline_confidence = _mean_baseline_confidence(features)

        entries: list[DiagnosisEntry] = []
        for resolved in resolution.diagnoses:
            decision = self.decision_engine.decide(
                diagnosis=resolved,
                rules=rules,
                data_quality_fraction=good_fraction,
                context_confidence=context.confidence,
                baseline_confidence=baseline_confidence,
                state_confidence=state.state_confidence,
                ml_eligible=bool(resolved.risk),
            )
            surfaced, _mode = surfacing_decision(self.settings, frame.machine_id, resolved.fault_id)
            explanation = self._maybe_explain(
                resolved=resolved,
                features=features,
                vector=vector,
                explain=explain,
                diagnosis_changed=diagnosis_changed,
                machine=machine,
                frame=frame,
            )
            entries.append(
                _to_entry(resolved, decision, explanation, surfaced=surfaced or resolved.source == "RULES")
            )
        return entries

    def _maybe_explain(
        self,
        *,
        resolved: ResolvedDiagnosis,
        features: FeatureFrame,
        vector: Sequence[float | None],
        explain: bool,
        diagnosis_changed: bool,
        machine: MachineState,
        frame: TelemetryFrame,
    ) -> Explanation | None:
        if not resolved.risk or not vector or not self.ensemble.available:
            return None
        horizon, verdict = max(resolved.risk.items(), key=lambda item: item[1].probability)
        if not should_explain(
            probability=verdict.probability,
            crossed=verdict.crossed,
            diagnosis_changed=diagnosis_changed,
            requested=explain,
            floor=self.settings.explanation_probability_floor,
        ):
            return None
        explanation = explain_output(
            self.ensemble, features, self._feature_ids, vector, verdict.key
        )
        if explanation.available:
            machine.explanations[f"{resolved.fault_id}@{horizon}"] = {
                "fault_id": resolved.fault_id,
                "horizon_minutes": horizon,
                "probability": verdict.probability,
                "timestamp": iso(frame.timestamp),
                "contributions": [
                    {
                        "feature": entry.feature_id,
                        "feature_name": entry.feature_name,
                        "value": entry.value,
                        "unit": entry.unit,
                        "shap": entry.shap,
                    }
                    for entry in explanation.all_contributions()
                ],
                "base_value": explanation.base_value,
            }
        return explanation

    def _build_response(
        self,
        *,
        frame: TelemetryFrame,
        quality: FrameQuality,
        state: StateRecord,
        context: ContextObject,
        rules: RuleResult,
        resolution: ResolutionResult,
        eligibility: EligibilityResult,
        entries: list[DiagnosisEntry],
        temporal_output: TemporalOutput,
        degraded: list[str],
        latency_ms: float,
        features: FeatureFrame,
    ) -> DiagnosisResponse:
        book = knowledge()
        status = (
            MLStatus.DISABLED
            if self.settings.ml_mode == "disabled"
            else MLStatus.DEGRADED
            if degraded
            else MLStatus.OK
            if eligibility.eligible
            else MLStatus.INELIGIBLE
        )

        notes = list(eligibility.warnings)
        notes.append(resolution.condition_reason)
        for pattern_id, missing in resolution.unevaluable_patterns:
            pattern = book.pattern(pattern_id)
            notes.append(
                f"Pattern {pattern_id} ({pattern.name if pattern else 'unnamed'}) cannot be "
                f"evaluated: {', '.join(missing)} not reporting."
            )
        if frame.data_source != "REAL":
            notes.append(f"This frame is marked {frame.data_source}, not real plant data.")

        return DiagnosisResponse(
            machine_id=frame.machine_id,
            timestamp=frame.timestamp,
            prediction_id=str(uuid.uuid4()),
            data_quality=DataQualityBlock(
                overall=quality.overall,
                issues=[
                    DataQualityIssue(
                        signal_id=entry.signal_id,
                        rule_id=finding.rule_id,
                        check=finding.check,
                        verdict=finding.verdict,
                        reason=finding.reason,
                        downstream_rule=finding.downstream_rule,
                        suppresses_physical_diagnosis=entry.suppresses_physical_diagnosis,
                    )
                    for entry in quality.per_signal.values()
                    for finding in entry.findings
                ],
                signals_reporting=quality.signals_reporting,
                signals_expected=quality.signals_expected,
                bad_or_missing_count=len(quality.bad_or_missing),
                mandatory_unavailable=list(quality.mandatory_unavailable),
            ),
            ml=MLBlock(
                eligible=eligibility.eligible,
                status=status.value,
                eligibility_reason=eligibility.reason_value,
                reason_detail=eligibility.detail,
                mode=self.settings.ml_mode,
                surfaced=self.settings.publishes_alerts,
                degraded_components=degraded,
                inference_latency_ms=round(latency_ms, 2),
            ),
            context=ContextBlock(
                operating_state=state.operating_state,
                operating_state_name=state.state_name,
                state_confidence=state.state_confidence,
                state_source=state.state_source,
                time_in_state_seconds=state.time_in_state_seconds,
                state_transition=state.transition_type,
                context_id=context.context_id,
                context_confidence=context.confidence,
                context_missing=list(context.missing),
                recipe_id=context.recipe_id,
                material_id=context.material_id,
                configuration_version=context.configuration_version,
                baseline_id=_first_baseline_id(features),
                baseline_level=_dominant_baseline_level(features),
                baseline_confidence=_baseline_confidence_band(features),
            ),
            current_condition=CurrentCondition(
                verdict=resolution.condition_verdict,
                rule_state=rules.severity,
                rule_state_reason=rules.severity_reason,
                customer_alert_reached=rules.alert_reached,
                customer_danger_reached=rules.danger_reached,
                trip_active=rules.trip_active,
                active_anomaly_count=len(rules.anomalies),
            ),
            anomalies=[
                AnomalyReport(
                    signal_id=entry.signal_id,
                    label=entry.label,
                    anomaly_id=entry.anomaly_id,
                    verdict=entry.verdict,
                    blocked_at_gate=entry.blocked_at_gate,
                    reason=entry.reason,
                    value=entry.value,
                    unit=entry.unit,
                    expected=entry.expected,
                    absolute_deviation=entry.absolute_deviation,
                    percent_deviation=entry.percent_deviation,
                    robust_score=entry.robust_score,
                    trend=entry.trend,  # type: ignore[arg-type]
                    rate_of_change_per_min=entry.rate_of_change,
                    persistence_seconds=entry.persistence_seconds,
                    limit_status=entry.limit_status,
                    data_quality=entry.data_quality,  # type: ignore[arg-type]
                )
                for entry in rules.verdicts
                if entry.verdict not in {"NOT_EVALUATED", "NOT_ANOMALOUS"}
            ],
            diagnoses=entries,
            models=ModelBlock(
                temporal_model=self.temporal.model_id,
                diagnosis_model=self.ensemble.model_id,
                calibrator=("fitted" if self.ensemble.available else None),
                champion=self.ensemble.library.upper() if self.ensemble.available else None,
                feature_set_version=version_block()["feature_set"],
                trained_on_dataset=(
                    self.ensemble.contract.trained_on_dataset if self.ensemble.contract else None
                ),
                trained_on_real_data=bool(
                    self.ensemble.contract and self.ensemble.contract.trained_on_real_data
                ),
            ),
            versions=version_block(),
            commissioning_notice=book.commissioning_notice or None,
            uses_uncalibrated_limits=not book.field_calibrated,
            notes=[note for note in notes if note],
        )


# -- helpers ---------------------------------------------------------------


def _to_entry(
    resolved: ResolvedDiagnosis,
    decision: DecisionResult,
    explanation: Explanation | None,
    *,
    surfaced: bool,
) -> DiagnosisEntry:
    return DiagnosisEntry(
        fault_id=resolved.fault_id,
        diagnosis=resolved.name,
        fault_family=resolved.family,
        diagnosis_state=resolved.diagnosis_state,
        what=resolved.what,
        where=resolved.where,
        why=resolved.why,
        mechanism=resolved.mechanism,
        risk=[
            RiskHorizon(
                horizon_minutes=horizon,
                probability=verdict.probability,
                calibrated=True,
                threshold=verdict.threshold,
                raise_threshold=verdict.raise_threshold,
                clear_threshold=verdict.clear_threshold,
                persistence_met=verdict.persistence_met,
                consecutive_eligible_cycles=verdict.consecutive_eligible_cycles,
                crossed=verdict.crossed,
            )
            for horizon, verdict in sorted(resolved.risk.items())
        ],
        fault_confidence=ConfidenceScore(
            score=decision.fault_confidence.score,
            level=decision.fault_confidence.level,
            basis=decision.fault_confidence.basis,
        ),
        location_confidence=ConfidenceScore(
            score=decision.location_confidence.score,
            level=decision.location_confidence.level,
            basis=decision.location_confidence.basis,
        ),
        root_cause_confidence=ConfidenceScore(
            score=decision.root_cause_confidence.score,
            level=decision.root_cause_confidence.level,
            basis=decision.root_cause_confidence.basis,
        ),
        supporting_evidence=[_evidence(item) for item in resolved.supporting],
        contradicting_evidence=[_evidence(item) for item in resolved.contradicting],
        missing_evidence=[_evidence(item) for item in resolved.missing],
        alternatives=resolved.alternatives,
        root_cause_candidates=resolved.root_cause_candidates,
        grouped_symptoms=resolved.grouped_symptoms,
        caused_by=resolved.caused_by,
        shap=[
            ShapContribution(
                feature=entry.feature_id,
                feature_name=entry.feature_name,
                value=entry.value,
                unit=entry.unit,
                shap=entry.shap,
                direction=entry.direction,
            )
            for entry in (explanation.all_contributions() if explanation else [])
        ],
        shap_available=bool(explanation and explanation.available),
        shap_unavailable_reason=(explanation.reason if explanation and not explanation.available else None),
        severity=decision.severity,
        severity_authority=decision.severity_authority,
        severity_reason=decision.severity_reason,
        progression=decision.progression,
        impact=ImpactBlock(**decision.impact, horizon=decision.impact_horizon),
        priority=decision.priority,
        priority_reason=decision.priority_reason,
        recommended_action=RecommendedAction(
            level=decision.action_level,
            sequence=decision.action_steps,
            text=decision.action_text,
            authority=decision.action_authority,
        ),
        source=resolved.source,
        surfaced=surfaced,
    )


def _evidence(item: Any) -> Evidence:
    return Evidence(
        evidence_class=item.evidence_class,
        statement=item.statement,
        signal_id=item.signal_id,
        quality=item.quality,
    )


def _mean_baseline_confidence(features: FeatureFrame) -> float:
    values = [selection.confidence for selection in features.baselines.values() if selection.record]
    return sum(values) / len(values) if values else 0.0


def _first_baseline_id(features: FeatureFrame) -> str | None:
    for selection in features.baselines.values():
        if selection.record:
            return selection.record.baseline_id
    return None


def _dominant_baseline_level(features: FeatureFrame) -> str | None:
    """The *weakest* level in use, not the strongest.

    Deliberate. The context block's level is read as "how good is this
    comparison", and reporting EXACT_CONTEXT because one signal out of thirty
    had a learned baseline would overstate the whole frame.
    """
    order = [
        "EXACT_CONTEXT",
        "CONTEXT_BAND",
        "BROADER_CONTEXT",
        "CUSTOMER_OEM_REFERENCE",
        "TEMPLATE_REFERENCE",
    ]
    levels = [selection.level for selection in features.baselines.values() if selection.level]
    if not levels:
        return None
    return max(levels, key=lambda level: order.index(level) if level in order else len(order))


def _baseline_confidence_band(features: FeatureFrame) -> str:
    score = _mean_baseline_confidence(features)
    if score >= 0.75:
        return "HIGH"
    if score >= 0.45:
        return "MEDIUM"
    if score > 0:
        return "LOW"
    return "NONE"
