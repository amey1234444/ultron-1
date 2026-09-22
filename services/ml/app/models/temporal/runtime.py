"""Serving the temporal model: forecast, embedding and residual features.

The inference-time counterpart to the builder. It owns three things the
training code does not need to think about and the serving path cannot get
wrong:

**Loading is allowed to fail.** A missing artifact, a TensorFlow that will not
import, a corrupt HDF5 file — each produces a ``TemporalRuntime`` that reports
itself unavailable with a reason, and the pipeline emits null residual columns
and carries on. It never raises into the request path.

**Residuals are returned in engineering units and in training-scale units.**
The first is what an operator reads (0.9 MPa above expectation); the second is
what a tree splits on (2.7 times the model's typical training error). Both, or
neither — a residual without its scale is uninterpretable and a scale without
the residual is not evidence.

**The embedding is extracted from the trained graph**, never recomputed, so it
cannot drift from the weights that produced the forecast.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

from ...core.errors import ComponentCapability, ModelLoadError
from ..base import ModelContract
from .builder import EMBEDDING_LAYER_NAME
from .scaler import SequenceScaler
from .sequences import sequence_from_window


@dataclass
class TemporalOutput:
    """One temporal inference, with everything the feature union needs."""

    available: bool
    reason: str | None = None
    expected: dict[str, float] = field(default_factory=dict)
    """Forecast per channel, in engineering units."""

    residual: dict[str, float] = field(default_factory=dict)
    normalised_residual: dict[str, float] = field(default_factory=dict)
    embedding: tuple[float, ...] = ()
    model_id: str | None = None
    sequence_completeness: float | None = None

    def residual_features(self) -> dict[str, float | None]:
        """The residual columns, keyed exactly as the registry declares them."""
        out: dict[str, float | None] = {}
        for channel, value in self.residual.items():
            out[f"r.{channel}.residual"] = value
            out[f"r.{channel}.abs_residual"] = abs(value)
            out[f"r.{channel}.norm_residual"] = self.normalised_residual.get(channel)
        return out

    def embedding_features(self) -> dict[str, float | None]:
        return {f"e.embedding_{index:02d}": value for index, value in enumerate(self.embedding)}


UNAVAILABLE = TemporalOutput(available=False, reason="No temporal model is loaded.")


class TemporalRuntime:
    """A loaded LSTM, or a clear explanation of why there is not one."""

    def __init__(
        self,
        *,
        model: Any = None,
        embedding_model: Any = None,
        contract: ModelContract | None = None,
        scaler: SequenceScaler | None = None,
        reason: str | None = None,
        capability: "ComponentCapability | None" = None,
    ) -> None:
        self._model = model
        self._embedding_model = embedding_model
        self.contract = contract
        self.scaler = scaler or SequenceScaler()
        self.reason = reason
        self._capability = capability

    @property
    def available(self) -> bool:
        return self._model is not None and self.contract is not None

    @property
    def capability(self) -> "ComponentCapability":
        """Which state this runtime is actually in.

        ``available`` is a boolean over several different situations. The one
        that matters most here is NOT_TRAINED: no LSTM has ever been fitted, so
        all 48 residual and 32 embedding columns are null. That is an expected
        state on the way to a working system, not a fault, and reporting it as
        DEGRADED would make a correctly-working deployment look unwell.
        """
        if self._capability is not None:
            return self._capability
        if self._model is not None and self.contract is not None:
            return ComponentCapability.AVAILABLE
        if self.contract is None:
            return ComponentCapability.NOT_TRAINED
        return ComponentCapability.NOT_LOADED

    @property
    def model_id(self) -> str | None:
        return self.contract.model_id if self.contract else None

    @property
    def input_columns(self) -> tuple[str, ...]:
        return self.contract.feature_ids if self.contract else ()

    @property
    def forecast_channels(self) -> tuple[str, ...]:
        return self.contract.outputs if self.contract else ()

    @property
    def lookback_steps(self) -> int:
        if not self.contract or not self.contract.lookback_seconds or not self.contract.step_seconds:
            return 0
        return int(self.contract.lookback_seconds / self.contract.step_seconds)

    # -- loading ------------------------------------------------------------

    @classmethod
    def load(cls, directory: Path) -> "TemporalRuntime":
        """Load an artifact directory, degrading with a reason on any failure."""
        contract_path = directory / "contract.json"
        if not contract_path.is_file():
            return cls(
                reason=f"No temporal model artifact at {directory}.",
                capability=ComponentCapability.NOT_TRAINED,
            )

        try:
            contract = ModelContract.read(contract_path)
        except Exception as error:  # noqa: BLE001 - a corrupt contract is a reason
            return cls(
                reason=f"Temporal contract unreadable: {error}",
                capability=ComponentCapability.FAILED,
            )

        scaler_path = directory / "scaler.json"
        scaler = SequenceScaler.read(scaler_path) if scaler_path.is_file() else SequenceScaler()

        try:
            from ...core.capability import module

            tf = module("tensorflow")
            weights = directory / "model.keras"
            if not weights.is_file():
                return cls(reason=f"No model weights at {weights}.", contract=contract, scaler=scaler)
            model = tf.keras.models.load_model(weights, compile=False)
            embedding_model = tf.keras.Model(
                inputs=model.inputs, outputs=model.get_layer(EMBEDDING_LAYER_NAME).output
            )
        except Exception as error:  # noqa: BLE001 - see class docstring
            return cls(reason=f"Temporal model would not load: {error}", contract=contract, scaler=scaler)

        return cls(model=model, embedding_model=embedding_model, contract=contract, scaler=scaler)

    @classmethod
    def unavailable(cls, reason: str) -> "TemporalRuntime":
        return cls(reason=reason)

    # -- inference ----------------------------------------------------------

    def infer(
        self,
        rows: Sequence[Sequence[float | None]],
        *,
        actual: dict[str, float | None],
    ) -> TemporalOutput:
        """Forecast, embed and residual, from an aligned window.

        ``rows`` are in ``input_columns`` order and raw engineering units; the
        scaler is applied here so a caller cannot forget it, which is the
        failure that produces a model fed unscaled input and a residual an
        order of magnitude wrong.
        """
        if not self.available:
            return TemporalOutput(available=False, reason=self.reason or "No temporal model is loaded.")

        lookback = self.lookback_steps
        if lookback <= 0:
            return TemporalOutput(available=False, reason="The temporal contract declares no lookback.")
        if len(rows) < lookback:
            return TemporalOutput(
                available=False,
                reason=f"{len(rows)} aligned samples against a {lookback}-step lookback.",
            )

        scaled = self.scaler.transform(list(rows))
        sequence = sequence_from_window(scaled, lookback=lookback)
        if sequence is None:
            return TemporalOutput(
                available=False,
                reason="The lookback window is too sparse for a temporal inference.",
            )

        try:
            from ...core.capability import module

            numpy = module("numpy")
            batch = numpy.array([sequence], dtype="float32")
            forecast = self._model.predict(batch, verbose=0)[0]
            embedding = self._embedding_model.predict(batch, verbose=0)[0]
        except Exception as error:  # noqa: BLE001 - inference must not 500
            return TemporalOutput(available=False, reason=f"Temporal inference failed: {error}")

        expected: dict[str, float] = {}
        residual: dict[str, float] = {}
        normalised: dict[str, float] = {}

        for index, channel in enumerate(self.forecast_channels):
            predicted = self.scaler.inverse_column(channel, float(forecast[index]))
            expected[channel] = predicted
            observed = actual.get(channel)
            if observed is None:
                continue
            gap = float(observed) - predicted
            residual[channel] = gap
            scale = (self.contract.residual_scale or {}).get(channel) if self.contract else None
            if scale and abs(scale) > 1e-9:
                normalised[channel] = gap / scale

        return TemporalOutput(
            available=True,
            expected=expected,
            residual=residual,
            normalised_residual=normalised,
            embedding=tuple(float(value) for value in embedding),
            model_id=self.model_id,
        )

    def describe(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "reason": self.reason,
            "model_id": self.model_id,
            "lookback_steps": self.lookback_steps,
            "forecast_channels": list(self.forecast_channels),
            "scaler_fitted_on": self.scaler.fitted_on_split,
        }


def require_loaded(runtime: TemporalRuntime) -> None:
    """For paths that genuinely cannot degrade — training, evaluation."""
    if not runtime.available:
        raise ModelLoadError(runtime.reason or "No temporal model is loaded.")
