"""The deterministic engineering rule engine.

This layer is independent of, and senior to, everything learned. It answers
"what is abnormal right now" from approved limits and contextual baselines, and
it answers it whether or not a single model loaded. When the ML service is
degraded this is the answer the operator still gets.

Two rules it exists to hold, both from DOC-05 §5 and §16:

**A learned boundary never redefines plant severity.** An approved Danger that
has been exceeded is DANGER, full stop. Analytics may raise severity above an
authority floor; nothing may lower it below one.

**Low confidence with high severity stays high severity.** A pressure past an
approved Danger whose evidence is weak remains DANGER and becomes *urgent
verification*. Weak evidence changes the action, never the condition. The
severity is computed here, before any confidence is consulted, so the wrong
behaviour is not expressible.

The limit registry carries provenance on every entry — source, authority,
version, effective date — because "who says so" is the question an engineer
asks about any number that stops a machine, and a limit that cannot answer it
should not be enforced.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Mapping

from ..baseline.engine import BaselineSelection
from ..core.config import settings
from ..core.versions import RULE_SET_VERSION
from ..features import families
from ..features.engine import FeatureFrame
from ..knowledge.enums import AUTHORITY_SEVERITY_FLOOR, LimitAuthority, LimitStatus, Severity
from ..knowledge.loader import knowledge
from ..quality.engine import FrameQuality
from ..state.engine import StateRecord

SEVERITY_ORDER: tuple[str, ...] = ("NORMAL", "ALERT", "DANGER")

#: States in which a *variability* finding is still meaningful. Ramp-up and
#: steady production; not a stopped, warming or shutting-down machine, whose
#: signals are supposed to be moving.
_VARIABILITY_STATES: frozenset[str] = frozenset({"ST-05", "ST-06"})

#: How far drive load must have moved from its baseline to count as
#: corroborating a pressure departure. One robust unit — well inside the
#: anomaly band, because the question is "did load move at all", not "is load
#: itself abnormal". A restriction moves both; a transmitter moves one.
_LOAD_CORROBORATION_UNITS = 1.0


@dataclass(frozen=True)
class LimitEntry:
    """One approved limit, with who approved it and when.

    ``authority`` decides precedence, not the numeric value: a customer Danger
    at 12 MPa outranks an OEM advisory at 10 even though the OEM number is
    lower, because the question is whose limit governs, not which is tightest.
    """

    signal_id: str
    concept: str
    """ALERT | DANGER | TRIP_PROTECTION. Never BASELINE — that is not a limit."""

    direction: str
    """HIGH or LOW."""

    value: float
    unit: str
    authority: LimitAuthority
    source: str
    version: str
    effective_from: str | None = None
    approved_by: str | None = None
    applicable_states: tuple[str, ...] = ()
    """Empty means every state. A limit that only applies in production says so."""

    notes: str = ""

    def applies_in(self, state_id: str) -> bool:
        return not self.applicable_states or state_id in self.applicable_states

    def exceeded_by(self, value: float) -> bool:
        return value >= self.value if self.direction == "HIGH" else value <= self.value


@dataclass
class LimitRegistry:
    """Approved limits for a machine. Empty until a site supplies them.

    Deliberately empty by default. DOC-01 refuses to invent a pressure, a
    temperature or an rpm, and so does this: a site with no declared limits gets
    no limit findings rather than plausible-looking ones this service made up.
    The baseline layer still produces contextual anomalies, which is the correct
    division — a learned envelope is an advisory, an approved limit is not.
    """

    entries: tuple[LimitEntry, ...] = ()

    @classmethod
    def load(cls, machine_id: str, directory: Path | None = None) -> "LimitRegistry":
        base = directory or (settings().config_dir / "limits")
        path = base / f"{machine_id}.json"
        if not path.is_file():
            path = base / "default.json"
        if not path.is_file():
            return cls()
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return cls()
        return cls(
            entries=tuple(
                LimitEntry(
                    signal_id=row["signal_id"],
                    concept=row["concept"],
                    direction=row.get("direction", "HIGH"),
                    value=float(row["value"]),
                    unit=row.get("unit", ""),
                    authority=row["authority"],
                    source=row.get("source", "UNDECLARED"),
                    version=row.get("version", "1"),
                    effective_from=row.get("effective_from"),
                    approved_by=row.get("approved_by"),
                    applicable_states=tuple(row.get("applicable_states", ())),
                    notes=row.get("notes", ""),
                )
                for row in payload.get("limits", [])
            )
        )

    def for_signal(self, signal_id: str) -> tuple[LimitEntry, ...]:
        return tuple(entry for entry in self.entries if entry.signal_id == signal_id)

    def boundaries(self) -> dict[str, dict[str, float | None]]:
        """Alert and Danger per signal, for the threshold-distance features."""
        out: dict[str, dict[str, float | None]] = {}
        for entry in self.entries:
            bucket = out.setdefault(entry.signal_id, {"alert": None, "danger": None})
            if entry.concept == "ALERT":
                bucket["alert"] = entry.value
            elif entry.concept in {"DANGER", "TRIP_PROTECTION"}:
                bucket["danger"] = entry.value
        return out


@dataclass
class SignalVerdict:
    """The deterministic conclusion about one signal."""

    signal_id: str
    label: str
    verdict: str
    """A DOC-04 ``AnomalyVerdict``."""

    blocked_at_gate: str | None
    reason: str
    limit_status: LimitStatus = "NONE"
    limit_authority: LimitAuthority | None = None
    value: float | None = None
    unit: str | None = None
    expected: float | None = None
    absolute_deviation: float | None = None
    percent_deviation: float | None = None
    robust_score: float | None = None
    trend: str = "UNKNOWN"
    rate_of_change: float | None = None
    persistence_seconds: float | None = None
    data_quality: str = "GOOD"
    anomaly_id: str | None = None
    baseline_level: str | None = None
    baseline_confidence: float | None = None

    @property
    def is_anomalous(self) -> bool:
        return self.verdict in {
            "HIGH_ANOMALY",
            "LOW_ANOMALY",
            "RISING_ABNORMAL",
            "FALLING_ABNORMAL",
            "OSCILLATING",
        }


@dataclass
class RuleResult:
    """Everything the deterministic layer concluded for one frame."""

    verdicts: tuple[SignalVerdict, ...]
    severity: Severity
    severity_authority: LimitAuthority | None
    severity_reason: str
    alert_reached: bool
    danger_reached: bool
    trip_active: bool
    instrumentation_suspect: bool
    instrumentation_reasons: tuple[str, ...] = ()
    rule_set_version: str = RULE_SET_VERSION
    notes: tuple[str, ...] = field(default_factory=tuple)

    @property
    def anomalies(self) -> tuple[SignalVerdict, ...]:
        return tuple(entry for entry in self.verdicts if entry.is_anomalous)


class RuleEngine:
    """The DOC-04 §3 gates plus the DOC-05 §5 authority ladder."""

    def __init__(self, registry: LimitRegistry | None = None) -> None:
        self.registry = registry or LimitRegistry()

    def evaluate(
        self,
        *,
        machine_id: str,
        features: FeatureFrame,
        quality: FrameQuality,
        state: StateRecord,
        context_confidence: float,
        commanded_change: str | None,
        channel_limits: Mapping[str, Mapping[str, bool]] | None = None,
    ) -> RuleResult:
        book = knowledge()
        bands = book.commissioning.get("featureBands", {})
        anomaly_band = float(bands.get("anomalyBand", 3))
        deviation_band = float(bands.get("deviationBand", 2))
        flat_band = float(bands.get("flatBand", 0.5))

        verdicts: list[SignalVerdict] = []
        alert_reached = False
        danger_reached = False
        trip_active = False
        top_authority: LimitAuthority | None = None

        for tag, selection in features.baselines.items():
            definition = book.tag(tag)
            label = definition.label if definition else tag
            signal_quality = quality.for_signal(tag)
            current = features.value_of(f"{tag}.value")

            plant = (channel_limits or {}).get(tag, {})
            limit_status, authority = self._limit_status(tag, current, state.operating_state, plant)
            if limit_status == "TRIP":
                trip_active = True
            elif limit_status == "DANGER":
                danger_reached = True
            elif limit_status == "ALERT":
                alert_reached = True
            if authority is not None and _outranks(authority, top_authority):
                top_authority = authority

            verdict = self._evaluate_signal(
                tag=tag,
                label=label,
                features=features,
                selection=selection,
                quality_verdict=signal_quality.verdict,
                state=state,
                context_confidence=context_confidence,
                commanded_change=commanded_change,
                anomaly_band=anomaly_band,
                deviation_band=deviation_band,
                flat_band=flat_band,
                limit_status=limit_status,
                limit_authority=authority,
                current=current,
            )
            verdicts.append(verdict)

        instrumentation_reasons = self._instrumentation_checks(
            features, quality, {entry.signal_id: entry for entry in verdicts}
        )

        severity, severity_authority, reason = self._severity(
            trip_active=trip_active,
            danger_reached=danger_reached,
            alert_reached=alert_reached,
            authority=top_authority,
            anomalies=[entry for entry in verdicts if entry.is_anomalous],
        )

        return RuleResult(
            verdicts=tuple(verdicts),
            severity=severity,
            severity_authority=severity_authority,
            severity_reason=reason,
            alert_reached=alert_reached,
            danger_reached=danger_reached,
            trip_active=trip_active,
            instrumentation_suspect=bool(instrumentation_reasons),
            instrumentation_reasons=tuple(instrumentation_reasons),
            notes=tuple(features.notes),
        )

    # -- gates --------------------------------------------------------------

    def _evaluate_signal(
        self,
        *,
        tag: str,
        label: str,
        features: FeatureFrame,
        selection: BaselineSelection,
        quality_verdict: str,
        state: StateRecord,
        context_confidence: float,
        commanded_change: str | None,
        anomaly_band: float,
        deviation_band: float,
        flat_band: float,
        limit_status: LimitStatus,
        limit_authority: LimitAuthority | None,
        current: float | None,
    ) -> SignalVerdict:
        """The nine DOC-04 §3 gates, in order, each able to stop the rest."""
        book = knowledge()
        base = SignalVerdict(
            signal_id=tag,
            label=label,
            verdict="NOT_EVALUATED",
            blocked_at_gate=None,
            reason="",
            limit_status=limit_status,
            limit_authority=limit_authority,
            value=current,
            unit=(book.tag(tag).canonical_unit if book.tag(tag) else None),
            expected=selection.expected,
            absolute_deviation=features.value_of(f"{tag}.baseline_abs_dev"),
            percent_deviation=features.value_of(f"{tag}.baseline_pct_dev"),
            robust_score=features.value_of(f"{tag}.baseline_robust_z"),
            rate_of_change=features.value_of(f"{tag}.roc"),
            persistence_seconds=features.value_of(f"{tag}.abnormal_seconds"),
            data_quality=quality_verdict,
            baseline_level=selection.level,
            baseline_confidence=selection.confidence,
        )
        base.trend = self._trend(features, tag, flat_band)

        # Gate 1 — data quality.
        if quality_verdict in {"BAD", "MISSING"}:
            base.verdict = "DATA_QUALITY_SUSPECT"
            base.blocked_at_gate = "DATA_QUALITY"
            base.reason = (
                f"{label} is {quality_verdict}. No physical claim is made from an untrustworthy "
                "reading; the instrumentation path evaluates it instead."
            )
            return base

        if current is None:
            base.verdict = "NOT_EVALUATED"
            base.blocked_at_gate = "DATA_QUALITY"
            base.reason = f"{label} has no usable value in this frame."
            return base

        # Gate 2 — operating state.
        #
        # A *level* comparison needs a steady baseline, so it is confined to
        # steady production. Variability is a different question: "is this
        # signal swinging much more than it normally does" does not depend on a
        # steady level, and DOC-04 lists feed surging and thermal control
        # instability as applicable during RAMP_UP too. Confining everything to
        # ST-06 makes an oscillating feed undiagnosable, because an oscillating
        # feed is itself the reason the state is not steady.
        if not state.is_steady_production:
            if state.operating_state in _VARIABILITY_STATES and self._oscillating(
                features, tag, selection
            ):
                base.verdict = "OSCILLATING"
                base.anomaly_id = book.anomaly_id_for(tag, "OSCILLATING")
                spread = features.value_of(f"{tag}.std_300s")
                base.reason = (
                    f"{label} is oscillating in {state.state_name}: a {spread:.3g} standard "
                    f"deviation over five minutes against a baseline spread of "
                    f"{selection.record.std_dev or 0:.3g} if a baseline applies. Variability "
                    "does not require a steady level to be meaningful."
                )
                return base
            base.verdict = "NOT_EVALUATED"
            base.blocked_at_gate = "OPERATING_STATE"
            base.reason = (
                f"{state.state_name} is not steady production, so a production baseline "
                "level comparison would not be valid."
            )
            return base

        # Gate 3 — context.
        if selection.record is None:
            base.verdict = "NOT_EVALUATED"
            base.blocked_at_gate = "CONTEXT"
            base.reason = selection.reason
            return base
        if context_confidence < 0.3:
            base.verdict = "NOT_EVALUATED"
            base.blocked_at_gate = "CONTEXT"
            base.reason = (
                f"Context confidence is {context_confidence:.2f}. The comparison would be "
                "against a normal that may not be this machine's."
            )
            return base

        # Gates 4 and 5 — expected range and magnitude.
        score = base.robust_score
        if score is None:
            base.verdict = "NOT_EVALUATED"
            base.blocked_at_gate = "EXPECTED_RANGE"
            base.reason = (
                f"The baseline for {label} has no usable spread, so no envelope can be "
                "drawn around its expected value."
            )
            return base

        magnitude = abs(score)
        direction = "HIGH" if score > 0 else "LOW"

        # Gate 8 — an expected response to a commanded change is not an anomaly.
        if commanded_change and magnitude >= deviation_band:
            base.verdict = "EXPECTED_PROCESS_RESPONSE"
            base.blocked_at_gate = "CONTEXT_CHANGE"
            base.reason = (
                f"{label} moved {magnitude:.1f} robust units after a commanded "
                f"{commanded_change}. A physically expected response is not an anomaly."
            )
            return base

        # Oscillation is judged on spread, not on level. A signal swinging
        # thirty per cent either side of its baseline has a perfectly normal
        # mean and is not remotely healthy, so a level test alone can never see
        # it — which is why P-004 and P-007 could not fire before this check
        # existed.
        if self._oscillating(features, tag, selection):
            base.verdict = "OSCILLATING"
            base.anomaly_id = book.anomaly_id_for(tag, "OSCILLATING")
            spread = features.value_of(f"{tag}.std_300s")
            base.reason = (
                f"{label} is oscillating: a {spread:.3g} standard deviation over five minutes "
                f"against a baseline spread of {selection.record.std_dev or 0:.3g}, "
                "with the mean still near expected."
            )
            return base

        if magnitude < deviation_band:
            # Gate 6 — a fast rate of change is anomalous before any level is.
            roc_verdict = self._rate_of_change_verdict(features, tag, selection)
            if roc_verdict is not None:
                base.verdict = roc_verdict
                base.reason = (
                    f"{label} is within its expected envelope but changing at "
                    f"{base.rate_of_change:.2f} per minute against a typical "
                    f"{selection.record.typical_roc or 0:.2f}."
                )
                base.anomaly_id = book.anomaly_id_for(tag, roc_verdict)
                return base
            base.verdict = "NOT_ANOMALOUS"
            base.reason = (
                f"{label} is {magnitude:.1f} robust units from expected, inside the "
                f"{deviation_band:g} deviation band."
            )
            return base

        if magnitude < anomaly_band:
            base.verdict = "NOT_ANOMALOUS"
            base.reason = (
                f"{label} is deviating ({magnitude:.1f} robust units) but has not reached the "
                f"{anomaly_band:g} anomaly band."
            )
            return base

        # Gate 7 — persistence.
        persisted = base.persistence_seconds
        if persisted is not None and persisted <= 0:
            base.verdict = "NOT_ANOMALOUS"
            base.blocked_at_gate = "PERSISTENCE"
            base.reason = (
                f"{label} touched the anomaly band but is not currently sustaining it."
            )
            return base

        base.verdict = "HIGH_ANOMALY" if direction == "HIGH" else "LOW_ANOMALY"
        base.anomaly_id = book.anomaly_id_for(tag, base.verdict)
        held = f" and has held for {persisted:.0f}s" if persisted else ""
        base.reason = (
            f"{label} is {base.value:.3g} against an expected {selection.expected:.3g} "
            f"({magnitude:.1f} robust units {direction.lower()}){held}. "
            f"Compared at {selection.level}."
        )
        return base

    def _oscillating(
        self, features: FeatureFrame, tag: str, selection: BaselineSelection
    ) -> bool:
        """Whether the signal is swinging far more than its baseline allows.

        Measured as observed spread against learned spread over five minutes.
        The factor of three is the same idea as the anomaly band applied to
        variability instead of level: three times the normal swing is a
        different machine behaviour, not noise.

        A trend is excluded deliberately — a signal ramping steadily also has a
        large spread, and that is a trend, not an oscillation. The mean must
        still be near expected for this to be the right word.
        """
        record = selection.record
        if record is None:
            return False
        observed = features.value_of(f"{tag}.std_300s")
        expected_spread = record.std_dev
        if observed is None or expected_spread is None or expected_spread <= 1e-9:
            return False
        if observed < expected_spread * 3.0:
            return False

        # A steady ramp is not an oscillation. If the window's slope explains
        # most of the spread, this is a trend and a different gate owns it.
        slope = features.value_of(f"{tag}.slope_300s") or features.value_of(f"{tag}.slope_120s")
        if slope is not None and abs(slope) * 2.5 >= observed:
            return False
        return True

    def _rate_of_change_verdict(
        self, features: FeatureFrame, tag: str, selection: BaselineSelection
    ) -> str | None:
        """Whether the signal is moving abnormally fast for its own history.

        Requires a learned typical rate. Without one there is nothing to call
        fast *relative to*, and an absolute rate threshold would be a number
        this service invented.
        """
        roc = features.value_of(f"{tag}.roc")
        typical = selection.record.typical_roc if selection.record else None
        if roc is None or typical is None or abs(typical) < 1e-9:
            return None
        if abs(roc) < abs(typical) * 4:
            return None
        return "RISING_ABNORMAL" if roc > 0 else "FALLING_ABNORMAL"

    def _trend(self, features: FeatureFrame, tag: str, flat_band: float) -> str:
        slope = features.value_of(f"{tag}.slope_600s") or features.value_of(f"{tag}.slope_120s")
        spread = features.value_of(f"{tag}.mad_600s")
        if slope is None:
            return "UNKNOWN"
        # A slope is "flat" relative to the signal's own noise, not to zero.
        # Without a spread to scale against, no claim is made.
        if spread is None or spread <= 1e-9:
            return "UNKNOWN"
        if abs(slope) < flat_band * spread:
            return "FLAT"
        return "RISING" if slope > 0 else "FALLING"

    def _limit_status(
        self,
        tag: str,
        value: float | None,
        state_id: str,
        plant: Mapping[str, bool],
    ) -> tuple[LimitStatus, LimitAuthority | None]:
        """Limit status from the plant's own flags first, then the registry.

        The plant's flags win because they come from the system that owns the
        limit. The registry covers limits a site declared to ULTRON but has not
        wired as a flag, and never contradicts a flag that is set.
        """
        if plant.get("trip"):
            return "TRIP", "SAFETY_TRIP"
        if plant.get("danger"):
            return "DANGER", "CUSTOMER_DANGER"
        if plant.get("alert"):
            return "ALERT", "CUSTOMER_ALERT"

        if value is None:
            return "NONE", None

        worst: LimitStatus = "NONE"
        authority: LimitAuthority | None = None
        for entry in self.registry.for_signal(tag):
            if not entry.applies_in(state_id) or not entry.exceeded_by(value):
                continue
            status: LimitStatus = (
                "TRIP"
                if entry.concept == "TRIP_PROTECTION"
                else "DANGER"
                if entry.concept == "DANGER"
                else "ALERT"
            )
            if _status_rank(status) > _status_rank(worst):
                worst = status
                authority = entry.authority
        return worst, authority

    def _uncorroborated_pressure(
        self, features: FeatureFrame, verdicts: dict[str, SignalVerdict]
    ) -> bool:
        """DOC-04 P-011, expressed relatively rather than on absolute values.

        An absolute threshold ("pressure above 20 MPa") only catches a sensor
        that fails dramatically. A transmitter drifting fifty per cent over
        fifteen minutes never reaches it, and is exactly the case where the
        machine looks like it has a developing restriction and does not.

        The discriminator is corroboration, and specifically *two* levels of
        it: drive load must be neither anomalous nor trending. An early
        restriction moves load before load becomes anomalous, so requiring
        only "load not anomalous" would flag every early restriction as a
        sensor fault. Requiring "load flat as well" separates them.
        """
        pressure = verdicts.get("TS-P3")
        load = verdicts.get("TS-PM1")
        feed = verdicts.get("TS-F1")
        if pressure is None or load is None or feed is None:
            return False
        if pressure.verdict not in {"HIGH_ANOMALY", "LOW_ANOMALY"}:
            return False
        if load.is_anomalous or feed.is_anomalous:
            return False

        # The discriminator is whether load has moved *at all*, not whether it
        # is anomalous. A restriction that has developed and plateaued shows an
        # elevated but flat load, and testing only for a rising trend would call
        # that a sensor fault — which is exactly backwards.
        load_score = features.value_of("TS-PM1.baseline_robust_z")
        if load_score is None:
            return False
        if abs(load_score) >= _LOAD_CORROBORATION_UNITS:
            # Load has departed its own baseline, even if not far enough to be
            # anomalous in its own right. That is corroboration, and it makes
            # the process explanation the better one.
            return False

        load_slope = features.value_of("TS-PM1.slope_600s")
        load_spread = features.value_of("TS-PM1.mad_600s")
        if load_slope is None or load_spread is None or load_spread <= 1e-9:
            # Without a load trend nothing can be concluded either way, and
            # guessing "instrumentation" would suppress real restrictions.
            return False
        # Load moving less than its own noise over ten minutes is flat.
        return abs(load_slope) < load_spread * 0.5

    def _instrumentation_checks(
        self, features: FeatureFrame, quality: FrameQuality, verdicts: dict[str, SignalVerdict]
    ) -> list[str]:
        """DOC-04 §17 — where signals that must agree do not.

        Each is a case where one reading claims something dramatic and every
        signal that would have to corroborate it does not. The measurement
        chain is the suspect before the machine.
        """
        reasons: list[str] = []

        screw = features.value_of("TS-S1.value")
        power = features.value_of("TS-PM1.value")
        pressure = features.value_of("TS-P3.value")
        feed = features.value_of("TS-F1.value")
        melt = features.value_of("TS-TM.value")
        spread = features.value_of("t.zone_profile_spread")
        mismatch = features.value_of("s.screw_speed_mismatch")

        if screw is not None and power is not None and screw < 1 and power > 5:
            reasons.append(
                "Screw speed reads zero while the drive still draws load. A speed tag or "
                "pulse fault is more likely than a stopped machine consuming power."
            )
        if self._uncorroborated_pressure(features, verdicts):
            reasons.append(
                "Melt pressure has departed its envelope while drive load is inside its own "
                "and is not even trending. A restriction raises load as well as pressure, so "
                "the transmitter, its port or its scaling is the first suspect."
            )
        last_zone = features.value_of("t.melt_minus_last_zone")
        if last_zone is not None and abs(last_zone) > 120:
            reasons.append(
                "Melt temperature disagrees with the final barrel zone by more than "
                "120 degC, which is a probe or channel fault before it is a process state."
            )
        if mismatch is not None and screw is not None and screw > 1 and abs(mismatch) / screw > 0.5:
            reasons.append(
                "The two geared screw shafts report speeds differing by more than half. "
                "They are mechanically coupled, so this is a scaling or tag fault first."
            )
        if spread is not None and spread > 150:
            reasons.append(
                f"The barrel temperature profile spans {spread:.0f} degC, which no recipe "
                "profile explains. One zone's channel is the likely fault."
            )

        frozen = [
            entry.signal_id
            for entry in quality.per_signal.values()
            if any(finding.rule_id == "DQ-005" for finding in entry.findings)
        ]
        if frozen:
            reasons.append(
                f"{len(frozen)} channel(s) are reporting a frozen value: {', '.join(sorted(frozen))}."
            )

        return reasons

    def _severity(
        self,
        *,
        trip_active: bool,
        danger_reached: bool,
        alert_reached: bool,
        authority: LimitAuthority | None,
        anomalies: list[SignalVerdict],
    ) -> tuple[Severity, LimitAuthority | None, str]:
        """Severity from the authority ladder, raised but never lowered by analytics.

        Computed before confidence is consulted anywhere. DOC-05 §16's failure
        mode — an approved Danger downgraded because the model was unsure — is
        not reachable from here, because confidence is not an argument.
        """
        if trip_active:
            return "DANGER", "SAFETY_TRIP", "A protection trip is active."
        if danger_reached:
            return (
                "DANGER",
                authority or "CUSTOMER_DANGER",
                "An approved Danger limit has been reached. Analytics cannot lower this.",
            )
        if alert_reached:
            return (
                "ALERT",
                authority or "CUSTOMER_ALERT",
                "An approved Alert limit has been reached.",
            )

        # No approved limit reached. A learned anomaly is an advisory: it raises
        # severity to ALERT only when several independent signals agree, and it
        # can never reach DANGER on its own. DOC-05 §5.
        if len(anomalies) >= 3:
            return (
                "ALERT",
                "ULTRON_LEARNED",
                f"{len(anomalies)} signals are outside their contextual envelope at once. "
                "No approved limit has been reached; this is a learned advisory.",
            )
        if anomalies:
            return (
                "NORMAL",
                "ULTRON_LEARNED",
                f"{len(anomalies)} signal(s) outside the contextual envelope, with no "
                "approved limit reached. Advisory only.",
            )
        return "NORMAL", None, "No approved limit reached and no contextual anomaly."


def _status_rank(status: LimitStatus) -> int:
    return {"NONE": 0, "UNKNOWN": 0, "ALERT": 1, "DANGER": 2, "TRIP": 3}[status]


def _outranks(candidate: LimitAuthority, incumbent: LimitAuthority | None) -> bool:
    if incumbent is None:
        return True
    order = list(AUTHORITY_SEVERITY_FLOOR)
    return order.index(candidate) < order.index(incumbent)


def severity_at_least(current: Severity, floor: Severity) -> Severity:
    """Raise a severity to a floor. Never lowers — there is no inverse here."""
    return current if SEVERITY_ORDER.index(current) >= SEVERITY_ORDER.index(floor) else floor


def max_severity(values: Iterable[Severity]) -> Severity:
    worst: Severity = "NORMAL"
    for value in values:
        worst = severity_at_least(worst, value)
    return worst
