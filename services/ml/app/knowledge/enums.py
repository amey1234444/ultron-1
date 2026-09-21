"""Python literals for the vocabulary shared with the TypeScript layer.

These exist so Python code can be type-checked and read without a dictionary
lookup, and every one of them is asserted against ``enums.json`` by
``tests/unit/test_enums_match_knowledge.py``. That test is the whole point: two
languages agreeing on a vocabulary by convention drift apart silently, and the
first symptom is a UI that renders "PROBABLE" as unknown because someone
renamed it on one side.

Where a value below does *not* appear in the snapshot it is marked, with the
reason. There are three such additions and they are all ML concepts the
documents do not have a word for.
"""

from __future__ import annotations

from typing import Final, Literal

# --- DOC-02 ---------------------------------------------------------------

QualityVerdict = Literal["GOOD", "UNCERTAIN", "BAD", "MISSING"]
QUALITY_VERDICTS: Final[tuple[str, ...]] = ("GOOD", "UNCERTAIN", "BAD", "MISSING")

QUALITY_RANK: Final[dict[str, int]] = {"GOOD": 0, "UNCERTAIN": 1, "BAD": 2, "MISSING": 3}

OperatingState = Literal[
    "ST-00", "ST-01", "ST-02", "ST-03", "ST-04", "ST-05", "ST-06",
    "ST-07", "ST-08", "ST-09", "ST-10", "ST-11", "ST-12",
]
OPERATING_STATES: Final[tuple[str, ...]] = tuple(f"ST-{index:02d}" for index in range(13))

#: The one state DOC-02 permits steady baseline learning in. Read from the
#: snapshot at runtime; this literal is the documented expectation a test pins.
STEADY_PRODUCTION: Final = "ST-06"

LimitStatus = Literal["NONE", "ALERT", "DANGER", "TRIP", "UNKNOWN"]

# --- DOC-03 ---------------------------------------------------------------

SymbolicState = Literal[
    "NORMAL",
    "LOW_DEVIATION",
    "HIGH_DEVIATION",
    "LOW_ANOMALY",
    "HIGH_ANOMALY",
    "RISING",
    "FALLING",
    "UNSTABLE",
    "INSUFFICIENT_DATA",
    "INSUFFICIENT_CONTEXT",
    "NOT_APPLICABLE",
]

BaselineLevel = Literal[
    "EXACT_CONTEXT",
    "CONTEXT_BAND",
    "BROADER_CONTEXT",
    "TEMPLATE_REFERENCE",
    "CUSTOMER_OEM_REFERENCE",
]
BASELINE_LEVELS: Final[tuple[str, ...]] = (
    "EXACT_CONTEXT",
    "CONTEXT_BAND",
    "BROADER_CONTEXT",
    "TEMPLATE_REFERENCE",
    "CUSTOMER_OEM_REFERENCE",
)

BaselineStatus = Literal[
    "NOT_AVAILABLE",
    "LEARNING",
    "PROVISIONAL",
    "VALID",
    "FROZEN",
    "REVIEW_REQUIRED",
    "SUPERSEDED",
    "RETIRED",
]

BaselineConfidence = Literal["HIGH", "MEDIUM", "LOW", "NONE"]

TrendDirection = Literal["RISING", "FALLING", "FLAT", "UNKNOWN"]

# --- DOC-04 ---------------------------------------------------------------

AnomalyVerdict = Literal[
    "NOT_ANOMALOUS",
    "HIGH_ANOMALY",
    "LOW_ANOMALY",
    "RISING_ABNORMAL",
    "FALLING_ABNORMAL",
    "OSCILLATING",
    "EXPECTED_PROCESS_RESPONSE",
    "DATA_QUALITY_SUSPECT",
    "NOT_EVALUATED",
]

DiagnosisState = Literal[
    "NOT_EVALUATED",
    "NOT_DETECTED",
    "POSSIBLE",
    "SUSPECTED",
    "PROBABLE",
    "INSUFFICIENT_EVIDENCE",
    "FAULT_UNKNOWN",
]
DIAGNOSIS_STATES: Final[tuple[str, ...]] = (
    "NOT_EVALUATED",
    "NOT_DETECTED",
    "POSSIBLE",
    "SUSPECTED",
    "PROBABLE",
    "INSUFFICIENT_EVIDENCE",
    "FAULT_UNKNOWN",
)

