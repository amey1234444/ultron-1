"""A model that learned nothing must not be promotable.

The gates here were added after an artifact with ROC-AUC exactly 0.50 on every
output, and zero splits in every tree, passed every existing check. Its metrics
existed, were computed correctly and were honestly reported -- they simply
described a model that had learned nothing, and nothing refused it.

The distinction these tests protect: a metric *describes* a model, a gate
*refuses* one.
"""

from __future__ import annotations

import inspect

import pytest

from app.registry.registry import MINIMUM_EVENTS_FOR_PROMOTION, ModelRegistry, RegistryEntry


def _entry(**overrides) -> RegistryEntry:
    payload = {
        "model_id": "test-model",
        "version": "1",
        "model_kind": "XGBOOST",
        "artifact_path": "x",
        "role": "CANDIDATE",
        "machine_type": "TWIN_SCREW_EXTRUDER",
        "registered_at": "2026-01-01T00:00:00Z",
        "contract": {"feature_set_version": "1.0.0", "feature_schema_hash": "abc123"},
        "trained_on_real_data": True,
        "test_metrics": {
            "TSE-DOWN-003@15": {
                "roc_auc": 0.82,
                "prediction_std": 0.11,
                "event_recall": {"events": 12, "detected": 9},
            }
        },
        "golden_results": {"GT-001": True},
        "approved_by": "an.engineer",
    }
    payload.update(overrides)
    accepted = set(inspect.signature(RegistryEntry.__init__).parameters)
    return RegistryEntry(**{k: v for k, v in payload.items() if k in accepted})


def _blockers(entry: RegistryEntry) -> list[str]:
    return ModelRegistry().promotion_blockers(entry, allow_untrained=True)


def test_a_healthy_model_has_no_structural_blockers() -> None:
    assert _blockers(_entry()) == []


def test_a_constant_predictor_cannot_be_promoted() -> None:
    blockers = _blockers(
        _entry(
            test_metrics={
                "TSE-DOWN-003@15": {
                    "roc_auc": 0.5,
                    "prediction_std": 0.0,
                    "event_recall": {"events": 12, "detected": 0},
                }
            }
        )
    )
    assert any("Constant predictions" in b for b in blockers)


def test_chance_ranking_cannot_be_promoted() -> None:
    blockers = _blockers(
        _entry(
            test_metrics={
                "TSE-DOWN-003@15": {
                    "roc_auc": 0.505,
                    "prediction_std": 0.2,
                    "event_recall": {"events": 12, "detected": 4},
                }
            }
        )
    )
    assert any("indistinguishable from chance" in b for b in blockers)


def test_too_few_events_cannot_be_promoted() -> None:
    """Rows are not events. Row counts would not show this."""
    blockers = _blockers(
        _entry(
            test_metrics={
                "TSE-DOWN-003@15": {
                    "roc_auc": 0.9,
                    "prediction_std": 0.2,
                    "event_recall": {"events": MINIMUM_EVENTS_FOR_PROMOTION - 1, "detected": 6},
                }
            }
        )
    )
    assert any("Too few physical events" in b for b in blockers)


def test_an_unfingerprinted_artifact_cannot_be_promoted() -> None:
    blockers = _blockers(_entry(contract={"feature_set_version": "1.0.0"}))
    assert any("feature schema fingerprint" in b for b in blockers)


def test_synthetic_training_blocks_promotion_by_default() -> None:
    """And the escape hatch is the only thing that lifts it."""
    entry = _entry(trained_on_real_data=False)
    strict = ModelRegistry().promotion_blockers(entry, allow_untrained=False)
    assert any("synthetic" in b.lower() for b in strict)
    assert not any("synthetic" in b.lower() for b in _blockers(entry))


def test_the_structural_gates_survive_the_untrained_escape_hatch() -> None:
    """ML_ALLOW_UNTRAINED_CHAMPION exists to test the promotion path.

    It must not become a way to promote a model that cannot rank, so the
    structural gates are checked with the hatch wide open.
    """
    blockers = _blockers(
        _entry(
            trained_on_real_data=False,
            contract={"feature_set_version": "1.0.0"},
            test_metrics={
                "TSE-DOWN-003@15": {
                    "roc_auc": 0.5,
                    "prediction_std": 0.0,
                    "event_recall": {"events": 1, "detected": 0},
                }
            },
            golden_results={},
        )
    )
    assert len(blockers) >= 5, blockers
