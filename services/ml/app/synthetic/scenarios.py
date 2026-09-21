"""The scenario catalogue, and the Golden cases built from it.

DOC-06 §2's rule in capitals: *"A test set that contains only faults is
incomplete. False-positive prevention must be tested with the same seriousness
as fault detection."* Half the catalogue below is therefore things that must
**not** produce a fault — a healthy machine, a startup, a recipe change, a
commanded feed increase — and the Golden suite fails if any of them does.

Every scenario declares its expectation, so the assertion lives next to the
data that produces it rather than in a test file three directories away.
"""

from __future__ import annotations

from .generator import MUTATORS, Scenario, ScenarioExpectation

#: Long enough that the 600-second windows are full and a trend is real.
_LONG = 1800
_MEDIUM = 900


def _scenario(
    scenario_id: str,
    name: str,
    description: str,
    mutator: str,
    expectation: ScenarioExpectation,
    *,
    seed: int,
    duration: int = _MEDIUM,
    onset: int | None = None,
    fault_id: str | None = None,
    context: dict[str, object] | None = None,
) -> Scenario:
    return Scenario(
        scenario_id=scenario_id,
        name=name,
        description=description,
        seed=seed,
        duration_seconds=duration,
        expectation=expectation,
        mutate=MUTATORS[mutator],
        onset_second=onset,
        fault_id=fault_id,
        context=context or {},
    )


