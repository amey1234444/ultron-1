"""Persistence, hysteresis and cooldown — what stands between a model and a pager.

An inference is a point estimate on noisy data. Surfacing one directly produces
the failure every condition-monitoring deployment dies of: alerts that appear,
vanish, reappear, and are ignored within a week. This module is the filter, and
it is configurable per fault because the right filter genuinely differs — a
thermal drift can afford two minutes of confirmation, a pressure excursion
cannot.

Four mechanisms, each answering a different failure:

**Threshold** — is the probability high enough? Per fault and per horizon,
never one global number, because the cost of a missed screen restriction and a
missed motor overload are not the same cost.

**N-of-M persistence** — has it been high enough, often enough, recently? Not
consecutive: a genuine signal that dips for one sample on a noisy channel is
still a genuine signal, and requiring consecutive crossings throws those away.

**Hysteresis** — separate raise and clear thresholds. A single threshold
produces chatter around itself, and an alert that flickers is worse than no
alert because it trains people to ignore it.

**Cooldown** — how long before the same fault may alert again after clearing.
Stops a condition that sits on the boundary from generating a new incident
every few minutes.

The whole filter is bypassed for one case, and only one: an approved hard
Danger or Trip. DOC-02 §25's ``hardLimitBypass``. A protection limit does not
wait three cycles for confirmation.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from ..core.timeutil import iso, parse_timestamp, seconds_between
from ..core.versions import DECISION_FILTER_VERSION


@dataclass(frozen=True)
class FilterConfig:
    """Per-fault, per-horizon decision filter configuration."""

    raise_threshold: float = 0.80
    clear_threshold: float = 0.60
    persistence_n: int = 3
    persistence_m: int = 5
    cooldown_seconds: float = 900.0
    duplicate_suppression_seconds: float = 300.0
    hard_limit_bypass: bool = True

    def __post_init__(self) -> None:
        if self.clear_threshold > self.raise_threshold:
            raise ValueError(
                "clear_threshold must not exceed raise_threshold; inverted hysteresis "
                "would make an alert impossible to clear."
            )
        if self.persistence_n > self.persistence_m:
            raise ValueError("persistence_n cannot exceed persistence_m")


DEFAULT_CONFIG = FilterConfig()


@dataclass
class FilterConfigSet:
    """Configuration for every fault-horizon pair, with a declared default.

    Loaded from ``configs/thresholds.yaml``. The default exists so a newly
    added fault has *a* policy rather than none; a fault whose policy matters
    gets its own entry and a comment saying why it differs.
    """

    default: FilterConfig = DEFAULT_CONFIG
    overrides: dict[str, FilterConfig] = field(default_factory=dict)

    def for_output(self, key: str) -> FilterConfig:
        if key in self.overrides:
            return self.overrides[key]
        fault_id = key.split("@")[0]
        return self.overrides.get(fault_id, self.default)

    @classmethod
    def load(cls, path: Path) -> "FilterConfigSet":
        if not path.is_file():
            return cls()
        try:
            import yaml

            payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except Exception:  # noqa: BLE001 - a bad config file must not stop serving
            return cls()

        def build(raw: dict[str, Any] | None) -> FilterConfig:
            raw = raw or {}
            return FilterConfig(
                raise_threshold=float(raw.get("raise_threshold", DEFAULT_CONFIG.raise_threshold)),
                clear_threshold=float(raw.get("clear_threshold", DEFAULT_CONFIG.clear_threshold)),
                persistence_n=int(raw.get("persistence_n", DEFAULT_CONFIG.persistence_n)),
                persistence_m=int(raw.get("persistence_m", DEFAULT_CONFIG.persistence_m)),
                cooldown_seconds=float(raw.get("cooldown_seconds", DEFAULT_CONFIG.cooldown_seconds)),
                duplicate_suppression_seconds=float(
                    raw.get("duplicate_suppression_seconds", DEFAULT_CONFIG.duplicate_suppression_seconds)
                ),
                hard_limit_bypass=bool(raw.get("hard_limit_bypass", True)),
            )

        return cls(
            default=build(payload.get("default")),
            overrides={key: build(value) for key, value in (payload.get("overrides") or {}).items()},
        )


@dataclass
class OutputState:
    """What the filter remembers about one fault-horizon pair, per machine."""

    key: str
    recent: list[bool] = field(default_factory=list)
    """The last M eligible cycles: did the probability clear the raise threshold."""

    active: bool = False
    raised_at: str | None = None
    cleared_at: str | None = None
    last_surfaced_at: str | None = None
    consecutive_eligible: int = 0
    peak_probability: float = 0.0

    def trim(self, m: int) -> None:
        if len(self.recent) > m:
            self.recent = self.recent[-m:]


@dataclass(frozen=True)
class FilterVerdict:
    """The filter's answer for one output at one instant."""

    key: str
    probability: float
    threshold: float
    raise_threshold: float
    clear_threshold: float
    crossed: bool
    """Threshold *and* persistence *and* hysteresis. The only field a decision
    layer may act on."""

    persistence_met: bool
    consecutive_eligible_cycles: int
    active: bool
    newly_raised: bool
    newly_cleared: bool
    suppressed: bool = False
    suppression_reason: str | None = None
    bypassed: bool = False
    """True when an approved hard limit skipped the filter entirely."""


