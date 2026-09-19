"""Event-aware labels and leakage-safe chronological splits (Doc A §10.3, §11.2-11.3).

* Labels: for horizon H a sample at t is positive for target F when a confirmed onset of F occurs
  in (t, t+H]. Samples during the active fault and the post-clear recovery window are excluded
  from the *negative* class (they are a different regime). ``@now`` targets are positive while
  the fault is active (diagnosis).
* MAINTENANCE / OFF / SHUTDOWN samples are excluded from training entirely (states.yaml
  ``train_eligible``).
* Splits are chronological per machine, 70/15/15 by *episode* (event group), with a purge gap of
  at least ``max_lookback + max_horizon`` seconds between partitions. Rows of one episode never
  cross partitions.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ultron_ml.config.models import OperatingState, ProfileConfig
from ultron_ml.models.trees import HORIZON_SECONDS, target_name


def _ts64(s: pd.Series) -> np.ndarray:
    """tz-aware timestamps -> naive UTC datetime64[ns] array."""
    return s.dt.tz_convert("UTC").dt.tz_localize(None).to_numpy(dtype="datetime64[ns]")


@dataclass(frozen=True)
class FaultEvent:
    episode_id: str
    machine_id: str
    target: str  # family id (or D1 fault id)
    onset: pd.Timestamp
    clear: pd.Timestamp
    fault_id: str | None = None


@dataclass
class LabelConfig:
    horizons: tuple[str, ...] = ("5m", "15m", "30m")
    recovery_exclusion_s: int = 600
    label_by: str = "fault_family"  # or "fault_id"


def extract_events(df: pd.DataFrame, label_by: str = "fault_family") -> list[FaultEvent]:
    ev: list[FaultEvent] = []
    for ep, g in df.groupby("episode_id", sort=False):
        act = g[g["fault_active"] & g[label_by].notna()]
        if act.empty:
            continue
        ev.append(FaultEvent(str(ep), str(g["machine_id"].iloc[0]), str(act[label_by].iloc[0]),
                             act["timestamp"].min(), act["timestamp"].max(),
                             str(act["fault_id"].iloc[0]) if act["fault_id"].notna().any() else None))
    return ev


def build_labels(df: pd.DataFrame, profile: ProfileConfig, targets: list[str], cfg: LabelConfig | None = None) -> tuple[pd.DataFrame, pd.Series]:
    """Return (label frame with one column per target@horizon, train_eligible mask).

    Label values: 1 positive, 0 negative, NaN = excluded (active fault / recovery for prognosis).
    """
    cfg = cfg or LabelConfig()
    events = extract_events(df, cfg.label_by)
    by_ep: dict[str, list[FaultEvent]] = {}
    for e in events:
        by_ep.setdefault(e.episode_id, []).append(e)
    cols: dict[str, np.ndarray] = {}
    n = len(df)
    for t in targets:
        cols[target_name(t, None)] = np.zeros(n)
        for h in cfg.horizons:
            cols[target_name(t, h)] = np.zeros(n)
    ts = _ts64(df["timestamp"])
    ep_arr = df["episode_id"].to_numpy()
    idx_by_ep: dict[str, np.ndarray] = {str(k): np.asarray(v) for k, v in df.groupby("episode_id", sort=False).indices.items()}
    for ep, evs in by_ep.items():
        rows = idx_by_ep[ep]
        t_rows = ts[rows]
        for e in evs:
            if e.target not in targets:
                continue
            onset = np.datetime64(e.onset.to_datetime64())
            clear = np.datetime64(e.clear.to_datetime64())
            active = (t_rows >= onset) & (t_rows <= clear)
            recov = (t_rows > clear) & (t_rows <= clear + np.timedelta64(cfg.recovery_exclusion_s, "s"))
            cols[target_name(e.target, None)][rows[active]] = 1.0
            for h in cfg.horizons:
                col = cols[target_name(e.target, h)]
                pre = (t_rows < onset) & (t_rows >= onset - np.timedelta64(HORIZON_SECONDS[h], "s"))
                col[rows[pre]] = 1.0
                col[rows[active | recov]] = np.nan  # excluded from prognosis negatives
    labels = pd.DataFrame(cols, index=df.index)
    del ep_arr
    st = df["operating_state"].map(lambda s: profile.states.for_state(OperatingState(s)).train_eligible)
    return labels, st.astype(bool)


@dataclass
class SplitConfig:
    train_frac: float = 0.70
    val_frac: float = 0.15
    max_lookback_s: int = 600
    max_horizon_s: int = 1800
    purge_gap_s: int | None = None  # default lookback + horizon
    holdout_machine: str | None = None  # unseen-machine test (E6)

    @property
    def gap(self) -> int:
        return self.purge_gap_s if self.purge_gap_s is not None else self.max_lookback_s + self.max_horizon_s


@dataclass
class Split:
    train: np.ndarray
    val: np.ndarray
    test: np.ndarray
    purged: np.ndarray
    boundaries: dict[str, list[tuple[pd.Timestamp, pd.Timestamp]]] = field(default_factory=dict)


def chronological_split(df: pd.DataFrame, cfg: SplitConfig | None = None) -> Split:
    """Episode-grouped chronological 70/15/15 split with purge gaps; per machine."""
    cfg = cfg or SplitConfig()
    part = np.full(len(df), "", dtype=object)
    bounds: dict[str, list[tuple[pd.Timestamp, pd.Timestamp]]] = {"train": [], "val": [], "test": []}
    gap = np.timedelta64(cfg.gap, "s")
    for mid, g in df.groupby("machine_id", sort=False):
        if cfg.holdout_machine and mid == cfg.holdout_machine:
            part[g.index.to_numpy()] = "test"
            bounds["test"].append((g["timestamp"].min(), g["timestamp"].max()))
            continue
        eps = g.groupby("episode_id", sort=False)["timestamp"].agg(["min", "max"]).sort_values("min")
        n = len(eps)
        n_tr = max(1, int(round(n * cfg.train_frac)))
        n_va = max(1, int(round(n * cfg.val_frac))) if n >= 3 else 0
        if n_tr + n_va >= n and n >= 3:
            n_tr = n - n_va - 1
        assign = {}
        for i, ep in enumerate(eps.index):
            assign[ep] = "train" if i < n_tr else ("val" if i < n_tr + n_va else "test")
        ep_ids = g["episode_id"].to_numpy()
        gi = g.index.to_numpy()
        for ep, lab in assign.items():
            part[gi[ep_ids == ep]] = lab
        # purge: rows in the trailing `gap` before a partition change are dropped from the earlier partition
        order = ["train", "val", "test"]
        for a, b in zip(order, order[1:], strict=False):
            eb = [e for e, l_ in assign.items() if l_ == b]
            if not eb:
                continue
            start_b = eps.loc[eb, "min"].min().to_datetime64()
            ts = _ts64(g["timestamp"])
            purge = (part[gi] == a) & (ts >= start_b - gap) & (ts < start_b)
            part[gi[purge]] = "purged"
        for lab in order:
            m = part[gi] == lab
            if m.any():
                bounds[lab].append((_ts64(g["timestamp"])[m].min(), _ts64(g["timestamp"])[m].max()))
    return Split(
        train=np.where(part == "train")[0], val=np.where(part == "val")[0], test=np.where(part == "test")[0],
        purged=np.where(part == "purged")[0], boundaries=bounds,
    )


def assert_no_leakage(df: pd.DataFrame, split: Split, gap_s: int) -> None:
    """Raise if any episode spans partitions or partitions are closer than the purge gap (per machine)."""
    ep = df["episode_id"].to_numpy()
    sets = {k: set(ep[getattr(split, k)]) for k in ("train", "val", "test")}
    for a, b in (("train", "val"), ("train", "test"), ("val", "test")):
        inter = sets[a] & sets[b]
        if inter:
            raise AssertionError(f"episodes in both {a} and {b}: {sorted(inter)[:3]}")
    ts = _ts64(df["timestamp"])
    mid = df["machine_id"].to_numpy()
    for m in np.unique(mid):
        for a, b in (("train", "val"), ("val", "test"), ("train", "test")):
            ia = getattr(split, a)[mid[getattr(split, a)] == m]
            ib = getattr(split, b)[mid[getattr(split, b)] == m]
            if len(ia) and len(ib):
                d = (ts[ib].min() - ts[ia].max()) / np.timedelta64(1, "s")
                if 0 <= d < gap_s:
                    raise AssertionError(f"{m}: gap {a}->{b} is {d:.0f}s < {gap_s}s")
