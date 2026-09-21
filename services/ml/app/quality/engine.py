"""The data-quality engine — DOC-02 §22, ahead of every learned layer.

The rule this exists to enforce is one sentence long: *a machine diagnosis
must never be produced because a broken sensor reported an extreme value.* Every
check below is a way that sentence gets violated in practice, and the verdict
is what stops it.

Four verdicts, not two. UNCERTAIN carries its weight: a reading that is late,
or sitting on a range boundary, or contradicted by one neighbour is not good
enough to found a fault on and not bad enough to throw away. Collapsing it
either direction loses the distinction the feature layer needs.

The rule ids are DOC-02's own, DQ-001 through DQ-010, so a finding here reads
identically to one from the TypeScript engine. Where this engine checks
something DOC-02 does not enumerate — duplicate sequence numbers, window
coverage — the finding is filed under the nearest rule and says so in its
reason, rather than inventing DQ-011.

What this engine never does: substitute a value. Not a default, not a
forward-fill past the freshness horizon, not a clamp into range. A BAD reading
stays BAD and travels that way into every feature computed from it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from math import isfinite, isnan
from typing import Any, Sequence

from ..core.timeutil import seconds_between
from ..knowledge.enums import QUALITY_RANK, QualityVerdict
from ..knowledge.loader import TagDefinition, knowledge
from ..schemas.telemetry import ChannelReading, TelemetryFrame


@dataclass(frozen=True)
class QualityFinding:
    """One check that fired, with what DOC-02 says happens next."""

    rule_id: str
    check: str
    verdict: QualityVerdict
    reason: str
    downstream_rule: str


@dataclass
class SignalQuality:
    """The verdict on one signal, with every finding behind it."""

    signal_id: str
    verdict: QualityVerdict = "GOOD"
    findings: list[QualityFinding] = field(default_factory=list)
    suppresses_physical_diagnosis: bool = False
    usable_value: float | None = None
    """The value downstream may use, or None. Never a substitute — this is the
    published value when the verdict permits using it, and None when it does
    not."""

    unit: str | None = None

    def add(self, finding: QualityFinding) -> None:
        self.findings.append(finding)
        if QUALITY_RANK[finding.verdict] > QUALITY_RANK[self.verdict]:
            self.verdict = finding.verdict

    @property
    def usable(self) -> bool:
        """Whether a feature may be computed from this reading at all."""
        return self.verdict in {"GOOD", "UNCERTAIN"} and self.usable_value is not None


@dataclass
class FrameQuality:
    """Every signal in one frame, plus the frame-level verdict."""

    per_signal: dict[str, SignalQuality]
    overall: QualityVerdict
    signals_reporting: int
    signals_expected: int
    mandatory_unavailable: list[str]
    frame_findings: list[QualityFinding]

    @property
    def bad_or_missing(self) -> list[str]:
        return [
            signal_id
            for signal_id, entry in self.per_signal.items()
            if entry.verdict in {"BAD", "MISSING"}
        ]

    @property
    def suppresses_physical_diagnosis(self) -> bool:
        """True when a mandatory signal is unusable.

        DOC-02 §22's instrumentation-first rule. The physical diagnosis is
        withheld and the instrumentation path runs instead — not because the
        machine is fine, but because nothing here can tell.
        """
        return any(entry.suppresses_physical_diagnosis for entry in self.per_signal.values())

    def for_signal(self, signal_id: str) -> SignalQuality:
        return self.per_signal.get(signal_id) or SignalQuality(signal_id=signal_id, verdict="MISSING")


@dataclass
class SignalHistory:
    """What the engine needs to remember about a signal between frames.

    Deliberately tiny. The rolling window store holds the real history; this is
    only what the *quality* checks need, and keeping it small means the quality
    engine can run on a frame the window store has not accepted yet.
    """

    last_value: float | None = None
    last_source_timestamp: datetime | None = None
    last_received_at: datetime | None = None
    repeat_count: int = 0
    recent_values: tuple[float, ...] = ()


_FRESHNESS_DEFAULT_MS = 30_000
_UNCERTAIN_DELAY_FACTOR = 0.5
"""A reading older than half its freshness budget is UNCERTAIN, not yet BAD.

