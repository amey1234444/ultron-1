"""The snapshot is intact, and the two languages agree on the vocabulary.

This is the test that keeps the TypeScript knowledge layer and the Python
service honest with each other. Every enum literal declared in
``app.knowledge.enums`` is asserted against the exported ``enums.json``, so a
severity renamed on the TypeScript side fails here on the next export rather
than silently producing a value the Analyzer renders as unknown.
"""

from __future__ import annotations

import json

import pytest

from app.knowledge import enums
from app.knowledge.loader import Knowledge, knowledge


def test_snapshot_loads_and_verifies(isolated_settings) -> None:
    book = knowledge()
    counts = book.manifest["counts"]
    assert counts["faults"] == 90
    assert counts["anomalies"] == 40
    assert counts["signals"] == 60
    assert counts["operatingStates"] == 13
    assert counts["formulas"] == 49


def test_corrupt_snapshot_is_refused(isolated_settings, tmp_path) -> None:
    """A half-updated snapshot must fail loudly at load, not quietly at runtime."""
    from app.core.errors import KnowledgeError

    staging = tmp_path / "knowledge"
    staging.mkdir()
    source = isolated_settings.knowledge_dir
    for path in source.glob("*.json"):
        staging.joinpath(path.name).write_text(path.read_text(encoding="utf-8"), encoding="utf-8")

    # Change one file without updating the manifest — the exact failure mode
    # the hashes exist to catch.
    faults = json.loads((staging / "faults.json").read_text(encoding="utf-8"))
    faults["faults"][0]["name"] = "Tampered"
    (staging / "faults.json").write_text(json.dumps(faults, indent=2) + "\n", encoding="utf-8")

    with pytest.raises(KnowledgeError) as error:
        Knowledge(staging)
    assert "faults.json" in str(error.value.detail)


@pytest.mark.parametrize(
    ("literal", "snapshot_key"),
    [
        (enums.QUALITY_VERDICTS, "qualityVerdict"),
        (enums.OPERATING_STATES, "operatingState"),
        (enums.BASELINE_LEVELS, "baselineLevel"),
        (enums.DIAGNOSIS_STATES, "diagnosisState"),
        (enums.SEVERITIES, "severity"),
        (enums.PRIORITIES, "priority"),
    ],
)
def test_python_literals_match_the_export(isolated_settings, literal, snapshot_key) -> None:
    assert set(literal) == set(knowledge().enum_values(snapshot_key))


def test_authority_severity_floor_matches(isolated_settings) -> None:
    """DOC-05 §5's ladder, character for character.

    The most consequential agreement in the whole contract: if Python and
    TypeScript disagree about what CUSTOMER_DANGER floors at, one of them is
    downgrading a Danger.
    """
    exported = knowledge().enums["authoritySeverityFloor"]
    assert enums.AUTHORITY_SEVERITY_FLOOR == exported


def test_ultron_learned_never_floors_above_normal(isolated_settings) -> None:
    """A learned anomaly must not be able to redefine plant severity."""
    assert enums.AUTHORITY_SEVERITY_FLOOR["ULTRON_LEARNED"] == "NORMAL"


def test_steady_production_is_the_only_learning_state(isolated_settings) -> None:
    assert knowledge().baseline_learning_states() == frozenset({enums.STEADY_PRODUCTION})


def test_anomaly_id_lookup_refuses_a_near_match(isolated_settings) -> None:
    """An unlabelled anomaly is usable; a wrongly labelled one corrupts labels."""
    book = knowledge()
    assert book.anomaly_id_for("TS-P3", "HIGH_ANOMALY") == "A-PRES-H"
    assert book.anomaly_id_for("TS-P3", "NOT_ANOMALOUS") is None
    assert book.anomaly_id_for("NOT-A-TAG", "HIGH_ANOMALY") is None


def test_commissioning_is_not_field_calibrated(isolated_settings) -> None:
    """The honesty flag the whole UI depends on."""
    book = knowledge()
    assert book.field_calibrated is False
    assert "No value here is field calibrated" in book.commissioning_notice
