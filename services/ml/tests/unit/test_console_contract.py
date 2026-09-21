"""The frame the TypeScript console actually sends must be one this service eats.

`tests/fixtures/console_frame.json` was produced by running
`lib/knowledge/ml/telemetryFrame.ts` over a synthetic rack — it is not
hand-written, which is the point. If the adapter's output shape drifts from the
schema, a hand-written fixture would keep passing and the drift would only
surface in production as a 422 on every frame.

Regenerating it, after changing either side:

    npx esbuild <probe>.ts --bundle --platform=node --format=cjs \
        --outfile=node_modules/.cache/probe.cjs && node node_modules/.cache/probe.cjs \
        > services/ml/tests/fixtures/console_frame.json

The properties asserted below are the ones the two languages have to agree on,
and each names the failure it prevents.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.inference.pipeline import InferencePipeline
from app.knowledge.loader import knowledge
from app.schemas.telemetry import TelemetryFrame

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "console_frame.json"


@pytest.fixture
def payload() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_the_console_frame_validates(isolated_settings, payload) -> None:
    """The join. A 422 here is every frame rejected in production."""
    frame = TelemetryFrame.model_validate(payload)
    assert frame.machine_id
    assert frame.machine_type == "TWIN_SCREW_EXTRUDER"
    assert frame.channels


def test_extra_fields_are_rejected_rather_than_ignored(isolated_settings, payload) -> None:
    """`extra="forbid"` is what makes a field the console renamed visible.

    Ignoring unknown fields would let the adapter send `melt_pressure` forever
    while the service silently read nothing.
    """
    payload["a_field_nobody_declared"] = 1
    with pytest.raises(Exception):
        TelemetryFrame.model_validate(payload)


def test_every_channel_key_is_a_known_tag(isolated_settings, payload) -> None:
    """The adapter keys on the analyser tag, and the knowledge snapshot agrees.

    Keying on the point code instead — `melt-pressure-pre-screen` rather than
    `TS-P3` — would produce a frame that validates and whose every channel the
    quality engine reports as an unmapped tag.
    """
    known = set(knowledge().known_tags())
    unknown = [tag for tag in payload["channels"] if tag not in known]
    assert not unknown, f"The console sent tags the knowledge layer does not declare: {unknown}"


def test_units_are_canonical(isolated_settings, payload) -> None:
    """Normalisation happens before the frame leaves the console.

    A channel arriving in bar against an MPa baseline is a factor-of-ten
    comparison that produces a confident, wrong diagnosis.
    """
    book = knowledge()
    for tag, channel in payload["channels"].items():
        declared = book.tag(tag)
        if declared is None or not declared.canonical_unit or not channel.get("unit"):
            continue
        assert channel["unit"] == declared.canonical_unit, (
            f"{tag} arrived as {channel['unit']}, declared {declared.canonical_unit}"
        )


def test_absence_and_nullity_stay_distinct(isolated_settings, payload) -> None:
    """A mapped-but-silent channel is present with a null value.

    An unmapped channel is absent entirely. The quality engine reports the two
    differently — a mapping gap versus a sensor problem — and collapsing them
    would make an unwired machine look like thirty dead sensors.
    """
    frame = TelemetryFrame.model_validate(payload)
    assert any(reading.value is None for reading in frame.channels.values())
    # Every present key was mapped; the absent ones simply are not there.
    assert len(frame.channels) < len(knowledge().known_tags())


def test_the_whole_chain_runs_on_a_console_frame(isolated_settings, payload) -> None:
    """End to end, on the real wire shape rather than a test-built one."""
    frame = TelemetryFrame.model_validate(payload)
    response = InferencePipeline().process(frame)

    assert response.machine_id == frame.machine_id
    assert response.schema_version == "1.0"
    assert response.current_condition.verdict
    assert response.ml.eligibility_reason  # no model promoted, and it says so
    assert response.versions["feature_set"]


def test_a_silent_frame_is_insufficient_evidence_not_a_fault(isolated_settings, payload) -> None:
    """The fixture reports no values. That must not become a diagnosis.

    A machine whose channels are mapped and reporting nothing has an
    integration problem, and saying INSUFFICIENT_EVIDENCE is the correct answer
    — inventing a fault from absent data is the failure the whole quality gate
    exists to prevent.
    """
    frame = TelemetryFrame.model_validate(payload)
    response = InferencePipeline().process(frame)
    assert response.current_condition.verdict == "INSUFFICIENT_EVIDENCE"
    assert response.ml.eligibility_reason == "ML_INELIGIBLE_MISSING_REQUIRED_SIGNAL"


def test_data_source_survives_the_wire(isolated_settings, payload) -> None:
    """SYNTHETIC must never arrive as REAL."""
    payload["data_source"] = "SYNTHETIC"
    frame = TelemetryFrame.model_validate(payload)
    assert frame.data_source == "SYNTHETIC"
