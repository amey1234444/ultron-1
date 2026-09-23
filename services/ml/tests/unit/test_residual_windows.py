"""The 300s residual statistics are computed by something.

The registry declares six residual features per forecast channel. The temporal
runtime produces three, because one inference knows the residual *now* and
nothing about the ones before it. The other 24 columns were declared, shipped in
every model's contract, and computed by nothing at all -- permanently null since
the feature set was written, and only visible once an LSTM was finally trained.

They are computed in the pipeline, which is the only layer holding history.
"""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.features.engine import union_feature_ids
from app.inference.pipeline import (
    RESIDUAL_EXCURSION_SIGMA,
    RESIDUAL_TAG_PREFIX,
    InferencePipeline,
)


def _rolling_ids() -> list[str]:
    return [
        fid
        for fid in union_feature_ids()
        if fid.startswith("r.")
        and fid.rsplit(".", 1)[-1]
        in {"residual_mean_300s", "residual_slope_300s", "residual_persistence_300s"}
    ]


def test_the_registry_really_declares_twenty_four_of_them(isolated_settings) -> None:
    assert len(_rolling_ids()) == 24


def test_without_history_they_are_null_not_zero(isolated_settings, steady_frame) -> None:
    """Null is the honest value. A zero residual slope is a real measurement
    meaning "the residual is not trending", and a model cannot tell an invented
    one from a measured one."""
    pipeline = InferencePipeline()
    frame = steady_frame()
    ids = union_feature_ids()
    # Driven through the public path rather than by calling _build_vector, so
    # this asserts what the served vector actually contains.
    response = pipeline.process(frame)
    assert response is not None
    served = pipeline.last_vector(frame.machine_id)
    index = {fid: position for position, fid in enumerate(ids)}
    assert all(served[index[fid]] is None for fid in _rolling_ids())


@pytest.mark.slow
def test_with_history_they_are_computed(isolated_settings, steady_run) -> None:
    """Feed residuals in directly and check the statistics come back.

    The residual series is written to the same window store the tags use, under
    a reserved prefix, so this drives that store rather than a stubbed LSTM --
    which is the path production takes.
    """
    pipeline = InferencePipeline()
    frames = steady_run(400)
    machine = frames[0].machine_id

    # A residual that grows steadily and sits well outside the model's usual
    # error: mean positive, slope positive, and a measurable excursion run.
    for index, frame in enumerate(frames):
        pipeline.windows.append(
            machine,
            f"{RESIDUAL_TAG_PREFIX}TS-P3",
            frame.timestamp,
            RESIDUAL_EXCURSION_SIGMA + index * 0.01,
        )

    statistics = pipeline._residual_statistics(machine, "TS-P3", frames[-1].timestamp)
    assert statistics["mean"] is not None and statistics["mean"] > RESIDUAL_EXCURSION_SIGMA
    assert statistics["slope"] is not None and statistics["slope"] > 0
    assert statistics["persistence"] is not None and statistics["persistence"] > 0


def test_a_quiet_residual_reports_no_excursion(isolated_settings, steady_run) -> None:
    pipeline = InferencePipeline()
    frames = steady_run(120)
    machine = frames[0].machine_id
    for frame in frames:
        pipeline.windows.append(machine, f"{RESIDUAL_TAG_PREFIX}TS-P3", frame.timestamp, 0.1)

    statistics = pipeline._residual_statistics(machine, "TS-P3", frames[-1].timestamp)
    assert statistics["mean"] == pytest.approx(0.1, abs=1e-6)
    assert statistics["persistence"] == 0.0, "0.1 sigma is not an excursion"
