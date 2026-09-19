"""Explainability (Doc A §12; brief: EXPLAINABILITY).

SHAP TreeExplainer contributions are rendered as ``Contribution`` records and turned into a
deterministic, template-based narrative. No generative model is involved; wording is limited
to the catalogue's own evidence language.
"""

from __future__ import annotations

import math

import numpy as np

from ultron_ml.config.models import FaultDefinition, ProfileConfig
from ultron_ml.contracts import Contribution, RuleResult
from ultron_ml.features.engine import FeatureEngine


def contributions(
    fe: FeatureEngine, feats: dict[str, float], shap_row: np.ndarray, top_k: int = 5
) -> list[Contribution]:
    order = np.argsort(-np.abs(shap_row))
    out: list[Contribution] = []
    for i in order[:top_k]:
        name = fe.schema[int(i)]
        s = float(shap_row[int(i)])
        if s == 0.0:
            continue
        v = feats.get(name)
        out.append(
            Contribution(
                feature=name,
                value=None if v is None or (isinstance(v, float) and math.isnan(v)) else float(v),
                unit=fe.unit_of(name),
                shap=s,
                direction="increases_risk" if s > 0 else "decreases_risk",
                description=fe.describe(name),
            )
        )
    return out


def rule_narrative(rules: RuleResult) -> str:
    if not rules.violations and not rules.developing:
        return "All monitored channels within normal bands."
    parts = [v.message for v in rules.violations]
    if rules.developing:
        parts.append("developing: " + ", ".join(rules.developing) + " outside normal but inside warning")
    return "; ".join(parts) + "."


def diagnosis_narrative(
    profile: ProfileConfig,
    fault: FaultDefinition | None,
    family_name: str | None,
    probability: float | None,
    contribs: list[Contribution],
    evidence_missing: list[str],
    alternatives: list[str],
) -> str:
    seg: list[str] = []
    if fault is not None and fault.detectability.value == "D1":
        seg.append(f"Specific diagnosis: {fault.fault_name} ({fault.fault_id}, {fault.machine_part}).")
    elif family_name:
        seg.append(f"Fault family: {family_name}. Specific cause not separable with current sensors.")
    if probability is not None:
        seg.append(f"Model probability {probability:.2f} (calibrated).")
    if contribs:
        top = ", ".join(
            f"{c.feature}={c.value:.3g} {c.unit}".strip() if c.value is not None else c.feature for c in contribs[:3]
        )
        seg.append(f"Top evidence: {top}.")
    if alternatives:
        seg.append("Alternatives not excluded: " + ", ".join(alternatives[:4]) + ".")
    if evidence_missing:
        seg.append("Evidence required to confirm: " + "; ".join(evidence_missing[:3]) + ".")
    seg.append("Advisory only – confirm by inspection before maintenance action.")
    return " ".join(seg)
