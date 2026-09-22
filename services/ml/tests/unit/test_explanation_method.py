"""The explanation says which method produced it, and does not overclaim.

`shap_explainer.py` is named for SHAP, its field is called `shap`, and until
now it never imported the library -- it used the boosters' native contribution
output and called the result SHAP. That is only accurate if the two agree, so
it was measured rather than assumed, on real trained artifacts:

    lightgbm  max_abs_diff = 0.000e+00   bit identical
    xgboost   max_abs_diff = 5.668e-01   not equivalent

The XGBoost gap is not a feature-name or DMatrix artifact; it was checked both
ways. So LightGBM's native path may honestly be called SHAP and XGBoost's may
not, and the code records which it used rather than leaving a reader to guess.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.capability import probe
from app.models.trees.ensemble import TreeEnsemble

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts" / "models"


def test_only_verified_libraries_claim_shap_equivalence() -> None:
    """The allow-list is evidence, not preference.

    A library joins it by being measured against shap.TreeExplainer on a real
    artifact and matching. Adding one without that measurement is how native
    output starts being reported as SHAP again.
    """
    assert TreeEnsemble.NATIVE_SHAP_EQUIVALENT == frozenset({"lightgbm"})
    assert "xgboost" not in TreeEnsemble.NATIVE_SHAP_EQUIVALENT


@pytest.mark.parametrize(
    "library,path",
    [
        ("xgboost", ARTIFACTS / "xgboost" / "xgb-recovery-2-1"),
        ("lightgbm", ARTIFACTS / "lightgbm" / "lgbm-recovery-1-1"),
    ],
)
def test_the_method_is_reported_with_the_numbers(library: str, path: Path) -> None:
    if not path.is_dir():
        pytest.skip(f"no {library} artifact at {path}")
    ensemble = TreeEnsemble.load(path)
    output = next(iter(ensemble.outputs))
    pairs, method = ensemble.explain_with_method(
        [0.0] * len(ensemble.contract.feature_ids), output
    )

    assert method in {
        "shap_treeexplainer",
        "native_pred_contrib_shap_equivalent",
        "native_tree_contributions_unverified",
        "unavailable",
    }

    # The invariant that matters, and the one this test previously got wrong:
    # the method describes the numbers that came back. `explain` swallows its
    # errors by design, so no contributions is a legitimate outcome — but then
    # the method must say so rather than name a path.
    if method == "unavailable":
        assert pairs == []
    else:
        assert len(pairs) == len(ensemble.contract.feature_ids), (
            "a named method must come with a full-width vector; a short one "
            "would look complete to every consumer"
        )

    if method == "native_tree_contributions_unverified":
        assert library not in TreeEnsemble.NATIVE_SHAP_EQUIVALENT, (
            "a library on the verified list should not report itself unverified"
        )


@pytest.mark.slow
def test_lightgbm_native_output_really_does_equal_treeshap() -> None:
    """The measurement behind the allow-list, run rather than remembered."""
    path = ARTIFACTS / "lightgbm" / "lgbm-recovery-1-1"
    if not path.is_dir() or not probe("shap").available:
        pytest.skip("needs a lightgbm artifact and shap")

    import numpy as np
    import shap

    ensemble = TreeEnsemble.load(path)
    output = next(iter(ensemble.outputs))
    width = len(ensemble.contract.feature_ids)
    sample = np.random.default_rng(7).normal(size=(4, width))

    native = np.array(
        [[value for _, value in ensemble.explain(list(row), output)] for row in sample]
    )
    reference = np.array(shap.TreeExplainer(ensemble.outputs[output].booster).shap_values(sample))
    if reference.ndim == 3:
        reference = reference[..., 1] if reference.shape[-1] == 2 else reference[0]

    assert np.abs(native - reference[:, :width]).max() < 1e-6
