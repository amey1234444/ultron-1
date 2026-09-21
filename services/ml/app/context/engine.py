"""The context engine — DOC-02 §26 and §27.

Context is what makes a number mean something. Eight MPa is normal for one
recipe at 250 rpm and a restriction for another at 180, and a baseline selected
against the wrong context is worse than no baseline: it produces confident
comparisons against somebody else's normal.

The ``context_id`` is a stable hash of the keys that, if any of them changed,
would make a stored baseline inapplicable. Two properties matter:

  - **stable across restarts and processes.** It is a digest of sorted key /
    value pairs, not a Python ``hash()``, which is salted per process and would
    silently orphan every baseline on restart.
  - **banded, not exact.** RPM 248.3 and RPM 251.7 are the same operating point
    and must select the same baseline. Raw values would make every frame its
    own context and no baseline would ever accumulate a sample.

When a mandatory key is missing the engine does not invent it. It lowers
confidence, names the gap, and offers a *fallback* id at a declared broader
level — DOC-03 §12's BROADER_CONTEXT, which is a real comparison at lower
confidence rather than no comparison at all.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any

from ..knowledge.enums import OperatingState
from ..schemas.telemetry import TelemetryFrame
from ..state.engine import StateRecord

#: Keys without which a baseline comparison is not safely portable.
MANDATORY_KEYS: tuple[str, ...] = ("machine_id", "configuration_version", "operating_state", "recipe_id")

#: Keys that sharpen the match but whose absence is survivable.
RECOMMENDED_KEYS: tuple[str, ...] = ("rpm_band", "feed_band", "material_id", "temperature_profile")


@dataclass(frozen=True)
class ContextBand:
    """One banding rule: a signal, and the edges its values fall between.

    Edges are configuration rather than physics. They are wide enough that
    ordinary control action does not move a machine between bands, which is the
    only property that matters — a band boundary crossed every thirty seconds
    would fragment the baseline it exists to keep coherent.
    """

    name: str
    tag: str
    edges: tuple[float, ...]

    def band_for(self, value: float | None) -> str | None:
        if value is None:
            return None
        for index, edge in enumerate(self.edges):
            if value < edge:
                return f"{self.name}-{index}"
        return f"{self.name}-{len(self.edges)}"


DEFAULT_BANDS: tuple[ContextBand, ...] = (
    ContextBand(name="RPM", tag="TS-S1", edges=(100.0, 200.0, 300.0, 400.0)),
    ContextBand(name="FEED", tag="TS-F1", edges=(50.0, 100.0, 150.0, 250.0)),
)


@dataclass
class ContextObject:
    """The operating conditions one observation happened in."""

    context_id: str | None
    fallback_context_id: str
    """Always present. Used at BROADER_CONTEXT level when the exact id is null."""

    machine_id: str
    configuration_version: str | None
    operating_state: OperatingState
    recipe_id: str | None = None
    material_id: str | None = None
    product_id: str | None = None
    batch_id: str | None = None
    rpm_band: str | None = None
    feed_band: str | None = None
    temperature_profile: str | None = None
    vacuum_mode: str | None = None
    cooling_mode: str | None = None
    screw_configuration: str | None = None
    production_mode: str | None = None

    confidence: float = 0.0
    missing: list[str] = field(default_factory=list)
    keys: dict[str, str] = field(default_factory=dict)

    @property
    def exact(self) -> bool:
        return self.context_id is not None

    def comparison_id(self) -> str:
        """The id a baseline lookup should use — exact when there is one."""
        return self.context_id or self.fallback_context_id


class ContextEngine:
    """Build the context object for a frame."""

    def __init__(self, bands: tuple[ContextBand, ...] = DEFAULT_BANDS) -> None:
        self._bands = bands

    def build(self, frame: TelemetryFrame, state: StateRecord) -> ContextObject:
        ctx = frame.context

        rpm_band = ctx.rpm_band or self._band("RPM", frame)
        feed_band = ctx.feed_band or self._band("FEED", frame)

        keys: dict[str, str] = {
            "machine_id": frame.machine_id,
            "operating_state": state.operating_state,
        }
        if frame.configuration_version:
            keys["configuration_version"] = frame.configuration_version
        if ctx.recipe_id:
            keys["recipe_id"] = ctx.recipe_id
        if ctx.material_id:
            keys["material_id"] = ctx.material_id
        if rpm_band:
            keys["rpm_band"] = rpm_band
        if feed_band:
            keys["feed_band"] = feed_band
        if ctx.temperature_profile:
            keys["temperature_profile"] = ctx.temperature_profile

        values = {
            "machine_id": frame.machine_id,
            "configuration_version": frame.configuration_version,
            "operating_state": state.operating_state,
            "recipe_id": ctx.recipe_id,
            "material_id": ctx.material_id,
            "rpm_band": rpm_band,
            "feed_band": feed_band,
            "temperature_profile": ctx.temperature_profile,
        }

        missing = [key for key in MANDATORY_KEYS if not values.get(key)]
        missing_recommended = [key for key in RECOMMENDED_KEYS if not values.get(key)]

        context_id = None if missing else _digest(keys)

        # Confidence is a product of what is present, then capped by the state's
        # own confidence: a context built on a state nobody is sure of cannot be
        # more certain than the state.
        confidence = 1.0
        confidence -= 0.25 * len(missing)
        confidence -= 0.08 * len(missing_recommended)
        confidence = max(0.0, min(1.0, confidence))
        confidence = min(confidence, max(state.state_confidence, 0.0))

        # The fallback drops recipe and material — the keys most often absent —
        # and keeps machine, configuration, state and load band. It is a real
        # grouping, just a broader one, and it is labelled as such everywhere.
        fallback_keys = {
            key: value
            for key, value in keys.items()
            if key in {"machine_id", "configuration_version", "operating_state", "rpm_band", "feed_band"}
        }

        return ContextObject(
            context_id=context_id,
            fallback_context_id=_digest(fallback_keys, prefix="CTXB"),
            machine_id=frame.machine_id,
            configuration_version=frame.configuration_version,
            operating_state=state.operating_state,
            recipe_id=ctx.recipe_id,
            material_id=ctx.material_id,
            product_id=ctx.product_id,
            batch_id=ctx.batch_id,
            rpm_band=rpm_band,
            feed_band=feed_band,
            temperature_profile=ctx.temperature_profile,
            vacuum_mode=ctx.vacuum_mode,
            cooling_mode=ctx.cooling_mode,
            screw_configuration=ctx.screw_configuration,
            production_mode=ctx.production_mode,
            confidence=round(confidence, 3),
            missing=missing + missing_recommended,
            keys=keys,
        )

    def _band(self, name: str, frame: TelemetryFrame) -> str | None:
        for band in self._bands:
            if band.name == name:
                return band.band_for(frame.value(band.tag))
        return None


def _digest(keys: dict[str, Any], *, prefix: str = "CTX") -> str:
    """A stable id for a set of context keys.

    ``sha1`` over sorted ``key=value`` pairs. Not a security boundary — it is a
    grouping key — and 16 hex characters is ample to avoid collisions across
    the few thousand contexts a plant produces.
    """
    payload = "|".join(f"{key}={keys[key]}" for key in sorted(keys))
    digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]  # noqa: S324
    return f"{prefix}-{digest}"


def context_changed(previous: ContextObject | None, current: ContextObject) -> bool:
    """Whether the context moved in a way that invalidates continuity.

    Used to freeze baseline learning and reset persistence counters. Compares
    the comparison id, so a move between bands counts and a move within one
    does not.
    """
    if previous is None:
        return False
    return previous.comparison_id() != current.comparison_id()
