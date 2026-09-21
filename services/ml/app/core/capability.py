"""Optional-dependency probes.

TensorFlow, LightGBM, XGBoost and SHAP are large, platform-sensitive and not
needed to answer most questions this service is asked. The deterministic
chain — quality, state, context, features, baselines, rules, decision — depends
on none of them, and that is the property worth protecting: if the LSTM cannot
load, an operator must still get the rule verdict rather than a 500.

So every heavy import happens here, lazily, once, and records *why* it failed.
Callers ask ``capabilities()`` and get a reason string they can put in an
``ML_STATUS = DEGRADED`` response instead of a traceback.

The corollary is that no module at import time may ``import tensorflow``. A
test asserts that: importing ``app`` with the heavy libraries hidden must
succeed.
"""

from __future__ import annotations

import importlib
from dataclasses import dataclass
from functools import lru_cache
from types import ModuleType

#: Libraries the service can use but never requires.
OPTIONAL_LIBRARIES: tuple[str, ...] = (
    "tensorflow",
    "lightgbm",
    "xgboost",
    "shap",
    "sklearn",
    "redis",
    "mlflow",
    "optuna",
)


@dataclass(frozen=True)
class Capability:
    """Whether one optional library is usable, and its version or its excuse."""

    name: str
    available: bool
    version: str | None = None
    reason: str | None = None

    def require(self) -> None:
        """Raise the reason as a clear error, for a path that cannot degrade."""
        if not self.available:
            raise CapabilityUnavailable(self.name, self.reason or "not installed")


class CapabilityUnavailable(RuntimeError):
    """A required optional library is absent. Carries a surfaceable reason."""

    def __init__(self, library: str, reason: str) -> None:
        super().__init__(f"{library} is unavailable: {reason}")
        self.library = library
        self.reason = reason


@lru_cache(maxsize=None)
def probe(name: str) -> Capability:
    """Import a library once and remember the outcome, success or failure."""
    try:
        module = importlib.import_module(name)
    except Exception as error:  # noqa: BLE001 - a broken install is a reason too
        # Deliberately broad. A library that imports but crashes on a missing
        # native DLL is exactly as unusable as one that is not installed, and
        # the operator needs the same answer in both cases.
        return Capability(name=name, available=False, reason=f"{type(error).__name__}: {error}")
    version = getattr(module, "__version__", None)
    return Capability(name=name, available=True, version=str(version) if version else None)


def module(name: str) -> ModuleType:
    """The imported module, or ``CapabilityUnavailable`` with a reason."""
    probe(name).require()
    return importlib.import_module(name)


def capabilities() -> dict[str, Capability]:
    """Every optional library, probed."""
    return {name: probe(name) for name in OPTIONAL_LIBRARIES}


def capability_report() -> dict[str, dict[str, object]]:
    """The probe results, shaped for ``GET /health``."""
    return {
        name: {"available": cap.available, "version": cap.version, "reason": cap.reason}
        for name, cap in capabilities().items()
    }


def reset_probes() -> None:
    """Forget cached probe results. Tests that hide a library need this."""
    probe.cache_clear()
