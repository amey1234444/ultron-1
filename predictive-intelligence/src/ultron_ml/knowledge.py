"""Fault knowledge base and propagation graph (brief: FAULT KNOWLEDGE BASE / FAULT PROPAGATION).

The graph is built from the catalogue (fault -> family / part / sensors / evidence) and from the
explicit propagation edges + cascade scenarios of the profile. Propagation edges are *engineering*
relations from the documents – the code never infers causality from correlation.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from ultron_ml.config.models import (
    Detectability,
    FaultDefinition,
    FaultFamily,
    ProfileConfig,
    PropagationEdge,
    PropagationScenario,
)


@dataclass(frozen=True)
class ChainStep:
    node: str
    relation: str
    mechanism: str
    typical_delay_s: int | None


@dataclass(frozen=True)
class RootCandidate:
    fault_id: str
    fault_name: str
    fault_family: str
    detectability: Detectability
    matched_symptoms: tuple[str, ...]
    unmatched_symptoms: tuple[str, ...]
    score: float
    rationale: str


class FaultKnowledgeBase:
    def __init__(self, profile: ProfileConfig) -> None:
        self.profile = profile
        self.faults: dict[str, FaultDefinition] = {f.fault_id: f for f in profile.catalogue.faults}
        self.families: dict[str, FaultFamily] = {f.family_id: f for f in profile.catalogue.families}
        self.by_family: dict[str, list[FaultDefinition]] = defaultdict(list)
        for f in self.faults.values():
            self.by_family[f.fault_family].append(f)
        self.edges: list[PropagationEdge] = list(profile.propagation.edges)
        self.scenarios: dict[str, PropagationScenario] = {s.scenario_id: s for s in profile.propagation.scenarios}
        self._out: dict[str, list[PropagationEdge]] = defaultdict(list)
        self._in: dict[str, list[PropagationEdge]] = defaultdict(list)
        for e in self.edges:
            self._out[e.source].append(e)
            self._in[e.target].append(e)

    # ---- lookups --------------------------------------------------------------------------
    def fault(self, fault_id: str) -> FaultDefinition:
        return self.faults[fault_id]

    def family(self, family_id: str) -> FaultFamily:
        return self.families[family_id]

    def faults_in_family(self, family_id: str) -> list[FaultDefinition]:
        return list(self.by_family.get(family_id, []))

    def predictive_families(self) -> list[str]:
        return [f.family_id for f in self.profile.catalogue.families if f.predictive]

    def predictive_faults(self) -> list[str]:
        return [f.fault_id for f in self.faults.values() if f.predictive and f.detectability == Detectability.D1]

    def sensors_for(self, fault_id: str) -> list[str]:
        f = self.faults[fault_id]
        return list(dict.fromkeys(f.primary_sensors + f.supporting_sensors))

    def faults_using_sensor(self, code: str) -> list[str]:
        return [f.fault_id for f in self.faults.values() if code in f.primary_sensors or code in f.supporting_sensors]

    def required_evidence(self, fault_id: str) -> list[str]:
        f = self.faults[fault_id]
        ev = list(f.additional_evidence_required)
        ev += [e.target for e in self._out.get(fault_id, []) if e.relation == "requires_confirmation_by"]
        if f.maintenance_confirmation:
            ev.append(f.maintenance_confirmation)
        return list(dict.fromkeys(ev))

    def confusable_with(self, fault_id: str) -> list[str]:
        f = self.faults[fault_id]
        out = list(f.alternative_causes)
        out += [e.target for e in self._out.get(fault_id, []) if e.relation == "may_be_confused_with"]
        out += [e.source for e in self._in.get(fault_id, []) if e.relation == "may_be_confused_with"]
        if f.ambiguity_group:
            out += [g.fault_id for g in self.faults.values() if g.ambiguity_group == f.ambiguity_group and g.fault_id != fault_id]
        return list(dict.fromkeys(x for x in out if x != fault_id))

    # ---- graph operations -----------------------------------------------------------------
    def get_possible_propagation_paths(self, fault_id: str, max_depth: int = 6) -> list[list[ChainStep]]:
        """All simple paths following may_propagate_to / causes_symptom edges from a fault."""
        paths: list[list[ChainStep]] = []

        def walk(node: str, path: list[ChainStep], seen: set[str]) -> None:
            nxt = [e for e in self._out.get(node, []) if e.relation in ("may_propagate_to", "causes_symptom")]
            if not nxt or len(path) >= max_depth:
                if path:
                    paths.append(list(path))
                return
            for e in nxt:
                if e.target in seen:
                    continue
                path.append(ChainStep(e.target, e.relation, e.mechanism, e.typical_delay_s))
                walk(e.target, path, seen | {e.target})
                path.pop()

        walk(fault_id, [], {fault_id})
        # scenarios where this fault is the root
        for sc in self.scenarios.values():
            if sc.root_fault == fault_id and sc.chain:
                paths.append([ChainStep(n, "scenario_stage", sc.name, None) for n in sc.chain])
        return paths

    def explain_fault_chain(self, fault_id: str) -> str:
        f = self.faults.get(fault_id)
        if f is None:
            return f"{fault_id}: unknown fault"
        paths = self.get_possible_propagation_paths(fault_id)
        if not paths:
            return f"{f.fault_name}: no documented propagation path in the catalogue."
        lines = [f"{f.fault_name} ({fault_id}) may develop along documented paths:"]
        for p in paths[:5]:
            lines.append("  " + fault_id + " -> " + " -> ".join(s.node for s in p))
        lines.append("Paths are catalogue relationships, not statistical causal claims.")
        return "\n".join(lines)

    def upstream_of(self, node: str) -> list[str]:
        return [e.source for e in self._in.get(node, []) if e.relation in ("may_propagate_to", "causes_symptom")]

    def rank_root_fault_candidates(self, observed_symptoms: list[str], family: str | None = None) -> list[RootCandidate]:
        """Rank catalogue faults whose documented downstream symptoms best cover the observations.

        Score = matched/observed, penalised for paths that predict symptoms not observed and
        for D3 (cannot be confirmed with current sensing).
        """
        obs = set(observed_symptoms)
        out: list[RootCandidate] = []
        for fid, f in self.faults.items():
            if family and f.fault_family != family:
                continue
            predicted: set[str] = set()
            for p in self.get_possible_propagation_paths(fid):
                predicted |= {s.node for s in p}
            for e in self._out.get(fid, []):
                if e.relation == "causes_symptom":
                    predicted.add(e.target)
            if not predicted:
                continue
            matched = tuple(sorted(obs & predicted))
            if not matched:
                continue
            unmatched = tuple(sorted(predicted - obs))
            cover = len(matched) / max(len(obs), 1)
            precision = len(matched) / max(len(predicted), 1)
            det_pen = {Detectability.D1: 1.0, Detectability.D2: 0.85, Detectability.D3: 0.6}[f.detectability]
            score = round((0.6 * cover + 0.4 * precision) * det_pen, 4)
            out.append(RootCandidate(fid, f.fault_name, f.fault_family, f.detectability, matched, unmatched, score,
                                     f"covers {len(matched)}/{len(obs)} observed symptoms; {f.detectability.value}"))
        out.sort(key=lambda c: (-c.score, c.fault_id))
        return out

    def scenarios_for(self, fault_id: str) -> list[PropagationScenario]:
        return [s for s in self.scenarios.values() if s.root_fault == fault_id or fault_id in s.chain]
