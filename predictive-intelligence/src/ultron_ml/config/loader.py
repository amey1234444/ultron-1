"""Load and validate machine profiles from YAML."""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, TypeVar

import yaml
from pydantic import BaseModel

from ultron_ml.config.models import (
    ChannelsConfig,
    DecisionConfig,
    FaultCatalogue,
    ProfileConfig,
    PropagationConfig,
    RecipesConfig,
    StatesConfig,
)

T = TypeVar("T", bound=BaseModel)

PROFILES_ROOT = Path(__file__).resolve().parents[3] / "profiles"


class ConfigError(ValueError):
    pass


def _read_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ConfigError(f"missing config file: {path}")
    with path.open() as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict):
        raise ConfigError(f"{path}: top level must be a mapping")
    return data


def load_model(path: Path, model: type[T]) -> T:
    try:
        return model.model_validate(_read_yaml(path))
    except ValueError as exc:  # pydantic ValidationError is a ValueError
        raise ConfigError(f"{path}: {exc}") from exc


def _hash_dir(files: list[Path]) -> str:
    h = hashlib.sha256()
    for f in sorted(files):
        h.update(f.name.encode())
        h.update(f.read_bytes())
    return h.hexdigest()[:16]


def _merge_common_catalogue(profile: str, cat: dict[str, Any], root: Path) -> dict[str, Any]:
    """Merge profile-agnostic records (DATA_QUALITY family, sensor faults) into the catalogue.

    Only records whose ``applies_to`` explicitly lists the profile are merged; nothing is
    shared implicitly between TSE and SSE.
    """
    common_path = root / "common" / "fault_catalogue.yaml"
    if not common_path.exists():
        return cat
    common = _read_yaml(common_path)
    fam_ids = {f["family_id"] for f in cat.get("families", [])}
    for fam in common.get("families", []):
        if fam["family_id"] not in fam_ids:
            cat.setdefault("families", []).append(fam)
    for fault in common.get("faults", []):
        if profile in fault.get("applies_to", []):
            cat.setdefault("faults", []).append(fault)
    return cat


def load_profile(name: str, root: Path | None = None) -> ProfileConfig:
    root = root or PROFILES_ROOT
    pdir = root / name
    if not pdir.is_dir():
        raise ConfigError(f"unknown machine profile '{name}' (looked in {pdir})")
    files = sorted(pdir.glob("*.yaml")) + sorted((root / "common").glob("*.yaml"))
    channels = load_model(pdir / "channels.yaml", ChannelsConfig)
    states = load_model(root / "common" / "states.yaml", StatesConfig)
    recipes = load_model(pdir / "recipes.yaml", RecipesConfig)
    cat_raw = _merge_common_catalogue(name, _read_yaml(pdir / "fault_catalogue.yaml"), root)
    try:
        catalogue = FaultCatalogue.model_validate(cat_raw)
    except ValueError as exc:
        raise ConfigError(f"{pdir / 'fault_catalogue.yaml'}: {exc}") from exc
    propagation = load_model(pdir / "propagation.yaml", PropagationConfig)
    decision = load_model(pdir / "decision.yaml", DecisionConfig)

    if channels.machine_profile != name or catalogue.machine_profile != name:
        raise ConfigError(f"profile '{name}': machine_profile fields must equal '{name}'")
    codes = set(channels.by_code())
    for r in recipes.recipes:
        for z in r.zone_setpoints:
            if z not in codes:
                raise ConfigError(f"recipe {r.recipe_id}: unknown zone channel {z}")
    for f in catalogue.faults:
        for s in f.primary_sensors + f.supporting_sensors:
            if s not in codes and not s.startswith("EXT:"):
                raise ConfigError(f"fault {f.fault_id}: unknown sensor {s}")
    fault_ids = {f.fault_id for f in catalogue.faults} | {f.family_id for f in catalogue.families}
    for sc in propagation.scenarios:
        if sc.root_fault is not None and sc.root_fault not in fault_ids:
            raise ConfigError(f"scenario {sc.scenario_id}: unknown root fault {sc.root_fault}")

    return ProfileConfig(
        name=name,
        channels=channels,
        states=states,
        recipes=recipes,
        catalogue=catalogue,
        propagation=propagation,
        decision=decision,
        config_hash=_hash_dir(files),
    )


@lru_cache(maxsize=8)
def get_profile(name: str) -> ProfileConfig:
    return load_profile(name)


def available_profiles(root: Path | None = None) -> list[str]:
    root = root or PROFILES_ROOT
    return sorted(p.name for p in root.iterdir() if p.is_dir() and p.name != "common")


def profile_summary(p: ProfileConfig) -> dict[str, Any]:
    return {
        "name": p.name,
        "config_hash": p.config_hash,
        "channels_version": p.channels.version,
        "catalogue_version": p.catalogue.version,
        "propagation_version": p.propagation.version,
        "decision_version": p.decision.version,
        "n_channels": len(p.channels.channels),
        "n_faults": len(p.catalogue.faults),
        "n_families": len(p.catalogue.families),
    }


def dump_json(model: BaseModel) -> str:
    return json.dumps(model.model_dump(mode="json"), indent=2, sort_keys=True)
