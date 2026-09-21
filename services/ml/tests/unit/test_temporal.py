"""The temporal model: shapes, the extractable embedding, and the residuals.

These build and fit a real Keras model, so they are marked ``needs_models`` and
skip cleanly where TensorFlow is absent — which is the point of the capability
probe and is itself asserted below.

What is being proved is architectural, not predictive. A tiny model fitted for
three epochs on a sine wave says nothing about forecasting an extruder; it says
the graph has the shape the design calls for, the embedding can actually be
extracted, the scaler round-trips, and a residual comes back in engineering
units. Those are the properties the rest of the service depends on.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import sin

import pytest

from app.core.capability import probe
from app.models.base import ModelContract
from app.models.temporal.builder import (
    EMBEDDING_LAYER_NAME,
    TemporalArchitecture,
    build_embedding_model,
    build_model,
    training_callbacks,
)
from app.models.temporal.runtime import TemporalRuntime
from app.models.temporal.scaler import SequenceScaler, residual_scale
from app.models.temporal.sequences import build_sequences

UTC = timezone.utc
ORIGIN = datetime(2026, 1, 1, tzinfo=UTC)

needs_tf = pytest.mark.skipif(
    not probe("tensorflow").available,
    reason=f"TensorFlow unavailable: {probe('tensorflow').reason}",
)


def _series(count: int = 500) -> tuple[list[datetime], list[list[float | None]], list[str]]:
    """A two-column series with a little structure to learn."""
    grid = [ORIGIN + timedelta(seconds=index) for index in range(count)]
    rows: list[list[float | None]] = [
        [8.0 + 0.5 * sin(index / 20.0), 45.0 + 2.0 * sin(index / 20.0 + 0.4)]
        for index in range(count)
    ]
    return grid, rows, ["TS-P3", "TS-PM1"]


# -- the capability contract ------------------------------------------------


def test_importing_the_builder_does_not_import_tensorflow() -> None:
    """The property that keeps the deterministic chain serving.

    Importing this module must cost nothing. Every heavy import happens inside
    a function, so a deployment where TensorFlow will not install still runs
    quality, state, context, features, rules and the decision layer.
    """
    import ast
    import inspect

    import app.models.temporal.builder as module

    tree = ast.parse(inspect.getsource(module))
    top_level_imports = [
        name.name
        for node in tree.body
        if isinstance(node, (ast.Import, ast.ImportFrom))
        for name in (node.names if isinstance(node, ast.Import) else node.names)
    ]
    assert not any("tensorflow" in str(name) for name in top_level_imports)


def test_a_missing_artifact_degrades_with_a_reason(tmp_path) -> None:
    runtime = TemporalRuntime.load(tmp_path / "nothing-here")
    assert runtime.available is False
    assert runtime.reason and "No temporal model artifact" in runtime.reason


def test_an_unavailable_runtime_returns_nulls_not_zeros(tmp_path) -> None:
    """Null residual columns, never a fabricated zero residual."""
    runtime = TemporalRuntime.unavailable("not configured")
    output = runtime.infer([[1.0]], actual={"TS-P3": 8.0})
    assert output.available is False
    assert output.residual_features() == {}
    assert output.embedding_features() == {}


# -- the architecture -------------------------------------------------------


@needs_tf
@pytest.mark.needs_models
def test_the_model_has_the_declared_shape() -> None:
    architecture = TemporalArchitecture(
        lookback_steps=60, feature_count=2, forecast_channels=("TS-P3", "TS-PM1")
    )
    model = build_model(architecture)

    assert model.input_shape == (None, 60, 2)
    assert model.output_shape == (None, 2)
    names = [layer.name for layer in model.layers]
    assert names.count("lstm_1") == 1
    assert names.count("lstm_2") == 1
    assert EMBEDDING_LAYER_NAME in names


@needs_tf
@pytest.mark.needs_models
def test_the_embedding_is_externally_obtainable() -> None:
    """It becomes input columns to the tree ensemble, so it must be reachable.

    An internal layer nobody can extract would make the whole E6 arm
    impossible, and the design depends on the forecast head reading *from* the
    embedding so the embedding is forced to carry the information.
    """
    architecture = TemporalArchitecture(
        lookback_steps=40, feature_count=2, forecast_channels=("TS-P3",), embedding_units=32
    )
    model = build_model(architecture)
    embedding_model = build_embedding_model(model)

    assert embedding_model.output_shape == (None, 32)

    import numpy

    batch = numpy.zeros((1, 40, 2), dtype="float32")
    assert embedding_model.predict(batch, verbose=0).shape == (1, 32)


@needs_tf
@pytest.mark.needs_models
def test_the_forecast_head_reads_from_the_embedding() -> None:
    """If it did not, the embedding would be a side branch the net can ignore."""
    architecture = TemporalArchitecture(
        lookback_steps=30, feature_count=2, forecast_channels=("TS-P3",)
    )
    model = build_model(architecture)

    # Read the functional graph rather than a tensor name: Keras 3 names
    # tensors `keras_tensor_N`, so the producing layer has to come from the
    # config's own history.
    layers = {entry["name"]: entry for entry in model.get_config()["layers"]}
    inbound = layers["forecast"]["inbound_nodes"][0]["args"][0]["config"]["keras_history"][0]
    assert inbound == EMBEDDING_LAYER_NAME


@needs_tf
@pytest.mark.needs_models
def test_early_stopping_restores_the_best_weights() -> None:
    """Otherwise the fitted model is whatever the last epoch happened to be."""
    callbacks = training_callbacks(patience=5)
    stopping = next(
        entry for entry in callbacks if entry.__class__.__name__ == "EarlyStopping"
    )
    assert stopping.restore_best_weights is True
    assert stopping.monitor == "val_loss"
    assert any(entry.__class__.__name__ == "TerminateOnNaN" for entry in callbacks)


# -- end to end, briefly ----------------------------------------------------


@needs_tf
@pytest.mark.needs_models
def test_a_short_fit_produces_usable_residuals(tmp_path) -> None:
    """Fit, save, reload, infer — the path the serving code actually takes."""
    grid, rows, columns = _series(400)
    channels = ("TS-P3",)
    lookback = 30

    scaler = SequenceScaler(kind="robust").fit(rows, columns, split="train")
    scaled = scaler.transform(rows)
    sequences = build_sequences(
        grid=grid,
        rows=scaled,
        columns=columns,
        forecast_columns=channels,
        lookback=lookback,
    )
    assert len(sequences) > 50

    architecture = TemporalArchitecture(
        lookback_steps=lookback, feature_count=len(columns), forecast_channels=channels
    )
    model = build_model(architecture)
    x, y = sequences.to_arrays()
    model.fit(x, y, epochs=2, batch_size=32, verbose=0)

    predictions = model.predict(x, verbose=0)
    residuals = [
        scaler.inverse_column("TS-P3", float(actual[0]))
        - scaler.inverse_column("TS-P3", float(predicted[0]))
        for actual, predicted in zip(y, predictions)
    ]
    scale = residual_scale(residuals)
    assert scale > 0

    artifact = tmp_path / "temporal"
    artifact.mkdir()
    model.save(artifact / "model.keras")
    scaler.write(artifact / "scaler.json")
    ModelContract(
        model_id="t-test",
        model_kind="TEMPORAL_LSTM",
        version="1",
        feature_ids=tuple(columns),
        outputs=channels,
        lookback_seconds=lookback,
        step_seconds=1.0,
        residual_scale={"TS-P3": scale},
    ).write(artifact / "contract.json")

    runtime = TemporalRuntime.load(artifact)
    assert runtime.available, runtime.reason
    assert runtime.lookback_steps == lookback

    window = [[float(row[0]), float(row[1])] for row in rows[-lookback:]]
    output = runtime.infer(window, actual={"TS-P3": 8.2})

    assert output.available, output.reason
    # The forecast comes back in engineering units, not scaled ones.
    assert 6.0 < output.expected["TS-P3"] < 10.0
    assert output.residual["TS-P3"] == pytest.approx(8.2 - output.expected["TS-P3"], abs=1e-6)
    # And normalised by the training residual scale, so a 3 means the same
    # thing on pressure as on temperature.
    assert output.normalised_residual["TS-P3"] == pytest.approx(
        output.residual["TS-P3"] / scale, rel=1e-6
    )
    assert len(output.embedding) == 32

    features = output.residual_features()
    assert features["r.TS-P3.residual"] == pytest.approx(output.residual["TS-P3"])
    assert features["r.TS-P3.abs_residual"] >= 0
    assert len(output.embedding_features()) == 32


@needs_tf
@pytest.mark.needs_models
def test_a_short_window_is_refused_rather_than_padded(tmp_path) -> None:
    """Padding a lookback to fill it teaches the model the padding."""
    grid, rows, columns = _series(120)
    scaler = SequenceScaler().fit(rows, columns, split="train")
    architecture = TemporalArchitecture(
        lookback_steps=30, feature_count=2, forecast_channels=("TS-P3",)
    )
    model = build_model(architecture)

    artifact = tmp_path / "temporal"
    artifact.mkdir()
    model.save(artifact / "model.keras")
    scaler.write(artifact / "scaler.json")
    ModelContract(
        model_id="t-test",
        model_kind="TEMPORAL_LSTM",
        version="1",
        feature_ids=tuple(columns),
        outputs=("TS-P3",),
        lookback_seconds=30,
        step_seconds=1.0,
    ).write(artifact / "contract.json")

    runtime = TemporalRuntime.load(artifact)
    output = runtime.infer([[8.0, 45.0]] * 5, actual={"TS-P3": 8.0})
    assert output.available is False
    assert "lookback" in (output.reason or "")
