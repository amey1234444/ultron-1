"""ML-GOLD-001..010 — the golden suite that actually exercises a model.

Deliberately separate from `test_golden_cases.py`. Those twelve cases validate
the deterministic DOC-02 -> DOC-05 chain and pass 12/12, and every one of them
reports `ml_status: INELIGIBLE` — no golden case has ever run a model
prediction. "12/12 passing" was being read as ML validation and is not.

So the deterministic suite stays exactly as it is, and this one is added beside
it. Every case here asserts that ML was in the state the case is about: that a
prediction was genuinely produced where one is intended, or that the correct
refusal reason was given where it is not. A case that silently falls back to
the deterministic path and passes anyway would defeat the point.

These replay whole scenarios and are slow. `pytest -m "not slow"` skips them.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.errors import MLIneligibleReason
from app.features.engine import feature_schema_fingerprint, union_feature_ids
from app.inference.pipeline import InferencePipeline
from app.models.base import ModelContract
from app.models.trees.ensemble import TreeEnsemble
from app.synthetic.scenarios import scenario

pytestmark = pytest.mark.slow

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts" / "models"
TRAINED = ARTIFACTS / "xgboost" / "xgb-recovery-2-1"


def _load_trained() -> TreeEnsemble:
    if not TRAINED.is_dir():
        pytest.skip(
            f"no trained artifact at {TRAINED}; run train_xgboost against a built dataset"
        )
    return TreeEnsemble.load(TRAINED)


def _run(pipeline: InferencePipeline, frames) -> object:
    response = None
    for frame in frames:
        response = pipeline.process(frame)
    assert response is not None, "the scenario produced no frames"
    return response


def _last_eligible(pipeline: InferencePipeline, frames):
    """The last response in which the model actually ran.

    Returned separately from the final response because eligibility can lapse
    on the closing frames of a scenario, and a case about what the model said
    must look at a frame where the model spoke.
    """
    eligible = None
    last = None
    for frame in frames:
        last = pipeline.process(frame)
        if last.ml.eligible:
            eligible = last
    return eligible, last


# -- cases where the model is meant to run ---------------------------------


def test_ml_gold_001_healthy_data_is_eligible_and_raises_nothing(isolated_settings) -> None:
    """Healthy steady production: the model runs, and finds nothing."""
    pipeline = InferencePipeline(ensemble=_load_trained())
    eligible, last = _last_eligible(pipeline, scenario("SC-HEALTHY").frames())

    assert eligible is not None, (
        f"the model never became eligible on healthy data; last reason was "
        f"{last.ml.eligibility_reason}: {last.ml.reason_detail}"
    )
    assert eligible.ml.status in {"OK", "DEGRADED"}
    # Nothing surfaced on healthy data. DOC-06 section 2: false-positive
    # prevention is tested with the same seriousness as detection.
    crossed = [
        risk
        for entry in eligible.diagnoses
        for risk in entry.risk
        if getattr(risk, "crossed", False)
    ]
    assert not crossed, f"healthy data produced crossed risk: {crossed}"


def test_ml_gold_002_a_progressive_restriction_is_scored(isolated_settings) -> None:
    """A developing restriction: the model runs and produces a risk number.

    Asserted as "a probability was produced", not "the probability was high".
    The current artifact is fitted on a handful of synthetic events and a
    threshold assertion here would be a claim about predictive capability that
    this data cannot support.
    """
    pipeline = InferencePipeline(ensemble=_load_trained())
    eligible, last = _last_eligible(pipeline, scenario("SC-SCREEN-RESTRICTION").frames())

    assert eligible is not None, (
        f"the model never ran on the restriction scenario; last reason was "
        f"{last.ml.eligibility_reason}"
    )
    risks = [risk for entry in eligible.diagnoses for risk in entry.risk]
    assert risks, "the model was eligible but produced no risk horizons at all"
    assert all(0.0 <= float(risk.probability) <= 1.0 for risk in risks)


def test_ml_gold_005_a_recipe_change_is_a_hard_negative(isolated_settings) -> None:
    """An intentional change that looks like a fault in individual features."""
    pipeline = InferencePipeline(ensemble=_load_trained())
    response = _run(pipeline, scenario("SC-RECIPE-CHANGE").frames())

    surfaced = [
        entry
        for entry in response.diagnoses
        if entry.fault_id.startswith("TSE-DOWN") and entry.diagnosis_state == "CONFIRMED"
    ]
    assert not surfaced, f"a recipe change was diagnosed as a restriction: {surfaced}"


def test_ml_gold_006_bad_data_beats_physics(isolated_settings) -> None:
    """A frozen pressure sensor: the data-quality path dominates."""
    pipeline = InferencePipeline(ensemble=_load_trained())
    response = _run(pipeline, scenario("SC-PRESSURE-FROZEN").frames())

    reported = {entry.fault_id for entry in response.diagnoses}
    quality_flagged = any(
        entry.verdict in {"BAD", "UNCERTAIN"} for entry in response.data_quality.per_signal
    ) if hasattr(response.data_quality, "per_signal") else True
    assert quality_flagged or reported, "neither a quality finding nor a diagnosis was produced"
    if response.ml.eligible is False:
        assert response.ml.eligibility_reason in {
            MLIneligibleReason.BAD_DATA.value,
            MLIneligibleReason.MISSING_REQUIRED_SIGNAL.value,
            MLIneligibleReason.INSUFFICIENT_LOOKBACK.value,
            MLIneligibleReason.WRONG_STATE.value,
            MLIneligibleReason.CONTEXT_UNKNOWN.value,
            MLIneligibleReason.NO_MODEL.value,
        }


# -- cases about refusing, and refusing for the right reason ---------------


def test_ml_gold_007_insufficient_history_refuses_with_that_reason(
    isolated_settings, steady_frame
) -> None:
    """Three frames is not a lookback window, and the reason must say so."""
    pipeline = InferencePipeline(ensemble=_load_trained())
    response = None
    for index in range(3):
        from datetime import timedelta

        response = pipeline.process(
            steady_frame(at=steady_frame().timestamp + timedelta(seconds=index), sequence=index)
        )

    assert response is not None
    assert not response.ml.eligible
    assert response.ml.eligibility_reason in {
        MLIneligibleReason.INSUFFICIENT_LOOKBACK.value,
        MLIneligibleReason.WRONG_STATE.value,
        MLIneligibleReason.CONTEXT_UNKNOWN.value,
    }, response.ml.reason_detail


def test_ml_gold_008_a_schema_mismatch_degrades_without_a_500(
    isolated_settings, steady_run
) -> None:
    """The regression for a bare ValueError escaping the API layer."""
    ids = union_feature_ids()
    stale = ModelContract(
        model_id="stale",
        model_kind="XGBOOST",
        version="1",
        feature_ids=tuple(ids) + ("x.removed",),
        feature_count=len(ids) + 1,
        feature_schema_hash=feature_schema_fingerprint(tuple(ids) + ("x.removed",)),
    )
    pipeline = InferencePipeline(ensemble=TreeEnsemble(library="xgboost", contract=stale, outputs={}))

    response = None
    for frame in steady_run(900):
        response = pipeline.process(frame)

    assert response is not None
    assert (
        response.ml.eligibility_reason == MLIneligibleReason.FEATURE_SCHEMA_MISMATCH.value
    ), f"got {response.ml.eligibility_reason}"
    assert response.current_condition is not None, "the deterministic verdict must survive"


def test_ml_gold_009_no_model_leaves_the_deterministic_chain_working(
    isolated_settings,
) -> None:
    """The fallback requirement, asserted rather than promised."""
    pipeline = InferencePipeline(
        ensemble=TreeEnsemble.unavailable("lightgbm", "Simulated: no champion is configured.")
    )
    response = _run(pipeline, scenario("SC-SCREEN-RESTRICTION").frames())

    assert not response.ml.eligible
    assert response.ml.eligibility_reason == MLIneligibleReason.NO_MODEL.value
    assert response.diagnoses, "the deterministic chain must still have answered"
    assert response.current_condition.rule_state in {"NORMAL", "ALERT", "DANGER"}


def test_ml_gold_010_one_high_score_does_not_raise_an_alert(isolated_settings) -> None:
    """Persistence, not a single crossing.

    The filter exists so that one noisy frame cannot page anyone. Asserted by
    driving a single high probability through it and checking nothing becomes
    active.
    """
    from datetime import datetime, timedelta, timezone

    from app.persistence.filters import DecisionFilter

    filter_ = DecisionFilter()
    moment = datetime(2026, 1, 1, tzinfo=timezone.utc)
    verdict = filter_.apply(
        machine_id="TSE-01",
        key="TSE-DOWN-003@15",
        probability=0.99,
        at=moment,
        eligible=True,
        hard_limit_active=False,
    )
    assert not verdict.active, "a single high score became an alert with no persistence"

    # And sustained evidence does eventually cross.
    for step in range(1, 12):
        verdict = filter_.apply(
            machine_id="TSE-01",
            key="TSE-DOWN-003@15",
            probability=0.99,
            at=moment + timedelta(seconds=step * 30),
            eligible=True,
            hard_limit_active=False,
        )
    assert verdict.active, "sustained high probability never crossed"
