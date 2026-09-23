"""The whole chain, end to end, over real frames.

Telemetry in, versioned diagnosis object out, with every layer in between doing
its job. The tests are grouped by the property being proved rather than by
module, because the properties are what the system promises:

  - the deterministic answer survives every model failure;
  - the response contract is complete and parseable;
  - the ML block is honest about why it did or did not run;
  - shadow mode records without alarming.
"""

from __future__ import annotations

from datetime import timezone

import pytest

from app.core.config import Settings, reset_settings
from app.features.engine import feature_schema_fingerprint, union_feature_ids
from app.inference.pipeline import InferencePipeline
from app.models.base import ModelContract, Prediction
from app.models.trees.ensemble import TreeEnsemble
from app.schemas.diagnosis import DiagnosisResponse
from app.synthetic.scenarios import scenario

UTC = timezone.utc


def _run(pipeline: InferencePipeline, frames, every: int = 10):  # type: ignore[no-untyped-def]
    last = None
    for index, frame in enumerate(frames):
        if index % every == 0:
            last = pipeline.process(frame)
        else:
            pipeline.ingest_only(frame)
    return last


class _StubEnsemble(TreeEnsemble):
    """A model that always answers, so the ML path can be exercised.

    Marked explicitly as a stub rather than pretending to be trained: its
    contract records `trained_on_real_data=False`, which is what the response
    surfaces and what the registry would refuse to promote.
    """

    def __init__(self, probability: float = 0.95) -> None:
        # The stub declares the real schema rather than a single column. The
        # pipeline verifies every artifact's contract at load now, and a stub
        # that skipped that would be exercising a path production never takes --
        # it would be refused as INCOMPATIBLE before the first frame.
        feature_ids = union_feature_ids()
        contract = ModelContract(
            model_id="stub",
            model_kind="LIGHTGBM",
            version="0",
            feature_ids=feature_ids,
            feature_count=len(feature_ids),
            feature_schema_hash=feature_schema_fingerprint(feature_ids),
            outputs=("TSE-DOWN-001@5", "TSE-DOWN-001@15", "TSE-DOWN-001@30"),
            trained_on_real_data=False,
        )
        super().__init__(library="lightgbm", contract=contract, outputs={})
        self._probability = probability

    @property
    def available(self) -> bool:  # type: ignore[override]
        return True

    def predict(self, vector):  # type: ignore[no-untyped-def]
        return [
            Prediction(output=key, raw_score=self._probability, calibrated=self._probability)
            for key in (self.contract.outputs if self.contract else ())
        ]

    def explain(self, vector, output):  # type: ignore[no-untyped-def]
        return [("TS-P3.value", 0.4), ("TS-P3.slope_600s", 0.25), ("TS-F1.value", -0.1)]

    def base_value(self, output, vector):  # type: ignore[no-untyped-def]
        return 0.1


# -- the deterministic answer survives -------------------------------------


@pytest.mark.slow
def test_healthy_run_produces_no_fault(isolated_settings) -> None:
    pipeline = InferencePipeline()
    response = _run(pipeline, scenario("SC-HEALTHY").frames())
    assert response is not None
    assert response.current_condition.verdict == "NORMAL"
    assert response.current_condition.rule_state == "NORMAL"
    assert response.diagnoses == []


@pytest.mark.slow
def test_screen_restriction_is_diagnosed_without_any_model(isolated_settings) -> None:
    """The property that matters most: no model, still a diagnosis."""
    pipeline = InferencePipeline()
    response = _run(pipeline, scenario("SC-SCREEN-RESTRICTION").frames())
    assert response is not None
    assert not pipeline.ensemble.available
    assert response.ml.eligibility_reason == "ML_INELIGIBLE_NO_MODEL"

    faults = {entry.fault_id for entry in response.diagnoses}
    assert "TSE-DOWN-001" in faults
    entry = next(item for item in response.diagnoses if item.fault_id == "TSE-DOWN-001")
    assert entry.diagnosis_state in {"SUSPECTED", "PROBABLE"}
    assert entry.recommended_action.text
    assert entry.priority in {"P1", "P2", "P3", "P4"}


@pytest.mark.slow
def test_corrupt_model_degrades_rather_than_raising(isolated_settings) -> None:
    """A model that will not load must not take the response down."""
    broken = TreeEnsemble.unavailable("lightgbm", "Simulated: the booster file is corrupt.")
    pipeline = InferencePipeline(ensemble=broken)
    response = _run(pipeline, scenario("SC-SCREEN-RESTRICTION").frames())
    assert response is not None
    assert response.ml.status in {"INELIGIBLE", "DEGRADED"}
    assert response.diagnoses, "The deterministic chain must still have answered."
    assert response.current_condition.rule_state in {"NORMAL", "ALERT", "DANGER"}


# -- the contract -----------------------------------------------------------


@pytest.mark.slow
def test_response_is_a_complete_contract(isolated_settings) -> None:
    pipeline = InferencePipeline()
    response = _run(pipeline, scenario("SC-SCREEN-RESTRICTION").frames())
    assert response is not None

    payload = response.model_dump(mode="json")
    assert payload["schema_version"] == "1.0"
    for key in (
        "machine_id",
        "timestamp",
        "prediction_id",
        "data_quality",
        "ml",
        "context",
        "current_condition",
        "anomalies",
        "diagnoses",
        "models",
        "versions",
    ):
        assert key in payload, f"{key} is missing from the response contract."

    # Round-trips: the schema accepts what it emits.
    assert DiagnosisResponse.model_validate(payload)


