"""The model registry — what is trained, what is champion, and on what evidence.

Filename conventions are not a registry. ``lgbm_v3_final_FINAL.txt`` cannot
answer which dataset it saw, which features it expects, whether it beat the
incumbent, or whether anybody approved it, and those are the only questions
that matter when a model is producing numbers an engineer acts on.

So every artifact is registered with its contract, its metrics and its
provenance, and promotion is a gated operation rather than a copy. The gates:

  - the Golden regression suite passes;
  - frozen-test metrics exist and were not computed on data used for tuning;
  - the model was trained on real confirmed events, unless explicitly waived;
  - a human approver is recorded.

The third gate is the one that matters right now. Every artifact this codebase
can currently produce is fitted on synthetic fixtures, and none of them may
become champion without ``ML_ALLOW_UNTRAINED_CHAMPION=true`` being set
deliberately. That is the mechanism that stops a pipeline test turning into a
production diagnosis.

Backed by JSON on the filesystem. MLflow can be pointed at the same records
when a deployment wants it; the abstraction is here so that swap is a new
backend rather than a rewrite.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from ..core.config import settings
from ..core.errors import PromotionRefused
from ..core.timeutil import iso, now as utc_now
from ..models.base import ModelContract


@dataclass
class RegistryEntry:
    """One registered model version."""

    model_id: str
    version: str
    model_kind: str
    artifact_path: str
    role: str = "CANDIDATE"
    """CANDIDATE | CHALLENGER | CHAMPION | ARCHIVED."""

    machine_type: str = "TWIN_SCREW_EXTRUDER"
    registered_at: str = field(default_factory=lambda: iso(utc_now()))
    promoted_at: str | None = None
    approved_by: str | None = None
    approval_note: str | None = None

    contract: dict[str, Any] = field(default_factory=dict)
    validation_metrics: dict[str, Any] = field(default_factory=dict)
    test_metrics: dict[str, Any] = field(default_factory=dict)
    golden_results: dict[str, Any] = field(default_factory=dict)
    ablation: dict[str, Any] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    @property
    def key(self) -> str:
        return f"{self.model_id}:{self.version}"

    @property
    def trained_on_real_data(self) -> bool:
        return bool(self.contract.get("trained_on_real_data", False))

    def as_contract(self) -> ModelContract | None:
        return ModelContract.from_json(self.contract) if self.contract else None


class ModelRegistry:
    """Registered models, on disk, with promotion gates."""

    def __init__(self, directory: Path | None = None) -> None:
        self.directory = directory or settings().registry_dir
        self._entries: dict[str, RegistryEntry] = {}
        self._loaded = False

    # -- storage ------------------------------------------------------------

    def _path(self) -> Path:
        return self.directory / "registry.json"

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        path = self._path()
        if not path.is_file():
            return
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return
        for row in payload.get("models", []):
            entry = RegistryEntry(**row)
            self._entries[entry.key] = entry

    def save(self) -> Path:
        self._ensure_loaded()
        self.directory.mkdir(parents=True, exist_ok=True)
        path = self._path()
        path.write_text(
            json.dumps({"models": [asdict(entry) for entry in self._entries.values()]}, indent=2),
            encoding="utf-8",
        )
        return path

    # -- registration -------------------------------------------------------

    def register(
        self,
        *,
        contract: ModelContract,
        artifact_path: Path,
        validation_metrics: dict[str, Any] | None = None,
        test_metrics: dict[str, Any] | None = None,
        notes: Iterable[str] = (),
    ) -> RegistryEntry:
        """Record a trained artifact. Registration is never promotion."""
        self._ensure_loaded()
        entry = RegistryEntry(
            model_id=contract.model_id,
            version=contract.version,
            model_kind=contract.model_kind,
            artifact_path=str(artifact_path),
            contract=contract.to_json(),
            validation_metrics=validation_metrics or {},
            test_metrics=test_metrics or {},
            notes=list(notes),
        )
        self._entries[entry.key] = entry
        self.save()
        return entry

    def get(self, model_id: str, version: str) -> RegistryEntry | None:
        self._ensure_loaded()
        return self._entries.get(f"{model_id}:{version}")

    def all(self) -> tuple[RegistryEntry, ...]:
        self._ensure_loaded()
        return tuple(self._entries.values())

    def champion(self, model_kind: str, machine_type: str = "TWIN_SCREW_EXTRUDER") -> RegistryEntry | None:
        self._ensure_loaded()
        for entry in self._entries.values():
            if (
                entry.role == "CHAMPION"
                and entry.model_kind == model_kind
                and entry.machine_type == machine_type
            ):
                return entry
        return None

    def challengers(self, model_kind: str) -> tuple[RegistryEntry, ...]:
        self._ensure_loaded()
        return tuple(
            entry
            for entry in self._entries.values()
            if entry.role == "CHALLENGER" and entry.model_kind == model_kind
        )

    # -- promotion ----------------------------------------------------------

    def promotion_blockers(
        self, entry: RegistryEntry, *, allow_untrained: bool | None = None
    ) -> list[str]:
        """Every reason this model may not become champion.

        Returned as a list rather than a boolean because the useful answer to
        "why can I not promote this" is the list.
        """
        allow = settings().allow_untrained_champion if allow_untrained is None else allow_untrained
        blockers: list[str] = []

        if not entry.test_metrics:
            blockers.append(
                "No frozen-test metrics are recorded. A model promoted on validation numbers "
                "has been tuned on everything it was measured by."
            )

        golden = entry.golden_results or {}
        if not golden:
            blockers.append("The Golden regression suite has not been run against this model.")
        else:
            failed = [name for name, result in golden.items() if not result]
            if failed:
                blockers.append(
                    f"Golden cases failing: {', '.join(sorted(failed))}. All critical cases must "
                    "pass before promotion."
                )

        if not entry.trained_on_real_data and not allow:
            blockers.append(
                "This model was fitted on synthetic data. It exercises the pipeline and carries "
                "no evidence about a real machine. Set ML_ALLOW_UNTRAINED_CHAMPION=true only to "
                "test the promotion path itself."
            )

        if not entry.approved_by:
            blockers.append("No approver is recorded. Promotion requires a named engineer.")

        return blockers

    def promote(
        self,
        model_id: str,
        version: str,
        *,
        approved_by: str,
        note: str | None = None,
        golden_results: dict[str, Any] | None = None,
        allow_untrained: bool | None = None,
    ) -> RegistryEntry:
        """Make a model champion, or refuse with every reason why not."""
        self._ensure_loaded()
        entry = self.get(model_id, version)
        if entry is None:
            raise PromotionRefused([f"No registered model {model_id}:{version}."])

        entry.approved_by = approved_by
        entry.approval_note = note
        if golden_results is not None:
            entry.golden_results = golden_results

        blockers = self.promotion_blockers(entry, allow_untrained=allow_untrained)
        if blockers:
            # The approver is cleared again so a refused promotion does not
            # leave a model looking approved in the stored record.
            entry.approved_by = None
            self.save()
            raise PromotionRefused(blockers)

        previous = self.champion(entry.model_kind, entry.machine_type)
        if previous is not None and previous.key != entry.key:
            previous.role = "ARCHIVED"
            previous.notes.append(f"Superseded by {entry.key} on {iso(utc_now())}.")

        entry.role = "CHAMPION"
        entry.promoted_at = iso(utc_now())
        self.save()
        return entry

    def demote(self, model_id: str, version: str, *, reason: str) -> RegistryEntry | None:
        """Roll back. Kept simple deliberately — a rollback under pressure
        should be one call with no arguments to get wrong."""
        self._ensure_loaded()
        entry = self.get(model_id, version)
        if entry is None:
            return None
        entry.role = "ARCHIVED"
        entry.notes.append(f"Demoted on {iso(utc_now())}: {reason}")
        self.save()
        return entry

    def describe(self) -> list[dict[str, Any]]:
        """The listing behind ``GET /models``."""
        self._ensure_loaded()
        return [
            {
                "model_id": entry.model_id,
                "version": entry.version,
                "kind": entry.model_kind,
                "role": entry.role,
                "registered_at": entry.registered_at,
                "promoted_at": entry.promoted_at,
                "approved_by": entry.approved_by,
                "trained_on_real_data": entry.trained_on_real_data,
                "feature_set_version": entry.contract.get("feature_set_version"),
                "outputs": len(entry.contract.get("outputs", [])),
                "validation_metrics": entry.validation_metrics,
                "test_metrics": entry.test_metrics,
                "golden_passed": all(entry.golden_results.values()) if entry.golden_results else None,
            }
            for entry in self._entries.values()
        ]


def default_registry() -> ModelRegistry:
    return ModelRegistry()


def artifact_dir(model_kind: str, model_id: str, version: str) -> Path:
    """Where an artifact of this kind and version lives."""
    return settings().artifacts_dir / "models" / model_kind.lower() / f"{model_id}-{version}"


def next_version(existing: Iterable[RegistryEntry], model_id: str) -> str:
    """The next integer version for a model id."""
    versions = [
        int(entry.version)
        for entry in existing
        if entry.model_id == model_id and entry.version.isdigit()
    ]
    return str(max(versions) + 1) if versions else "1"


def timestamp_id(prefix: str, at: datetime | None = None) -> str:
    moment = at or utc_now()
    return f"{prefix}-{moment.strftime('%Y%m%d%H%M%S')}"
