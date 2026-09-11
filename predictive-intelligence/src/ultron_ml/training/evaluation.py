"""Row-level and event-level evaluation (Doc A §14; brief: EVALUATION METRICS)."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)

from ultron_ml.training.labels import FaultEvent


def _ts64(s: pd.Series) -> np.ndarray:
    """tz-aware timestamps -> naive UTC datetime64[ns] array."""
    return s.dt.tz_convert("UTC").dt.tz_localize(None).to_numpy(dtype="datetime64[ns]")


@dataclass
class RowMetrics:
    n: int
    positives: int
    precision: float
    recall: float
    f1: float
    pr_auc: float
    roc_auc: float
    log_loss: float
    brier: float
    tn: int
    fp: int
    fn: int
    tp: int
    calibration_bins: list[dict[str, float]] = field(default_factory=list)
    ece: float = 0.0


def row_metrics(y: np.ndarray, p: np.ndarray, threshold: float = 0.5, n_bins: int = 10) -> RowMetrics:
    m = ~np.isnan(y)
    y, p = y[m].astype(int), np.clip(p[m], 0, 1)
    if len(y) == 0:
        return RowMetrics(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    yhat = (p >= threshold).astype(int)
    two = len(np.unique(y)) > 1
    cm = confusion_matrix(y, yhat, labels=[0, 1])
    bins = np.linspace(0, 1, n_bins + 1)
    cal: list[dict[str, float]] = []
    ece = 0.0
    for lo, hi in zip(bins[:-1], bins[1:], strict=False):
        sel = (p >= lo) & (p < hi if hi < 1 else p <= hi)
        if sel.sum():
            conf, acc = float(p[sel].mean()), float(y[sel].mean())
            cal.append({"bin_low": float(lo), "bin_high": float(hi), "count": int(sel.sum()), "mean_pred": conf, "frac_pos": acc})
            ece += abs(conf - acc) * sel.sum() / len(p)
    return RowMetrics(
        n=int(len(y)), positives=int(y.sum()),
        precision=float(precision_score(y, yhat, zero_division=0)), recall=float(recall_score(y, yhat, zero_division=0)),
        f1=float(f1_score(y, yhat, zero_division=0)),
        pr_auc=float(average_precision_score(y, p)) if two else float("nan"),
        roc_auc=float(roc_auc_score(y, p)) if two else float("nan"),
        log_loss=float(log_loss(y, p, labels=[0, 1])), brier=float(brier_score_loss(y, p)),
        tn=int(cm[0, 0]), fp=int(cm[0, 1]), fn=int(cm[1, 0]), tp=int(cm[1, 1]), calibration_bins=cal, ece=float(ece),
    )


@dataclass
class EventMetrics:
    events_total: int
    events_detected: int
    events_missed: int
    severe_event_recall: float
    lead_times_s: list[float]
    median_lead_time_s: float
    p10_lead_time_s: float
    detected_ge_5m: float
    detected_ge_15m: float
    detected_ge_30m: float
    false_alarms_per_hour: float
    false_alerts_per_shift: float  # 8 h shift
    peak_pre_onset_probability: list[float]
    missed_events: list[dict[str, Any]]
    first_alarm: dict[str, str | None]


def _persistent_alarm(flags: np.ndarray, n: int, m: int) -> np.ndarray:
    """N-of-M persistence over a boolean series -> boolean series of alarm-on."""
    out = np.zeros_like(flags, dtype=bool)
    for i in range(len(flags)):
        w = flags[max(0, i - m + 1) : i + 1]
        out[i] = w.sum() >= n
    return out


def event_metrics(
    df: pd.DataFrame,
    prob: np.ndarray,
    events: list[FaultEvent],
    target: str,
    threshold: float,
    persistence_n: int = 3,
    persistence_m: int = 5,
    max_lead_s: int = 1800,
    severe_targets: set[str] | None = None,
) -> EventMetrics:
    """``df`` rows aligned with ``prob``; must contain episode_id, timestamp, fault_active, fault_family."""
    ts = _ts64(df["timestamp"])
    ep = df["episode_id"].to_numpy()
    active = df["fault_active"].to_numpy(dtype=bool)
    flags = prob >= threshold
    alarm = np.zeros(len(df), dtype=bool)
    for e in np.unique(ep):
        m = ep == e
        alarm[m] = _persistent_alarm(flags[m], persistence_n, persistence_m)
    tgt_events = [e for e in events if e.target == target]
    leads: list[float] = []
    peaks: list[float] = []
    missed: list[dict[str, Any]] = []
    first: dict[str, str | None] = {}
    detected = 0
    for e in tgt_events:
        m = ep == e.episode_id
        onset = np.datetime64(e.onset.to_datetime64())
        win = m & (ts >= onset - np.timedelta64(max_lead_s, "s")) & (ts <= np.datetime64(e.clear.to_datetime64()))
        pre = m & (ts >= onset - np.timedelta64(max_lead_s, "s")) & (ts < onset)
        peaks.append(float(prob[pre].max()) if pre.any() else float("nan"))
        idx = np.where(win & alarm)[0]
        if len(idx):
            detected += 1
            t_first = ts[idx[0]]
            lead = (onset - t_first) / np.timedelta64(1, "s")
            leads.append(float(lead))
            first[e.episode_id] = str(pd.Timestamp(t_first))
        else:
            missed.append({"episode_id": e.episode_id, "machine_id": e.machine_id, "onset": str(e.onset),
                           "peak_pre_onset_probability": peaks[-1]})
            first[e.episode_id] = None
    # false alarms: alarm-on rising edges outside [onset - max_lead, clear] of any event of this target, in healthy time
    fa = 0
    healthy_seconds = 0.0
    for e_id in np.unique(ep):
        m = np.where(ep == e_id)[0]
        evs = [e for e in tgt_events if e.episode_id == e_id]
        protect = np.zeros(len(m), dtype=bool)
        for e in evs:
            onset = np.datetime64(e.onset.to_datetime64())
            protect |= (ts[m] >= onset - np.timedelta64(max_lead_s, "s")) & (ts[m] <= np.datetime64(e.clear.to_datetime64()))
        protect |= active[m]  # other faults active: not counted as false alarm for this target either
        a = alarm[m] & ~protect
        edges = np.diff(np.concatenate([[False], a]).astype(int)) == 1
        fa += int(edges.sum())
        if len(m) > 1:
            healthy_seconds += float(((~protect).sum()) * ((ts[m][-1] - ts[m][0]) / np.timedelta64(1, "s")) / max(len(m) - 1, 1))
    hours = max(healthy_seconds / 3600.0, 1e-9)
    la = np.array(leads) if leads else np.array([np.nan])
    n_ev = len(tgt_events)
    sev_ev = [e for e in tgt_events if severe_targets is None or e.target in severe_targets]
    sev_det = sum(1 for e in sev_ev if first.get(e.episode_id))
    return EventMetrics(
        events_total=n_ev, events_detected=detected, events_missed=n_ev - detected,
        severe_event_recall=sev_det / len(sev_ev) if sev_ev else float("nan"),
        lead_times_s=leads, median_lead_time_s=float(np.nanmedian(la)), p10_lead_time_s=float(np.nanpercentile(la, 10)),
        detected_ge_5m=float(np.mean([lt >= 300 for lt in leads] + [False] * (n_ev - len(leads)))) if n_ev else float("nan"),
        detected_ge_15m=float(np.mean([lt >= 900 for lt in leads] + [False] * (n_ev - len(leads)))) if n_ev else float("nan"),
        detected_ge_30m=float(np.mean([lt >= 1800 for lt in leads] + [False] * (n_ev - len(leads)))) if n_ev else float("nan"),
        false_alarms_per_hour=fa / hours, false_alerts_per_shift=8.0 * fa / hours,
        peak_pre_onset_probability=peaks, missed_events=missed, first_alarm=first,
    )


def to_dict(m: RowMetrics | EventMetrics) -> dict[str, Any]:
    return asdict(m)
