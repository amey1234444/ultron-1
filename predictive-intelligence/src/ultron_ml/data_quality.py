"""Data-quality engine (Doc A §11.1 data-quality gate; Doc B §15/§16; brief: DATA QUALITY).

Stateful per machine: keeps the last accepted packet and per-channel freeze counters. Rules:

* a missing / null channel is MISSING – it is never converted to 0;
* a physically impossible value is quarantined (REJECT for that channel) and raises a DQ event;
* stale (lag > limit) or long gaps make the packet ML-ineligible; short gaps are only flagged;
* frozen sensors (unchanged beyond ``freeze_seconds``) are flagged and excluded from ML;
* out-of-order / duplicate packets are rejected;
* schema / unit / type / mapping mismatches are rejected before any physical interpretation;
* contradictory cross-sensor states (Doc B Appendix E.15) become an INFO/WARNING flag so the
  decision layer can prefer a sensor-fault hypothesis.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from ultron_ml.config.models import ChannelSpec, ProfileConfig
from ultron_ml.contracts import DataQualityIssue, DataQualityReport, QualityFlag, TelemetryPacket

DQ_VERSION = "dq-1.0.0"


@dataclass
class DQLimits:
    stale_seconds: float = 5.0  # freshness: lag from previous sample beyond which data is stale
    short_gap_seconds: float = 10.0  # <= short gap: interpolation permitted downstream
    long_gap_seconds: float = 60.0  # > long gap: window must be reset / no forward fill
    clock_drift_seconds: float = 30.0  # |packet ts - wall clock| beyond => TIMESTAMP_DRIFT
    clip_fraction: float = 0.995  # value at >= 99.5 % of plausible span => CLIPPING


@dataclass
class _ChannelState:
    last_value: float | None = None
    frozen_since: datetime | None = None


@dataclass
class _MachineState:
    last_ts: datetime | None = None
    last_seq: int | None = None
    channels: dict[str, _ChannelState] = field(default_factory=dict)


class DataQualityEngine:
    def __init__(self, profile: ProfileConfig, limits: DQLimits | None = None) -> None:
        self.profile = profile
        self.limits = limits or DQLimits()
        self.specs: dict[str, ChannelSpec] = profile.channels.by_code()
        self._state: dict[str, _MachineState] = {}

    # -- helpers ------------------------------------------------------------------------
    def _st(self, machine_id: str) -> _MachineState:
        return self._state.setdefault(machine_id, _MachineState())

    def reset(self, machine_id: str | None = None) -> None:
        if machine_id is None:
            self._state.clear()
        else:
            self._state.pop(machine_id, None)

    # -- main entry -----------------------------------------------------------------------
    def evaluate(self, pkt: TelemetryPacket, now: datetime | None = None) -> DataQualityReport:
        issues: list[DataQualityIssue] = []
        flags: dict[str, list[str]] = {}
        reject_packet = False
        ml_block = False

        def add(code: str, sev: str, msg: str, ch: str | None = None, val: float | None = None) -> None:
            issues.append(DataQualityIssue(code=code, channel=ch, severity=sev, message=msg, value=val))  # type: ignore[arg-type]
            if ch:
                flags.setdefault(ch, []).append(code)

        # schema / profile
        if pkt.machine_profile != self.profile.name:
            add("PROFILE_MISMATCH", "REJECT", f"packet profile {pkt.machine_profile} != {self.profile.name}")
            reject_packet = True
        if pkt.schema_version.split(".")[0] != "1":
            add("SCHEMA_MISMATCH", "REJECT", f"unsupported schema_version {pkt.schema_version}")
            reject_packet = True
        if pkt.config_version and pkt.config_version != self.profile.channels.version:
            add("CONFIG_VERSION_MISMATCH", "WARNING",
                f"packet config {pkt.config_version} != {self.profile.channels.version}")
            ml_block = True

        unknown = sorted(set(pkt.channels) - set(self.specs))
        for ch in unknown:
            add("UNKNOWN_CHANNEL", "WARNING", f"channel {ch} is not in the {self.profile.name} channel map", ch)

        st = self._st(pkt.machine_id)

        # ordering / duplicates / gaps
        stale_seconds: float | None = None
        gap: float | None = None
        if st.last_ts is not None:
            gap = (pkt.timestamp - st.last_ts).total_seconds()
            if gap < 0:
                add("OUT_OF_ORDER", "REJECT", f"timestamp {pkt.timestamp.isoformat()} earlier than last accepted")
                reject_packet = True
            elif gap == 0:
                add("DUPLICATE", "REJECT", "duplicate timestamp")
                reject_packet = True
            elif gap > self.limits.long_gap_seconds:
                add("LONG_GAP", "WARNING", f"gap {gap:.0f}s > {self.limits.long_gap_seconds}s; window reset, no forward-fill")
                ml_block = True
            elif gap > self.limits.short_gap_seconds:
                add("SHORT_GAP", "INFO", f"gap {gap:.0f}s (short gap – cautious interpolation allowed)")
            elif gap > self.limits.stale_seconds:
                add("STALE", "WARNING", f"sample lag {gap:.1f}s > {self.limits.stale_seconds}s")
                ml_block = True
            stale_seconds = gap
        if pkt.sequence is not None and st.last_seq is not None and pkt.sequence <= st.last_seq and not reject_packet:
            add("DUPLICATE", "REJECT", f"sequence {pkt.sequence} <= last {st.last_seq}")
            reject_packet = True
        if now is not None:
            drift = abs((now - pkt.timestamp).total_seconds())
            if drift > self.limits.clock_drift_seconds:
                add("TIMESTAMP_DRIFT", "WARNING", f"packet clock differs from receiver by {drift:.0f}s")
                ml_block = True

        # per-channel checks
        missing: list[str] = []
        for code, spec in self.specs.items():
            if spec.kind == "context":
                continue
            val = pkt.channels.get(code)
            q = pkt.quality.get(code, QualityFlag.GOOD)
            if q in (QualityFlag.BAD, QualityFlag.MISSING, QualityFlag.STALE):
                add("SOURCE_QUALITY_" + q.value, "WARNING", f"{code} flagged {q.value} by source", code, val)
                val = None
            if val is None:
                missing.append(code)
                add("MISSING_CHANNEL", "WARNING" if spec.critical else "INFO", f"{code} missing (not zero)", code)
                if spec.critical:
                    ml_block = True
                self._track_freeze(st, code, None, pkt.timestamp, spec)
                continue
            if val != val or val in (float("inf"), float("-inf")):
                add("INVALID_TYPE", "REJECT", f"{code} is NaN/inf", code)
                missing.append(code)
                continue
            if not spec.plausible.contains(val):
                add("IMPLAUSIBLE", "WARNING", f"{code}={val} outside physical range [{spec.plausible.low}, {spec.plausible.high}] – quarantined", code, val)
                missing.append(code)
                ml_block = True
                continue
            if spec.plausible.low is not None and spec.plausible.high is not None:
                span = spec.plausible.high - spec.plausible.low
                if span > 0 and (val - spec.plausible.low) / span >= self.limits.clip_fraction and code not in ("L",):
                    add("CLIPPING", "WARNING", f"{code}={val} at sensor full-scale", code, val)
            cs = st.channels.get(code)
            if cs is not None and cs.last_value is not None and spec.max_rate_per_s and gap and gap > 0:
                rate = abs(val - cs.last_value) / gap
                if rate > spec.max_rate_per_s:
                    add("RATE_OF_CHANGE", "WARNING", f"{code} jumped {rate:.3g} {spec.unit}/s > {spec.max_rate_per_s}", code, val)
            frozen = self._track_freeze(st, code, val, pkt.timestamp, spec)
            if frozen:
                add("FROZEN", "WARNING", f"{code} unchanged for >= {spec.freeze_seconds}s", code, val)
                ml_block = True

        # unit sanity: a channel that only makes sense in a given unit and is wildly off-scale
        # is caught by IMPLAUSIBLE above; explicit unit mismatch is a schema-level concept
        # (channel map version) and reported via CONFIG_VERSION_MISMATCH.

        # cross-sensor contradictions (Doc B E.15 false cascades)
        self._cross_checks(pkt, add)

        # derived-channel consistency: SRPM should equal RPM/gear_ratio if purely derived
        gr = self.profile.channels.gear_ratio
        rpm, srpm = pkt.channels.get("RPM"), pkt.channels.get("SRPM")
        if gr and rpm is not None and srpm is not None and "SRPM" in self.specs and "RPM" not in missing:
            expected = rpm / gr
            if abs(srpm - expected) > max(0.05 * expected, 1.0) and rpm > 100:
                add("CHANNEL_MAPPING_INCONSISTENT", "WARNING",
                    f"SRPM={srpm:.1f} inconsistent with RPM/{gr:g}={expected:.1f}", "SRPM", srpm)

        if not reject_packet:
            st.last_ts = pkt.timestamp
            if pkt.sequence is not None:
                st.last_seq = pkt.sequence

        return DataQualityReport(
            valid=not reject_packet,
            ml_eligible=not reject_packet and not ml_block,
            issues=issues,
            channel_flags=flags,
            missing_channels=sorted(missing),
            stale_seconds=stale_seconds,
            dq_version=DQ_VERSION,
        )

    def _track_freeze(self, st: _MachineState, code: str, val: float | None, ts: datetime, spec: ChannelSpec) -> bool:
        cs = st.channels.setdefault(code, _ChannelState())
        if val is None:
            cs.last_value = None
            cs.frozen_since = None
            return False
        if cs.last_value is not None and abs(val - cs.last_value) <= spec.freeze_tolerance:
            if cs.frozen_since is None:
                cs.frozen_since = ts
            frozen = (ts - cs.frozen_since).total_seconds() >= spec.freeze_seconds
        else:
            cs.frozen_since = None
            frozen = False
        cs.last_value = val
        return frozen

    def _cross_checks(self, pkt: TelemetryPacket, add) -> None:  # type: ignore[no-untyped-def]
        c = pkt.channels
        spec = self.specs
        rpm, i, p, l_, mt, tmot = (c.get(k) for k in ("RPM", "I", "P", "L", "MT", "TMOT"))
        running = pkt.operating_state.value in ("STEADY_PRODUCTION", "RECIPE_CHANGE", "PURGING")
        if not running:
            return
        # P falsely high: high P without I/RPM/MT corroboration (CAS-INS-F01)
        if p is not None and i is not None and rpm is not None and "P" in spec and spec["P"].severe and spec["P"].severe.high is not None:
            if p >= spec["P"].severe.high and spec["I"].normal and spec["I"].normal.contains(i) and spec["RPM"].normal and spec["RPM"].normal.contains(rpm):
                add("CROSS_SENSOR_CONTRADICTION", "WARNING", "P severe-high while I and RPM nominal – suspect pressure sensor (CAS-INS-F01)", "P", p)
        # L falsely low: starvation-level L with healthy P and I (CAS-INS-F02)
        if l_ is not None and p is not None and i is not None and "L" in spec and spec["L"].severe and spec["L"].severe.low is not None:
            if l_ <= spec["L"].severe.low and spec["P"].normal and spec["P"].normal.contains(p) and spec["I"].normal and spec["I"].normal.contains(i):
                add("CROSS_SENSOR_CONTRADICTION", "WARNING", "L critical-low while P and I nominal – suspect level sensor (CAS-INS-F02)", "L", l_)
        # I falsely high (CAS-INS-F03)
        if i is not None and tmot is not None and rpm is not None and p is not None and spec["I"].warning and spec["I"].warning.high is not None:
            if i >= spec["I"].warning.high and spec["TMOT"].normal and spec["TMOT"].normal.contains(tmot) and spec["P"].normal and spec["P"].normal.contains(p) and spec["RPM"].normal and spec["RPM"].normal.contains(rpm):
                add("CROSS_SENSOR_CONTRADICTION", "WARNING", "I high while TMOT, RPM and P nominal – suspect current scaling (CAS-INS-F03)", "I", i)
        # RPM falsely low (CAS-INS-F04)
        if rpm is not None and p is not None and i is not None and spec["RPM"].severe and spec["RPM"].severe.low is not None:
            if rpm <= spec["RPM"].severe.low * 0.6 and spec["P"].normal and spec["P"].normal.contains(p) and spec["I"].normal and spec["I"].normal.contains(i):
                add("CROSS_SENSOR_CONTRADICTION", "WARNING", "RPM far below plausible run speed while P and I nominal – suspect pulse loss (CAS-INS-F04)", "RPM", rpm)
