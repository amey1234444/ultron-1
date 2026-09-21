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
) -> dict[str, float | int]:
    """How many *events* were caught, not how many samples."""
    total = len(outcomes)
    detected = sum(1 for outcome in outcomes if outcome.detected)
    return {
        "events": total,
        "detected": detected,
        "event_recall": round(detected / total, 4) if total else 0.0,
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
