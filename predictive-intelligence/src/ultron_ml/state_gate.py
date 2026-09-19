"""Operating-state gating (Doc A §5.3, §11.3; brief: OPERATING STATE GATING).

Which pipeline stages run in which state is configuration (``profiles/common/states.yaml``),
not code. This module tracks per-machine state transitions so that a stabilisation period
after a transition can suppress steady-state logic, and tells callers which channels are in
scope (thermal-only during WARMING).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ultron_ml.config.models import OperatingState, ProfileConfig, StateRule

THERMAL_CHANNELS = ("Z1", "Z2", "Z3", "MT", "TMOT", "TGB")
PRODUCTION_STATES = frozenset({OperatingState.STEADY_PRODUCTION})


@dataclass(frozen=True)
class GateDecision:
    state: OperatingState
    rules_enabled: bool
    diagnosis_enabled: bool
    prognosis_enabled: bool
    thermal_only: bool
    train_eligible: bool
    stabilising: bool
    seconds_in_state: float
    reasons: tuple[str, ...]
    reset_persistence: bool

    def channel_in_scope(self, code: str) -> bool:
        return not self.thermal_only or code in THERMAL_CHANNELS


@dataclass
class _Track:
    state: OperatingState
    since: datetime


class OperatingStateGate:
    def __init__(self, profile: ProfileConfig) -> None:
        self.profile = profile
        self._tracks: dict[str, _Track] = {}

    def rule(self, state: OperatingState) -> StateRule:
        return self.profile.states.for_state(state)

    def reset(self, machine_id: str | None = None) -> None:
        if machine_id is None:
            self._tracks.clear()
        else:
            self._tracks.pop(machine_id, None)

    def evaluate(self, machine_id: str, state: OperatingState, ts: datetime) -> GateDecision:
        tr = self._tracks.get(machine_id)
        transitioned = tr is None or tr.state != state
        if transitioned:
            tr = _Track(state=state, since=ts)
            self._tracks[machine_id] = tr
        seconds = (ts - tr.since).total_seconds()
        r = self.rule(state)
        stab = self.profile.states.stabilisation_seconds
        stabilising = state in PRODUCTION_STATES and seconds < stab
        reasons: list[str] = []
        if not r.rules:
            reasons.append(f"rules disabled in {state.value}")
        if not r.diagnosis:
            reasons.append(f"diagnosis disabled in {state.value}")
        if not r.prognosis:
            reasons.append(f"prognosis disabled in {state.value}")
        if r.thermal_only:
            reasons.append("thermal-only analysis")
        if stabilising:
            reasons.append(f"stabilising after transition ({seconds:.0f}s < {stab}s)")
        return GateDecision(
            state=state,
            rules_enabled=r.rules,
            diagnosis_enabled=r.diagnosis and not stabilising,
            prognosis_enabled=r.prognosis and not stabilising,
            thermal_only=r.thermal_only,
            train_eligible=r.train_eligible and not stabilising,
            stabilising=stabilising,
            seconds_in_state=seconds,
            reasons=tuple(reasons),
            reset_persistence=transitioned and r.persistence_reset,
        )
