"""Decision engine (Doc A §13; brief: DECISION ENGINE, FAULT AMBIGUITY, ML ELIGIBILITY).

Priority order (highest first):

1. data-quality rejection      -> DATA_QUALITY_FAULT, no physical diagnosis, no prognosis
2. operating-state gate        -> SUPPRESSED stages
3. deterministic SEVERE rule   -> SEVERE regardless of ML probability
4. deterministic WARNING rule  -> at least WARNING
5. ML (calibrated, persistent) -> DEVELOPING / WARNING with D1/D2/D3-aware localisation

Persistence is N-of-M per (target, horizon); hysteresis uses on/off thresholds; a cooldown
suppresses duplicate alerts for the same target. State is per machine.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np

from ultron_ml.config.models import Detectability, FaultDefinition, ProfileConfig
from ultron_ml.contracts import (
    Contribution,
    DataQualityReport,
    Diagnosis,
    HorizonRisk,
    Hypothesis,
    RuleResult,
    Severity,
)
from ultron_ml.explain import diagnosis_narrative, rule_narrative
from ultron_ml.knowledge import FaultKnowledgeBase
from ultron_ml.state_gate import GateDecision

_DIR_OF_BOUNDARY = {"high": "UP", "low": "DOWN"}


@dataclass
class _TargetState:
    hits: deque[bool]
    active: bool = False
    last_alert: datetime | None = None


@dataclass
class _MachineState:
    targets: dict[str, _TargetState] = field(default_factory=dict)


@dataclass
class MLInput:
    """Calibrated probabilities keyed ``target@horizon`` ('now' for diagnosis) + optional SHAP."""

    probabilities: dict[str, float]
    contributions: dict[str, list[Contribution]] = field(default_factory=dict)
    model_version: str | None = None


class DecisionEngine:
    def __init__(self, profile: ProfileConfig, kb: FaultKnowledgeBase | None = None) -> None:
        self.profile = profile
        self.kb = kb or FaultKnowledgeBase(profile)
        self.cfg = profile.decision
        self._state: dict[str, _MachineState] = {}

    def reset(self, machine_id: str | None = None) -> None:
        if machine_id is None:
            self._state.clear()
        else:
            self._state.pop(machine_id, None)

    def _ts(self, machine_id: str, target: str) -> _TargetState:
        ms = self._state.setdefault(machine_id, _MachineState())
        st = ms.targets.get(target)
        if st is None:
            st = _TargetState(hits=deque(maxlen=self.cfg.persistence_m))
            ms.targets[target] = st
        return st

    def reset_persistence(self, machine_id: str) -> None:
        ms = self._state.get(machine_id)
        if ms:
            for t in ms.targets.values():
                t.hits.clear()
                t.active = False

    # ---- main --------------------------------------------------------------------------
    def decide(
        self,
        machine_id: str,
        ts: datetime,
        dq: DataQualityReport,
        gate: GateDecision,
        rules: RuleResult | None,
        ml: MLInput | None,
        ml_available: bool,
    ) -> tuple[Diagnosis, list[HorizonRisk], list[str]]:
        suppress: list[str] = []
        if gate.reset_persistence:
            self.reset_persistence(machine_id)

        # 1. data quality
        if not dq.valid:
            return (
                Diagnosis(status="DATA_QUALITY_FAULT", detectability=None, localization_confidence="NONE",
                          evidence_missing=[i.message for i in dq.issues if i.severity == "REJECT"],
                          narrative="Packet rejected by data-quality gate: " + "; ".join(
                              i.message for i in dq.issues if i.severity == "REJECT") + ". No physical diagnosis issued."),
                [], ["data_quality_reject"],
            )
        ml_ok = ml_available and ml is not None and dq.ml_eligible and gate.diagnosis_enabled
        if not ml_available:
            suppress.append("ml_unavailable")
        if not dq.ml_eligible:
            suppress.append("data_quality_ml_ineligible:" + ",".join(sorted({i.code for i in dq.issues if i.severity != "INFO"})))
        if not gate.diagnosis_enabled:
            suppress.append("state_gate:" + ";".join(gate.reasons))
        if gate.seconds_in_state < self.cfg.min_history_seconds and gate.state.value == "STEADY_PRODUCTION":
            suppress.append("insufficient_history")
            ml_ok = False

        # 2. rule-derived diagnosis (always available)
        rule_status = rules.status if rules else Severity.NORMAL
        rule_dx = self._rule_diagnosis(rules) if rules else None

        # 3./4. deterministic severity has priority
        if rule_status is Severity.SEVERE or (rule_status is Severity.WARNING and not ml_ok):
            dx = rule_dx or Diagnosis(status=rule_status.value)
            dx = dx.model_copy(update={"status": rule_status.value})
            if ml_ok and ml is not None:
                dx = self._enrich_with_ml(dx, ml)
            prog = self._prognosis(machine_id, ts, ml, gate, dq, ml_ok, suppress)
            return dx, prog, suppress

        # 5. ML diagnosis
        if ml_ok and ml is not None:
            dx = self._ml_diagnosis(machine_id, ts, ml, rules)
            if rule_status is Severity.WARNING and dx.status in ("NORMAL", "DEVELOPING"):
                dx = (rule_dx or dx).model_copy(update={"status": "WARNING"})
            prog = self._prognosis(machine_id, ts, ml, gate, dq, ml_ok, suppress)
            return dx, prog, suppress

        # rules only
        if not gate.diagnosis_enabled and rule_status is Severity.NORMAL:
            dx = Diagnosis(status="SUPPRESSED", narrative="Diagnosis suppressed: " + "; ".join(gate.reasons) + ".")
        elif rules and rules.developing:
            dx = (rule_dx or Diagnosis(status="DEVELOPING")).model_copy(update={"status": "DEVELOPING"})
        else:
            dx = Diagnosis(status="NORMAL", narrative=rule_narrative(rules) if rules else "")
        return dx, [], suppress

    # ---- rule -> family/fault mapping -------------------------------------------------
    def _rule_diagnosis(self, rules: RuleResult) -> Diagnosis | None:
        if not rules.violations and not rules.developing:
            return None
        observed: dict[str, str] = {}
        for v in rules.violations:
            side = v.boundary.rsplit(".", 1)[-1]
            observed[v.channel] = _DIR_OF_BOUNDARY.get(side, "ANY")
        for c in rules.developing:
            observed.setdefault(c, "ANY")
        scores: dict[str, tuple[int, FaultDefinition]] = {}
        for f in self.kb.faults.values():
            if f.machine_profile != self.profile.name and self.profile.name not in f.applies_to:
                continue
            pats = f.severe_pattern + f.warning_pattern + f.developing_pattern
            hit = 0
            for p in pats:
                d = observed.get(p.channel)
                if d is None:
                    continue
                if p.direction in ("ANY", "OSCILLATING") or d == "ANY" or p.direction == d:
                    hit += 1
            if hit == 0 and not pats:
                hit = sum(1 for s in f.primary_sensors if s in observed)
            if hit:
                scores[f.fault_id] = (hit, f)
        if not scores:
            return Diagnosis(status=rules.status.value, evidence_available=rules.reasons, narrative=rule_narrative(rules))
        ranked = sorted(scores.values(), key=lambda t: (-t[0], t[1].detectability.value, t[1].fault_id))
        best_hit = ranked[0][0]
        top = [f for h, f in ranked if h == best_hit]
        fams = {f.fault_family for f in top}
        family = top[0].fault_family if len(fams) == 1 else None
        # a specific fault is only named when it is the unique best D1 match
        d1 = [f for f in top if f.detectability == Detectability.D1]
        specific = d1[0] if len(d1) == 1 and len(top) == 1 else None
        alts = [
            Hypothesis(fault_id=f.fault_id, fault_family=f.fault_family, probability=0.0, detectability=f.detectability,
                       evidence_available=[c for c in f.primary_sensors if c in observed],
                       evidence_missing=self.kb.required_evidence(f.fault_id))
            for f in top[:6] if specific is None or f.fault_id != specific.fault_id
        ]
        det = specific.detectability if specific else (min((f.detectability for f in top), key=lambda d: d.value) if family else None)
        if specific and det == Detectability.D1:
            loc = "HIGH"
        elif family:
            loc = "MEDIUM"
        else:
            loc = "LOW"
        fam_name = self.kb.families[family].name if family else None
        return Diagnosis(
            status=rules.status.value,
            fault_family=family,
            specific_fault=specific.fault_id if specific else None,
            detectability=det,
            localization_confidence=loc,  # type: ignore[arg-type]
            alternatives=alts,
            evidence_available=rules.reasons,
            evidence_missing=self.kb.required_evidence(specific.fault_id) if specific else [],
            narrative=rule_narrative(rules) + " " + diagnosis_narrative(
                self.profile, specific, fam_name, None, [], self.kb.required_evidence(specific.fault_id) if specific else [],
                [a.fault_id for a in alts]),
            propagation_chain=[s.node for p in self.kb.get_possible_propagation_paths(specific.fault_id)[:1] for s in p] if specific else [],
        )

    # ---- ML diagnosis with D1/D2/D3 -------------------------------------------------------
    def _ml_diagnosis(self, machine_id: str, ts: datetime, ml: MLInput, rules: RuleResult | None) -> Diagnosis:
        now = {k.split("@")[0]: p for k, p in ml.probabilities.items() if k.endswith("@now")}
        if not now:
            return Diagnosis(status="NORMAL", narrative=rule_narrative(rules) if rules else "")
        target, p = max(now.items(), key=lambda kv: kv[1])
        p = float(np.clip(p, 0.0, 1.0))
        thr = self.cfg.threshold_for(target, "now")
        st = self._ts(machine_id, target + "@now")
        st.hits.append(p >= thr.on_threshold)
        persistent = sum(st.hits) >= self.cfg.persistence_n
        if st.active and p < thr.off_threshold:
            st.active = False
        elif not st.active and persistent:
            st.active = True
        contribs = ml.contributions.get(target + "@now", [])
        if not st.active:
            status = "DEVELOPING" if p >= thr.off_threshold or (rules and rules.developing) else "NORMAL"
            if status == "NORMAL":
                return Diagnosis(status="NORMAL", probability=p, top_contributors=contribs[:3],
                                 narrative=(rule_narrative(rules) if rules else "") + f" Highest model risk {target} p={p:.2f} below threshold.")
        else:
            status = "WARNING"

        # resolve target -> family / specific
        family, specific = self._localise(target, rules)
        fam = self.kb.families.get(family) if family else None
        cands = self.kb.faults_in_family(family) if family else []
        alts = [
            Hypothesis(fault_id=f.fault_id, fault_family=f.fault_family, probability=p if f is specific else 0.0,
                       detectability=f.detectability,
                       evidence_available=[c.feature for c in contribs if any(c.feature.startswith(s + "_") for s in f.primary_sensors)],
                       evidence_missing=self.kb.required_evidence(f.fault_id))
            for f in cands if specific is None or f.fault_id != specific.fault_id
        ]
        det = specific.detectability if specific else (min((f.detectability for f in cands), key=lambda d: d.value) if cands else None)
        loc = "HIGH" if specific and det == Detectability.D1 and status == "WARNING" else ("MEDIUM" if family else "LOW")
        missing = self.kb.required_evidence(specific.fault_id) if specific else sorted(
            {e for f in cands for e in self.kb.required_evidence(f.fault_id)})[:6]
        return Diagnosis(
            status=status,  # type: ignore[arg-type]
            fault_family=family,
            specific_fault=specific.fault_id if specific else None,
            detectability=det,
            localization_confidence=loc,  # type: ignore[arg-type]
            probability=p,
            alternatives=alts[:8],
            evidence_available=[c.feature for c in contribs if c.direction == "increases_risk"] + (rules.reasons if rules else []),
            evidence_missing=missing,
            top_contributors=contribs,
            narrative=diagnosis_narrative(self.profile, specific, fam.name if fam else None, p, contribs, missing,
                                          [a.fault_id for a in alts]),
            propagation_chain=[s.node for pth in self.kb.get_possible_propagation_paths(specific.fault_id)[:1] for s in pth] if specific else [],
        )

    def _localise(self, target: str, rules: RuleResult | None) -> tuple[str | None, FaultDefinition | None]:
        """ML targets are families (or D1 fault ids). A *specific* fault is named only when the
        target itself is a D1 fault, or the family contains exactly one D1 fault whose pattern is
        corroborated by the deterministic rules. D2 stays family-level; D3 is never specific."""
        if target in self.kb.faults:
            f = self.kb.faults[target]
            return f.fault_family, (f if f.detectability == Detectability.D1 else None)
        if target not in self.kb.families:
            return None, None
        d1 = [f for f in self.kb.faults_in_family(target) if f.detectability == Detectability.D1]
        if len(d1) == 1:
            f = d1[0]
            if rules is None:
                return target, None
            touched = {v.channel for v in rules.violations} | set(rules.developing)
            if touched & set(f.primary_sensors):
                return target, f
        return target, None

    def _enrich_with_ml(self, dx: Diagnosis, ml: MLInput) -> Diagnosis:
        now = {k.split("@")[0]: p for k, p in ml.probabilities.items() if k.endswith("@now")}
        if not now:
            return dx
        t, p = max(now.items(), key=lambda kv: kv[1])
        upd: dict[str, object] = {"probability": float(np.clip(p, 0, 1)), "top_contributors": ml.contributions.get(t + "@now", [])}
        if dx.fault_family is None and t in self.kb.families:
            upd["fault_family"] = t
        return dx.model_copy(update=upd)

    # ---- prognosis -------------------------------------------------------------------------
    def _prognosis(
        self, machine_id: str, ts: datetime, ml: MLInput | None, gate: GateDecision, dq: DataQualityReport,
        ml_ok: bool, suppress: list[str],
    ) -> list[HorizonRisk]:
        if ml is None:
            return []
        out: list[HorizonRisk] = []
        for key, p in sorted(ml.probabilities.items()):
            fault, hz = key.split("@", 1)
            if hz == "now" or hz not in self.cfg.horizons:
                continue
            p = float(np.clip(p, 0.0, 1.0))
            thr = self.cfg.threshold_for(fault, hz)
            st = self._ts(machine_id, key)
            reasons: list[str] = []
            if not ml_ok:
                reasons.extend(suppress)
            if not gate.prognosis_enabled:
                reasons.append("state_gate:prognosis_disabled")
            if gate.thermal_only and not any(fault.startswith(x) for x in ("THERMAL", "MELT", "COOLING")):
                reasons.append("state_gate:thermal_only")
            eligible = not reasons
            if eligible:
                st.hits.append(p >= thr.on_threshold)
            persistent = eligible and sum(st.hits) >= self.cfg.persistence_n
            alert = False
            if eligible:
                if st.active and p < thr.off_threshold:
                    st.active = False
                elif not st.active and persistent:
                    if st.last_alert is not None and (ts - st.last_alert).total_seconds() < self.cfg.cooldown_seconds:
                        reasons.append("cooldown")
                    else:
                        st.active = True
                        st.last_alert = ts
                        alert = True
                elif st.active:
                    alert = True
            out.append(HorizonRisk(fault=fault, horizon=hz, probability=p, calibrated=True, threshold_on=thr.on_threshold,
                                   persistent=persistent, alert=alert, suppressed_by=sorted(set(reasons)),
                                   top_contributors=ml.contributions.get(key, [])[:5]))
        return out