class DecisionFilter:
    """Applies the filter and holds the per-machine state it needs.

    State is kept in memory and optionally persisted, because it *is* the
    filter: restarting with an empty history means a condition that has been
    confirmed for an hour has to re-confirm from scratch, and the operator sees
    an alert disappear for no reason they can observe.
    """

    version = DECISION_FILTER_VERSION

    def __init__(self, config: FilterConfigSet | None = None, state_path: Path | None = None) -> None:
        self.config = config or FilterConfigSet()
        self._state: dict[str, dict[str, OutputState]] = {}
        self._state_path = state_path
        if state_path is not None:
            self._load()

    def apply(
        self,
        *,
        machine_id: str,
        key: str,
        probability: float,
        at: datetime,
        eligible: bool,
        hard_limit_active: bool = False,
    ) -> FilterVerdict:
        """One output, one instant."""
        config = self.config.for_output(key)
        machine_state = self._state.setdefault(machine_id, {})
        state = machine_state.setdefault(key, OutputState(key=key))

        if hard_limit_active and config.hard_limit_bypass:
            # DOC-02 §25. A protection condition does not wait for confirmation.
            state.active = True
            state.raised_at = state.raised_at or iso(at)
            state.last_surfaced_at = iso(at)
            return FilterVerdict(
                key=key,
                probability=probability,
                threshold=config.raise_threshold,
                raise_threshold=config.raise_threshold,
                clear_threshold=config.clear_threshold,
                crossed=True,
                persistence_met=True,
                consecutive_eligible_cycles=state.consecutive_eligible,
                active=True,
                newly_raised=False,
                newly_cleared=False,
                bypassed=True,
            )

        if not eligible:
            # An ineligible cycle is not a negative observation. Recording it as
            # one would let a data-quality outage silently clear a real alert.
            return FilterVerdict(
                key=key,
                probability=probability,
                threshold=config.raise_threshold,
                raise_threshold=config.raise_threshold,
                clear_threshold=config.clear_threshold,
                crossed=state.active,
                persistence_met=False,
                consecutive_eligible_cycles=state.consecutive_eligible,
                active=state.active,
                newly_raised=False,
                newly_cleared=False,
                suppressed=True,
                suppression_reason="Cycle was not eligible for inference; state is held.",
            )

        state.consecutive_eligible += 1
        state.peak_probability = max(state.peak_probability, probability)

        above_raise = probability >= config.raise_threshold
        state.recent.append(above_raise)
        state.trim(config.persistence_m)

        # N of the last M, not N consecutive. A genuine signal that dips for one
        # sample on a noisy channel is still a genuine signal.
        persistence_met = sum(1 for flag in state.recent if flag) >= config.persistence_n

        newly_raised = False
        newly_cleared = False
        suppressed = False
        suppression_reason: str | None = None

        if not state.active:
            if above_raise and persistence_met:
                cooldown_remaining = self._cooldown_remaining(state, config, at)
                if cooldown_remaining > 0:
                    suppressed = True
                    suppression_reason = (
                        f"Within the {config.cooldown_seconds:.0f}s cooldown after the previous "
                        f"clear; {cooldown_remaining:.0f}s remaining."
                    )
                else:
                    state.active = True
                    state.raised_at = iso(at)
                    state.last_surfaced_at = iso(at)
                    newly_raised = True
        else:
            # Hysteresis: falling below the *clear* threshold ends it, not
            # falling below the raise threshold.
            if probability <= config.clear_threshold:
                state.active = False
                state.cleared_at = iso(at)
                state.peak_probability = 0.0
                newly_cleared = True
            elif state.last_surfaced_at is not None:
                elapsed = seconds_between(parse_timestamp(state.last_surfaced_at), at)
                if elapsed < config.duplicate_suppression_seconds:
                    suppressed = True
                    suppression_reason = (
                        f"Already surfaced {elapsed:.0f}s ago; duplicate suppressed for "
                        f"{config.duplicate_suppression_seconds:.0f}s."
                    )
                else:
                    state.last_surfaced_at = iso(at)

        return FilterVerdict(
            key=key,
            probability=probability,
            threshold=config.raise_threshold,
            raise_threshold=config.raise_threshold,
            clear_threshold=config.clear_threshold,
            crossed=state.active,
            persistence_met=persistence_met,
            consecutive_eligible_cycles=state.consecutive_eligible,
            active=state.active,
            newly_raised=newly_raised,
            newly_cleared=newly_cleared,
            suppressed=suppressed,
            suppression_reason=suppression_reason,
        )

    def _cooldown_remaining(self, state: OutputState, config: FilterConfig, at: datetime) -> float:
        if state.cleared_at is None:
            return 0.0
        elapsed = seconds_between(parse_timestamp(state.cleared_at), at)
        return max(0.0, config.cooldown_seconds - elapsed)

    def reset(self, machine_id: str | None = None) -> None:
        if machine_id is None:
            self._state.clear()
        else:
            self._state.pop(machine_id, None)

    def snapshot(self, machine_id: str) -> dict[str, OutputState]:
        return dict(self._state.get(machine_id, {}))

    # -- persistence --------------------------------------------------------

    def save(self) -> Path | None:
        if self._state_path is None:
            return None
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": self.version,
            "machines": {
                machine: {key: _state_to_json(state) for key, state in outputs.items()}
                for machine, outputs in self._state.items()
            },
        }
        self._state_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return self._state_path

    def _load(self) -> None:
        if self._state_path is None or not self._state_path.is_file():
            return
        try:
            payload = json.loads(self._state_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return
        if payload.get("version") != self.version:
            # A filter version change means the state's meaning changed. Starting
            # clean is correct; reinterpreting old state under new rules is not.
            return
        for machine, outputs in payload.get("machines", {}).items():
            self._state[machine] = {key: _state_from_json(key, raw) for key, raw in outputs.items()}


def _state_to_json(state: OutputState) -> dict[str, Any]:
    return {
        "recent": state.recent,
        "active": state.active,
        "raised_at": state.raised_at,
        "cleared_at": state.cleared_at,
        "last_surfaced_at": state.last_surfaced_at,
        "consecutive_eligible": state.consecutive_eligible,
        "peak_probability": state.peak_probability,
    }


def _state_from_json(key: str, raw: dict[str, Any]) -> OutputState:
    return OutputState(
        key=key,
        recent=list(raw.get("recent", [])),
        active=bool(raw.get("active", False)),
        raised_at=raw.get("raised_at"),
        cleared_at=raw.get("cleared_at"),
        last_surfaced_at=raw.get("last_surfaced_at"),
        consecutive_eligible=int(raw.get("consecutive_eligible", 0) or 0),
        peak_probability=float(raw.get("peak_probability", 0.0) or 0.0),
    )
