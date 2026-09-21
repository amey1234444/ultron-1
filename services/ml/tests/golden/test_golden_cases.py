"""The twelve locked Golden cases, as pytest tests.

The same cases `python -m app.training.run_golden_tests` runs, exposed here so
they execute in CI alongside everything else. The command exists separately
because promotion reads the JSON report it writes, and because an engineer
about to promote a model wants to see all twelve outcomes at once rather than
a pytest summary line.

DOC-06 §2's rule governs the set and is asserted below: *"A test set that
contains only faults is incomplete. False-positive prevention must be tested
with the same seriousness as fault detection."* Half of these cases assert that
nothing is diagnosed, and they are the half that fails first when a threshold
is quietly loosened.

These replay full scenarios and take a minute or two each, so they carry the
``slow`` marker. `pytest -m "not slow"` skips them.
"""

from __future__ import annotations

import pytest

from app.inference.pipeline import InferencePipeline
from app.synthetic.scenarios import GOLDEN_CASES, SCENARIOS, SCENARIOS_BY_ID
from app.training.run_golden_tests import run_case


@pytest.fixture
def pipeline(isolated_settings) -> InferencePipeline:  # type: ignore[no-untyped-def]
    """A fresh pipeline per case.

    Function-scoped because `isolated_settings` is: each case needs its own
    artifacts directory, and a module-scoped pipeline would carry one case's
    baselines and filter state into the next. `run_case` resets the pipeline
    anyway; this makes the isolation structural rather than dependent on that.
    """
    return InferencePipeline()


@pytest.mark.slow
@pytest.mark.parametrize(
    ("case_id", "scenario_id", "intent"),
    GOLDEN_CASES,
    ids=[case[0] for case in GOLDEN_CASES],
)
def test_golden_case(case_id: str, scenario_id: str, intent: str, pipeline) -> None:  # type: ignore[no-untyped-def]
    result = run_case(case_id, scenario_id, intent, pipeline)
    assert result.passed, (
        f"{case_id} — {intent}\n  " + "\n  ".join(result.failures) + f"\n  observed: {result.observed}"
    )


def test_the_suite_covers_false_positives_as_well_as_faults(isolated_settings) -> None:
    """DOC-06 §2's mandatory rule, asserted on the suite's own shape."""
    negatives = [
        case
        for case in GOLDEN_CASES
        if SCENARIOS_BY_ID[case[1]].expectation.forbid_fault_ids
        or SCENARIOS_BY_ID[case[1]].expectation.condition_verdict == "NORMAL"
    ]
    positives = [
        case for case in GOLDEN_CASES if SCENARIOS_BY_ID[case[1]].expectation.expect_fault_ids
    ]
    assert len(negatives) >= 4, "A suite of only fault tests says nothing about false alarms."
    assert len(positives) >= 4, "A suite of only negatives says nothing about detection."


def test_every_scenario_declares_what_it_proves(isolated_settings) -> None:
    """A scenario with no expectation is a fixture, not a test."""
    for scenario in SCENARIOS:
        expectation = scenario.expectation
        assert (
            expectation.expect_fault_ids
            or expectation.forbid_fault_ids
            or expectation.condition_verdict
            or expectation.expect_ml_ineligible
        ), f"{scenario.scenario_id} asserts nothing."
        assert expectation.notes, f"{scenario.scenario_id} has no stated intent."


def test_every_synthetic_frame_is_marked_synthetic(isolated_settings) -> None:
    """The marking that stops a generated frame becoming training truth."""
    for scenario in SCENARIOS:
        frame = next(iter(scenario.frames()))
        assert frame.data_source == "SYNTHETIC", f"{scenario.scenario_id} is not marked."


def test_scenarios_are_reproducible(isolated_settings) -> None:
    """A seeded scenario must produce identical frames on every run."""
    scenario = SCENARIOS_BY_ID["SC-SCREEN-RESTRICTION"]
    first = [frame.value("TS-P3") for frame in list(scenario.frames())[:50]]
    second = [frame.value("TS-P3") for frame in list(scenario.frames())[:50]]
    assert first == second
