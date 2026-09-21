"""Service configuration.

Every knob is an environment variable with a declared default, and the defaults
are chosen so that a service started with no configuration at all runs in the
safest mode rather than the most capable one: ``ML_MODE`` defaults to
``shadow``, so a fresh deployment produces predictions nobody is paged by.

Two settings deserve their names being read twice.

``ml_mode`` decides whether a prediction is allowed to reach an operator. It is
not a feature flag on the model — the model runs identically in every mode —
it governs *publication*, which is the only thing that can hurt anyone.

``allow_untrained_champion`` is false and should stay false outside tests. It
is the guard that stops a model fitted on synthetic fixtures from being
promoted to champion and answering a production diagnosis request.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

MLMode = Literal["disabled", "shadow", "canary", "production"]

_MODES: tuple[MLMode, ...] = ("disabled", "shadow", "canary", "production")

SERVICE_ROOT = Path(__file__).resolve().parents[2]


def _env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return default if value is None or value == "" else value


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    return _env(name, "true" if default else "false").strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw = _env(name, ",".join(default))
    return tuple(part.strip() for part in raw.split(",") if part.strip())


@dataclass(frozen=True)
class Settings:
    """Everything the service reads from its environment, resolved once."""

    # --- publication ------------------------------------------------------
    ml_mode: MLMode = "shadow"
    """disabled | shadow | canary | production. See the module docstring."""

    canary_machines: tuple[str, ...] = ()
    """Machines whose ML findings may be surfaced while in canary mode."""

    canary_faults: tuple[str, ...] = ()
    """Fault ids allowed to surface in canary mode. Empty means all of them."""

    # --- paths ------------------------------------------------------------
    knowledge_dir: Path = SERVICE_ROOT / "knowledge"
    artifacts_dir: Path = SERVICE_ROOT / "artifacts"
    datasets_dir: Path = SERVICE_ROOT / "artifacts" / "datasets"
    registry_dir: Path = SERVICE_ROOT / "artifacts" / "registry"
    config_dir: Path = SERVICE_ROOT / "configs"

    # --- inference --------------------------------------------------------
    inference_interval_seconds: float = 2.0
    """How often the online path is allowed to run a model per machine.

    Telemetry may arrive far faster. Running a tree ensemble and a recurrent
    network on every 1 Hz packet buys nothing on a process whose fault
    signatures develop over minutes, and costs latency everyone else waits on.
    """

    window_retention_seconds: int = 3600
    """How much history the rolling store keeps per signal."""

    max_lookback_seconds: int = 600
    """Longest sequence any temporal model may request. Bounds the store."""

    explanation_probability_floor: float = 0.30
    """Below this calibrated risk, SHAP is not computed unless explicitly asked.

    An explanation for a 4% risk nobody will read is pure latency. The floor is
    a cost control, not a confidence statement, and an operator opening the
    detail view gets an explanation at any probability.
    """

    # --- storage ----------------------------------------------------------
    redis_url: str | None = None
    """When set, rolling windows and decision state survive a restart."""

    database_url: str | None = None
    """Postgres, shared with the Next.js app. Predictions persist here."""

    # --- safety -----------------------------------------------------------
    allow_untrained_champion: bool = False
    internal_api_token: str | None = None
    """Required by every training and promotion route. No token, no training."""

    request_timeout_seconds: float = 5.0

    log_level: str = "INFO"

    extra: dict[str, str] = field(default_factory=dict)

    @property
    def publishes_alerts(self) -> bool:
        """Whether a finding from this service may raise an operator alert."""
        return self.ml_mode in {"canary", "production"}

    def surfaces_for(self, machine_id: str, fault_id: str | None = None) -> bool:
        """Whether *this* finding may be surfaced, given the mode."""
        if self.ml_mode in {"disabled", "shadow"}:
            return False
        if self.ml_mode == "production":
            return True
        if self.canary_machines and machine_id not in self.canary_machines:
            return False
        if fault_id is not None and self.canary_faults and fault_id not in self.canary_faults:
            return False
        return True


def load_settings() -> Settings:
    """Read the environment. Called once at import; re-callable in tests."""
    mode_raw = _env("ML_MODE", "shadow").strip().lower()
    mode: MLMode = mode_raw if mode_raw in _MODES else "shadow"  # type: ignore[assignment]

    root = Path(_env("ULTRON_ML_ROOT", str(SERVICE_ROOT)))

    return Settings(
        ml_mode=mode,
        canary_machines=_env_list("ML_CANARY_MACHINES", ()),
        canary_faults=_env_list("ML_CANARY_FAULTS", ()),
        knowledge_dir=Path(_env("ML_KNOWLEDGE_DIR", str(root / "knowledge"))),
        artifacts_dir=Path(_env("ML_ARTIFACTS_DIR", str(root / "artifacts"))),
        datasets_dir=Path(_env("ML_DATASETS_DIR", str(root / "artifacts" / "datasets"))),
        registry_dir=Path(_env("ML_REGISTRY_DIR", str(root / "artifacts" / "registry"))),
        config_dir=Path(_env("ML_CONFIG_DIR", str(root / "configs"))),
        inference_interval_seconds=_env_float("ML_INFERENCE_INTERVAL_SECONDS", 2.0),
        window_retention_seconds=_env_int("ML_WINDOW_RETENTION_SECONDS", 3600),
        max_lookback_seconds=_env_int("ML_MAX_LOOKBACK_SECONDS", 600),
        explanation_probability_floor=_env_float("ML_EXPLANATION_FLOOR", 0.30),
        redis_url=os.environ.get("ML_REDIS_URL") or None,
        database_url=os.environ.get("ML_DATABASE_URL") or os.environ.get("DATABASE_URL") or None,
        allow_untrained_champion=_env_bool("ML_ALLOW_UNTRAINED_CHAMPION", False),
        internal_api_token=os.environ.get("ML_INTERNAL_TOKEN") or None,
        request_timeout_seconds=_env_float("ML_REQUEST_TIMEOUT_SECONDS", 5.0),
        log_level=_env("ML_LOG_LEVEL", "INFO").upper(),
    )


_SETTINGS: Settings | None = None


def settings() -> Settings:
    """The process-wide settings, resolved on first use."""
    global _SETTINGS
    if _SETTINGS is None:
        _SETTINGS = load_settings()
    return _SETTINGS


def reset_settings(replacement: Settings | None = None) -> None:
    """Replace the cached settings. Tests only."""
    global _SETTINGS
    _SETTINGS = replacement