The band exists so a slow link degrades confidence gradually instead of
flipping a healthy channel to BAD the instant it crosses one boundary.
"""

_RANGE_EDGE_FRACTION = 0.01
"""Within 1% of the instrument's declared range is clipping, not a reading."""


class DataQualityEngine:
    """Judge a frame. Stateful only in what the checks genuinely need."""

    def __init__(self) -> None:
        self._history: dict[tuple[str, str], SignalHistory] = {}
        self._last_frame_time: dict[str, datetime] = {}
        self._last_sequence: dict[str, int] = {}
        self._seen_sequences: dict[str, set[int]] = {}

    # -- public ------------------------------------------------------------

    def evaluate(self, frame: TelemetryFrame, *, now: datetime | None = None) -> FrameQuality:
        """Every check, over one frame."""
        book = knowledge()
        moment = now or frame.timestamp
        frame_findings = self._frame_checks(frame)

        expected_tags = book.known_tags()
        results: dict[str, SignalQuality] = {}

        for tag in expected_tags:
            definition = book.tag(tag)
            if definition is None:
                continue
            reading = frame.channels.get(tag)
            results[tag] = self._evaluate_signal(frame, tag, definition, reading, moment)

        # A tag the machine published that the knowledge layer does not know is
        # a mapping error, and saying so is more useful than ignoring it.
        for tag, reading in frame.channels.items():
            if tag in results:
                continue
            entry = SignalQuality(signal_id=tag, unit=reading.unit)
            entry.add(
                QualityFinding(
                    rule_id="DQ-008",
                    check="Calibration / configuration",
                    verdict="BAD",
                    reason=f"{tag} is published but is not a declared tag for this machine template.",
                    downstream_rule="Do not compute features from an unmapped tag.",
                )
            )
            results[tag] = entry

        reporting = sum(1 for entry in results.values() if entry.usable_value is not None)
        mandatory_unavailable = [
            tag
            for tag, entry in results.items()
            if (book.tag(tag).mandatory if book.tag(tag) else False) and not entry.usable
        ]

        overall: QualityVerdict = "GOOD"
        for entry in results.values():
            # A signal the machine simply does not have must not drag the frame
            # to MISSING; only a mandatory one does. Otherwise every frame on a
            # partially instrumented machine reads as MISSING forever.
            definition = book.tag(entry.signal_id)
            if definition is not None and not definition.mandatory and entry.verdict == "MISSING":
                continue
            if QUALITY_RANK[entry.verdict] > QUALITY_RANK[overall]:
                overall = entry.verdict
        for finding in frame_findings:
            if QUALITY_RANK[finding.verdict] > QUALITY_RANK[overall]:
                overall = finding.verdict

        return FrameQuality(
            per_signal=results,
            overall=overall,
            signals_reporting=reporting,
            signals_expected=len(expected_tags),
            mandatory_unavailable=mandatory_unavailable,
            frame_findings=frame_findings,
        )

    def reset(self, machine_id: str | None = None) -> None:
        """Forget history. A replay starts clean; a restart has nothing to keep."""
        if machine_id is None:
            self._history.clear()
            self._last_frame_time.clear()
            self._last_sequence.clear()
            self._seen_sequences.clear()
            return
        self._history = {key: value for key, value in self._history.items() if key[0] != machine_id}
        self._last_frame_time.pop(machine_id, None)
        self._last_sequence.pop(machine_id, None)
        self._seen_sequences.pop(machine_id, None)

    # -- frame-level checks -------------------------------------------------

    def _frame_checks(self, frame: TelemetryFrame) -> list[QualityFinding]:
        findings: list[QualityFinding] = []
        machine = frame.machine_id

        previous = self._last_frame_time.get(machine)
        if previous is not None and frame.timestamp < previous:
            findings.append(
                QualityFinding(
                    rule_id="DQ-002",
                    check="Timestamp validity",
                    verdict="UNCERTAIN",
                    reason=(
                        f"Frame timestamp {frame.timestamp.isoformat()} precedes the previous frame "
                        f"at {previous.isoformat()}. Out-of-order delivery."
                    ),
                    downstream_rule="Do not compute a rate of change across an out-of-order pair.",
                )
            )
        else:
            self._last_frame_time[machine] = frame.timestamp

        if frame.sequence is not None:
            seen = self._seen_sequences.setdefault(machine, set())
            if frame.sequence in seen:
                findings.append(
                    QualityFinding(
                        rule_id="DQ-002",
                        check="Timestamp validity",
                        verdict="UNCERTAIN",
                        reason=f"Sequence {frame.sequence} has already been processed. Duplicate packet.",
                        downstream_rule="Do not count a duplicate toward persistence or window coverage.",
                    )
                )
            seen.add(frame.sequence)
            # Bounded: a long-running machine must not accumulate every id it
            # has ever sent. Two thousand is far more than any plausible
            # retransmit window.
            if len(seen) > 2000:
                self._seen_sequences[machine] = set(sorted(seen)[-1000:])
            self._last_sequence[machine] = frame.sequence

        if not frame.channels:
            findings.append(
                QualityFinding(
                    rule_id="DQ-001",
                    check="Signal presence",
                    verdict="MISSING",
                    reason="The frame carries no channels at all.",
                    downstream_rule="No diagnosis is possible from an empty frame.",
                )
            )

        return findings

    # -- per-signal checks --------------------------------------------------

    def _evaluate_signal(
        self,
        frame: TelemetryFrame,
        tag: str,
        definition: TagDefinition,
        reading: ChannelReading | None,
        now: datetime,
    ) -> SignalQuality:
        config: dict[str, Any] = definition.quality_config or {}
        entry = SignalQuality(signal_id=tag, unit=(reading.unit if reading else None) or definition.canonical_unit)
        key = (frame.machine_id, tag)
        history = self._history.setdefault(key, SignalHistory())

        if reading is None:
            entry.add(
                QualityFinding(
                    rule_id="DQ-001",
                    check="Signal presence",
                    verdict="MISSING",
                    reason=f"{definition.label} is not published in this frame.",
                    downstream_rule=definition_behaviour(definition),
                )
            )
            entry.suppresses_physical_diagnosis = definition.mandatory
            return entry

        value = reading.value

        if value is None:
            entry.add(
                QualityFinding(
                    rule_id="DQ-001",
                    check="Signal presence",
                    verdict="MISSING",
                    reason=f"{definition.label} is published with no value.",
                    downstream_rule=definition_behaviour(definition),
                )
            )
            entry.suppresses_physical_diagnosis = definition.mandatory
            return entry

        # NaN and infinity before anything else: every later check would
        # produce nonsense from them, and a comparison against NaN is silently
        # false rather than an error.
        if isnan(value) or not isfinite(value):
            entry.add(
                QualityFinding(
                    rule_id="DQ-003",
                    check="Range plausibility",
                    verdict="BAD",
                    reason=f"{definition.label} reports {value!r}, which is not a finite number.",
                    downstream_rule="Never compute a feature from a non-finite value.",
                )
            )
            entry.suppresses_physical_diagnosis = definition.mandatory
            return entry

        self._check_freshness(entry, definition, reading, config, now)
        self._check_range(entry, definition, value, config)
        self._check_rate(entry, definition, value, reading, history, config)
        self._check_flatline(entry, definition, value, history, config)
        self._check_unit(entry, definition, reading)
        self._honour_source_quality(entry, definition, reading)

        history.last_value = value
        history.last_source_timestamp = reading.source_timestamp
        history.last_received_at = reading.received_at
        history.recent_values = (*history.recent_values, value)[-32:]

        if entry.verdict in {"GOOD", "UNCERTAIN"}:
            entry.usable_value = value
        entry.suppresses_physical_diagnosis = definition.mandatory and entry.verdict in {"BAD", "MISSING"}
        return entry

    def _check_freshness(
        self,
        entry: SignalQuality,
        definition: TagDefinition,
        reading: ChannelReading,
        config: dict[str, Any],
        now: datetime,
    ) -> None:
        stamp = reading.source_timestamp or reading.received_at
        if stamp is None:
            # No timestamp is not the same as a stale one. The value may be
            # current; nothing here can tell, and saying so is the answer.
            entry.add(
                QualityFinding(
                    rule_id="DQ-002",
                    check="Timestamp validity",
                    verdict="UNCERTAIN",
                    reason=f"{definition.label} carries no timestamp, so its age cannot be established.",
                    downstream_rule="Rate of change is invalid without a trustworthy time delta.",
                )
            )
            return

        budget_ms = float(config.get("freshnessMs") or _FRESHNESS_DEFAULT_MS)
        age_s = seconds_between(stamp, now)

        if age_s < -1.0:
            entry.add(
                QualityFinding(
                    rule_id="DQ-002",
                    check="Timestamp validity",
                    verdict="BAD",
                    reason=(
                        f"{definition.label} is timestamped {abs(age_s):.1f}s in the future. "
                        "A source clock is wrong."
                    ),
                    downstream_rule="Do not trust ordering or rate of change from this source.",
                )
            )
            return

        if age_s * 1000.0 > budget_ms:
            entry.add(
                QualityFinding(
                    rule_id="DQ-002",
                    check="Freshness",
                    verdict="BAD",
                    reason=(
                        f"{definition.label} is {age_s:.1f}s old against a {budget_ms / 1000:.0f}s "
                        "freshness budget. The value is stale."
                    ),
                    downstream_rule="A stale value must not be forward-filled into a feature.",
                )
            )
        elif age_s * 1000.0 > budget_ms * _UNCERTAIN_DELAY_FACTOR:
            entry.add(
                QualityFinding(
                    rule_id="DQ-002",
                    check="Freshness",
                    verdict="UNCERTAIN",
                    reason=(
                        f"{definition.label} is {age_s:.1f}s old, past half its "
                        f"{budget_ms / 1000:.0f}s freshness budget. Packet delay."
                    ),
                    downstream_rule="Lower the confidence of anything derived from it.",
                )
            )

    def _check_range(
        self,
        entry: SignalQuality,
        definition: TagDefinition,
        value: float,
        config: dict[str, Any],
    ) -> None:
        low = config.get("rangeMin")
        high = config.get("rangeMax")
        if low is None or high is None:
            return
        low = float(low)
        high = float(high)

        if value < low or value > high:
            entry.add(
                QualityFinding(
                    rule_id="DQ-003",
                    check="Range plausibility",
                    verdict="BAD",
                    reason=(
                        f"{definition.label} reads {value:g} {definition.canonical_unit or ''}".strip()
                        + f", outside the instrument range {low:g}..{high:g}. "
                        "That is a scaling or calibration fault, not a process condition."
                    ),
                    downstream_rule="Do not call a machine fault from an invalid scale.",
                )
            )
            return

        span = high - low
        if span > 0:
            edge = span * _RANGE_EDGE_FRACTION
            if value >= high - edge or value <= low + edge:
                entry.add(
                    QualityFinding(
                        rule_id="DQ-003",
                        check="Range plausibility",
                        verdict="UNCERTAIN",
                        reason=(
                            f"{definition.label} sits at {value:g}, within 1% of the instrument's "
                            f"{low:g}..{high:g} range end. The transmitter may be clipping."
                        ),
                        downstream_rule="A clipped reading understates the true value; do not trend on it.",
                    )
                )

    def _check_rate(
        self,
        entry: SignalQuality,
        definition: TagDefinition,
        value: float,
        reading: ChannelReading,
        history: SignalHistory,
        config: dict[str, Any],
    ) -> None:
        limit = config.get("maxRateOfChangePerSecond")
        if limit is None or history.last_value is None:
            return
        previous_stamp = history.last_source_timestamp or history.last_received_at
        current_stamp = reading.source_timestamp or reading.received_at
        if previous_stamp is None or current_stamp is None:
            return
        elapsed = seconds_between(previous_stamp, current_stamp)
        if elapsed <= 0:
            return
        rate = abs(value - history.last_value) / elapsed
        if rate > float(limit):
            entry.add(
                QualityFinding(
                    rule_id="DQ-004",
                    check="Rate-of-change plausibility",
                    verdict="BAD",
                    reason=(
                        f"{definition.label} moved {abs(value - history.last_value):g} in {elapsed:.1f}s "
                        f"({rate:.1f}/s against a {float(limit):g}/s physical limit). "
                        "Physically impossible for this quantity."
                    ),
                    downstream_rule="Treat as a sensor or communication artefact, not a process event.",
                )
            )

    def _check_flatline(
        self,
        entry: SignalQuality,
        definition: TagDefinition,
        value: float,
        history: SignalHistory,
        config: dict[str, Any],
    ) -> None:
        threshold = config.get("flatlineSamples")
        if history.last_value is not None and value == history.last_value:
            history.repeat_count += 1
        else:
            history.repeat_count = 0
        if threshold is None:
            return
        if history.repeat_count >= int(threshold):
            entry.add(
                QualityFinding(
                    rule_id="DQ-005",
                    check="Sensor diagnostics",
                    verdict="BAD",
                    reason=(
                        f"{definition.label} has reported exactly {value:g} for "
                        f"{history.repeat_count + 1} consecutive samples. The sensor or its "
                        "channel is frozen."
                    ),
                    downstream_rule=(
                        "A frozen sensor is an instrumentation fault. It must not read as a "
                        "stable process."
                    ),
                )
            )

    def _check_unit(self, entry: SignalQuality, definition: TagDefinition, reading: ChannelReading) -> None:
        """Compare the published unit against the tag's canonical one.

        A mismatch is DQ-008 rather than an automatic conversion. Silently
        converting bar to MPa when the publisher *meant* bar is correct; doing
        it when the publisher mislabelled MPa as bar multiplies the value by
        ten and produces a confident, wrong diagnosis. Conversion belongs in
        the mapping layer, where somebody approved it.
        """
        published = (reading.unit or "").strip()
        canonical = (definition.canonical_unit or "").strip()
        if not published or not canonical:
            return
        if published.lower() == canonical.lower():
            return
        entry.add(
            QualityFinding(
                rule_id="DQ-008",
                check="Calibration / configuration",
                verdict="UNCERTAIN",
                reason=(
                    f'{definition.label} publishes in "{published}" but the tag is declared in '
                    f'"{canonical}". The mapping must convert it explicitly.'
                ),
                downstream_rule="Compare a value only against a baseline in the same unit.",
            )
        )

    def _honour_source_quality(
        self, entry: SignalQuality, definition: TagDefinition, reading: ChannelReading
    ) -> None:
        """A source verdict is a floor, never a ceiling.

        A gateway that knows its input is bad is authoritative about that. A
        gateway that says GOOD knows only that it received something.
        """
        declared = reading.source_quality
        if declared is None or QUALITY_RANK[declared] <= QUALITY_RANK["GOOD"]:
            return
        entry.add(
            QualityFinding(
                rule_id="DQ-007",
                check="Source-declared quality",
                verdict=declared,
                reason=f"{definition.label} was published with a source quality of {declared}.",
                downstream_rule="A source that reports its own data bad is believed.",
            )
        )


