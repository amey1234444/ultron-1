"""Vectorised offline feature computation for one contiguous 1 Hz episode.

Produces the same schema as :class:`FeatureEngine.compute` (online path). Rolling statistics use
trailing windows only (no future samples). Parity with the online path is covered by tests.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

from ultron_ml.config.models import RecipeSpec
from ultron_ml.features.engine import EPS, EWMA_ALPHA, WINDOWS, FeatureEngine, signed_threshold_distance


def _trailing(v: np.ndarray, w: int) -> np.ndarray:
    """[T, w] trailing windows (NaN-padded at the start). Window i covers rows i-w+1..i."""
    pad = np.full(w - 1, np.nan)
    return sliding_window_view(np.concatenate([pad, v]), w)


def _slope(win: np.ndarray, t: np.ndarray) -> np.ndarray:
    m = ~np.isnan(win)
    cnt = m.sum(1)
    tt = np.where(m, t, np.nan)
    tm = np.nanmean(tt, 1, keepdims=True)
    vm = np.nanmean(win, 1, keepdims=True)
    num = np.nansum((tt - tm) * (win - vm), 1)
    den = np.nansum((tt - tm) ** 2, 1)
    out = np.where((cnt >= 3) & (den > 0), num / np.where(den > 0, den, 1), np.nan)
    return out


def compute_batch(fe: FeatureEngine, df: pd.DataFrame, recipe: RecipeSpec | None = None, dq_flags: pd.DataFrame | None = None) -> pd.DataFrame:
    n = len(df)
    out: dict[str, np.ndarray] = {}
    cur: dict[str, np.ndarray] = {}
    with np.errstate(all="ignore"):
        for c in fe.codes:
            spec = fe.specs[c]
            v = df[c].to_numpy(dtype=float) if c in df else np.full(n, np.nan)
            cur[c] = v
            out[f"{c}_raw"] = v
            out[f"{c}_missing"] = np.isnan(v).astype(float)
            out[f"{c}_nom_dev"] = (v - spec.nominal) / max(abs(spec.nominal), EPS) if spec.nominal is not None else np.full(n, np.nan)
            d1 = np.full(n, np.nan)
            d1[1:] = v[1:] - v[:-1]
            out[f"{c}_diff1"] = d1
            roc = np.full(n, np.nan)
            roc[10:] = (v[10:] - v[:-10]) / 10.0
            out[f"{c}_roc_10s"] = roc
            ew = pd.Series(v).ewm(alpha=EWMA_ALPHA, adjust=False, ignore_na=True).mean().to_numpy()
            out[f"{c}_ewma"] = ew
            w2 = WINDOWS["2m"] + 1
            t2 = -np.arange(w2 - 1, -1, -1, dtype=float)
            out[f"{c}_ewma_slope_2m"] = _slope(_trailing(ew, w2), t2)
            for wname, secs in WINDOWS.items():
                w = secs + 1  # online window is t >= -secs inclusive => secs+1 samples
                win = _trailing(v, w)
                t = -np.arange(w - 1, -1, -1, dtype=float)
                cnt = (~np.isnan(win)).sum(1)
                ok = cnt >= 3
                mean = np.nanmean(win, 1)
                std = np.nanstd(win, 1, ddof=1)
                mn, mx = np.nanmin(win, 1), np.nanmax(win, 1)
                out[f"{c}_mean_{wname}"] = np.where(ok, mean, np.nan)
                out[f"{c}_median_{wname}"] = np.where(ok, np.nanmedian(win, 1), np.nan)
                out[f"{c}_std_{wname}"] = np.where(ok, std, np.nan)
                out[f"{c}_range_{wname}"] = np.where(ok, mx - mn, np.nan)
                out[f"{c}_cv_{wname}"] = np.where(ok, std / np.maximum(np.abs(mean), EPS), np.nan)
                out[f"{c}_slope_{wname}"] = np.where(ok, _slope(win, t), np.nan)
                out[f"{c}_min_{wname}"] = np.where(ok, mn, np.nan)
                out[f"{c}_max_{wname}"] = np.where(ok, mx, np.nan)
                filled_min = np.where(np.isnan(win), np.inf, win)
                filled_max = np.where(np.isnan(win), -np.inf, win)
                out[f"{c}_t_since_min_{wname}"] = np.where(ok, -t[np.argmin(filled_min, 1)], np.nan)
                out[f"{c}_t_since_max_{wname}"] = np.where(ok, -t[np.argmax(filled_max, 1)], np.nan)
            for band in ("normal", "warning", "severe"):
                out[f"{c}_dist_{band}"] = np.array([signed_threshold_distance(spec, x, band) for x in v])
            sp, span = fe._setpoint(c, recipe)
            out[f"{c}_sp_dev"] = (v - sp) if sp is not None else np.full(n, np.nan)
            out[f"{c}_sp_dev_norm"] = (v - sp) / max(span, EPS) if sp is not None else np.full(n, np.nan)

        g = cur
        gr = fe.profile.channels.gear_ratio

        def ratio(a: np.ndarray, b: np.ndarray) -> np.ndarray:
            return a / np.maximum(np.abs(b), EPS)

        out["P_over_FR"] = ratio(g["P"], g["FR"])
        out["I_over_RPM"] = ratio(g["I"], g["RPM"])
        out["P_over_I"] = ratio(g["P"], g["I"])
        out["P_over_SRPM"] = ratio(g["P"], g["SRPM"])
        out["FR_over_RPM"] = ratio(g["FR"], g["RPM"])
        out["VM_over_RPM"] = ratio(g["VM"], g["RPM"])
        out["VG_over_RPM"] = ratio(g["VG"], g["RPM"])
        out["thermal_gradient_12"] = g["Z2"] - g["Z1"]
        out["thermal_gradient_23"] = g["Z3"] - g["Z2"]
        out["melt_zone_delta"] = g["MT"] - g["Z3"]
        exp = g["RPM"] / gr if gr else np.full(n, np.nan)
        out["expected_SRPM"] = exp
        out["SRPM_error"] = g["SRPM"] - exp
        out["SRPM_error_rel"] = out["SRPM_error"] / np.maximum(np.abs(exp), EPS)
        out["load_proxy"] = out["I_over_RPM"]
        out["TMOT_minus_TGB"] = g["TMOT"] - g["TGB"]
        out["P_slope_5m_x_I_slope_5m"] = out["P_slope_5m"] * out["I_slope_5m"]
        out["dq_missing_count"] = np.isnan(np.stack([cur[c] for c in fe.codes], 1)).sum(1).astype(float)
        if dq_flags is not None:
            out["dq_flag_count"] = dq_flags["flag_count"].to_numpy(dtype=float)
            out["dq_frozen_any"] = dq_flags["frozen_any"].to_numpy(dtype=float)
            out["dq_contradiction_any"] = dq_flags["contradiction_any"].to_numpy(dtype=float)
        else:
            out["dq_flag_count"] = np.zeros(n)
            out["dq_frozen_any"] = np.zeros(n)
            out["dq_contradiction_any"] = np.zeros(n)
        hist = np.minimum(np.arange(n, dtype=float), 600.0)
        out["history_seconds"] = hist
    res = pd.DataFrame({k: out[k] for k in fe.schema}, index=df.index)
    return res.astype(float)


def nan_to_none(x: float) -> float | None:
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else x
