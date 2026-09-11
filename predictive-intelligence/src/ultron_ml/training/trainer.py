"""Training orchestration: trees (LightGBM primary / XGBoost challenger), LSTM temporal model,
LSTM-derived residual/embedding features, and the E0-E7 experiment matrix."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from ultron_ml.config.models import OperatingState, ProfileConfig
from ultron_ml.knowledge import FaultKnowledgeBase
from ultron_ml.features.engine import FeatureEngine
from ultron_ml.models.lstm import LSTMConfig, LSTMTemporalModel, make_windows
from ultron_ml.models.trees import MultiLabelTreeModel, TreeParams, split_target
from ultron_ml.rules import RuleEngine
from ultron_ml.training.dataset import RAW_COLUMNS, Dataset
from ultron_ml.training.evaluation import EventMetrics, RowMetrics, event_metrics, row_metrics, to_dict

log = logging.getLogger(__name__)

LSTM_CHANNELS = RAW_COLUMNS


def lstm_feature_names(cfg: LSTMConfig) -> list[str]:
    names = [f"lstm_nres_{c}" for c in LSTM_CHANNELS] + [f"lstm_absres_{c}" for c in LSTM_CHANNELS]
    names += ["lstm_nres_l2"]
    names += [f"lstm_emb_{i:02d}" for i in range(cfg.embedding_dim)]
    return names


def lstm_features_for_series(model: LSTMTemporalModel, series: np.ndarray) -> np.ndarray:
    """[T, 14] raw series -> [T, n_lstm_features]; rows without a full lookback are NaN.

    Row t uses the window ending at t-1 (no future leakage) and compares the one-step forecast with the
    actual sample at t.
    """
    T = len(series)
    L = model.cfg.lookback_steps
    n_out = len(lstm_feature_names(model.cfg))
    out = np.full((T, n_out), np.nan)
    if T <= L:
        return out
    X, Y = make_windows(series, L, 1)  # X[i] = rows i..i+L-1, Y[i] = row i+L
    fc, emb = model.predict(X)
    res = Y[:, 0, :] - fc[:, 0, :]
    scale = model.residual_scale if model.residual_scale is not None else np.ones(series.shape[1])
    nres = res / scale
    nres = np.nan_to_num(nres, nan=0.0)
    block = np.concatenate([nres, np.abs(res), np.linalg.norm(nres, axis=1, keepdims=True), emb], axis=1)
    out[L:] = block
    return out


def add_lstm_features(ds: Dataset, model: LSTMTemporalModel) -> pd.DataFrame:
    names = lstm_feature_names(model.cfg)
    parts = []
    for _, g in ds.frame.groupby("episode_id", sort=False):
        arr = lstm_features_for_series(model, g[LSTM_CHANNELS].to_numpy(dtype=float))
        parts.append(pd.DataFrame(arr, index=g.index, columns=names))
    return pd.concat(parts).loc[ds.frame.index]


def train_lstm(ds: Dataset, cfg: LSTMConfig, epochs: int | None = None) -> LSTMTemporalModel:
    """Fit forecaster on *healthy, steady* training rows (normal-behaviour model), validate on val rows."""
    fr = ds.frame

    def healthy(rows: np.ndarray) -> np.ndarray:
        sel = fr.iloc[rows]
        sel = sel[(~sel["fault_active"]) & (sel["operating_state"] == "STEADY_PRODUCTION")]
        return sel[LSTM_CHANNELS].to_numpy(dtype=float)

    tr = healthy(ds.idx_all("train"))
    va = healthy(ds.idx_all("val"))
    if len(va) < cfg.lookback_steps + cfg.forecast_steps + 1:
        va = tr[-(cfg.lookback_steps + cfg.forecast_steps + 200):]
    model = LSTMTemporalModel(cfg)
    model.fit(tr, va, epochs=epochs)
    return model


@dataclass
class ExperimentResult:
    experiment: str
    description: str
    backend: str
    feature_count: int
    train_rows: int
    seconds: float
    val: dict[str, dict[str, Any]] = field(default_factory=dict)
    test: dict[str, dict[str, Any]] = field(default_factory=dict)
    test_events: dict[str, dict[str, Any]] = field(default_factory=dict)
    notes: str = ""

    def summary(self) -> dict[str, float]:
        def mean(part: dict[str, dict[str, Any]], key: str) -> float:
            v = [m[key] for m in part.values() if m.get("positives", 0) > 0 and not (isinstance(m[key], float) and np.isnan(m[key]))]
            return float(np.mean(v)) if v else float("nan")

        ev = [m for m in self.test_events.values() if m["events_total"] > 0]
        return {
            "test_pr_auc_mean": mean(self.test, "pr_auc"), "test_roc_auc_mean": mean(self.test, "roc_auc"),
            "test_f1_mean": mean(self.test, "f1"), "test_brier_mean": mean(self.test, "brier"), "test_ece_mean": mean(self.test, "ece"),
            "event_recall": float(np.mean([m["events_detected"] / m["events_total"] for m in ev])) if ev else float("nan"),
            "median_lead_time_s": float(np.nanmedian([m["median_lead_time_s"] for m in ev])) if ev else float("nan"),
            "false_alarms_per_hour": float(np.mean([m["false_alarms_per_hour"] for m in ev])) if ev else float("nan"),
        }


def _eval_tree(ds: Dataset, model: MultiLabelTreeModel, cols: list[str], profile: ProfileConfig, res: ExperimentResult) -> None:
    for part in ("val", "test"):
        X, Y, rows = ds.xy(part, cols)
        if len(rows) == 0:
            continue
        P = model.predict(X)
        store = res.val if part == "val" else res.test
        for t in model.targets:
            store[t] = to_dict(row_metrics(Y[t], P[t]))
        if part == "test":
            sub = ds.frame.iloc[rows]
            dec = profile.decision
            for t in model.targets:
                fam, h = split_target(t)
                if h == "now":
                    continue
                thr = dec.threshold_for(fam, h).on_threshold
                res.test_events[t] = to_dict(event_metrics(sub, P[t], ds.events, fam, thr, dec.persistence_n, dec.persistence_m))


def _rules_only(ds: Dataset, profile: ProfileConfig, res: ExperimentResult) -> None:
    """E0: rule severity as a score (SEVERE=1, WARNING=0.6, developing=0.3, NORMAL=0) mapped to families via catalogue channels."""
    re_ = RuleEngine(profile)
    kb = FaultKnowledgeBase(profile)
    fam_channels = {f: {s for fd in kb.faults_in_family(f) for s in fd.primary_sensors} for f in ds.targets}
    recipes = profile.recipes.by_id()
    X, Y, rows = ds.xy("test")
    sub = ds.frame.iloc[rows]
    scores = {f: np.zeros(len(rows)) for f in ds.targets}
    for i, (_, r) in enumerate(sub.iterrows()):
        vals = {c: (None if pd.isna(r[c]) else float(r[c])) for c in RAW_COLUMNS}
        rr = re_.evaluate(vals, r["timestamp"].to_pydatetime(), OperatingState(r["operating_state"]), recipe=recipes.get(str(r["recipe_id"])))
        for v in rr.violations:
            s = 1.0 if v.severity.value == "SEVERE" else (0.6 if v.severity.value == "WARNING" else 0.3)
            for f, chs in fam_channels.items():
                if v.channel in chs:
                    scores[f][i] = max(scores[f][i], s)
    for t in ds.labels.columns:
        fam, h = split_target(t)
        if fam not in scores:
            continue
        res.test[t] = to_dict(row_metrics(Y[t], scores[fam], threshold=0.6))
        if h != "now":
            res.test_events[t] = to_dict(event_metrics(sub, scores[fam], ds.events, fam, 0.6, profile.decision.persistence_n, profile.decision.persistence_m))
    res.notes = "Rule score is a deterministic severity proxy per family (channels from catalogue); no probabilities."


def run_experiment_matrix(
    ds: Dataset,
    profile: ProfileConfig,
    out_dir: Path,
    experiments: list[str] | None = None,
    lstm_cfg: LSTMConfig | None = None,
    lstm_epochs: int | None = None,
    tree_rounds: int | None = None,
) -> tuple[list[ExperimentResult], dict[str, Any]]:
    """Runs E0..E7 and writes ``experiments.json`` + ``comparison.md``. Returns results and trained artefact paths."""
    out_dir.mkdir(parents=True, exist_ok=True)
    fe = FeatureEngine(profile)
    exps = experiments or ["E0", "E1", "E2", "E3", "E4", "E5", "E6", "E7"]
    results: list[ExperimentResult] = []
    artefacts: dict[str, Any] = {}
    raw_cols = [f"{c}_raw" for c in RAW_COLUMNS]
    eng_cols = ds.feature_schema
    lstm_model: LSTMTemporalModel | None = None
    lstm_feats: pd.DataFrame | None = None

    def tree_params(backend: str) -> TreeParams:
        p = TreeParams(algorithm=backend, max_depth=6 if backend == "lightgbm" else 5)  # type: ignore[arg-type]
        if tree_rounds:
            p.n_rounds = tree_rounds
        return p

    def fit_tree(name: str, desc: str, backend: str, cols: list[str], features: pd.DataFrame) -> tuple[ExperimentResult, MultiLabelTreeModel]:
        t0 = time.time()
        ds_local = ds.with_features(features)
        Xtr, Ytr, rtr = ds_local.xy("train", cols)
        Xva, Yva, _ = ds_local.xy("val", cols)
        targets = [t for t in ds.labels.columns]
        model = MultiLabelTreeModel(tree_params(backend), cols, targets)
        model.fit(Xtr, Ytr, Xva, Yva)
        r = ExperimentResult(name, desc, backend, len(cols), len(rtr), 0.0)
        _eval_tree(ds_local, model, cols, profile, r)
        r.seconds = time.time() - t0
        model.save(out_dir / name.lower())
        artefacts[name] = str(out_dir / name.lower())
        return r, model

    for e in exps:
        log.info("experiment %s", e)
        if e == "E0":
            t0 = time.time()
            r = ExperimentResult("E0", "Rules only (deterministic severity as score)", "rules", 0, 0, 0.0)
            _rules_only(ds, profile, r)
            r.seconds = time.time() - t0
            results.append(r)
        elif e == "E1":
            results.append(fit_tree("E1", "LightGBM on raw snapshot (14 current values)", "lightgbm", raw_cols, ds.features)[0])
        elif e == "E2":
            results.append(fit_tree("E2", "LightGBM on engineered features", "lightgbm", eng_cols, ds.features)[0])
        elif e == "E3":
            results.append(fit_tree("E3", "XGBoost challenger on engineered features", "xgboost", eng_cols, ds.features)[0])
        elif e in ("E4", "E5", "E6"):
            if lstm_model is None:
                t0 = time.time()
                lstm_model = train_lstm(ds, lstm_cfg or LSTMConfig(feature_count=len(LSTM_CHANNELS)), epochs=lstm_epochs)
                lstm_model.save(out_dir / "lstm")
                artefacts["LSTM"] = str(out_dir / "lstm")
                lstm_feats = add_lstm_features(ds, lstm_model)
                if e == "E4":
                    r = ExperimentResult("E4", "LSTM forecaster: normalised-residual L2 as anomaly score", "lstm", len(LSTM_CHANNELS), 0, time.time() - t0)
                    _, Y, rows = ds.xy("test")
                    score = np.nan_to_num(lstm_feats.iloc[rows]["lstm_nres_l2"].to_numpy(), nan=0.0)
                    score = 1 - np.exp(-score / max(np.nanmedian(score[score > 0]) if (score > 0).any() else 1.0, 1e-6) / 3)
                    sub = ds.frame.iloc[rows]
                    for t in ds.labels.columns:
                        fam, h = split_target(t)
                        r.test[t] = to_dict(row_metrics(Y[t], score))
                        if h != "now":
                            r.test_events[t] = to_dict(event_metrics(sub, score, ds.events, fam, 0.6, profile.decision.persistence_n, profile.decision.persistence_m))
                    r.notes = "Anomaly score is fault-agnostic; identical score for every target (cannot localise). Val loss: " + json.dumps({k: round(v[-1], 4) for k, v in lstm_model.history.items()})
                    results.append(r)
            assert lstm_feats is not None
            if e == "E5":
                cols = eng_cols + [c for c in lstm_feats.columns if not c.startswith("lstm_emb_")]
                results.append(fit_tree("E5", "LightGBM engineered + LSTM residuals", "lightgbm", cols, pd.concat([ds.features, lstm_feats], axis=1))[0])
            if e == "E6":
                cols = eng_cols + list(lstm_feats.columns)
                results.append(fit_tree("E6", "LightGBM engineered + LSTM residuals + 32-D temporal embedding", "lightgbm", cols, pd.concat([ds.features, lstm_feats], axis=1))[0])
        elif e == "E7":
            for fam in ("trend", "threshold", "cross", "rolling"):
                cols = fe.columns_without({fam}, eng_cols)
                r = fit_tree(f"E7-no_{fam}", f"Ablation: LightGBM engineered minus '{fam}' family", "lightgbm", cols, ds.features)[0]
                results.append(r)
    (out_dir / "experiments.json").write_text(json.dumps([asdict(r) for r in results], indent=2, default=str))
    (out_dir / "comparison.md").write_text(comparison_markdown(results))
    return results, artefacts


def comparison_markdown(results: list[ExperimentResult]) -> str:
    rows = ["# Experiment matrix comparison (SYNTHETIC VALIDATION ONLY)", "",
            "| Exp | Description | Backend | #feat | PR-AUC | ROC-AUC | F1 | Brier | ECE | Event recall | Median lead (s) | FA/h | s |",
            "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for r in results:
        s = r.summary()
        f = lambda x: "n/a" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.3f}"  # noqa: E731
        rows.append(f"| {r.experiment} | {r.description} | {r.backend} | {r.feature_count} | {f(s['test_pr_auc_mean'])} | {f(s['test_roc_auc_mean'])} | "
                    f"{f(s['test_f1_mean'])} | {f(s['test_brier_mean'])} | {f(s['test_ece_mean'])} | {f(s['event_recall'])} | {f(s['median_lead_time_s'])} | "
                    f"{f(s['false_alarms_per_hour'])} | {r.seconds:.0f} |")
    best = max((r for r in results if r.backend != "rules" and not np.isnan(r.summary()["test_pr_auc_mean"])), key=lambda r: r.summary()["test_pr_auc_mean"], default=None)
    rows += ["", "Means are over targets with at least one positive in the test partition; event metrics over prognosis targets with >=1 event.", ""]
    if best:
        rows.append(f"Best mean test PR-AUC: **{best.experiment}** ({best.description}). This is a synthetic-data result and does not imply plant performance.")
    for r in results:
        if r.notes:
            rows.append(f"\n- {r.experiment}: {r.notes}")
    return "\n".join(rows) + "\n"


__all__ = ["EventMetrics", "RowMetrics", "ExperimentResult", "run_experiment_matrix", "train_lstm", "add_lstm_features", "lstm_feature_names"]
