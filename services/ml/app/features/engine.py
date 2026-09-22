"""The feature engine — computes the registry against a live frame.

Its one job that matters: **never turn a BAD or MISSING input into an
apparently valid feature.** DOC-03 §2, and it is the reason the return type is
``FeatureValue`` rather than ``float``. A feature carries its own quality, the
window coverage behind it, the baseline it was compared against and the tags it
traces to. A model consuming a plain ``float`` cannot tell a measured 8.1 from
an 8.1 that was forward-filled across a dead channel; a model consuming these
can, because the second one is ``None`` with a reason attached.

The gating is done once, at the top: a tag whose quality verdict is unusable
produces nulls across its whole family, and the reason is recorded once rather
than repeated three hundred times. Derived features inherit the worst quality
of their inputs, which is DOC-02's ``worstQuality`` applied in the place it
actually matters.

Output ordering is the registry's ordering, always, including the nulls. A
feature vector that changes width or order depending on what was available is
the fastest way to feed a trained model garbage it will confidently classify.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Mapping, Sequence

from ..baseline.engine import BaselineSelection, BaselineSelector
from ..context.engine import ContextObject
from ..core.timeutil import iso
from ..core.versions import FEATURE_SET_VERSION
from ..knowledge.enums import QUALITY_RANK, QualityVerdict
from ..knowledge.loader import knowledge
from ..quality.engine import FrameQuality
from ..schemas.telemetry import TelemetryFrame
from ..state.engine import StateRecord
from ..windows.store import Window, WindowStore
from . import families
from .registry import (
    CROSS_SIGNAL_PAIRS,
    FeatureDefinition,
    TREND_WINDOWS,
    WINDOWS,
    ZONE_SEQUENCE,
    definition_index,
    feature_definitions,
)


@dataclass
class FeatureValue:
    """One computed feature, with everything needed to trust or reject it."""

    feature_id: str
    value: float | None
    unit: str
    family: str
    quality: QualityVerdict
    version: str = FEATURE_SET_VERSION
    window_seconds: int | None = None
    window_samples: int | None = None
    window_span_seconds: float | None = None
    baseline_id: str | None = None
    baseline_level: str | None = None
    baseline_confidence: float | None = None
    lineage: tuple[str, ...] = ()
    formula_ids: tuple[str, ...] = ()
    unavailable_reason: str | None = None
    timestamp: str | None = None

    @property
    def usable(self) -> bool:
        return self.value is not None and self.quality in {"GOOD", "UNCERTAIN"}


@dataclass
class FeatureFrame:
    """Every feature for one instant, plus the context it was computed in."""

    machine_id: str
    timestamp: datetime
    values: dict[str, FeatureValue]
    feature_set_version: str = FEATURE_SET_VERSION
    baselines: dict[str, BaselineSelection] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def numeric(self, feature_ids: Sequence[str]) -> list[float | None]:
        """A vector in the caller's declared order. Missing ids become None.

        The order comes from the *model's* recorded feature list, not from this
        frame, so a model trained before a feature was added still receives its
        own columns in its own order.
        """
        return [self._numeric_one(feature_id) for feature_id in feature_ids]

    def _numeric_one(self, feature_id: str) -> float | None:
        entry = self.values.get(feature_id)
        if entry is None or not entry.usable:
            return None
        return entry.value

    def get(self, feature_id: str) -> FeatureValue | None:
        return self.values.get(feature_id)

    def value_of(self, feature_id: str) -> float | None:
        return self._numeric_one(feature_id)

    def usable_count(self) -> int:
        return sum(1 for entry in self.values.values() if entry.usable)

    def as_dict(self) -> dict[str, float | None]:
        return {feature_id: self._numeric_one(feature_id) for feature_id in self.values}


class FeatureEngine:
    """Compute the declared registry for one frame."""

    def __init__(self, store: WindowStore, selector: BaselineSelector | None = None) -> None:
        self.store = store
        self.selector = selector or BaselineSelector()

    def compute(
        self,
        frame: TelemetryFrame,
        quality: FrameQuality,
        state: StateRecord,
        context: ContextObject,
        *,
        limits: Mapping[str, Mapping[str, float | None]] | None = None,
    ) -> FeatureFrame:
        """Every feature in the registry, in registry order."""
        book = knowledge()
        out: dict[str, FeatureValue] = {}
        baselines: dict[str, BaselineSelection] = {}
        notes: list[str] = []
        stamp = iso(frame.timestamp)

        # Window cache: the same tag and duration are asked for by a dozen
        # features, and slicing a deque per request is the one place this loop
        # would actually get slow.
        cache: dict[tuple[str, int], Window] = {}

        def window(tag: str, seconds: int) -> Window:
            key = (tag, seconds)
            if key not in cache:
                cache[key] = self.store.window(frame.machine_id, tag, seconds=seconds, end=frame.timestamp)
            return cache[key]

        def tag_quality(tag: str) -> QualityVerdict:
            entry = quality.per_signal.get(tag)
            return entry.verdict if entry else "MISSING"

        def tag_usable(tag: str) -> float | None:
            entry = quality.per_signal.get(tag)
            return entry.usable_value if entry and entry.usable else None

        def worst(tags: Sequence[str]) -> QualityVerdict:
            verdict: QualityVerdict = "GOOD"
            for tag in tags:
                candidate = tag_quality(tag)
                if QUALITY_RANK[candidate] > QUALITY_RANK[verdict]:
                    verdict = candidate
            return verdict

        def blocked_reason(tags: Sequence[str]) -> str | None:
            unusable = [tag for tag in tags if tag_usable(tag) is None]
            if not unusable:
                return None
            labels = ", ".join(
                f"{(book.tag(tag).label if book.tag(tag) else tag)} ({tag_quality(tag)})" for tag in unusable
            )
            return f"Input unusable: {labels}."

        def emit(
            definition: FeatureDefinition,
            value: float | None,
            *,
            quality_override: QualityVerdict | None = None,
            window_obj: Window | None = None,
            reason: str | None = None,
            baseline: BaselineSelection | None = None,
        ) -> None:
            verdict = quality_override or worst(definition.quality_inputs)
            out[definition.feature_id] = FeatureValue(
                feature_id=definition.feature_id,
                value=value,
                unit=definition.unit,
                family=definition.family,
                quality=verdict,
                window_seconds=definition.window_seconds,
                window_samples=window_obj.count if window_obj else None,
                window_span_seconds=window_obj.span_seconds if window_obj else None,
                baseline_id=baseline.record.baseline_id if baseline and baseline.record else None,
                baseline_level=baseline.level if baseline else None,
                baseline_confidence=baseline.confidence if baseline else None,
                lineage=tuple(
                    f"{(book.tag(tag).label if book.tag(tag) else tag)} ({tag})"
                    for tag in definition.inputs
                ),
                formula_ids=definition.formula_ids,
                unavailable_reason=reason if value is None else None,
                timestamp=stamp,
            )

        index = {entry.feature_id: entry for entry in feature_definitions()}

        # --- per-tag families ---------------------------------------------
        for tag in _tags_in_registry(index):
            current = tag_usable(tag)
            block = blocked_reason((tag,))

            self._emit_raw(index, tag, current, block, emit)
            self._emit_rolling(index, tag, window, current, block, emit)
            self._emit_trend(index, tag, window, block, emit)
            self._emit_extremes(index, tag, window, block, emit)

            selection = self.selector.select(
                machine_id=frame.machine_id,
                tag=tag,
                context_id=context.context_id,
                fallback_context_id=context.fallback_context_id,
            )
            baselines[tag] = selection
            self._emit_baseline(index, tag, current, selection, block, emit)
            self._emit_persistence(index, tag, window, selection, block, emit)
            self._emit_threshold(index, tag, current, limits, selection, block, emit)
            self._emit_setpoint(index, tag, current, frame, block, emit)

        # --- cross-signal --------------------------------------------------
        for numerator, denominator, name, _ in CROSS_SIGNAL_PAIRS:
            definition = index.get(f"x.{name}")
            if definition is None:
                continue
            block = blocked_reason((numerator, denominator))
            value = families.ratio(tag_usable(numerator), tag_usable(denominator))
            emit(definition, value, reason=block or "Ratio undefined at this denominator.")

            slope_def = index.get(f"x.{name}.slope_300s")
            if slope_def is not None:
                emit(
                    slope_def,
                    self._ratio_slope(window(numerator, 300), window(denominator, 300)),
                    window_obj=window(numerator, 300),
                    reason=block or "Insufficient paired history for a ratio slope.",
                )

        # --- thermal -------------------------------------------------------
        zones = [tag for tag in ZONE_SEQUENCE if f"{tag}.value" in index]
        for earlier, later in zip(zones, zones[1:]):
            definition = index.get(f"t.gradient_{earlier}_{later}")
            if definition is None:
                continue
            low, high = tag_usable(earlier), tag_usable(later)
            emit(
                definition,
                None if low is None or high is None else high - low,
                reason=blocked_reason((earlier, later)),
            )

        melt_def = index.get("t.melt_minus_last_zone")
        if melt_def is not None and zones:
            melt, last = tag_usable("TS-TM"), tag_usable(zones[-1])
            emit(
                melt_def,
                None if melt is None or last is None else melt - last,
                reason=blocked_reason(("TS-TM", zones[-1])),
            )

        spread_def = index.get("t.zone_profile_spread")
        if spread_def is not None and zones:
            present = [value for value in (tag_usable(tag) for tag in zones) if value is not None]
            emit(
                spread_def,
                families.value_range(present) if len(present) >= 2 else None,
                quality_override=worst(zones),
                reason="Fewer than two barrel zones are reporting usable values."
                if len(present) < 2
                else None,
            )

        # --- load and speed -------------------------------------------------
        load_def = index.get("l.load_proxy")
        if load_def is not None:
            emit(
                load_def,
                families.ratio(tag_usable("TS-PM1"), tag_usable("TS-S1")),
                reason=blocked_reason(("TS-PM1", "TS-S1")) or "Screw speed too low for a load ratio.",
            )

        mismatch_def = index.get("s.screw_speed_mismatch")
        if mismatch_def is not None:
            first, second = tag_usable("TS-S1"), tag_usable("TS-S2")
            emit(
                mismatch_def,
                None if first is None or second is None else first - second,
                reason=blocked_reason(("TS-S1", "TS-S2")),
            )

        ratio_def = index.get("s.gear_ratio_observed")
        if ratio_def is not None:
            emit(
                ratio_def,
                families.ratio(tag_usable("TS-E1"), tag_usable("TS-S1")),
                reason=blocked_reason(("TS-E1", "TS-S1")) or "Screw speed too low for a ratio.",
            )

        # --- quality and context -------------------------------------------
        expected = max(1, quality.signals_expected)
        good = sum(1 for entry in quality.per_signal.values() if entry.verdict == "GOOD")
        self._emit_scalar(index, "q.good_fraction", good / expected, emit)
        self._emit_scalar(index, "q.bad_or_missing_count", float(len(quality.bad_or_missing)), emit)
        self._emit_scalar(index, "q.mandatory_unavailable", float(len(quality.mandatory_unavailable)), emit)
        self._emit_scalar(index, "c.state_confidence", state.state_confidence, emit)
        self._emit_scalar(index, "c.context_confidence", context.confidence, emit)
        self._emit_scalar(index, "c.time_in_state", state.time_in_state_seconds, emit)
        for state_id in ("ST-01", "ST-02", "ST-04", "ST-05", "ST-06", "ST-07", "ST-08"):
            feature_id = f"c.state_is_{state_id.replace('-', '_').lower()}"
            self._emit_scalar(
                index, feature_id, 1.0 if state.operating_state == state_id else 0.0, emit
            )

        if not book.field_calibrated:
            notes.append(book.commissioning_notice)

        return FeatureFrame(
            machine_id=frame.machine_id,
            timestamp=frame.timestamp,
            values=out,
            baselines=baselines,
            notes=notes,
        )

    # -- per-family emitters ------------------------------------------------

    def _emit_raw(self, index, tag, current, block, emit) -> None:  # type: ignore[no-untyped-def]
        definition = index.get(f"{tag}.value")
        if definition is not None:
            emit(definition, current, reason=block)

    def _emit_rolling(self, index, tag, window, current, block, emit) -> None:  # type: ignore[no-untyped-def]
        for seconds in WINDOWS:
            slice_ = window(tag, seconds)
            values = slice_.values
            ready = slice_.sufficient()
            reason = block or (
                None
                if ready
                else f"Only {slice_.count} samples over {slice_.span_seconds:.0f}s of a {seconds}s window."
            )
            for suffix, computed in (
                (f"mean_{seconds}s", families.mean(values) if ready else None),
                (f"median_{seconds}s", families.median(values) if ready else None),
                (f"std_{seconds}s", families.std_dev(values) if ready else None),
                (f"mad_{seconds}s", families.mad(values) if ready else None),
                (f"range_{seconds}s", families.value_range(values) if ready else None),
                (f"cv_{seconds}s", families.coefficient_of_variation(values) if ready else None),
            ):
                definition = index.get(f"{tag}.{suffix}")
                if definition is not None:
                    emit(definition, computed, window_obj=slice_, reason=reason)

        ewma_def = index.get(f"{tag}.ewma_120s")
        if ewma_def is not None:
            slice_ = window(tag, 120)
            emit(
                ewma_def,
                families.ewma(slice_.values) if slice_.sufficient() else None,
                window_obj=slice_,
                reason=block,
            )

    def _emit_trend(self, index, tag, window, block, emit) -> None:  # type: ignore[no-untyped-def]
        for seconds in TREND_WINDOWS:
            slice_ = window(tag, seconds)
            ready = slice_.sufficient(min_samples=4)
            reason = block or (None if ready else f"Insufficient history for a {seconds}s trend.")
            for suffix, computed in (
                (
                    f"slope_{seconds}s",
                    families.slope_per_minute(slice_.values, slice_.timestamps) if ready else None,
                ),
                (
                    f"ewma_slope_{seconds}s",
                    families.ewma_slope(slice_.values, slice_.timestamps) if ready else None,
                ),
            ):
                definition = index.get(f"{tag}.{suffix}")
                if definition is not None:
                    emit(definition, computed, window_obj=slice_, reason=reason)

        roc_def = index.get(f"{tag}.roc")
        if roc_def is not None:
            slice_ = window(tag, 30)
            emit(
                roc_def,
                families.rate_of_change_per_minute(slice_.values, slice_.timestamps),
                window_obj=slice_,
                reason=block or "Two timestamped samples are needed for a rate of change.",
            )

    def _emit_extremes(self, index, tag, window, block, emit) -> None:  # type: ignore[no-untyped-def]
        slice_ = window(tag, 600)
        values, stamps = slice_.values, slice_.timestamps
        ready = slice_.sufficient()
        for suffix, computed in (
            ("min_600s", min(values) if ready and values else None),
            ("max_600s", max(values) if ready and values else None),
            (
                "seconds_since_max_600s",
                families.time_since_extreme(values, stamps, mode="max") if ready else None,
            ),
            (
                "seconds_since_min_600s",
                families.time_since_extreme(values, stamps, mode="min") if ready else None,
            ),
        ):
            definition = index.get(f"{tag}.{suffix}")
            if definition is not None:
                emit(definition, computed, window_obj=slice_, reason=block)

    def _emit_baseline(self, index, tag, current, selection, block, emit) -> None:  # type: ignore[no-untyped-def]
        expected = selection.expected
        spread = selection.spread
        record = selection.record
        reason = block or (
            None if record is not None else "No baseline exists for this signal at any level."
        )

        pairs: list[tuple[str, float | None]] = [
            (
                "baseline_abs_dev",
                families.absolute_deviation(current, expected) if current is not None else None,
            ),
            (
                "baseline_pct_dev",
                families.percent_deviation(current, expected) if current is not None else None,
            ),
            (
                "baseline_z",
                families.z_score(current, record.mean if record else None, record.std_dev if record else None)
                if current is not None
                else None,
            ),
            (
                "baseline_robust_z",
                families.robust_score(current, expected, spread) if current is not None else None,
            ),
            ("baseline_confidence", selection.confidence),
        ]

        percentile_value: float | None = None
        if current is not None and record is not None:
            anchors = [
                value
                for value in (record.p05, record.p25, record.p50, record.p75, record.p95, record.p99)
                if value is not None
            ]
            if len(anchors) >= 3:
                percentile_value = families.percentile_position(anchors, current)
        pairs.append(("baseline_percentile", percentile_value))

        for suffix, computed in pairs:
            definition = index.get(f"{tag}.{suffix}")
            if definition is not None:
                emit(definition, computed, reason=reason, baseline=selection)

    def _emit_persistence(self, index, tag, window, selection, block, emit) -> None:  # type: ignore[no-untyped-def]
        slice_ = window(tag, 600)
        expected, spread = selection.expected, selection.spread
        bands = knowledge().commissioning.get("featureBands", {})
        anomaly_band = float(bands.get("anomalyBand", 3))

        if expected is None or spread is None or not slice_.values:
            flags: list[bool] = []
        else:
            flags = [
                abs(families.robust_score(value, expected, spread) or 0.0) >= anomaly_band
                for value in slice_.values
            ]

        reason = block or (
            None if flags else "No baseline or no history, so an abnormal duration cannot be measured."
        )
        for suffix, computed in (
            (
                "abnormal_seconds",
                families.persistence_seconds(flags, slice_.timestamps) if flags else None,
            ),
            ("abnormal_fraction_600s", families.persistence_fraction(flags) if flags else None),
        ):
            definition = index.get(f"{tag}.{suffix}")
            if definition is not None:
                emit(definition, computed, window_obj=slice_, reason=reason, baseline=selection)

    def _emit_threshold(self, index, tag, current, limits, selection, block, emit) -> None:  # type: ignore[no-untyped-def]
        declared: Mapping[str, float | None] = (limits or {}).get(tag, {})
        record = selection.record
        # The normal boundary is the learned envelope; alert and danger are
        # approved limits and come only from the authority that owns them. A
        # site with none declared gets nulls, which is the honest answer and
        # not a number this service made up.
        boundaries: dict[str, float | None] = {
            "normal": (record.p95 if record else None),
            "alert": declared.get("alert"),
            "danger": declared.get("danger"),
        }
        reference = record.spread() if record else None

        for name, boundary in boundaries.items():
            distance_def = index.get(f"{tag}.distance_to_{name}")
            normalised_def = index.get(f"{tag}.normalised_distance_to_{name}")
            reason = block or (
                None if boundary is not None else f"No {name} boundary is declared for this signal."
            )
            if distance_def is not None:
                emit(
                    distance_def,
                    families.distance_to(current, boundary) if current is not None else None,
                    reason=reason,
                    baseline=selection,
                )
            if normalised_def is not None:
                emit(
                    normalised_def,
                    families.normalised_distance(current, boundary, reference)
                    if current is not None
                    else None,
                    reason=reason,
                    baseline=selection,
                )

    def _emit_setpoint(self, index, tag, current, frame, block, emit) -> None:  # type: ignore[no-untyped-def]
        setpoint = frame.setpoints.get(tag)
        reason = block or (
            None
            if setpoint is not None
            else "No setpoint is published for this tag, so no control error can be computed."
        )
        for suffix, computed in (
            ("setpoint_error", families.setpoint_error(current, setpoint)),
            ("setpoint_error_normalised", families.normalised_setpoint_error(current, setpoint)),
        ):
            definition = index.get(f"{tag}.{suffix}")
            if definition is not None:
                emit(definition, computed, reason=reason)

    def _emit_scalar(self, index, feature_id, value, emit) -> None:  # type: ignore[no-untyped-def]
        definition = index.get(feature_id)
        if definition is not None:
            emit(
                definition,
                value,
                quality_override="GOOD",
                reason=None if value is not None else "Not available for this frame.",
            )

    def _ratio_slope(self, numerator: Window, denominator: Window) -> float | None:
        """Slope of a ratio over a window, computed point by point.

        The ratio of the slopes is not the slope of the ratio, and the
        difference is exactly the drift these features exist to catch. So the
        ratio is formed at each aligned instant and a slope is fitted to that.
        """
        num_by_time = {stamp: value for stamp, value in zip(numerator.timestamps, numerator.values)}
        den_by_time = {stamp: value for stamp, value in zip(denominator.timestamps, denominator.values)}
        shared = sorted(set(num_by_time) & set(den_by_time))
        if len(shared) < 4:
            return None
        ratios: list[float] = []
        stamps: list[datetime] = []
        for stamp in shared:
            value = families.ratio(num_by_time[stamp], den_by_time[stamp])
            if value is not None:
                ratios.append(value)
                stamps.append(stamp)
        return families.slope_per_minute(ratios, stamps)


def _tags_in_registry(index: Mapping[str, FeatureDefinition]) -> tuple[str, ...]:
    """Tags the registry declared a ``.value`` feature for, in registry order."""
    return tuple(
        definition.inputs[0]
        for feature_id, definition in index.items()
        if feature_id.endswith(".value") and definition.family == "RAW" and definition.inputs
    )


def union_feature_ids(
    *,
    include_residuals: bool = True,
    include_embedding: bool = True,
) -> tuple[str, ...]:
    """The full feature-union column order a model is trained and served on.

    Base registry, then residuals, then the embedding. The order is fixed and
    the residual and embedding columns are always present — null when no
    temporal model ran — because a vector whose width depends on which
    libraries imported is not a contract.
    """
    from .registry import default_forecast_tags, embedding_feature_definitions, residual_feature_definitions

    ids = [entry.feature_id for entry in feature_definitions()]
    if include_residuals:
        ids.extend(entry.feature_id for entry in residual_feature_definitions(default_forecast_tags()))
    if include_embedding:
        ids.extend(entry.feature_id for entry in embedding_feature_definitions())
    return tuple(ids)


def describe_vector(feature_ids: Sequence[str]) -> list[dict[str, Any]]:
    """Registry metadata for a vector, for a model card or a SHAP render."""
    index = definition_index()
    out: list[dict[str, Any]] = []
    for feature_id in feature_ids:
        definition = index.get(feature_id)
        out.append(
            {
                "feature_id": feature_id,
                "name": definition.name if definition else feature_id,
                "family": definition.family if definition else "UNKNOWN",
                "unit": definition.unit if definition else None,
                "formula_ids": list(definition.formula_ids) if definition else [],
                "window_seconds": definition.window_seconds if definition else None,
            }
        )
    return out


def feature_schema_fingerprint(feature_ids: Sequence[str] | None = None) -> str:
    """A deterministic hash of the feature schema a model is fitted against.

    ``FEATURE_SET_VERSION`` is a promise a human has to remember to keep. This
    is the same promise the machine can check, and it exists because the
    promise was broken: ``TS-TZ9`` was removed from the knowledge, 48 columns
    disappeared, and the version string stayed ``1.0.0`` on both sides. A model
    trained before that change and a pipeline running after it agreed on the
    version and disagreed on 48 columns.

    The hash covers everything that changes what a column *means* to a trained
    model — id, order, family, unit and window — so a renamed unit or a
    widened window invalidates the artifact even though the column count is
    unchanged. It deliberately does not cover descriptions or display names,
    which a model never sees.
    """
    from hashlib import sha256

    ids = tuple(feature_ids) if feature_ids is not None else union_feature_ids()
    index = definition_index()
    digest = sha256()
    for position, feature_id in enumerate(ids):
        definition = index.get(feature_id)
        digest.update(
            "|".join(
                (
                    str(position),
                    feature_id,
                    definition.family if definition else "UNKNOWN",
                    str(definition.unit) if definition else "",
                    str(definition.window_seconds) if definition else "",
                )
            ).encode("utf-8")
        )
        digest.update(b"\x1e")
    return digest.hexdigest()[:32]


def feature_schema_block(feature_ids: Sequence[str] | None = None) -> dict[str, Any]:
    """The schema identity to stamp on an artifact and compare at load."""
    ids = tuple(feature_ids) if feature_ids is not None else union_feature_ids()
    return {
        "feature_set_version": FEATURE_SET_VERSION,
        "feature_schema_hash": feature_schema_fingerprint(ids),
        "feature_count": len(ids),
    }
