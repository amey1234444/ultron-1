"""The feature mathematics — pure functions, no state, no I/O.

Every one of these returns ``None`` rather than a number it cannot justify.
That is the DOC-03 §37 rule made concrete: a denominator at zero yields
NOT_APPLICABLE, not infinity; a slope over one point yields nothing, not zero;
a z-score against a baseline with no spread yields nothing, not a division by a
fudge factor.

The alternative — epsilon in the denominator, zero for an unknown slope —
produces numbers that look like measurements and are not, and a tree ensemble
will happily learn to split on them.

Implemented on plain Python rather than numpy so the deterministic chain has no
array dependency at all: the whole quality → feature → rule path runs in an
environment where numpy failed to import, which is the path that must never go
down. numpy is used where it genuinely pays, in the model adapters.
"""

from __future__ import annotations

from datetime import datetime
from math import sqrt
from statistics import median as _median
from typing import Sequence


def mean(values: Sequence[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def median(values: Sequence[float]) -> float | None:
    if not values:
        return None
    return float(_median(values))


def std_dev(values: Sequence[float]) -> float | None:
    """Sample standard deviation. None below two points, which have no spread."""
    if len(values) < 2:
        return None
    centre = sum(values) / len(values)
    variance = sum((value - centre) ** 2 for value in values) / (len(values) - 1)
    return sqrt(variance)


def mad(values: Sequence[float]) -> float | None:
    """Median absolute deviation — the robust spread.

    Preferred over the standard deviation wherever a process variable is
    skewed or occasionally spiky, which on an extruder is most of them. One
    pressure spike moves the standard deviation and barely moves this.
    """
    centre = median(values)
    if centre is None:
        return None
    return median([abs(value - centre) for value in values])


def value_range(values: Sequence[float]) -> float | None:
    if not values:
        return None
    return max(values) - min(values)


def coefficient_of_variation(values: Sequence[float]) -> float | None:
    """Spread relative to level. Meaningless on a signal that crosses zero.

    Returned as None for a near-zero mean rather than as a huge number, because
    on a ratio scale a near-zero denominator does not mean "very variable", it
    means the statistic does not apply.
    """
    centre = mean(values)
    spread = std_dev(values)
    if centre is None or spread is None:
        return None
    if abs(centre) < 1e-9:
        return None
    return spread / abs(centre)


def percentile(values: Sequence[float], fraction: float) -> float | None:
    """Linear-interpolated percentile. ``fraction`` in 0..1."""
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = fraction * (len(ordered) - 1)
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def percentile_position(values: Sequence[float], value: float) -> float | None:
    """Where a value sits inside a distribution, 0..1."""
    if not values:
        return None
    below = sum(1 for entry in values if entry < value)
    equal = sum(1 for entry in values if entry == value)
    return (below + 0.5 * equal) / len(values)


def slope_per_minute(values: Sequence[float], timestamps: Sequence[datetime]) -> float | None:
    """Least-squares slope in units per minute.

    Least squares rather than first-minus-last: an endpoint slope on a noisy
    signal reports the noise at the endpoints, and a pressure trend read that
    way flickers between rising and falling every sample.
    """
    if len(values) < 3 or len(values) != len(timestamps):
        return None
    base = timestamps[0]
    xs = [(stamp - base).total_seconds() / 60.0 for stamp in timestamps]
    span = xs[-1] - xs[0]
    if span <= 0:
        return None
    x_mean = sum(xs) / len(xs)
    y_mean = sum(values) / len(values)
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, values))
    denominator = sum((x - x_mean) ** 2 for x in xs)
    if denominator <= 0:
        return None
    return numerator / denominator


def rate_of_change_per_minute(
    values: Sequence[float], timestamps: Sequence[datetime]
) -> float | None:
    """First difference over elapsed time. The instantaneous companion to slope.

    Never fabricates a time delta — DOC-03 §37's TIMESTAMP_INVALID_FOR_ROC rule.
    """
    if len(values) < 2 or len(values) != len(timestamps):
        return None
    elapsed = (timestamps[-1] - timestamps[-2]).total_seconds() / 60.0
    if elapsed <= 0:
        return None
    return (values[-1] - values[-2]) / elapsed


def ewma(values: Sequence[float], alpha: float = 0.3) -> float | None:
    """Exponentially weighted mean. Recent samples dominate, gently."""
    if not values:
        return None
    current = values[0]
    for value in values[1:]:
        current = alpha * value + (1 - alpha) * current
    return current