@pytest.mark.slow
def test_versions_travel_on_every_response(isolated_settings) -> None:
    """A prediction nobody can reproduce is an opinion."""
    pipeline = InferencePipeline()
    response = _run(pipeline, list(scenario("SC-HEALTHY").frames())[:400], every=50)
    assert response is not None
    for key in ("contract", "feature_set", "rule_set", "baseline_engine", "decision_rules"):
        assert key in response.versions


@pytest.mark.slow
def test_uncalibrated_limits_are_declared(isolated_settings) -> None:
    pipeline = InferencePipeline()
    response = _run(pipeline, list(scenario("SC-HEALTHY").frames())[:400], every=50)
    assert response is not None
    assert response.uses_uncalibrated_limits is True
    assert response.commissioning_notice


# -- the ML block is honest -------------------------------------------------


@pytest.mark.slow
def test_wrong_state_is_reported_before_missing_model(isolated_settings) -> None:
    """The reason about the data beats the reason about the deployment."""
    pipeline = InferencePipeline()
    frames = list(scenario("SC-STARTUP").frames())
    response = _run(pipeline, frames[:120], every=10)
    assert response is not None
    assert response.ml.eligibility_reason == "ML_INELIGIBLE_WRONG_STATE"


@pytest.mark.slow
def test_missing_mandatory_signal_is_reported(isolated_settings) -> None:
    pipeline = InferencePipeline()
    response = _run(pipeline, scenario("SC-MISSING-MANDATORY").frames())
    assert response is not None
    assert response.ml.eligibility_reason == "ML_INELIGIBLE_MISSING_REQUIRED_SIGNAL"
    assert response.current_condition.verdict == "INSUFFICIENT_EVIDENCE"


@pytest.mark.slow
def test_model_runs_and_produces_risk(isolated_settings) -> None:
    pipeline = InferencePipeline(ensemble=_StubEnsemble())
    response = _run(pipeline, scenario("SC-SCREEN-RESTRICTION").frames())
    assert response is not None
    assert response.ml.eligible, response.ml.reason_detail

    with_risk = [entry for entry in response.diagnoses if entry.risk]
    assert with_risk, "The model answered; a risk should be attached to a diagnosis."
    horizons = {horizon.horizon_minutes for horizon in with_risk[0].risk}
    assert horizons == {5, 15, 30}
    assert all(horizon.crossed for horizon in with_risk[0].risk), "0.95 over many cycles should cross."


@pytest.mark.slow
def test_synthetic_model_is_declared_as_such(isolated_settings) -> None:
    pipeline = InferencePipeline(ensemble=_StubEnsemble())
    response = _run(pipeline, scenario("SC-SCREEN-RESTRICTION").frames())
    assert response is not None
    assert response.models.trained_on_real_data is False


# -- shadow, canary and production -----------------------------------------


@pytest.mark.slow
def test_shadow_mode_records_without_surfacing(isolated_settings) -> None:
    """The point of shadow mode: predictions exist, nobody is paged."""
    pipeline = InferencePipeline(ensemble=_StubEnsemble())
    response = _run(pipeline, scenario("SC-SCREEN-RESTRICTION").frames())
    assert response is not None
    assert response.ml.mode == "shadow"
    assert response.ml.surfaced is False

    ml_only = [entry for entry in response.diagnoses if entry.source == "ML"]
    assert all(not entry.surfaced for entry in ml_only)


@pytest.mark.slow
def test_production_mode_surfaces(isolated_settings, tmp_path) -> None:
    reset_settings(
        Settings(
            ml_mode="production",
            knowledge_dir=isolated_settings.knowledge_dir,
            artifacts_dir=tmp_path / "a",
            registry_dir=tmp_path / "a" / "registry",
            config_dir=tmp_path / "c",
            inference_interval_seconds=0.0,
        )
    )
    pipeline = InferencePipeline(ensemble=_StubEnsemble())
    response = _run(pipeline, scenario("SC-SCREEN-RESTRICTION").frames())
    assert response is not None
    assert response.ml.mode == "production"
    assert all(entry.surfaced for entry in response.diagnoses)


@pytest.mark.slow
def test_canary_restricts_to_named_machines(isolated_settings, tmp_path) -> None:
    reset_settings(
        Settings(
            ml_mode="canary",
            canary_machines=("TSE-99",),
            knowledge_dir=isolated_settings.knowledge_dir,
            artifacts_dir=tmp_path / "a",
            registry_dir=tmp_path / "a" / "registry",
            config_dir=tmp_path / "c",
            inference_interval_seconds=0.0,
        )
    )
    pipeline = InferencePipeline(ensemble=_StubEnsemble())
    response = _run(pipeline, scenario("SC-SCREEN-RESTRICTION").frames())
    assert response is not None
    ml_only = [entry for entry in response.diagnoses if entry.source == "ML"]
    assert all(not entry.surfaced for entry in ml_only), "TSE-01 is not in the canary set."


# -- cadence ----------------------------------------------------------------


def test_cadence_skips_inference_but_never_ingestion(isolated_settings, steady_run, tmp_path) -> None:
    """Windows update on every frame; models do not."""
    reset_settings(
        Settings(
            ml_mode="shadow",
            knowledge_dir=isolated_settings.knowledge_dir,
            artifacts_dir=tmp_path / "a",
            registry_dir=tmp_path / "a" / "registry",
            config_dir=tmp_path / "c",
            inference_interval_seconds=5.0,
        )
    )
    pipeline = InferencePipeline()
    frames = steady_run(20)

    pipeline.process(frames[0])
    assert pipeline.should_run(frames[1]) is False
    assert pipeline.should_run(frames[6]) is True

    for frame in frames[1:]:
        pipeline.ingest_only(frame)

    window = pipeline.windows.window("TSE-01", "TS-P3", seconds=60, end=frames[-1].timestamp)
    assert window.count == len(frames), "Every frame must reach the window store."
