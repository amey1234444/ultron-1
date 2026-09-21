"""Version identifiers that travel on every prediction.

A prediction nobody can reproduce is an opinion. DOC-06 §32 asks for enough
lineage to rebuild any surfaced finding, and that means a version for each
thing that can change the answer independently:

    contract        the shape of the response the UI parses
    feature set     which features exist and how they are computed
    rule set        the deterministic limit and gate logic
    baseline engine how a baseline is selected and scored
    decision rules  DOC-05 severity / confidence / priority / action

They are separate strings because they move at different speeds. Adding a
feature does not invalidate a decision rule, and bumping all five together
would make the lineage useless for telling which change caused a regression.

Bump discipline: the minor digit for additive changes that keep old artifacts
loadable, the major digit for anything that makes a trained model's input
contract wrong. `FEATURE_SET_VERSION` in particular is checked at inference
against the version a model was trained with, and a mismatch makes the model
ineligible rather than silently wrong.
"""

from __future__ import annotations

from typing import Final

#: The ``schema_version`` on the diagnosis response contract.
CONTRACT_VERSION: Final = "1.0"

#: Feature registry version. A trained model records the one it saw.
FEATURE_SET_VERSION: Final = "1.0.0"

#: Deterministic rule engine (limits, gates, eligibility).
RULE_SET_VERSION: Final = "1.0.0"

#: Baseline selection, eligibility and scoring.
BASELINE_ENGINE_VERSION: Final = "1.0.0"

#: DOC-05 decision layer as implemented here.
DECISION_RULES_VERSION: Final = "1.0.0"

#: Persistence / hysteresis / cooldown filter.
DECISION_FILTER_VERSION: Final = "1.0.0"

#: The knowledge snapshot shape this code understands. Checked at load.
KNOWLEDGE_SCHEMA_VERSION: Final = "1.0.0"

#: The ML service's own release.
SERVICE_VERSION: Final = "1.0.0"


def version_block() -> dict[str, str]:
    """The version set stamped onto a diagnosis response."""
    return {
        "contract": CONTRACT_VERSION,
        "service": SERVICE_VERSION,
        "feature_set": FEATURE_SET_VERSION,
        "rule_set": RULE_SET_VERSION,
        "baseline_engine": BASELINE_ENGINE_VERSION,
        "decision_rules": DECISION_RULES_VERSION,
        "decision_filter": DECISION_FILTER_VERSION,
        "knowledge_schema": KNOWLEDGE_SCHEMA_VERSION,
    }
