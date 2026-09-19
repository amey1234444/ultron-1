"""Dataset assembly: simulator fleet -> features -> labels -> chronological split."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from ultron_ml.config.models import ProfileConfig
from ultron_ml.features.batch import compute_batch
from ultron_ml.features.engine import FeatureEngine
from ultron_ml.knowledge import FaultKnowledgeBase
from ultron_ml.simulator import PROCESS_FAULT_SCENARIOS, Scenario, simulate_fleet
from ultron_ml.training.labels import (
    FaultEvent,
    LabelConfig,
    Split,
    SplitConfig,
    assert_no_leakage,
    build_labels,
    chronological_split,
    extract_events,
)

RAW_COLUMNS = ["RPM", "SRPM", "VM", "VG", "TMOT", "TGB", "Z1", "Z2", "Z3", "MT", "P", "L", "I", "FR"]


@dataclass
class DatasetConfig:
    scenarios: list[Scenario] = field(default_factory=lambda: [Scenario.HEALTHY, *sorted(PROCESS_FAULT_SCENARIOS), Scenario.STARTUP,
                                                               Scenario.RECIPE_CHANGE, Scenario.FROZEN_SENSOR, Scenario.FALSE_HIGH_PRESSURE])
    n_machines: int = 3
    episodes_per_scenario: int = 2
    duration_s: int = 3600
    seed: int = 42
    stride_s: int = 5  # row subsampling for tree training (windows overlap heavily at 1 Hz)
    holdout_machine: str | None = None


@dataclass
class Dataset:
    frame: pd.DataFrame  # telemetry + metadata
    features: pd.DataFrame  # engineered features (schema order)
    labels: pd.DataFrame
    train_eligible: pd.Series
    events: list[FaultEvent]
    split: Split
    targets: list[str]
    feature_schema: list[str]
    snapshot_hash: str
    config: DatasetConfig

    def idx_all(self, part: str) -> np.ndarray:
        """Eligible rows of a partition without stride (chronological order preserved)."""
        rows = getattr(self.split, part)
        return rows[self.train_eligible.to_numpy()[rows]]

    def idx(self, part: str) -> np.ndarray:
        rows = self.idx_all(part)
        return rows[:: self.config.stride_s] if part == "train" else rows

    def with_features(self, features: pd.DataFrame) -> Dataset:
        return Dataset(self.frame, features, self.labels, self.train_eligible, self.events, self.split, self.targets,
                       list(features.columns), self.snapshot_hash, self.config)

    def xy(self, part: str, columns: list[str] | None = None) -> tuple[np.ndarray, dict[str, np.ndarray], np.ndarray]:
        rows = self.idx(part)
        cols = columns or self.feature_schema
        X = self.features.iloc[rows][cols].to_numpy(dtype=float)
        Y = {t: self.labels.iloc[rows][t].to_numpy(dtype=float) for t in self.labels.columns}
        return X, Y, rows


def build_dataset(profile: ProfileConfig, cfg: DatasetConfig | None = None, split_cfg: SplitConfig | None = None) -> Dataset:
    cfg = cfg or DatasetConfig()
    fe = FeatureEngine(profile)
    kb = FaultKnowledgeBase(profile)
    df = simulate_fleet(profile, cfg.scenarios, cfg.n_machines, cfg.episodes_per_scenario, cfg.duration_s, cfg.seed)
    recipes = profile.recipes.by_id()
    feats = []
    for _, g in df.groupby("episode_id", sort=False):
        rec = recipes.get(str(g["recipe_id"].iloc[0]))
        feats.append(compute_batch(fe, g, rec))
    features = pd.concat(feats).loc[df.index]
    targets = [f for f in kb.predictive_families() if f in set(df["fault_family"].dropna().unique()) | set(kb.predictive_families())]
    labels, elig = build_labels(df, profile, targets, LabelConfig())
    scfg = split_cfg or SplitConfig(holdout_machine=cfg.holdout_machine)
    split = chronological_split(df, scfg)
    assert_no_leakage(df, split, scfg.gap)
    h = hashlib.sha256(pd.util.hash_pandas_object(df[RAW_COLUMNS].round(6), index=False).to_numpy().tobytes()).hexdigest()[:16]
    return Dataset(df, features, labels, elig, extract_events(df), split, targets, fe.schema, h, cfg)


def save_dataset_manifest(ds: Dataset, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "snapshot_hash": ds.snapshot_hash, "rows": int(len(ds.frame)), "machines": sorted(ds.frame["machine_id"].unique().tolist()),
        "episodes": int(ds.frame["episode_id"].nunique()), "targets": ds.targets, "feature_count": len(ds.feature_schema),
        "events": [{"episode_id": e.episode_id, "machine_id": e.machine_id, "target": e.target, "onset": str(e.onset), "clear": str(e.clear)} for e in ds.events],
        "split_sizes": {k: int(len(getattr(ds.split, k))) for k in ("train", "val", "test", "purged")},
        "split_boundaries": {k: [(str(a), str(b)) for a, b in v] for k, v in ds.split.boundaries.items()},
        "config": {**{k: (v if not isinstance(v, list) else [str(x) for x in v]) for k, v in ds.config.__dict__.items()}},
        "synthetic": True,
    }
    path.write_text(json.dumps(manifest, indent=2, default=str))
