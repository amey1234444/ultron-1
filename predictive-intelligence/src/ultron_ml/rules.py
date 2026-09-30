"""Deterministic rule engine (Doc A §5.1, §6.1; brief: DETERMINISTIC RULE LAYER).

Band semantics per channel (channels.yaml):

* inside ``normal``                       -> NORMAL
* outside normal but inside ``warning``   -> DEVELOPING (reported, no alarm)
* at/beyond ``warning`` boundary          -> WARNING
* at/beyond ``severe`` boundary           -> SEVERE

Recipe-dependent channels (FR) are judged against the recipe setpoint when a recipe is known.
The engine is stateless and works when ML is unavailable. It never issues control actions.
"""

from __future__ import annotations

from datetime import datetime

from ultron_ml.config.models import Band, ChannelSpec, OperatingState, ProfileConfig, RecipeSpec
from ultron_ml.contracts import RuleResult, RuleViolation, Severity
from ultron_ml.state_gate import GateDecision

RULE_VERSION = "rules-1.0.0"
_ORDER = {Severity.NORMAL: 0, Severity.WARNING: 1, Severity.SEVERE: 2}


def _beyond(x: float, band: Band | None) -> str | None:
    """Return 'low'/'high' if x is at or beyond the band edge (outside), else None."""
    if band is None:
        return None
    if band.low is not None and x <= band.low:
        return "low"
    if band.high is not None and x >= band.high:
        return "high"
    return None


def classify_channel(spec: ChannelSpec, x: float) -> tuple[Severity, str | None, float | None, bool]:
    """-> (severity, boundary name, limit, developing)."""
    side = _beyond(x, spec.severe)
    if side:
        return Severity.SEVERE, f"severe.{side}", getattr(spec.severe, side), False
    side = _beyond(x, spec.warning)
    if side:
        return Severity.WARNING, f"warning.{side}", getattr(spec.warning, side), False
    if spec.normal is not None and not spec.normal.contains(x):
        return Severity.NORMAL, None, None, True
    return Severity.NORMAL, None, None, False


class RuleEngine:
    def __init__(self, profile: ProfileConfig) -> None:
        self.profile = profile
        self.specs = profile.channels.by_code()

    def evaluate(
        self,
        channels: dict[str, float | None],
        ts: datetime,
        state: OperatingState,
        gate: GateDecision | None = None,
        recipe: RecipeSpec | None = None,
        quarantined: set[str] | frozenset[str] = frozenset(),
    ) -> RuleResult:
        status = Severity.NORMAL
        violations: list[RuleViolation] = []
        reasons: list[str] = []
        developing: list[str] = []
        suppressed: list[str] = []

        if gate is not None and not gate.rules_enabled:
            return RuleResult(
                status=Severity.NORMAL,
                reasons=[f"rules disabled in state {state.value}"],
                sensor_values=dict(channels),
                timestamp=ts,
                rule_version=RULE_VERSION,
                config_hash=self.profile.config_hash,
                operating_state=state,
                state_suppressed=list(self.specs),
            )

        for code, spec in self.specs.items():
            if spec.kind == "context":
                continue
            x = channels.get(code)
            if x is None or code in quarantined:
                continue  # missing data is not a physical violation
            if gate is not None and not gate.channel_in_scope(code):
                suppressed.append(code)
                continue
            sev, boundary, limit, dev = classify_channel(spec, x)
            # recipe-relative judgement for recipe-dependent channels
            if spec.normal is None and recipe is not None and code == "FR":
                sev, boundary, limit, dev = self._recipe_fr(spec, x, recipe, sev, boundary, limit)
            if dev:
                developing.append(code)
            if sev is not Severity.NORMAL and boundary is not None and limit is not None:
                rid = f"R_{code}_{boundary.upper().replace('.', '_')}"
                dirn = "below" if boundary.endswith("low") else "above"
                msg = f"{spec.name} {x:g} {spec.unit} {dirn} {boundary} limit {limit:g} {spec.unit}"
                violations.append(RuleViolation(rule_id=rid, channel=code, severity=sev, value=x,
                                                boundary=boundary, limit=limit, unit=spec.unit, message=msg))
                reasons.append(msg)
                if _ORDER[sev] > _ORDER[status]:
                    status = sev

        # zone-setpoint deviation rules (Doc A §10.1 barrel thermal-control issue)
        if recipe is not None:
            for z, sp in recipe.zone_setpoints.items():
                x = channels.get(z)
                spec = self.specs.get(z)
                if x is None or spec is None or z in quarantined or (gate and not gate.channel_in_scope(z)):
                    continue
                err = x - sp
                if abs(err) >= 20:
                    sev = Severity.SEVERE
                elif abs(err) >= 10:
                    sev = Severity.WARNING
                else:
                    continue
                if any(v.channel == z for v in violations):
                    continue
                msg = f"{spec.name} deviates {err:+.1f} {spec.unit} from recipe setpoint {sp:g}"
                violations.append(RuleViolation(rule_id=f"R_{z}_SETPOINT_DEV", channel=z, severity=sev, value=x,
                                                boundary="setpoint", limit=sp, unit=spec.unit, message=msg))
                reasons.append(msg)
                if _ORDER[sev] > _ORDER[status]:
                    status = sev

        if developing and not reasons:
            reasons.append("developing deviation (outside normal, inside warning): " + ", ".join(developing))

        return RuleResult(
            status=status,
            developing=developing,
            violations=violations,
            reasons=reasons,
            sensor_values=dict(channels),
            timestamp=ts,
            rule_version=RULE_VERSION,
            config_hash=self.profile.config_hash,
            operating_state=state,
            state_suppressed=suppressed,
        )

    @staticmethod
    def _recipe_fr(
        spec: ChannelSpec, x: float, recipe: RecipeSpec, sev: Severity, boundary: str | None, limit: float | None
    ) -> tuple[Severity, str | None, float | None, bool]:
        if sev is Severity.SEVERE:
            return sev, boundary, limit, False
        sp = recipe.feed_setpoint
        if sp <= 0:
            return sev, boundary, limit, False
        rel = (x - sp) / sp
        if abs(rel) >= 0.25:
            return Severity.WARNING, "recipe.low" if rel < 0 else "recipe.high", sp * (0.75 if rel < 0 else 1.25), False
        if abs(rel) >= 0.10:
            return Severity.NORMAL, None, None, True
        return Severity.NORMAL, None, None, False
