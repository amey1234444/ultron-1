"""Evaluation, per fault and per horizon. Accuracy is not reported.

At a 0.2% positive rate a model that answers "no fault" to everything scores
99.8% accuracy and is worth precisely nothing, so accuracy does not appear in
this module at all. What does:

**PR-AUC** as the headline. It is the metric that degrades honestly under
imbalance, where ROC-AUC stays flattering.

**Event-level recall** alongside sample-level. Catching ninety per cent of the
*samples* of two long events and none of eight short ones is one number that
hides the thing that matters: a maintenance team cares how many *events* were
caught, not how many seconds of them.

**False alarms per operating hour.** The number that decides whether anyone
keeps the system switched on. A model with 80% recall and four false alarms a
shift will be ignored inside a fortnight.

**Lead time distribution.** Median and p10, not mean. Mean lead time is
dominated by the one event detected forty minutes early and says nothing about
the typical case.

**Calibration.** Because a probability that does not mean what it says cannot
be thresholded coherently.

Every function here takes plain sequences and returns plain dictionaries, with
no dependency on a modelling library, so the metrics can be computed on
anything — a champion, a challenger, an ablation arm, or a rules-only baseline.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Sequence

from ..models.calibration.calibrators import (
    brier_score,
    expected_calibration_error,
    reliability_curve,
)


@dataclass
class ClassificationMetrics:
    """Sample-level metrics for one output at one threshold."""

    threshold: float
    true_positives: int
    false_positives: int
    true_negatives: int
    false_negatives: int

    @property
    def precision(self) -> float:
        denominator = self.true_positives + self.false_positives
        return self.true_positives / denominator if denominator else 0.0

    @property
    def recall(self) -> float:
        denominator = self.true_positives + self.false_negatives
        return self.true_positives / denominator if denominator else 0.0

    @property
    def f1(self) -> float:
        total = self.precision + self.recall
        return 2 * self.precision * self.recall / total if total else 0.0

    @property
    def false_positive_rate(self) -> float:
        denominator = self.false_positives + self.true_negatives
        return self.false_positives / denominator if denominator else 0.0

    @property
    def false_negative_rate(self) -> float:
        denominator = self.false_negatives + self.true_positives
        return self.false_negatives / denominator if denominator else 0.0

    def to_json(self) -> dict[str, float]:
        return {
            "threshold": self.threshold,
            "precision": round(self.precision, 4),
            "recall": round(self.recall, 4),
            "f1": round(self.f1, 4),
            "false_positive_rate": round(self.false_positive_rate, 4),
            "false_negative_rate": round(self.false_negative_rate, 4),
            "true_positives": self.true_positives,
            "false_positives": self.false_positives,
            "true_negatives": self.true_negatives,
            "false_negatives": self.false_negatives,
        }


def confusion(
    probabilities: Sequence[float], labels: Sequence[int], threshold: float
) -> ClassificationMetrics:
    tp = fp = tn = fn = 0
    for probability, label in zip(probabilities, labels):
        predicted = probability >= threshold
        if predicted and label == 1:
            tp += 1
        elif predicted:
            fp += 1
        elif label == 1:
            fn += 1
        else:
            tn += 1
    return ClassificationMetrics(
        threshold=threshold, true_positives=tp, false_positives=fp, true_negatives=tn, false_negatives=fn
    )


def pr_auc(probabilities: Sequence[float], labels: Sequence[int]) -> float:
    """Average precision — the area under the precision-recall curve.

    Computed as the step-wise sum of precision at each positive, which is the
    definition scikit-learn's ``average_precision_score`` uses. Written out so
    the metric is available with no modelling library installed.
    """
    if not probabilities:
        return 0.0
    positives = sum(1 for label in labels if label == 1)
    if positives == 0:
        return 0.0

    ordered = sorted(zip(probabilities, labels), key=lambda pair: -pair[0])
    seen_positive = 0
    total = 0.0
    for index, (_score, label) in enumerate(ordered, start=1):
        if label == 1:
            seen_positive += 1
            total += seen_positive / index
    return total / positives


def roc_auc(probabilities: Sequence[float], labels: Sequence[int]) -> float:
    """Rank-based AUC. Secondary — reported, never optimised against."""
    positives = [p for p, label in zip(probabilities, labels) if label == 1]
    negatives = [p for p, label in zip(probabilities, labels) if label != 1]
    if not positives or not negatives:
        return 0.0

    ordered = sorted(zip(probabilities, labels))
    ranks: dict[int, float] = {}
    index = 0
    rank = 1
    while index < len(ordered):
        end = index
        while end + 1 < len(ordered) and ordered[end + 1][0] == ordered[index][0]:
            end += 1
        average = (rank + rank + (end - index)) / 2
        for position in range(index, end + 1):
            ranks[position] = average
        rank += end - index + 1
        index = end + 1

    positive_rank_sum = sum(
        ranks[position] for position, (_score, label) in enumerate(ordered) if label == 1
    )
    count_p, count_n = len(positives), len(negatives)
    return (positive_rank_sum - count_p * (count_p + 1) / 2) / (count_p * count_n)


def best_threshold(
    probabilities: Sequence[float],
    labels: Sequence[int],
    *,
    objective: str = "f1",
    min_precision: float | None = None,
) -> tuple[float, ClassificationMetrics]:
    """Sweep thresholds and pick one, against a declared objective.

    ``min_precision`` is the practical control: on a plant, a recall gain that
    costs three false alarms a shift is a loss, and constraining precision is
    how that trade is expressed instead of hoping F1 captures it.
    """
    candidates = sorted({round(value, 3) for value in probabilities} | {0.05 * step for step in range(1, 20)})
    best: tuple[float, ClassificationMetrics] | None = None
    for threshold in candidates:
        metrics = confusion(probabilities, labels, threshold)
        if min_precision is not None and metrics.precision < min_precision:
            continue
        score = metrics.f1 if objective == "f1" else metrics.recall
        if best is None or score > (best[1].f1 if objective == "f1" else best[1].recall):
            best = (threshold, metrics)
    if best is None:
        # No threshold meets the precision floor. Returning the highest one is
        # honest: the model cannot be operated at that precision.
        return 1.0, confusion(probabilities, labels, 1.0)
    return best


@dataclass
class EventOutcome:
    """Whether one confirmed event was caught, and how early."""

    event_id: str
    fault_id: str
    detected: bool
    lead_time_seconds: float | None
    first_crossing_at: datetime | None
    onset_at: datetime | None


def event_level_recall(
    outcomes: Sequence[EventOutcome],
) -> dict[str, float | int | str | None]:
    """How many *events* were caught, not how many samples.

    With no events in the split the recall is **undefined**, and it is reported
    as ``None`` with a reason rather than as ``0.0``. The difference is not
    cosmetic: ``0.0`` reads as "the model missed everything" and would fail a
    promotion gate on evidence that does not exist, when the truth is that the
    split contained nothing to detect. The frozen test split of ds-synth-002
    reported exactly this — `event_recall: 0.0` over zero events — and it was
    read as a model failure for longer than it should have been.
    """
    total = len(outcomes)
    detected = sum(1 for outcome in outcomes if outcome.detected)
    if total == 0:
        return {
            "events": 0,
            "detected": 0,
            "event_recall": None,
            "undefined_reason": "No physical events of this fault occur in this split.",
        }
    return {
        "events": total,
        "detected": detected,
        "event_recall": round(detected / total, 4),
    }


def lead_times(outcomes: Sequence[EventOutcome]) -> dict[str, float | None]:
    """Lead time distribution. Median and p10, never the mean.

    p10 is the number that matters operationally: it is the lead time you can
    rely on nine times in ten, and it is the one a maintenance window is
    planned against.
    """
    values = sorted(
        outcome.lead_time_seconds
        for outcome in outcomes
        if outcome.detected and outcome.lead_time_seconds is not None
    )
    if not values:
        return {"count": 0, "median": None, "p10": None, "p25": None, "p75": None, "p90": None}

    def percentile(fraction: float) -> float:
        position = fraction * (len(values) - 1)
        low = int(position)
        high = min(low + 1, len(values) - 1)
        weight = position - low
        return values[low] * (1 - weight) + values[high] * weight

    return {
        "count": len(values),
        "median": round(percentile(0.5), 1),
        "p10": round(percentile(0.10), 1),
        "p25": round(percentile(0.25), 1),
        "p75": round(percentile(0.75), 1),
        "p90": round(percentile(0.90), 1),
    }


def false_alarms_per_hour(
    timestamps: Sequence[datetime],
    probabilities: Sequence[float],
    labels: Sequence[int],
    *,
    threshold: float,
    persistence_n: int = 1,
    persistence_m: int = 1,
) -> float:
    """False alarms an operator would actually have seen, per operating hour.

    Counts *alarm onsets* after the persistence filter, not raw samples above a
    threshold. A condition that sits above the line for ten minutes is one
    alarm, and counting six hundred would make every model look unusable.
    """
    if not timestamps:
        return 0.0
    span_hours = (max(timestamps) - min(timestamps)).total_seconds() / 3600.0
    if span_hours <= 0:
        return 0.0

    recent: list[bool] = []
    active = False
    alarms = 0
    for probability, label in zip(probabilities, labels):
        recent.append(probability >= threshold)
        if len(recent) > persistence_m:
            recent = recent[-persistence_m:]
        met = sum(1 for flag in recent if flag) >= persistence_n
        if met and not active:
            active = True
            if label != 1:
                alarms += 1
        elif not met:
            active = False
    return round(alarms / span_hours, 4)


@dataclass
class OutputEvaluation:
    """Everything worth knowing about one fault-horizon pair."""

    key: str
    fault_id: str
    horizon_minutes: int
    sample_count: int
    positive_count: int
    pr_auc: float
    roc_auc: float
    brier: float
    calibration_error: float
    reliability: list[dict[str, float]]
    at_threshold: ClassificationMetrics
    false_alarms_per_hour: float
    event_recall: dict[str, float | int] = field(default_factory=dict)
    lead_time: dict[str, float | None] = field(default_factory=dict)
    note: str | None = None

    def to_json(self) -> dict[str, object]:
        return {
            "key": self.key,
            "fault_id": self.fault_id,
            "horizon_minutes": self.horizon_minutes,
            "samples": self.sample_count,
            "positives": self.positive_count,
            "positive_rate": round(self.positive_count / self.sample_count, 6) if self.sample_count else 0.0,
            "pr_auc": round(self.pr_auc, 4),
            "roc_auc": round(self.roc_auc, 4),
            "brier": round(self.brier, 4),
            "calibration_error": round(self.calibration_error, 4),
            "reliability": self.reliability,
            "threshold_metrics": self.at_threshold.to_json(),
            "false_alarms_per_hour": self.false_alarms_per_hour,
            "event_recall": self.event_recall,
            "lead_time_seconds": self.lead_time,
            "note": self.note,
        }


def evaluate_output(
    *,
    key: str,
    probabilities: Sequence[float],
    labels: Sequence[int],
    timestamps: Sequence[datetime],
    threshold: float,
    outcomes: Sequence[EventOutcome] = (),
    persistence_n: int = 3,
    persistence_m: int = 5,
) -> OutputEvaluation:
    """Every metric for one output, at one operating threshold."""
    fault_id, _, horizon = key.rpartition("@")
    positives = sum(1 for label in labels if label == 1)

    note = None
    if positives == 0:
        note = (
            "No positive samples in this split. Every metric below is undefined rather "
            "than zero, and a model for this output has not been demonstrated at all."
        )

    return OutputEvaluation(
        key=key,
        fault_id=fault_id,
        horizon_minutes=int(horizon or 0),
        sample_count=len(labels),
        positive_count=positives,
        pr_auc=pr_auc(probabilities, labels),
        roc_auc=roc_auc(probabilities, labels),
        brier=brier_score(probabilities, labels),
        calibration_error=expected_calibration_error(probabilities, labels),
        reliability=reliability_curve(probabilities, labels),
        at_threshold=confusion(probabilities, labels, threshold),
        false_alarms_per_hour=false_alarms_per_hour(
            timestamps,
            probabilities,
            labels,
            threshold=threshold,
            persistence_n=persistence_n,
            persistence_m=persistence_m,
        ),
        event_recall=event_level_recall(outcomes),
        lead_time=lead_times(outcomes),
        note=note,
    )


def detect_events(
    *,
    timestamps: Sequence[datetime],
    probabilities: Sequence[float],
    onsets: Sequence[tuple[str, str, datetime]],
    threshold: float,
    persistence_n: int = 3,
    persistence_m: int = 5,
    max_lead_seconds: float = 3600.0,
) -> list[EventOutcome]:
    """Match persistent threshold crossings to confirmed onsets.

    The crossing must be one the *decision layer* would actually have
    surfaced — threshold plus persistence — because counting isolated spikes
    inflates lead time with alerts nobody would ever have seen.
    """
    crossings: list[datetime] = []
    recent: list[bool] = []
    active = False
    for at, probability in zip(timestamps, probabilities):
        recent.append(probability >= threshold)
        if len(recent) > persistence_m:
            recent = recent[-persistence_m:]
        met = sum(1 for flag in recent if flag) >= persistence_n
        if met and not active:
            crossings.append(at)
            active = True
        elif not met:
            active = False

    outcomes: list[EventOutcome] = []
    window = timedelta(seconds=max_lead_seconds)
    for event_id, fault_id, onset in onsets:
        candidates = [at for at in crossings if onset - window <= at < onset]
        if candidates:
            first = min(candidates)
            outcomes.append(
                EventOutcome(
                    event_id=event_id,
                    fault_id=fault_id,
                    detected=True,
                    lead_time_seconds=(onset - first).total_seconds(),
                    first_crossing_at=first,
                    onset_at=onset,
                )
            )
        else:
            outcomes.append(
                EventOutcome(
                    event_id=event_id,
                    fault_id=fault_id,
                    detected=False,
                    lead_time_seconds=None,
                    first_crossing_at=None,
                    onset_at=onset,
                )
            )
    return outcomes


@dataclass
class FalseAlarmRecord:
    """One false alarm, with everything needed to understand why it happened.

    The report that matters most during shadow deployment. "Forty false alarms"
    is a number nobody can act on; "thirty-one of them were during startup
    transients, and the state engine was reporting ST-05 at 0.45 confidence" is
    a fix.
    """

    at: datetime
    machine_id: str
    fault_id: str
    horizon_minutes: int
    probability: float
    threshold: float
    operating_state: str
    state_confidence: float
    recipe_id: str | None
    context_id: str | None
    rule_severity: str
    data_quality: str
    baseline_level: str | None
    top_features: list[tuple[str, float]] = field(default_factory=list)
    actual_outcome: str = "NO_EVENT_CONFIRMED"
    probable_reason: str = ""

    def to_json(self) -> dict[str, object]:
        return {
            "at": self.at.isoformat(),
            "machine_id": self.machine_id,
            "fault_id": self.fault_id,
            "horizon_minutes": self.horizon_minutes,
            "probability": round(self.probability, 4),
            "threshold": self.threshold,
            "operating_state": self.operating_state,
            "state_confidence": self.state_confidence,
            "recipe_id": self.recipe_id,
            "context_id": self.context_id,
            "rule_severity": self.rule_severity,
            "data_quality": self.data_quality,
            "baseline_level": self.baseline_level,
            "top_features": [{"feature": name, "shap": round(value, 4)} for name, value in self.top_features],
            "actual_outcome": self.actual_outcome,
            "probable_reason": self.probable_reason,
        }


def classify_false_alarm(record: FalseAlarmRecord) -> str:
    """A first-pass reason for a false alarm, from the context around it.

    Heuristic and labelled as such. Its value is triage: it sorts forty alarms
    into four buckets so an engineer reads the interesting ones first, and it
    is never presented as the verified cause.
    """
    if record.operating_state in {"ST-04", "ST-05"}:
        return "Startup or ramp transient — the model was applied outside steady production."
    if record.operating_state == "ST-07":
        return "Recipe transition — the context changed and the baseline had not caught up."
    if record.data_quality in {"UNCERTAIN", "BAD"}:
        return "Degraded data quality at the time of the alarm."
    if record.baseline_level in {"TEMPLATE_REFERENCE", "CUSTOMER_OEM_REFERENCE"}:
        return "Compared against an uncalibrated template baseline rather than learned history."
    if record.state_confidence < 0.5:
        return "Low operating-state confidence; the state may have been wrong."
    if record.rule_severity != "NORMAL":
        return (
            "The deterministic layer also saw something. This may be a real but unconfirmed "
            "anomaly rather than a model error."
        )
    return "No obvious contextual cause. Candidate for engineering review or a label gap."


# ---------------------------------------------------------------------------
# Sanity gates.
#
# These exist because ds-synth-002 produced nine outputs whose every metric was
# computed correctly, reported honestly, and described a model that had learned
# nothing at all. The trees contained zero splits, every prediction was the
# base score, ROC-AUC was exactly 0.50, and nothing in the pipeline objected.
#
# A metric describes a model. A gate refuses one. The difference is what these
# add. See docs/ml/WHY_THE_MODEL_WAS_CONSTANT.md.


@dataclass(frozen=True)
class SanityVerdict:
    """The outcome of one gate, with the numbers that decided it."""

    check: str
    passed: bool
    detail: str
    observed: dict[str, float | int | None] = field(default_factory=dict)

    def to_json(self) -> dict[str, object]:
        return {
            "check": self.check,
            "passed": self.passed,
            "detail": self.detail,
            "observed": self.observed,
        }


#: Below this spread a score column carries no ranking information at all.
#: Deliberately tiny — this catches a degenerate model, not a cautious one.
CONSTANT_PREDICTION_STD = 1e-6

#: A ranking this close to chance on data built to be separable means something
#: upstream is broken. It is not a quality bar; a genuinely weak model scores
#: well clear of it.
RANDOM_RANKING_MARGIN = 0.02


def constant_predictor_check(probabilities: Sequence[float]) -> SanityVerdict:
    """Fail when a model returns effectively one number for every input."""
    values = [float(p) for p in probabilities if p is not None]
    if len(values) < 2:
        return SanityVerdict(
            check="CONSTANT_PREDICTOR_CHECK",
            passed=False,
            detail="Fewer than two predictions were produced; nothing can be concluded.",
            observed={"count": len(values)},
        )
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    std = variance**0.5
    distinct = len(set(round(value, 9) for value in values))
    passed = std > CONSTANT_PREDICTION_STD and distinct > 1
    return SanityVerdict(
        check="CONSTANT_PREDICTOR_CHECK",
        passed=passed,
        detail=(
            "Predictions vary across inputs."
            if passed
            else (
                f"Every prediction is effectively the same value (std={std:.3e}, "
                f"{distinct} distinct). The model cannot rank anything. Check that the "
                "feature matrix reaching the trainer is populated."
            )
        ),
        observed={
            "std": std,
            "mean": mean,
            "min": min(values),
            "max": max(values),
            "distinct": distinct,
            "count": len(values),
        },
    )


def ranking_sanity_check(observed_roc_auc: float, *, positives: int, negatives: int) -> SanityVerdict:
    """Fail when ranking is indistinguishable from chance on separable data.

    Reported as undecidable rather than failed when either class is empty,
    because ROC-AUC is undefined there and a gate that fails on an undefined
    metric teaches people to ignore gates.
    """
    if positives == 0 or negatives == 0:
        return SanityVerdict(
            check="RANKING_SANITY_CHECK",
            passed=True,
            detail=(
                "Undecidable: ROC-AUC needs both classes present "
                f"({positives} positive, {negatives} negative)."
            ),
            observed={"roc_auc": None, "positives": positives, "negatives": negatives},
        )
    passed = abs(observed_roc_auc - 0.5) > RANDOM_RANKING_MARGIN
    return SanityVerdict(
        check="RANKING_SANITY_CHECK",
        passed=passed,
        detail=(
            f"ROC-AUC {observed_roc_auc:.4f} is distinguishable from chance."
            if passed
            else (
                f"ROC-AUC {observed_roc_auc:.4f} is within {RANDOM_RANKING_MARGIN} of 0.50. "
                "On data built to be separable this indicates a broken pipeline, not a weak "
                "model — check the feature matrix, the label alignment and the column order."
            )
        ),
        observed={
            "roc_auc": observed_roc_auc,
            "positives": positives,
            "negatives": negatives,
        },
    )
