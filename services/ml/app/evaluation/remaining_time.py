"""Remaining useful time — how long until this machine leaves a usable state.

    from app.evaluation.remaining_time import estimate_remaining_time
    estimate = estimate_remaining_time([(5, 0.12), (15, 0.48), (30, 0.83)])
    estimate.median_minutes      # 15.6
    estimate.censored            # False

**What this is.** The classifier answers "will this fault develop within N
minutes?" at each trained horizon. Read together, those probabilities are a
cumulative distribution over onset time, sampled at three points. Inverting it
gives the time by which onset is more likely than not — the machine's remaining
useful time with respect to that fault.

**What this is not, and the distinction matters operationally.** This is not
component remaining-useful-life. RUL in the wear sense — how many hours are left
in a bearing, a gearbox, a screw flight — needs three things this system does
not have and cannot infer:

  1. an end-of-life definition per component. The DOC-01..07 knowledge layer
     contains no wear limit, no degradation state and no end-of-life criterion;
     a search for "remaining", "wear" and "life" returns nothing.
  2. a degradation model. Wear is monotonic and consumes life; the faults in
     this library are process conditions that are *cleared*. A blocked screen
     pack is cleaned and the clock resets — it has no remaining life to
     estimate.
  3. run-to-failure histories. Several complete degradation cycles per
     component, which needs a year or more of operation including real
     failures.

Producing an hours-to-failure number without those would mean inventing the
wear threshold, the degradation curve and the failure criterion. Somebody would
then schedule a shutdown around a fabricated constant. So this module estimates
what the models were actually trained to know, and says so in its own field
names.

**Honesty rules this module follows.**

*Censoring is reported, not extrapolated.* When the probability curve never
reaches the quantile inside the longest trained horizon — which is the normal
case on a healthy machine — the answer is "beyond 30 minutes", not a number
obtained by extending a line. Extrapolating past the last trained horizon is
exactly how a 30-minute model starts claiming to see days.

*The curve is forced monotonic.* A cumulative distribution cannot decrease. If
P(within 15) comes back below P(within 5), that is model noise between two
independently fitted boosters, and taking the running maximum is the correct
repair. The adjustment is recorded so nobody mistakes it for a measurement.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Sequence

#: Quantiles reported. The median is the headline; the quartiles are the band.
#: Not a confidence interval — it is the spread of the onset distribution the
#: model implies, which is a different and weaker claim.
LOWER_QUANTILE = 0.25
MEDIAN_QUANTILE = 0.50
UPPER_QUANTILE = 0.75


@dataclass(frozen=True)
class RemainingTimeEstimate:
    """Time until onset, or an explicit statement that it is beyond the horizon."""

    median_minutes: float | None
    lower_minutes: float | None
    upper_minutes: float | None

    censored: bool
    """True when the curve never reaches the median inside the trained horizons.

    The normal state of a healthy machine. ``median_minutes`` is None and
    ``beyond_minutes`` carries the longest horizon actually modelled.
    """

    beyond_minutes: float | None = None
    left_censored: bool = False
    """True when onset is already more likely than not at the *shortest*
    horizon, so the estimate is "at most 5 minutes" rather than a point."""

    monotonic_repair: bool = False
    """A non-decreasing curve had to be enforced. Model noise, not a reading."""

    horizons: tuple[tuple[float, float], ...] = ()
    """The (minutes, probability) pairs this was derived from, as used."""

    basis: str = ""

    def to_json(self) -> dict[str, Any]:
        return {
            # Named for what it is. Calling this remaining_useful_life would
            # invite a reader to plan maintenance intervals from a 30-minute
            # process-fault model.
            "remaining_useful_time_minutes": (
                None if self.median_minutes is None else round(self.median_minutes, 1)
            ),
            "lower_minutes": None if self.lower_minutes is None else round(self.lower_minutes, 1),
            "upper_minutes": None if self.upper_minutes is None else round(self.upper_minutes, 1),
            "censored": self.censored,
            "beyond_minutes": self.beyond_minutes,
            "left_censored": self.left_censored,
            "monotonic_repair": self.monotonic_repair,
            "horizons": [[m, round(p, 4)] for m, p in self.horizons],
            "basis": self.basis,
            "means": (
                "Time until this fault is more likely than not to have begun, "
                "inverted from the trained horizon probabilities. Not component "
                "wear life."
            ),
        }


def _crossing(points: Sequence[tuple[float, float]], quantile: float) -> float | None:
    """Minutes at which the curve first reaches ``quantile``.

    Linear between the two bracketing horizons. Returns None when the curve
    never gets there, which the caller reports as censored rather than guessing.
    """
    previous_minutes = 0.0
    previous_probability = 0.0
    for minutes, probability in points:
        if probability >= quantile:
            if probability == previous_probability:
                return minutes
            span = probability - previous_probability
            fraction = (quantile - previous_probability) / span
            return previous_minutes + fraction * (minutes - previous_minutes)
        previous_minutes, previous_probability = minutes, probability
    return None


def estimate_remaining_time(
    horizons: Sequence[tuple[float, float]],
) -> RemainingTimeEstimate:
    """Invert a horizon probability curve into a remaining-time estimate.

    ``horizons`` is (minutes, probability) per trained horizon, in any order.
    """
    usable = sorted(
        (float(m), float(p)) for m, p in horizons if m is not None and p is not None
    )
    if not usable:
        return RemainingTimeEstimate(
            median_minutes=None,
            lower_minutes=None,
            upper_minutes=None,
            censored=True,
            basis="No horizon probabilities were produced for this fault.",
        )

    # A cumulative distribution cannot decrease. Two independently fitted
    # boosters can disagree by a little; the running maximum is the repair.
    repaired: list[tuple[float, float]] = []
    highest = 0.0
    changed = False
    for minutes, probability in usable:
        clamped = min(max(probability, 0.0), 1.0)
        if clamped < highest:
            changed = True
            clamped = highest
        highest = clamped
        repaired.append((minutes, clamped))

    longest = repaired[-1][0]
    shortest, shortest_probability = repaired[0]

    median = _crossing(repaired, MEDIAN_QUANTILE)
    lower = _crossing(repaired, LOWER_QUANTILE)
    upper = _crossing(repaired, UPPER_QUANTILE)

    if median is None:
        # The ordinary case on a healthy machine, and the one where a number
        # would be an invention.
        return RemainingTimeEstimate(
            median_minutes=None,
            lower_minutes=lower,
            upper_minutes=None,
            censored=True,
            beyond_minutes=longest,
            monotonic_repair=changed,
            horizons=tuple(repaired),
            basis=(
                f"Onset stays below even odds through the longest trained horizon "
                f"({longest:.0f} min), so remaining time is beyond it. Not "
                f"extrapolated: this model was never trained past {longest:.0f} min."
            ),
        )

    left = shortest_probability >= MEDIAN_QUANTILE
    return RemainingTimeEstimate(
        median_minutes=median,
        lower_minutes=lower,
        upper_minutes=upper,
        censored=False,
        beyond_minutes=None,
        left_censored=left,
        monotonic_repair=changed,
        horizons=tuple(repaired),
        basis=(
            f"Onset reaches even odds at {median:.1f} min, interpolated between "
            f"trained horizons."
            + (
                f" Already past even odds at the shortest horizon ({shortest:.0f} min), "
                "so this is an upper bound."
                if left
                else ""
            )
            + (" A non-decreasing curve was enforced first." if changed else "")
        ),
    )


def describe(estimate: RemainingTimeEstimate) -> str:
    """One line for an operator. Never a bare number."""
    if estimate.censored:
        if estimate.beyond_minutes is None:
            # No horizons at all — a different statement from "beyond the
            # window", and formatting None as a number would raise here rather
            # than in the caller.
            return "Not estimated — no horizon probability was produced for this fault."
        return (
            f"Beyond {estimate.beyond_minutes:.0f} min — no fault is more likely than "
            "not to begin inside the modelled window."
        )
    if estimate.left_censored:
        return f"At most {estimate.median_minutes:.0f} min — onset may already have begun."
    band = (
        f" (25–75%: {estimate.lower_minutes:.0f}–{estimate.upper_minutes:.0f} min)"
        if estimate.lower_minutes is not None and estimate.upper_minutes is not None
        else ""
    )
    return f"About {estimate.median_minutes:.0f} min of useful operation remaining{band}."
