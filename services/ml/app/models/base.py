"""What every model artifact must carry, and how it is checked before use.

A model file on disk is not enough to serve a prediction from. The runtime has
to know which features it expects, in which order, which feature-set version
they came from, what it was trained on and whether any of that was real. So the
``ModelContract`` travels *with* every artifact and the loader refuses a model
whose contract does not match the running pipeline.

The refusal is the point. Feeding a reordered or re-scaled vector to a trained
tree does not raise — it returns a confident, wrong probability, and nothing
downstream can tell. A loud ``ML_INELIGIBLE_FEATURE_SCHEMA_MISMATCH`` is
strictly better than a quiet 0.91.

``trained_on_real_data`` is the field that keeps this honest while no confirmed
production faults exist. Every artifact fitted from the synthetic generator
carries ``False``, the registry refuses to promote such a model to champion
unless ``ML_ALLOW_UNTRAINED_CHAMPION`` is set, and the diagnosis response
surfaces it so a risk number is never read as evidence about this machine.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Protocol, Sequence

from ..core.errors import ModelContractError
from ..core.versions import FEATURE_SET_VERSION


@dataclass
class ModelContract:
    """The input and output agreement a trained artifact was fitted under."""

    model_id: str
    model_kind: str
    version: str

    feature_ids: tuple[str, ...]
    """Exact order. This *is* the input contract."""

    feature_set_version: str = FEATURE_SET_VERSION

    feature_schema_hash: str | None = None
    """Fingerprint of the exact schema this artifact was fitted against.

    The version string is a promise a human has to remember to keep; this is
    the one the machine checks. It exists because the promise was broken once
    already — 48 columns were removed from the registry and
    ``feature_set_version`` stayed ``1.0.0`` on both sides, so a model and a
    pipeline agreed on the version and disagreed on the columns.

    ``None`` means the artifact predates fingerprinting, which is itself a
    reason to refuse it rather than a reason to skip the check.
    """

    feature_count: int | None = None
    """Column count, checked before the hash so the error can say what changed."""

    outputs: tuple[str, ...] = ()
    """For a classifier: ``fault_id@horizon_minutes`` per output. For the
    temporal model: the forecast channels."""

    lookback_seconds: int | None = None
    step_seconds: float | None = None

    trained_on_dataset: str | None = None
    trained_on_real_data: bool = False
    label_quality_mix: dict[str, int] = field(default_factory=dict)
    """Counts by GOLD/SILVER/BRONZE/UNVERIFIED in the training set. A model
    trained entirely on BRONZE is a pipeline test, and this is where that is
    written down rather than remembered."""

    knowledge_digest: str | None = None
    code_revision: str | None = None
    random_seed: int | None = None
    trained_at: str | None = None
    training_window: tuple[str, str] | None = None
    machines: tuple[str, ...] = ()
    recipes: tuple[str, ...] = ()
    event_ids: tuple[str, ...] = ()

    hyperparameters: dict[str, Any] = field(default_factory=dict)
    validation_metrics: dict[str, Any] = field(default_factory=dict)
    test_metrics: dict[str, Any] = field(default_factory=dict)
    calibration: dict[str, Any] = field(default_factory=dict)
    scaler: dict[str, Any] = field(default_factory=dict)
    residual_scale: dict[str, float] = field(default_factory=dict)
    environment: dict[str, str] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def check_against(self, available: Sequence[str]) -> None:
        """Raise unless this model's inputs can be served from ``available``.

        Checks the version first because it is the cheap answer and the common
        case: a feature-set bump invalidates every model, and reporting "column
        x missing" for four hundred columns would bury the actual cause.
        """
        from ..features.engine import feature_schema_fingerprint

        running_hash = feature_schema_fingerprint(available)

        def refuse(message: str, **extra: Any) -> None:
            # Every refusal carries both sides of every identifier, because the
            # first question anyone asks is "trained against what, running
            # what?" and an error that omits it sends them to the registry.
            raise ModelContractError(
                message,
                detail={
                    "model": self.model_id,
                    "expected_feature_set_version": self.feature_set_version,
                    "actual_feature_set_version": FEATURE_SET_VERSION,
                    "expected_feature_count": self.feature_count
                    if self.feature_count is not None
                    else len(self.feature_ids),
                    "actual_feature_count": len(available),
                    "expected_feature_schema_hash": self.feature_schema_hash,
                    "actual_feature_schema_hash": running_hash,
                    **extra,
                },
            )

        if self.feature_set_version != FEATURE_SET_VERSION:
            refuse(
                f"Model {self.model_id} was trained against feature set "
                f"{self.feature_set_version}; this service computes {FEATURE_SET_VERSION}."
            )

        expected_count = (
            self.feature_count if self.feature_count is not None else len(self.feature_ids)
        )
        if expected_count != len(available):
            refuse(
                f"Model {self.model_id} was trained on {expected_count} features; this "
                f"pipeline produces {len(available)}."
            )

        missing = [feature_id for feature_id in self.feature_ids if feature_id not in set(available)]
        if missing:
            refuse(
                f"Model {self.model_id} expects {len(missing)} feature(s) this pipeline "
                "does not produce.",
                missing=missing[:20],
                missing_count=len(missing),
            )

        # Last, because it is the check that catches what the others cannot: a
        # column that kept its name and position but changed its unit, its
        # window or the family that computes it. The count matches, no name is
        # missing, and the trained tree's thresholds are silently wrong.
        if self.feature_schema_hash is None:
            refuse(
                f"Model {self.model_id} carries no feature schema fingerprint. It predates "
                "schema verification and cannot be shown to match this pipeline."
            )
        if self.feature_schema_hash != running_hash:
            refuse(
                f"Model {self.model_id} was fitted against feature schema "
                f"{self.feature_schema_hash}; this pipeline computes {running_hash}. The "
                "column count and names agree, so something a model reads — a unit, a "
                "window, or the family computing a column — changed underneath it."
            )

    def to_json(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["feature_ids"] = list(self.feature_ids)
        payload["outputs"] = list(self.outputs)
        payload["machines"] = list(self.machines)
        payload["recipes"] = list(self.recipes)
        payload["event_ids"] = list(self.event_ids)
        payload["training_window"] = list(self.training_window) if self.training_window else None
        return payload

    @classmethod
    def from_json(cls, payload: dict[str, Any]) -> "ModelContract":
        data = dict(payload)
        data["feature_ids"] = tuple(data.get("feature_ids", ()))
        data["outputs"] = tuple(data.get("outputs", ()))
        data["machines"] = tuple(data.get("machines", ()))
        data["recipes"] = tuple(data.get("recipes", ()))
        data["event_ids"] = tuple(data.get("event_ids", ()))
        window = data.get("training_window")
        data["training_window"] = tuple(window) if window else None
        known = {entry for entry in cls.__dataclass_fields__}
        return cls(**{key: value for key, value in data.items() if key in known})

    def write(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_json(), indent=2), encoding="utf-8")
        return path

    @classmethod
    def read(cls, path: Path) -> "ModelContract":
        return cls.from_json(json.loads(path.read_text(encoding="utf-8")))


@dataclass(frozen=True)
class Prediction:
    """One model output, before calibration and before any decision logic."""

    output: str
    """``fault_id@horizon`` for a classifier."""

    raw_score: float
    calibrated: float | None = None

    @property
    def probability(self) -> float:
        """The number anything downstream may use.

        Falls back to the raw score when no calibrator is fitted, and the
        ``calibrated`` flag on the response says which it was — so an
        uncalibrated 0.8 is never presented as an 80% expectation.
        """
        return self.calibrated if self.calibrated is not None else self.raw_score


class StructuredModel(Protocol):
    """A tree ensemble over the feature union."""

    contract: ModelContract

    def predict(self, vector: Sequence[float | None]) -> list[Prediction]: ...

    def explain(self, vector: Sequence[float | None], output: str) -> list[tuple[str, float]]: ...


class TemporalModel(Protocol):
    """A sequence model producing a forecast and an embedding."""

    contract: ModelContract

    def forecast(self, sequence: Sequence[Sequence[float | None]]) -> dict[str, float]: ...

    def embed(self, sequence: Sequence[Sequence[float | None]]) -> list[float]: ...


def output_key(fault_id: str, horizon_minutes: int) -> str:
    """The canonical name for one classifier output.

    One string rather than a tuple because it is a dictionary key, a column
    name, a metrics label and a registry entry, and a tuple would be spelled
    four different ways.
    """
    return f"{fault_id}@{horizon_minutes}"


def parse_output_key(key: str) -> tuple[str, int]:
    fault_id, _, horizon = key.rpartition("@")
    return fault_id, int(horizon)
