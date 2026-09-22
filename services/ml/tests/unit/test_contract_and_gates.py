"""Regression tests for the defects that produced a constant predictor.

Every test here names a specific failure that actually happened and went
undetected. The pipeline reported all of it honestly; what was missing was
anything that *checked*. See docs/ml/WHY_THE_MODEL_WAS_CONSTANT.md.
"""

from __future__ import annotations

import pytest

from app.core.errors import MLIneligibleReason, ModelContractError
from app.evaluation.metrics import (
    constant_predictor_check,
    event_level_recall,
    ranking_sanity_check,
    roc_auc,
)
from app.features.engine import feature_schema_fingerprint, union_feature_ids
from app.inference.pipeline import InferencePipeline
from app.models.base import ModelContract
from app.models.trees.ensemble import TreeEnsemble


# -- feature schema fingerprinting -----------------------------------------


def test_the_fingerprint_is_stable_for_an_unchanged_schema(isolated_settings) -> None:
    assert feature_schema_fingerprint() == feature_schema_fingerprint()


def test_removing_a_feature_changes_the_fingerprint(isolated_settings) -> None:
    """The exact defect: 48 columns vanished and the version stayed 1.0.0."""
    ids = union_feature_ids()
    assert feature_schema_fingerprint(ids) != feature_schema_fingerprint(ids[:-48])


def test_adding_a_feature_changes_the_fingerprint(isolated_settings) -> None:
    ids = union_feature_ids()
    assert feature_schema_fingerprint(ids) != feature_schema_fingerprint(
        tuple(ids) + ("x.invented",)
    )


def test_reordering_features_changes_the_fingerprint(isolated_settings) -> None:
    """Order *is* the contract — a tree indexes into a position, not a name."""
    ids = list(union_feature_ids())
    ids[0], ids[1] = ids[1], ids[0]
    assert feature_schema_fingerprint(tuple(ids)) != feature_schema_fingerprint()


# -- the contract check that existed and was never called -------------------


def _contract(feature_ids: tuple[str, ...], **overrides) -> ModelContract:
    payload = {
        "model_id": "test-model",
        "model_kind": "XGBOOST",
        "version": "1",
        "feature_ids": feature_ids,
        "feature_count": len(feature_ids),
        "feature_schema_hash": feature_schema_fingerprint(feature_ids),
    }
    payload.update(overrides)
    return ModelContract(**payload)


def test_a_matching_contract_passes(isolated_settings) -> None:
    ids = union_feature_ids()
    _contract(ids).check_against(ids)


def test_a_stale_contract_is_refused_before_any_prediction(isolated_settings) -> None:
    """1,652 columns against a pipeline computing 1,604.

    Previously this reached ``predict()`` and raised a bare ValueError that
    escaped an API layer catching only MLServiceError.
    """
    ids = union_feature_ids()
    stale = _contract(tuple(ids) + tuple(f"TS-TZ9.f{n}" for n in range(48)))
    with pytest.raises(ModelContractError) as caught:
        stale.check_against(ids)
    detail = caught.value.detail
    # Both sides of every identifier, so nobody has to open the registry.
    assert detail["expected_feature_count"] == len(ids) + 48
    assert detail["actual_feature_count"] == len(ids)
    assert detail["expected_feature_schema_hash"] != detail["actual_feature_schema_hash"]


def test_a_contract_without_a_fingerprint_is_refused(isolated_settings) -> None:
    """Predating the check is a reason to refuse, not a reason to skip it."""
    ids = union_feature_ids()
    with pytest.raises(ModelContractError):
        _contract(ids, feature_schema_hash=None).check_against(ids)


def test_a_reordered_schema_is_caught_even_though_the_count_matches(
    isolated_settings,
) -> None:
    """The case a count check cannot see and a version string will not catch."""
    ids = union_feature_ids()
    swapped = list(ids)
    swapped[5], swapped[6] = swapped[6], swapped[5]
    contract = _contract(tuple(swapped))
    assert contract.feature_count == len(ids)
    with pytest.raises(ModelContractError):
        contract.check_against(ids)


@pytest.mark.slow
def test_a_schema_mismatch_degrades_rather_than_raising(
    isolated_settings, steady_run
) -> None:
    """The end-to-end property: a stale artifact must not become an HTTP 500.

    A full steady run rather than one frame, because FEATURE_SCHEMA_MISMATCH
    sits with NO_MODEL at the *end* of the gate ladder. That ordering is
    deliberate — an observation that would have been refused for its own
    reasons must be told that reason, not a deployment-level one — so the run
    has to actually reach steady state before the schema gate is the one
    left standing.
    """
    ids = union_feature_ids()
    stale = _contract(tuple(ids) + ("x.removed",))
    ensemble = TreeEnsemble(library="xgboost", contract=stale, outputs={})

    pipeline = InferencePipeline(ensemble=ensemble)
    response = None
    for frame in steady_run(900):
        response = pipeline.process(frame)

    assert response is not None, "the deterministic response must still be produced"
    assert (
        response.ml.eligibility_reason
        == MLIneligibleReason.FEATURE_SCHEMA_MISMATCH.value
    ), f"got {response.ml.eligibility_reason}: {response.ml.reason_detail}"
    assert not response.ml.eligible
    # And the deterministic chain is untouched by the ML failure.
    assert response.current_condition is not None


# -- undefined is not zero --------------------------------------------------


def test_event_recall_over_zero_events_is_undefined_not_zero() -> None:
    """``0.0`` reads as "missed everything" and would fail a promotion gate on
    evidence that does not exist. ds-synth-002 reported exactly that."""
    result = event_level_recall([])
    assert result["event_recall"] is None
    assert result["events"] == 0
    assert "undefined_reason" in result


# -- the sanity gates -------------------------------------------------------


def test_a_constant_predictor_is_detected() -> None:
    verdict = constant_predictor_check([0.5] * 400)
    assert not verdict.passed
    assert verdict.observed["distinct"] == 1


def test_a_varying_predictor_passes() -> None:
    verdict = constant_predictor_check([index / 400 for index in range(400)])
    assert verdict.passed


def test_chance_ranking_is_detected() -> None:
    """ROC-AUC 0.50 on separable data is a broken pipeline, not a weak model."""
    assert not ranking_sanity_check(0.50, positives=40, negatives=360).passed


def test_ranking_is_undecidable_with_one_class() -> None:
    """A gate that fails on an undefined metric teaches people to ignore gates."""
    verdict = ranking_sanity_check(0.0, positives=0, negatives=360)
    assert verdict.passed
    assert verdict.observed["roc_auc"] is None


def test_calibration_cannot_manufacture_discrimination() -> None:
    """Perfectly calibrating a constant leaves it unable to rank anything.

    ds-synth-002 reported ECE 0.405 -> 0.000 while ROC-AUC stayed at exactly
    0.50, and the calibration number was read as progress.
    """
    labels = [1] * 40 + [0] * 360
    constant = [0.1] * 400  # the base rate: perfectly calibrated, and useless
    assert roc_auc(constant, labels) == pytest.approx(0.5, abs=1e-9)
    assert not constant_predictor_check(constant).passed
