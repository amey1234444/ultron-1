"""Service instrumentation.

Counters and latency histograms held in memory and exposed on ``/metrics``.
Deliberately not a Prometheus client: this service has one process, the numbers
are small, and adding a metrics library to make three counters observable is a
dependency for its own sake. The shape is Prometheus-compatible, so a scraper
can be pointed at it when one exists.

What is measured is chosen by what a question needs to be answerable:

    "is the ML layer actually running?"      eligible vs ineligible rate
    "why is it not?"                          counts per ineligibility reason
    "is it fast enough?"                      p50 / p95 / p99 inference latency
    "is the data any good?"                   quality verdict rate, missing rate
    "are the models being used?"              usage per model and baseline version
    "is anything alarming?"                   alerts raised, cleared, suppressed
    "is it any good?"                         confirmed positives and negatives

The last one comes from feedback and is the only one that matters in the end,
which is why it is counted here beside the operational numbers rather than
being left to a dashboard nobody builds.
"""

from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass, field
from typing import Iterable


@dataclass
class LatencyWindow:
    """A bounded sample of recent latencies.

    Bounded because an unbounded list on a service that runs for months is a
    leak, and because a p99 over three months is not a number anybody wants —
    the useful question is about now.
    """

    capacity: int = 2000
    samples: deque[float] = field(default_factory=lambda: deque(maxlen=2000))

    def observe(self, milliseconds: float) -> None:
        self.samples.append(milliseconds)

    def percentiles(self) -> dict[str, float | None]:
        if not self.samples:
            return {"count": 0, "p50": None, "p95": None, "p99": None, "max": None}
        ordered = sorted(self.samples)

        def at(fraction: float) -> float:
            index = min(len(ordered) - 1, int(fraction * len(ordered)))
            return round(ordered[index], 2)

        return {
            "count": len(ordered),
            "p50": at(0.50),
            "p95": at(0.95),
            "p99": at(0.99),
            "max": round(ordered[-1], 2),
        }


@dataclass
class ServiceMetrics:
    """Everything the service counts about itself."""

    requests: Counter = field(default_factory=Counter)
    inference_latency: LatencyWindow = field(default_factory=LatencyWindow)
    ineligible_reasons: Counter = field(default_factory=Counter)
    quality_verdicts: Counter = field(default_factory=Counter)
    missing_signals: Counter = field(default_factory=Counter)
    model_usage: Counter = field(default_factory=Counter)
    baseline_levels: Counter = field(default_factory=Counter)
    alerts: Counter = field(default_factory=Counter)
    feedback: Counter = field(default_factory=Counter)
    failures: Counter = field(default_factory=Counter)
    window_readiness: Counter = field(default_factory=Counter)
    unknown_events: int = 0

    # -- recording ---------------------------------------------------------

    def request(self, route: str) -> None:
        self.requests[route] += 1

    def inference(
        self,
        *,
        latency_ms: float,
        eligible: bool,
        reason: str | None,
        quality: str,
        missing: Iterable[str],
        model_id: str | None,
        baseline_level: str | None,
        condition: str,
    ) -> None:
        self.inference_latency.observe(latency_ms)
        self.requests["inference"] += 1
        self.requests["inference_eligible" if eligible else "inference_ineligible"] += 1
        if reason:
            self.ineligible_reasons[reason] += 1
        self.quality_verdicts[quality] += 1
        for signal in missing:
            self.missing_signals[signal] += 1
        if model_id:
            self.model_usage[model_id] += 1
        if baseline_level:
            self.baseline_levels[baseline_level] += 1
        if condition == "FAULT_UNKNOWN":
            # Worth its own counter. A rising unknown rate means the fault
            # library is behind the machine, which is a knowledge job rather
            # than a modelling one.
            self.unknown_events += 1

    def alert(self, action: str) -> None:
        """action: raised | cleared | suppressed | bypassed."""
        self.alerts[action] += 1

    def failure(self, component: str) -> None:
        self.failures[component] += 1

    def feedback_received(self, verdict: str) -> None:
        """verdict: confirmed_positive | confirmed_negative | false_positive |
        false_negative | partial | unknown."""
        self.feedback[verdict] += 1

    def window(self, ready: bool) -> None:
        self.window_readiness["ready" if ready else "insufficient"] += 1

    # -- reporting ---------------------------------------------------------

    def eligible_rate(self) -> float | None:
        total = self.requests["inference_eligible"] + self.requests["inference_ineligible"]
        if total == 0:
            return None
        return round(self.requests["inference_eligible"] / total, 4)

    def good_quality_rate(self) -> float | None:
        total = sum(self.quality_verdicts.values())
        if total == 0:
            return None
        return round(self.quality_verdicts["GOOD"] / total, 4)

    def confirmed_precision(self) -> float | None:
        """Precision as engineers actually confirmed it.

        The only number here that says whether the system is any good. None
        until somebody has confirmed something, which is honest — an
        unconfirmed prediction is not a correct one.
        """
        positives = self.feedback["confirmed_positive"]
        negatives = self.feedback["false_positive"]
        if positives + negatives == 0:
            return None
        return round(positives / (positives + negatives), 4)

    def snapshot(self) -> dict[str, object]:
        return {
            "requests": dict(self.requests),
            "inference_latency_ms": self.inference_latency.percentiles(),
            "eligible_rate": self.eligible_rate(),
            "ineligible_reasons": dict(self.ineligible_reasons),
            "data_quality": {
                "verdicts": dict(self.quality_verdicts),
                "good_rate": self.good_quality_rate(),
                "missing_signals": dict(self.missing_signals.most_common(20)),
            },
            "models": {
                "usage": dict(self.model_usage),
                "baseline_levels": dict(self.baseline_levels),
            },
            "window_readiness": dict(self.window_readiness),
            "alerts": dict(self.alerts),
            "unknown_event_count": self.unknown_events,
            "feedback": {
                "counts": dict(self.feedback),
                "confirmed_precision": self.confirmed_precision(),
                "note": (
                    "Confirmed precision is None until engineers have confirmed outcomes. "
                    "An unconfirmed prediction is not a correct one."
                ),
            },
            "failures": dict(self.failures),
        }

    def prometheus(self) -> str:
        """The same numbers in the exposition format, for a scraper."""
        lines: list[str] = []

        def emit(name: str, value: float, **labels: str) -> None:
            label = (
                "{" + ",".join(f'{key}="{value}"' for key, value in labels.items()) + "}"
                if labels
                else ""
            )
            lines.append(f"ultron_ml_{name}{label} {value}")

        for route, count in self.requests.items():
            emit("requests_total", count, route=route)
        for reason, count in self.ineligible_reasons.items():
            emit("ineligible_total", count, reason=reason)
        for verdict, count in self.quality_verdicts.items():
            emit("data_quality_total", count, verdict=verdict)
        for action, count in self.alerts.items():
            emit("alerts_total", count, action=action)
        for component, count in self.failures.items():
            emit("failures_total", count, component=component)

        percentiles = self.inference_latency.percentiles()
        for key in ("p50", "p95", "p99"):
            value = percentiles.get(key)
            if value is not None:
                emit("inference_latency_ms", float(value), quantile=key)

        emit("unknown_events_total", self.unknown_events)
        return "\n".join(lines) + "\n"


_METRICS: ServiceMetrics | None = None


def metrics() -> ServiceMetrics:
    global _METRICS
    if _METRICS is None:
        _METRICS = ServiceMetrics()
    return _METRICS


def reset_metrics() -> None:
    global _METRICS
    _METRICS = None
