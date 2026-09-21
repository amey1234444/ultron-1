"""Shared fixtures.

Two things every test here depends on and neither of which should be implicit:

**An isolated artifacts directory.** Tests that write baselines, registries or
filter state must not touch the real one, so ``isolated_settings`` points every
path at a tmp_path and resets the cached settings afterwards.

**Deterministic frames.** The scenario generator is seeded, so a test that
asserts a diagnosis asserts the same thing on every run and on every machine.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.core.config import Settings, reset_settings, settings
from app.features.registry import reset_registry_cache
from app.knowledge.loader import reset_knowledge
from app.schemas.telemetry import ChannelReading, TelemetryContext, TelemetryFrame
from app.synthetic.generator import STEADY_LEVELS, UNITS

UTC = timezone.utc
KNOWLEDGE_DIR = Path(__file__).resolve().parents[1] / "knowledge"


@pytest.fixture
def isolated_settings(tmp_path: Path) -> Settings:
    """Settings whose every writable path is inside tmp_path."""
    replacement = Settings(
        ml_mode="shadow",
        knowledge_dir=KNOWLEDGE_DIR,
        artifacts_dir=tmp_path / "artifacts",
        datasets_dir=tmp_path / "artifacts" / "datasets",
        registry_dir=tmp_path / "artifacts" / "registry",
        config_dir=tmp_path / "configs",
        inference_interval_seconds=0.0,
    )
    reset_settings(replacement)
    reset_knowledge()
    reset_registry_cache()
    yield replacement
    reset_settings(None)
    reset_knowledge()
    reset_registry_cache()


@pytest.fixture
def steady_frame():
    """A factory for healthy steady-production frames."""

    def build(
        *,
        at: datetime | None = None,
        machine_id: str = "TSE-01",
        overrides: dict[str, float | None] | None = None,
        sequence: int | None = None,
        commanded_change: str | None = None,
        recipe_id: str | None = "PP-GF30",
        configuration_version: str | None = "CFG-01",
    ) -> TelemetryFrame:
        moment = at or datetime(2026, 1, 1, tzinfo=UTC)
        values: dict[str, float | None] = dict(STEADY_LEVELS)
        if overrides:
            values.update(overrides)
        return TelemetryFrame(
            machine_id=machine_id,
            timestamp=moment,
            configuration_version=configuration_version,
            context=TelemetryContext(recipe_id=recipe_id, commanded_change=commanded_change),
            channels={
                tag: ChannelReading(
                    value=value,
                    unit=UNITS.get(tag),
                    source_timestamp=moment,
                    received_at=moment,
                    source="test",
                )
                for tag, value in values.items()
            },
            data_source="SYNTHETIC",
            sequence=sequence,
        )

    return build


@pytest.fixture
def steady_run(steady_frame):
    """A factory for a run of healthy frames, one per second."""

    def build(
        seconds: int = 900,
        *,
        machine_id: str = "TSE-01",
        start: datetime | None = None,
        mutate=None,
        seed: int = 4242,
    ) -> list[TelemetryFrame]:
        origin = start or datetime(2026, 1, 1, tzinfo=UTC)
        rng = random.Random(seed)
        frames = []
        for index in range(seconds):
            # Small seeded noise on every channel. A fixture that repeats a
            # value byte for byte is a frozen sensor as far as DQ-005 is
            # concerned, and it is right about that — so the fixture has to
            # behave like an instrument rather than like a constant.
            overrides: dict[str, float | None] = {
                tag: level * (1.0 + rng.gauss(0.0, 0.002))
                for tag, level in STEADY_LEVELS.items()
            }
            if mutate is not None:
                mutate(overrides, index)
            frames.append(
                steady_frame(
                    at=origin + timedelta(seconds=index),
                    machine_id=machine_id,
                    overrides=overrides,
                    sequence=index,
                )
            )
        return frames

    return build
