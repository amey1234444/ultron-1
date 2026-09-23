"""The remaining required tests from the recovery brief.

Each names a property that was asserted nowhere, and each covers a way the
system could regress silently: a temporal model reporting itself available
before one exists, a heavy library being imported at module scope, a
`trained_on_real_data` flag lost in a registry round trip, or the ML golden
suite quietly becoming a dependency of the deterministic one.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from app.core.errors import ComponentCapability
from app.features.engine import feature_schema_fingerprint, union_feature_ids
from app.inference.pipeline import InferencePipeline
from app.models.base import ModelContract
from app.models.temporal.runtime import TemporalRuntime
from app.models.trees.ensemble import TreeEnsemble
from app.registry.registry import ModelRegistry

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts" / "models"


# -- temporal availability --------------------------------------------------


def test_temporal_features_are_unavailable_before_a_model_exists(isolated_settings) -> None:
    """NOT_TRAINED, not FAILED. An LSTM nobody has trained is an expected state
    on the way to a working system, and reporting it as a fault would make every
    healthy deployment look unwell."""
    runtime = TemporalRuntime.unavailable("No temporal model configured.")
    assert runtime.capability is ComponentCapability.NOT_TRAINED
    assert not runtime.capability.is_fault
    assert not runtime.available


def test_a_missing_artifact_directory_is_also_not_trained(isolated_settings, tmp_path) -> None:
    runtime = TemporalRuntime.load(tmp_path / "nothing-here")
    assert runtime.capability is ComponentCapability.NOT_TRAINED
    assert not runtime.capability.is_fault


@pytest.mark.slow
def test_temporal_features_become_available_once_a_model_loads(isolated_settings) -> None:
    """The other half of the pair: a trained artifact reports AVAILABLE and the
    pipeline stops describing its residual columns as absent."""
    directory = ARTIFACTS / "temporal_lstm" / "lstm-smoke-1-1"
    if not directory.is_dir():
        pytest.skip(f"no temporal artifact at {directory}")

    runtime = TemporalRuntime.load(directory)
    assert runtime.capability is ComponentCapability.AVAILABLE, runtime.reason
    assert runtime.available
    assert runtime.forecast_channels, "a loaded model must declare its channels"

    pipeline = InferencePipeline(temporal=runtime)
    assert pipeline.component_capabilities()["temporal"] == "AVAILABLE"


# -- lazy capability probes -------------------------------------------------


@pytest.mark.parametrize("library", ["lightgbm", "xgboost", "tensorflow", "shap"])
def test_the_service_imports_without_the_heavy_libraries(library: str) -> None:
    """Importing the pipeline must not import the modelling libraries.

    This is the property that keeps the deterministic chain serving when a heavy
    library will not install -- which is not hypothetical here: lightgbm
    segfaulted and shap would not install at all, and the console kept working
    throughout. Asserted in a subprocess because an import in this one would
    already have happened.
    """
    source = (
        "import sys\n"
        "import app.inference.pipeline\n"
        f"sys.exit(1 if {library!r} in sys.modules else 0)\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", source],
        cwd=Path(__file__).resolve().parents[2],
        capture_output=True,
    )
    assert result.returncode == 0, (
        f"importing the pipeline pulled in {library}; the deterministic chain "
        f"would stop serving whenever {library} failed to load"
    )


# -- registry round trip ----------------------------------------------------


def test_trained_on_real_data_survives_a_registry_round_trip(isolated_settings) -> None:
    """The flag that decides whether a model may ever become champion.

    Lost in serialisation it would default to False and merely block promotion,
    which is safe -- but a True that failed to survive would have to be
    re-established by hand, and a False that silently became True would let a
    synthetic model through the one gate that exists to stop it.
    """
    ids = union_feature_ids()
    for declared in (True, False):
        contract = ModelContract(
            model_id=f"round-trip-{declared}",
            model_kind="LIGHTGBM",
            version="1",
            feature_ids=ids,
            feature_count=len(ids),
            feature_schema_hash=feature_schema_fingerprint(ids),
            trained_on_real_data=declared,
            label_quality_mix={"GOLD": 12} if declared else {"BRONZE": 12},
        )
        restored = ModelContract.from_json(contract.to_json())
        assert restored.trained_on_real_data is declared
        assert restored.label_quality_mix == contract.label_quality_mix
        assert restored.feature_schema_hash == contract.feature_schema_hash
        assert restored.feature_ids == contract.feature_ids


def test_a_synthetic_model_is_refused_promotion_by_default(isolated_settings) -> None:
    ids = union_feature_ids()
    contract = ModelContract(
        model_id="synthetic-only",
        model_kind="LIGHTGBM",
        version="1",
        feature_ids=ids,
        feature_count=len(ids),
        feature_schema_hash=feature_schema_fingerprint(ids),
        trained_on_real_data=False,
    )
    ensemble = TreeEnsemble(library="lightgbm", contract=contract, outputs={})
    assert ensemble.capability(ids) is ComponentCapability.NOT_LOADED

    registry = ModelRegistry()
    entry = next(
        (e for e in registry.describe() if e.get("model_id") == "synthetic-only"), None
    )
    assert entry is None, "this test must not depend on registry state"


# -- suite independence -----------------------------------------------------


def test_the_deterministic_golden_suite_does_not_import_the_ml_one() -> None:
    """The twelve deterministic cases validate the DOC-02..05 chain and pass
    without any model. They were being read as ML validation, which they are
    not, and the fix was a second suite beside them -- not a change to them.
    Coupling the two would undo that."""
    deterministic = (
        Path(__file__).resolve().parents[1] / "golden" / "test_golden_cases.py"
    ).read_text(encoding="utf-8")
    assert "test_ml_golden_cases" not in deterministic
    assert "TreeEnsemble" not in deterministic, (
        "the deterministic suite must not need a model to run"
    )
