"""Feature engineering (Doc A §7 and Appendix A; brief: FEATURE ENGINEERING).

Every feature is named ``<channel>_<stat>_<window>`` or documented in :data:`FEATURE_DOCS`.
Feature order is fixed by :meth:`FeatureEngine.schema` and versioned; models store the schema
they were trained with and inference asserts equality. Missing inputs yield NaN (never zero)
plus an explicit ``<channel>_missing`` flag.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from ultron_ml.config.models import ChannelSpec, ProfileConfig, RecipeSpec
from ultron_ml.contracts import DataQualityReport
from ultron_ml.features.window import WindowStore

FEATURE_SCHEMA_VERSION = "features-1.0.0"
WINDOWS: dict[str, int] = {"30s": 30, "2m": 120, "5m": 300, "10m": 600}
EWMA_ALPHA = 0.1
EPS = 1e-6
ROLL_STATS = ("mean", "median", "std", "range", "cv", "slope", "min", "max", "t_since_min", "t_since_max")


@dataclass(frozen=True)
class FeatureDoc:
    name: str
    unit: str
    description: str


def _nanslope(t: np.ndarray, v: np.ndarray) -> float:
    m = ~np.isnan(v)
    if m.sum() < 3:
        return math.nan
    t, v = t[m], v[m]
    tm, vm = t.mean(), v.mean()
    d = ((t - tm) ** 2).sum()
    return float(((t - tm) * (v - vm)).sum() / d) if d > 0 else math.nan


def _ewma(v: np.ndarray, alpha: float = EWMA_ALPHA) -> np.ndarray:
    out = np.full_like(v, np.nan, dtype=float)
    acc = math.nan
    for i, x in enumerate(v):
        if not math.isnan(x):
            acc = x if math.isnan(acc) else alpha * x + (1 - alpha) * acc
        out[i] = acc
    return out


def signed_threshold_distance(spec: ChannelSpec, x: float, band: str) -> float:
    """Signed distance to the nearest edge of ``band``; negative = inside, positive = outside.

    Normalised by the nominal (or span) so channels are comparable.
    """
    b = getattr(spec, band)
    if b is None or math.isnan(x):
        return math.nan
    dists: list[float] = []
    if b.low is not None:
        dists.append(b.low - x)  # >0 when below low
    if b.high is not None:
        dists.append(x - b.high)  # >0 when above high
    if not dists:
        return math.nan
    d = max(dists)
    scale = abs(spec.nominal) if spec.nominal else (
        (spec.plausible.high - spec.plausible.low) if spec.plausible.high is not None and spec.plausible.low is not None else 1.0
    )
    return d / max(scale, EPS)


class FeatureEngine:
    def __init__(self, profile: ProfileConfig) -> None:
        self.profile = profile
        self.specs = {c.code: c for c in profile.channels.channels if c.kind != "context"}
        self.codes = list(self.specs)
        self._schema, self._docs = self._build_schema()

    # ---- schema -----------------------------------------------------------------------
    def _build_schema(self) -> tuple[list[str], dict[str, FeatureDoc]]:
        names: list[str] = []
        docs: dict[str, FeatureDoc] = {}

        def add(n: str, unit: str, d: str) -> None:
            names.append(n)
            docs[n] = FeatureDoc(n, unit, d)

        for c in self.codes:
            u = self.specs[c].unit
            add(f"{c}_raw", u, f"current {self.specs[c].name}")
            add(f"{c}_missing", "flag", f"1 if {c} missing/quarantined now")
            add(f"{c}_nom_dev", "ratio", f"(x-nominal)/|nominal| for {c}")
            add(f"{c}_diff1", u, f"first difference {c}")
            add(f"{c}_roc_10s", f"{u}/s", f"rate of change over 10 s for {c}")
            add(f"{c}_ewma", u, f"EWMA(alpha={EWMA_ALPHA}) of {c}")
            add(f"{c}_ewma_slope_2m", f"{u}/s", "EWMA slope over 2 min")
            for w in WINDOWS:
                for s in ROLL_STATS:
                    unit = "s" if s.startswith("t_since") else ("ratio" if s == "cv" else (f"{u}/s" if s == "slope" else u))
                    add(f"{c}_{s}_{w}", unit, f"rolling {s} of {c} over {w}")
            for band in ("normal", "warning", "severe"):
                add(f"{c}_dist_{band}", "ratio", f"signed normalised distance to {band} band edge (>0 outside)")
            add(f"{c}_sp_dev", u, f"{c} minus recipe setpoint/expected")
            add(f"{c}_sp_dev_norm", "ratio", f"({c} - setpoint)/expected span")
        for n, u, d in [
            ("P_over_FR", "MPa/(kg/h)", "pressure per unit feed rate"),
            ("I_over_RPM", "A/rpm", "load proxy current per rpm"),
            ("P_over_I", "MPa/A", "pressure per ampere"),
            ("P_over_SRPM", "MPa/rpm", "pressure per screw rpm"),
            ("FR_over_RPM", "(kg/h)/rpm", "feed per motor rpm"),
            ("VM_over_RPM", "(mm/s)/rpm", "motor vibration per rpm"),
            ("VG_over_RPM", "(mm/s)/rpm", "gearbox vibration per rpm"),
            ("thermal_gradient_12", "degC", "Z2 - Z1"),
            ("thermal_gradient_23", "degC", "Z3 - Z2"),
            ("melt_zone_delta", "degC", "MT - Z3"),
            ("expected_SRPM", "rpm", "RPM / gear_ratio"),
            ("SRPM_error", "rpm", "SRPM - RPM/gear_ratio"),
            ("SRPM_error_rel", "ratio", "SRPM error / expected"),
            ("load_proxy", "A/rpm", "I / RPM"),
            ("TMOT_minus_TGB", "degC", "motor minus gearbox temperature"),
            ("P_slope_5m_x_I_slope_5m", "mixed", "sign agreement of P and I trends (restriction/overload signature)"),
            ("dq_missing_count", "count", "number of missing channels"),
            ("dq_flag_count", "count", "number of DQ flags on this sample"),
            ("dq_frozen_any", "flag", "any channel frozen"),
            ("dq_contradiction_any", "flag", "cross-sensor contradiction present"),
            ("history_seconds", "s", "seconds of history in window"),
        ]:
            add(n, u, d)
        return names, docs

    def family_of(self, feature: str) -> str:
        """Feature family used for ablations (E7): raw, rolling, trend, threshold, setpoint, cross, thermal, dq, lstm."""
        if feature.startswith("lstm_"):
            return "lstm"
        if feature.startswith("dq_") or feature.endswith("_missing") or feature == "history_seconds":
            return "dq"
        if feature in ("thermal_gradient_12", "thermal_gradient_23", "melt_zone_delta", "TMOT_minus_TGB"):
            return "thermal"
        if "_over_" in feature or feature in ("expected_SRPM", "SRPM_error", "SRPM_error_rel", "load_proxy", "P_slope_5m_x_I_slope_5m"):
            return "cross"
        if "_dist_" in feature:
            return "threshold"
        if "_sp_dev" in feature or feature.endswith("_nom_dev"):
            return "setpoint"
        if "_slope_" in feature or "_diff1" in feature or "_roc_" in feature or "_ewma" in feature:
            return "trend"
        if feature.endswith("_raw"):
            return "raw"
        return "rolling"

    def columns_without(self, families: set[str], columns: list[str] | None = None) -> list[str]:
        return [c for c in (columns or self.schema) if self.family_of(c) not in families]

    @property
    def schema(self) -> list[str]:
        return list(self._schema)

    @property
    def docs(self) -> dict[str, FeatureDoc]:
        return dict(self._docs)

    def unit_of(self, feature: str) -> str:
        d = self._docs.get(feature)
        return d.unit if d else ""

    def describe(self, feature: str) -> str:
        d = self._docs.get(feature)
        return d.description if d else feature

    # ---- compute ------------------------------------------------------------------------
    def compute(
        self,
        store: WindowStore,
        machine_id: str,
        recipe: RecipeSpec | None = None,
        dq: DataQualityReport | None = None,
    ) -> dict[str, float]:
        f: dict[str, float] = {}
        cur: dict[str, float] = {}
        for c in self.codes:
            t, v = store.series(machine_id, c)
            x = v[-1] if v.size else math.nan
            cur[c] = x
            spec = self.specs[c]
            f[f"{c}_raw"] = x
            f[f"{c}_missing"] = 1.0 if math.isnan(x) else 0.0
            f[f"{c}_nom_dev"] = (x - spec.nominal) / max(abs(spec.nominal), EPS) if spec.nominal is not None else math.nan
            f[f"{c}_diff1"] = (v[-1] - v[-2]) if v.size >= 2 else math.nan
            if v.size >= 11 and not math.isnan(v[-1]) and not math.isnan(v[-11]):
                f[f"{c}_roc_10s"] = (v[-1] - v[-11]) / max(t[-1] - t[-11], EPS)
            else:
                f[f"{c}_roc_10s"] = math.nan
            ew = _ewma(v) if v.size else np.empty(0)
            f[f"{c}_ewma"] = ew[-1] if ew.size else math.nan
            m2 = t >= -WINDOWS["2m"]
            f[f"{c}_ewma_slope_2m"] = _nanslope(t[m2], ew[m2]) if ew.size else math.nan
            for w, secs in WINDOWS.items():
                m = t >= -secs
                vw, tw = v[m], t[m]
                ok = vw[~np.isnan(vw)]
                if ok.size >= 3:
                    mean = float(ok.mean())
                    std = float(ok.std(ddof=1)) if ok.size > 1 else 0.0
                    f[f"{c}_mean_{w}"] = mean
                    f[f"{c}_median_{w}"] = float(np.median(ok))
                    f[f"{c}_std_{w}"] = std
                    f[f"{c}_range_{w}"] = float(ok.max() - ok.min())
                    f[f"{c}_cv_{w}"] = std / max(abs(mean), EPS)
                    f[f"{c}_slope_{w}"] = _nanslope(tw, vw)
                    f[f"{c}_min_{w}"] = float(ok.min())
                    f[f"{c}_max_{w}"] = float(ok.max())
                    f[f"{c}_t_since_min_{w}"] = float(-tw[int(np.nanargmin(vw))])
                    f[f"{c}_t_since_max_{w}"] = float(-tw[int(np.nanargmax(vw))])
                else:
                    for s in ROLL_STATS:
                        f[f"{c}_{s}_{w}"] = math.nan
            for band in ("normal", "warning", "severe"):
                f[f"{c}_dist_{band}"] = signed_threshold_distance(spec, x, band)
            sp, span = self._setpoint(c, recipe)
            f[f"{c}_sp_dev"] = (x - sp) if sp is not None else math.nan
            f[f"{c}_sp_dev_norm"] = (x - sp) / max(span, EPS) if sp is not None else math.nan

        g = cur.get
        gr = self.profile.channels.gear_ratio
        f["P_over_FR"] = self._ratio(g("P"), g("FR"))
        f["I_over_RPM"] = self._ratio(g("I"), g("RPM"))
        f["P_over_I"] = self._ratio(g("P"), g("I"))
        f["P_over_SRPM"] = self._ratio(g("P"), g("SRPM"))
        f["FR_over_RPM"] = self._ratio(g("FR"), g("RPM"))
        f["VM_over_RPM"] = self._ratio(g("VM"), g("RPM"))
        f["VG_over_RPM"] = self._ratio(g("VG"), g("RPM"))
        f["thermal_gradient_12"] = self._sub(g("Z2"), g("Z1"))
        f["thermal_gradient_23"] = self._sub(g("Z3"), g("Z2"))
        f["melt_zone_delta"] = self._sub(g("MT"), g("Z3"))
        exp_srpm = (g("RPM", math.nan) / gr) if gr else math.nan
        f["expected_SRPM"] = exp_srpm
        f["SRPM_error"] = self._sub(g("SRPM"), exp_srpm)
        f["SRPM_error_rel"] = f["SRPM_error"] / max(abs(exp_srpm), EPS) if not math.isnan(exp_srpm) else math.nan
        f["load_proxy"] = f["I_over_RPM"]
        f["TMOT_minus_TGB"] = self._sub(g("TMOT"), g("TGB"))
        ps, is_ = f.get("P_slope_5m", math.nan), f.get("I_slope_5m", math.nan)
        f["P_slope_5m_x_I_slope_5m"] = ps * is_ if not (math.isnan(ps) or math.isnan(is_)) else math.nan
        f["dq_missing_count"] = float(len(dq.missing_channels)) if dq else float(sum(math.isnan(x) for x in cur.values()))
        f["dq_flag_count"] = float(len(dq.issues)) if dq else 0.0
        f["dq_frozen_any"] = float(any(i.code == "FROZEN" for i in dq.issues)) if dq else 0.0
        f["dq_contradiction_any"] = float(any(i.code == "CROSS_SENSOR_CONTRADICTION" for i in dq.issues)) if dq else 0.0
        f["history_seconds"] = store.seconds(machine_id)
        return {k: f[k] for k in self._schema}

    def vector(self, feats: dict[str, float]) -> np.ndarray:
        return np.array([feats[k] for k in self._schema], dtype=float)

    def _setpoint(self, c: str, recipe: RecipeSpec | None) -> tuple[float | None, float]:
        spec = self.specs[c]
        span = 1.0
        if spec.normal and spec.normal.low is not None and spec.normal.high is not None:
            span = spec.normal.high - spec.normal.low
        if recipe is None:
            return None, span
        if c in recipe.zone_setpoints:
            return recipe.zone_setpoints[c], span
        if c == "FR":
            return recipe.feed_setpoint, max(0.2 * recipe.feed_setpoint, EPS)
        if c == "RPM":
            return recipe.motor_speed_setpoint, span
        if c == "SRPM" and recipe.screw_speed_setpoint is not None:
            return recipe.screw_speed_setpoint, span
        if c == "MT":
            return recipe.expected_melt_temperature, span
        if c == "P":
            lo, hi = recipe.expected_pressure.low, recipe.expected_pressure.high
            if lo is not None and hi is not None:
                return (lo + hi) / 2, hi - lo
        r = recipe.expected_ranges.get(c)
        if r and r.low is not None and r.high is not None:
            return (r.low + r.high) / 2, r.high - r.low
        return None, span

    @staticmethod
    def _ratio(a: float | None, b: float | None) -> float:
        if a is None or b is None or math.isnan(a) or math.isnan(b):
            return math.nan
        return a / max(abs(b), EPS)

    @staticmethod
    def _sub(a: float | None, b: float | None) -> float:
        if a is None or b is None or math.isnan(a) or math.isnan(b):
            return math.nan
        return a - b