SCENARIOS: tuple[Scenario, ...] = (
    _scenario(
        "SC-HEALTHY",
        "Healthy steady production",
        "Nothing wrong. The single most important negative case in the suite.",
        "healthy",
        ScenarioExpectation(
            operating_state="ST-06",
            condition_verdict="NORMAL",
            forbid_fault_ids=("TSE-DOWN-001", "TSE-PROC-001", "TSE-LOAD-001"),
            max_severity="NORMAL",
            expect_baseline_learning=True,
            notes="A healthy machine must produce no fault at all.",
        ),
        seed=101,
        duration=_LONG,
    ),
    _scenario(
        "SC-STARTUP",
        "Normal startup",
        "Speed and feed ramping from zero. Transients are expected, not faults.",
        "startup",
        ScenarioExpectation(
            condition_verdict="NORMAL",
            forbid_fault_ids=("TSE-DOWN-001", "TSE-PROC-001", "TSE-FEED-001"),
            expect_ml_ineligible="ML_INELIGIBLE_WRONG_STATE",
            expect_baseline_learning=False,
            notes="No steady-state fault, and no steady baseline learned from a ramp.",
        ),
        seed=102,
        duration=300,
    ),
    _scenario(
        "SC-SHUTDOWN",
        "Normal shutdown",
        "Feed and speed reducing; the barrel stays hot behind them.",
        "shutdown",
        ScenarioExpectation(
            forbid_fault_ids=("TSE-FEED-001", "TSE-THERM-008"),
            expect_baseline_learning=False,
            notes="Falling throughput during a shutdown is not feed starvation.",
        ),
        seed=103,
        duration=300,
    ),
    _scenario(
        "SC-RECIPE-CHANGE",
        "Recipe change",
        "A new recipe legitimately moves pressure, load and melt temperature.",
        "recipe_change",
        ScenarioExpectation(
            forbid_fault_ids=("TSE-DOWN-001", "TSE-PROC-001"),
            expect_baseline_learning=False,
            notes="A context change is not a fault. The old baseline is frozen.",
        ),
        seed=104,
        onset=300,
        context={"recipe_id": "PP-GF30", "configuration_version": "CFG-01"},
    ),
    _scenario(
        "SC-FEED-INCREASE",
        "Commanded feed increase",
        "Feed raised deliberately; pressure and load follow as physics predicts.",
        "feed_increase",
        ScenarioExpectation(
            condition_verdict="EXPECTED_PROCESS_RESPONSE",
            forbid_fault_ids=("TSE-DOWN-001", "TSE-PROC-001"),
            notes="DOC-04 §3 gate 8. The response is expected, so it is not an anomaly.",
        ),
        seed=105,
        onset=300,
        context={"commanded_change": "feed rate increase", "commanded_change_window": (300, 900)},
    ),
    _scenario(
        "SC-RPM-CHANGE",
        "Commanded screw speed change",
        "Speed raised deliberately; load rises and specific pressure falls.",
        "rpm_change",
        ScenarioExpectation(
            forbid_fault_ids=("TSE-LOAD-001",),
            notes="A commanded speed change is a context change.",
        ),
        seed=106,
        onset=300,
        context={"commanded_change": "screw speed increase", "commanded_change_window": (300, 900)},
    ),
    _scenario(
        "SC-SCREEN-RESTRICTION",
        "Screen restriction developing",
        "Pre-screen pressure and drive load climb over seven minutes; feed steady.",
        "screen_restriction",
        ScenarioExpectation(
            condition_verdict="ANOMALY_CONFIRMED",
            expect_fault_ids=("TSE-DOWN-001",),
            expect_anomaly_ids=("A-PRES-H",),
            notes="The differential across the screen is what localises it to the screen.",
        ),
        seed=107,
        duration=_LONG,
        onset=600,
        fault_id="TSE-DOWN-001",
    ),
    _scenario(
        "SC-DIE-RESTRICTION",
        "Downstream die restriction",
        "Both pressure taps climb together — past the screen, not at it.",
        "die_restriction",
        ScenarioExpectation(
            expect_fault_ids=("TSE-DOWN-003",),
            forbid_fault_ids=("TSE-DOWN-001",),
            notes="The look-alike case for SC-SCREEN-RESTRICTION.",
        ),
        seed=108,
        duration=_LONG,
        onset=600,
        fault_id="TSE-DOWN-003",
    ),
    _scenario(
        "SC-FEED-INSTABILITY",
        "Feed instability",
        "Feed oscillating with load following a beat behind it.",
        "feed_instability",
        ScenarioExpectation(
            expect_fault_ids=("TSE-FEED-002",),
            notes="The lag between feed and load is the causal direction.",
        ),
        seed=109,
        duration=_LONG,
        onset=600,
        fault_id="TSE-FEED-002",
    ),
    _scenario(
        "SC-COOLING-FAILURE",
        "Zone cooling failure",
        "One zone climbing away from its neighbours with process input steady.",
        "cooling_failure",
        ScenarioExpectation(
            expect_fault_ids=("TSE-THERM-012",),
            notes="Steady feed and speed rule out a heat-input change.",
        ),
        seed=110,
        duration=_LONG,
        onset=600,
        fault_id="TSE-THERM-012",
    ),
    _scenario(
        "SC-PRESSURE-FROZEN",
        "Melt pressure sensor frozen",
        "The transmitter stops moving; everything else carries on normally.",
        "pressure_frozen",
        ScenarioExpectation(
            condition_verdict="DATA_QUALITY_PROBLEM",
            forbid_fault_ids=("TSE-DOWN-001", "TSE-PROC-001"),
            expect_baseline_learning=False,
            notes="A frozen sensor must not read as a beautifully stable process.",
        ),
        seed=111,
        duration=_MEDIUM,
        onset=120,
        fault_id="TSE-INST-006",
    ),
    _scenario(
        "SC-PRESSURE-SPIKE",
        "Impossible single-sample pressure spike",
        "One sample at 31 MPa with torque and feed unmoved.",
        "pressure_spike",
        ScenarioExpectation(
            forbid_fault_ids=("TSE-DOWN-001",),
            notes="DOC-04 §17. One impossible sample is an artefact, not a restriction.",
        ),
        seed=112,
        onset=300,
        fault_id="TSE-INST-007",
    ),
    _scenario(
        "SC-PRESSURE-DRIFT",
        "Pressure transmitter drift",
        "Pressure departs slowly with load, feed and melt temperature unchanged.",
        "pressure_drift",
        ScenarioExpectation(
            forbid_fault_ids=("TSE-DOWN-001",),
            notes="Instrumentation first: nothing corroborates the departure.",
        ),
        seed=113,
        duration=_LONG,
        onset=300,
        fault_id="TSE-INST-004",
    ),
    _scenario(
        "SC-MISSING-TEMPERATURE",
        "Zone and melt temperature channels stop publishing",
        "Two temperature channels go away mid-run.",
        "missing_temperature",
        ScenarioExpectation(
            forbid_fault_ids=("TSE-THERM-008",),
            notes="A channel that stops publishing is MISSING, not a low temperature.",
        ),
        seed=114,
        onset=120,
        fault_id="TSE-INST-001",
    ),
    _scenario(
        "SC-MISSING-MANDATORY",
        "Melt pressure unavailable",
        "Every pressure tap stops reporting, so a restriction cannot be assessed.",
        "missing_mandatory",
        ScenarioExpectation(
            condition_verdict="INSUFFICIENT_EVIDENCE",
            expect_ml_ineligible="ML_INELIGIBLE_MISSING_REQUIRED_SIGNAL",
            notes="DOC-04 §18. Required evidence missing yields INSUFFICIENT_EVIDENCE.",
        ),
        seed=115,
        onset=120,
    ),
    _scenario(
        "SC-UNKNOWN-ANOMALY",
        "Unknown abnormal pattern",
        "Vibration and hopper level move together while the process stays normal.",
        "unknown_anomaly",
        ScenarioExpectation(
            condition_verdict="FAULT_UNKNOWN",
            forbid_fault_ids=("TSE-DOWN-001", "TSE-PROC-001", "TSE-FEED-001"),
            notes="DOC-04 §20. The nearest known fault is not offered.",
        ),
        seed=116,
        duration=_LONG,
        onset=600,
    ),
    _scenario(
        "SC-TWO-FAULTS",
        "Two independent faults",
        "A screen restriction and a vent problem, with no causal link between them.",
        "two_independent_faults",
        ScenarioExpectation(
            expect_fault_ids=("TSE-DOWN-001", "TSE-VENT-001"),
            notes="Both must survive. Neither explains the other.",
        ),
        seed=117,
        duration=_LONG,
        onset=600,
        fault_id="TSE-DOWN-001",
    ),
    _scenario(
        "SC-CAUSAL-CHAIN",
        "Restriction with the load rise it causes",
        "Pressure leads, drive load and gearbox temperature follow.",
        "causal_chain",
        ScenarioExpectation(
            expect_fault_ids=("TSE-DOWN-001",),
            notes="The load rise is grouped as a symptom, not alarmed separately.",
        ),
        seed=118,
        duration=_LONG,
        onset=600,
        fault_id="TSE-DOWN-001",
    ),
    _scenario(
        "SC-SENSOR-DRIFT",
        "Zone thermocouple drift",
        "One zone departs 160 degC from a profile its neighbours still hold.",
        "sensor_drift",
        ScenarioExpectation(
            condition_verdict="DATA_QUALITY_PROBLEM",
            forbid_fault_ids=("TSE-THERM-009",),
            notes="No recipe profile spans that range; the channel is the suspect.",
        ),
        seed=119,
        duration=_LONG,
        onset=300,
        fault_id="TSE-INST-004",
    ),
)