def definition_behaviour(definition: TagDefinition) -> str:
    """What DOC-02 §19 says happens when this signal is absent."""
    if definition.mandatory:
        return (
            "MANDATORY. Dependent logic returns degraded or INSUFFICIENT_EVIDENCE; "
            "nothing is silently assumed."
        )
    if definition.doc02_priority == "RECOMMENDED":
        return "RECOMMENDED. Run degraded logic where defined and reduce evidence quality."
    return "Improves confidence only. Core analytics continue."


def window_coverage(
    values: Sequence[float | None], *, expected: int
) -> tuple[float, QualityFinding | None]:
    """How much of a window actually carried values.

    Returned as a fraction rather than a verdict because what counts as enough
    depends on the feature: a mean over 40% of a window is defensible, a slope
    over the same 40% is not if the gaps are at the ends. The caller decides;
    this only measures.
    """
    if expected <= 0:
        return 0.0, None
    present = sum(1 for value in values if value is not None)
    coverage = present / expected
    if coverage >= 0.6:
        return coverage, None
    return coverage, QualityFinding(
        rule_id="DQ-009",
        check="Window coverage",
        verdict="UNCERTAIN" if coverage >= 0.3 else "BAD",
        reason=(
            f"Only {present} of an expected {expected} samples are present "
            f"({coverage * 100:.0f}% window coverage)."
        ),
        downstream_rule="A statistic over a sparse window is not comparable with one over a full window.",
    )
