"""The LSTM: expected trajectory, residuals and a temporal embedding.

What this model is for, and what it is deliberately not for.

**It is for** modelling how the machine normally moves. Given the last few
minutes of process variables it predicts the next values, and the *residual* —
what actually happened minus what it expected — is the evidence. A residual
that is small and unbiased means the machine is behaving like itself. A
residual that grows steadily in one direction means it is not, and that
statement is available long before any level crosses any limit.

**It is not** the root-cause classifier. A recurrent network trained on a
handful of confirmed faults would memorise them, and it has no access to the
fault library, the evidence model or the authority hierarchy. It produces
evidence; LightGBM weighs it and DOC-04 names it.

Two heads, from one trunk:

    Head A  forecast    the next value of each configured channel
    Head B  embedding   a 32-dimensional summary of the window

The embedding must be *externally obtainable*, not an internal layer nobody can
reach, because it becomes input columns to the tree ensemble. So it is a named
layer and the runtime builds a second Keras model that outputs it.

The forecast channel list is configuration, never a constant in here. A site
that instruments a different machine changes a YAML file, not this module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Sequence

from ...core.capability import module

EMBEDDING_LAYER_NAME = "temporal_embedding"
FORECAST_LAYER_NAME = "forecast"


@dataclass
class TemporalArchitecture:
    """Every shape and regularisation choice, in one inspectable object.

    The defaults are the starting configuration, not a tuned result. They are
    conventional for a sequence of this length and width, and the search ranges
    that belong around them live in ``configs/training.yaml`` — the point being
    that nobody should have to read Python to find out what was searched.
    """

    lookback_steps: int = 300
    """300 at 1 Hz is five minutes. Long enough to contain the development of
    a restriction, short enough that a recipe change does not dominate the
    window."""

    feature_count: int = 0
    forecast_channels: tuple[str, ...] = ()

    lstm_units: tuple[int, int] = (64, 32)
    dropout: float = 0.20
    embedding_units: int = 32
    embedding_activation: str = "relu"

    learning_rate: float = 1e-3
    gradient_clip_norm: float = 1.0
    loss: str = "huber"
    """Huber rather than MSE: a process spike should influence the fit like an
    outlier, not like a hundred ordinary samples."""

    huber_delta: float = 1.0
    channel_weights: dict[str, float] = field(default_factory=dict)
    """Weight per forecast channel for the multi-output loss. Absent means 1.0.
    A site that cares more about pressure than about zone 7 says so here."""

    def summary(self) -> dict[str, Any]:
        return {
            "lookback_steps": self.lookback_steps,
            "feature_count": self.feature_count,
            "forecast_channels": list(self.forecast_channels),
            "lstm_units": list(self.lstm_units),
            "dropout": self.dropout,
            "embedding_units": self.embedding_units,
            "learning_rate": self.learning_rate,
            "loss": self.loss,
            "gradient_clip_norm": self.gradient_clip_norm,
        }


def build_model(architecture: TemporalArchitecture) -> Any:
    """Construct the two-headed Keras model.

    TensorFlow is imported here and nowhere else at module scope, so importing
    this file costs nothing and a deployment without TensorFlow still serves
    the deterministic chain.
    """
    tf = module("tensorflow")
    keras = tf.keras
    layers = keras.layers

    if architecture.feature_count <= 0:
        raise ValueError("TemporalArchitecture.feature_count must be set before building.")
    if not architecture.forecast_channels:
        raise ValueError("TemporalArchitecture.forecast_channels must name at least one channel.")

    first_units, second_units = architecture.lstm_units

    inputs = keras.Input(
        shape=(architecture.lookback_steps, architecture.feature_count), name="sequence"
    )
    hidden = layers.LSTM(first_units, return_sequences=True, name="lstm_1")(inputs)
    hidden = layers.Dropout(architecture.dropout, name="dropout_1")(hidden)
    hidden = layers.LSTM(second_units, return_sequences=False, name="lstm_2")(hidden)
    hidden = layers.Dropout(architecture.dropout, name="dropout_2")(hidden)

    embedding = layers.Dense(
        architecture.embedding_units,
        activation=architecture.embedding_activation,
        name=EMBEDDING_LAYER_NAME,
    )(hidden)

    # The forecast reads from the embedding rather than from the LSTM output.
    # That is what makes the embedding worth extracting: it is forced to carry
    # everything needed to predict the next values, instead of being a side
    # branch the network can ignore.
    forecast = layers.Dense(
        len(architecture.forecast_channels), activation="linear", name=FORECAST_LAYER_NAME
    )(embedding)

    model = keras.Model(inputs=inputs, outputs=forecast, name="ultron_temporal")

    loss = (
        keras.losses.Huber(delta=architecture.huber_delta)
        if architecture.loss == "huber"
        else keras.losses.MeanAbsoluteError()
    )
    optimizer = keras.optimizers.Adam(
        learning_rate=architecture.learning_rate,
        clipnorm=architecture.gradient_clip_norm,
    )
    model.compile(optimizer=optimizer, loss=loss, metrics=["mae"])
    return model


def build_embedding_model(trained: Any) -> Any:
    """A second model over the same weights, returning the embedding.

    Built from the trained graph rather than by re-running layers by hand, so
    it cannot drift out of step with what was actually fitted.
    """
    tf = module("tensorflow")
    keras = tf.keras
    layer = trained.get_layer(EMBEDDING_LAYER_NAME)
    return keras.Model(inputs=trained.inputs, outputs=layer.output, name="ultron_temporal_embedding")


def training_callbacks(
    *, patience: int = 12, checkpoint_path: str | None = None
) -> list[Any]:
    """Early stopping with weight restoration, and a best-epoch checkpoint.

    ``restore_best_weights=True`` is not optional. Without it the fitted model
    is whatever the last epoch happened to produce, which on a noisy validation
    curve is frequently worse than epoch 40 — and "the model is the last epoch"
    is exactly the mistake that produces an unreproducible result.
    """
    tf = module("tensorflow")
    keras = tf.keras

    callbacks: list[Any] = [
        keras.callbacks.EarlyStopping(
            monitor="val_loss",
            patience=patience,
            restore_best_weights=True,
            verbose=1,
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=max(3, patience // 3), min_lr=1e-5, verbose=1
        ),
        keras.callbacks.TerminateOnNaN(),
    ]
    if checkpoint_path:
        callbacks.append(
            keras.callbacks.ModelCheckpoint(
                filepath=checkpoint_path,
                monitor="val_loss",
                save_best_only=True,
                save_weights_only=False,
                verbose=0,
            )
        )
    return callbacks


def channel_loss_weights(architecture: TemporalArchitecture) -> Sequence[float]:
    """Per-channel weights in forecast-channel order."""
    return [architecture.channel_weights.get(channel, 1.0) for channel in architecture.forecast_channels]