EvidenceClass = Literal["REQUIRED", "SUPPORTING", "CONTRADICTORY", "MISSING", "NOT_APPLICABLE"]

FaultFamily = Literal[
    "FEEDING",
    "PROCESS",
    "THERMAL",
    "VENTING",
    "DOWNSTREAM",
    "DRIVE_LOAD",
    "MECHANICAL",
    "INSTRUMENTATION",
    "CONTROL",
    "QUALITY",
]

# --- DOC-05 ---------------------------------------------------------------

Severity = Literal["NORMAL", "ALERT", "DANGER"]
SEVERITIES: Final[tuple[str, ...]] = ("NORMAL", "ALERT", "DANGER")

LimitAuthority = Literal[
    "SAFETY_TRIP",
    "CUSTOMER_DANGER",
    "CUSTOMER_ALERT",
    "OEM_ENGINEERING",
    "ULTRON_LEARNED",
]

#: DOC-05 §5. The floor an authority sets, which analytics may raise, never lower.
AUTHORITY_SEVERITY_FLOOR: Final[dict[str, str]] = {
    "SAFETY_TRIP": "DANGER",
    "CUSTOMER_DANGER": "DANGER",
    "CUSTOMER_ALERT": "ALERT",
    "OEM_ENGINEERING": "ALERT",
    "ULTRON_LEARNED": "NORMAL",
}

ConfidenceLevel = Literal["LOW", "MEDIUM", "HIGH", "INSUFFICIENT_EVIDENCE"]

ImpactLevel = Literal["NONE", "LOW", "MEDIUM", "HIGH", "POTENTIAL"]

Priority = Literal["P1", "P2", "P3", "P4"]
PRIORITIES: Final[tuple[str, ...]] = ("P1", "P2", "P3", "P4")

ActionLevel = Literal[
    "MONITOR",
    "VERIFY",
    "INSPECT",
    "PLAN_MAINTENANCE",
    "URGENT_INTERVENTION",
    "IMMEDIATE_ESCALATION",
]

ActionStep = Literal["CONFIRM", "INSPECT", "CORRECT", "VERIFY", "ESCALATE"]

ProgressionStage = Literal["EARLY", "DEVELOPING", "ADVANCED", "SEVERE"]

# --- ML concepts the documents have no word for ---------------------------

#: NOT in the snapshot. DOC-04 classifies a *finding*; this classifies the
#: overall condition of a machine at an instant, which is the thing the
#: Analyzer's Overview needs and no document names.
ConditionVerdict = Literal[
    "NORMAL",
    "EXPECTED_PROCESS_RESPONSE",
    "ANOMALY_CONFIRMED",
    "FAULT_UNKNOWN",
    "INSUFFICIENT_EVIDENCE",
    "DATA_QUALITY_PROBLEM",
]
CONDITION_VERDICTS: Final[tuple[str, ...]] = (
    "NORMAL",
    "EXPECTED_PROCESS_RESPONSE",
    "ANOMALY_CONFIRMED",
    "FAULT_UNKNOWN",
    "INSUFFICIENT_EVIDENCE",
    "DATA_QUALITY_PROBLEM",
)

#: NOT in the snapshot. How much a label is worth as training truth.
LabelQuality = Literal["GOLD", "SILVER", "BRONZE", "UNVERIFIED"]
LABEL_QUALITIES: Final[tuple[str, ...]] = ("GOLD", "SILVER", "BRONZE", "UNVERIFIED")

#: NOT in the snapshot. Where a record came from. SYNTHETIC never silently
#: becomes REAL, which is the reason this is a stored field and not a guess.
DataSource = Literal["REAL", "SYNTHETIC", "SIMULATION", "REPLAY"]

ModelKind = Literal["TEMPORAL_LSTM", "LIGHTGBM", "XGBOOST", "CALIBRATOR", "BASELINE"]

ChampionRole = Literal["CHAMPION", "CHALLENGER", "CANDIDATE", "ARCHIVED"]


def confidence_level(score: float) -> ConfidenceLevel:
    """Map a 0..1 confidence score onto the DOC-05 §11 band.

    The boundaries are the only numbers here and they are conventional rather
    than derived: 0.75 for HIGH, 0.45 for MEDIUM. They live in one function so
    a site that wants different ones changes them once.
    """
    if score >= 0.75:
        return "HIGH"
    if score >= 0.45:
        return "MEDIUM"
    return "LOW"