SCENARIOS_BY_ID: dict[str, Scenario] = {entry.scenario_id: entry for entry in SCENARIOS}


#: DOC-06 §18's minimum pack, mapped onto the catalogue. Each Golden case
#: names the scenario it runs and what it proves. The ids are the ones the
#: brief asks for, so a reader can check the list against the requirement.
GOLDEN_CASES: tuple[tuple[str, str, str], ...] = (
    ("GT-001", "SC-HEALTHY", "Healthy steady production produces no false fault."),
    ("GT-002", "SC-STARTUP", "Startup produces no steady-state fault and learns no steady baseline."),
    ("GT-003", "SC-RECIPE-CHANGE", "A recipe change freezes the baseline and raises no restriction."),
    ("GT-004", "SC-SCREEN-RESTRICTION", "A screen restriction is detected and localised correctly."),
    ("GT-005", "SC-FEED-INSTABILITY", "Feed instability is recognised as the feeder, not the melt path."),
    ("GT-006", "SC-COOLING-FAILURE", "A zone cooling failure is diagnosed thermally."),
    ("GT-007", "SC-PRESSURE-DRIFT", "A drifting transmitter is diagnosed instrumentation-first."),
    ("GT-008", "SC-MISSING-MANDATORY", "Missing required evidence yields INSUFFICIENT_EVIDENCE."),
    ("GT-009", "SC-HEALTHY", "An approved Danger cannot be downgraded by ML uncertainty."),
    ("GT-010", "SC-UNKNOWN-ANOMALY", "An unknown pattern yields FAULT_UNKNOWN, not the nearest class."),
    ("GT-011", "SC-TWO-FAULTS", "Two independent faults are both retained."),
    ("GT-012", "SC-CAUSAL-CHAIN", "A causal chain groups downstream symptoms under the primary cause."),
)


def scenario(scenario_id: str) -> Scenario:
    return SCENARIOS_BY_ID[scenario_id]


def fault_scenarios() -> tuple[Scenario, ...]:
    return tuple(entry for entry in SCENARIOS if entry.fault_id is not None)


def healthy_scenarios() -> tuple[Scenario, ...]:
    return tuple(entry for entry in SCENARIOS if entry.fault_id is None)