def ewma_slope(values: Sequence[float], timestamps: Sequence[datetime], alpha: float = 0.3) -> float | None:
    """Slope of the smoothed series — a trend with the noise taken out first."""
    if len(values) < 4 or len(values) != len(timestamps):
        return None
    smoothed: list[float] = [values[0]]
    for value in values[1:]:
        smoothed.append(alpha * value + (1 - alpha) * smoothed[-1])
    return slope_per_minute(smoothed, timestamps)


def z_score(value: float, centre: float | None, spread: float | None) -> float | None:
    """Standard score. None when the baseline has no usable spread."""
    if centre is None or spread is None or spread <= 1e-12:
        return None
    return (value - centre) / spread


def robust_score(value: float, centre: float | None, spread: float | None) -> float | None:
    """Median/MAD score, scaled to be comparable with a z-score.

    The 0.6745 factor makes one robust unit equal one standard deviation for
    normally distributed data, so a band of "3" means the same thing whichever
    score a feature happens to use.
    """
    if centre is None or spread is None or spread <= 1e-12:
        return None
    return 0.6745 * (value - centre) / spread


def absolute_deviation(value: float, expected: float | None) -> float | None:
    if expected is None:
        return None
    return value - expected


def percent_deviation(value: float, expected: float | None) -> float | None:
    """Deviation as a percentage. None when the expected value is ~zero.

    A percentage of nothing is not a large percentage, it is undefined, and
    reporting 40000% because the baseline was 0.001 is worse than reporting
    nothing.
    """
    if expected is None or abs(expected) < 1e-9:
        return None
    return (value - expected) / abs(expected) * 100.0


def ratio(numerator: float | None, denominator: float | None, *, floor: float = 1e-6) -> float | None:
    """A guarded ratio. None when the denominator is at or below the floor.

    ``floor`` is not an epsilon added to the denominator — it is the point
    below which the ratio stops being meaningful. Load per rpm at 0.2 rpm is
    not a large load, it is a machine that is not turning.
    """
    if numerator is None or denominator is None:
        return None
    if abs(denominator) <= floor:
        return None
    return numerator / denominator


def distance_to(value: float, boundary: float | None) -> float | None:
    """How far a value is from a limit. Positive means still inside."""
    if boundary is None:
        return None
    return boundary - value


def normalised_distance(value: float, boundary: float | None, reference: float | None) -> float | None:
    """Distance to a limit, scaled by a reference so tags are comparable.

    Without the scaling, "3 away" means something different for a pressure in
    MPa and a temperature in degrees, and a tree has to learn each tag's scale
    separately from data nobody has.
    """
    gap = distance_to(value, boundary)
    if gap is None or reference is None or abs(reference) < 1e-9:
        return None
    return gap / abs(reference)


def persistence_fraction(flags: Sequence[bool]) -> float | None:
    """Fraction of a window a condition held."""
    if not flags:
        return None
    return sum(1 for flag in flags if flag) / len(flags)


def persistence_seconds(
    flags: Sequence[bool], timestamps: Sequence[datetime]
) -> float | None:
    """How long the condition has held *continuously*, ending now.

    The run length at the end of the window, not the total inside it. A
    condition that fired twenty times an hour ago and is quiet now has not
    persisted, and a fraction over the whole window cannot tell the difference.
    """
    if not flags or len(flags) != len(timestamps):
        return None
    if not flags[-1]:
        return 0.0
    start_index = len(flags) - 1
    while start_index > 0 and flags[start_index - 1]:
        start_index -= 1
    return (timestamps[-1] - timestamps[start_index]).total_seconds()


def n_of_m(flags: Sequence[bool], n: int, m: int) -> bool:
    """Whether at least ``n`` of the last ``m`` samples were true."""
    if m <= 0 or not flags:
        return False
    recent = flags[-m:]
    return sum(1 for flag in recent if flag) >= n


def time_since_extreme(
    values: Sequence[float], timestamps: Sequence[datetime], *, mode: str
) -> float | None:
    """Seconds since the window's minimum or maximum.

    Distinguishes "still climbing" from "peaked and holding", which look the
    same to a level and to a spread.
    """
    if not values or len(values) != len(timestamps):
        return None
    target = max(values) if mode == "max" else min(values)
    for index in range(len(values) - 1, -1, -1):
        if values[index] == target:
            return (timestamps[-1] - timestamps[index]).total_seconds()
    return None


def setpoint_error(actual: float | None, setpoint: float | None) -> float | None:
    if actual is None or setpoint is None:
        return None
    return actual - setpoint


def normalised_setpoint_error(actual: float | None, setpoint: float | None) -> float | None:
    """Setpoint error as a fraction of the setpoint.

    Comparable across zones whose setpoints differ by a hundred degrees, which
    the raw error is not.
    """
    if actual is None or setpoint is None or abs(setpoint) < 1e-9:
        return None
    return (actual - setpoint) / abs(setpoint)
