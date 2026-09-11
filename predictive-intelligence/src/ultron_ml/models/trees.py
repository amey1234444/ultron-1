"""Boosted-tree diagnosis/prognosis models (Doc A §8.3; brief: LIGHTGBM / XGBOOST).

One independent binary classifier per ``(target, horizon)`` – multi-label, never multiclass.
LightGBM is the primary; XGBoost is a challenger trained on the *same* feature schema, labels,
splits and metrics. There is no voting ensemble. Probabilities are calibrated on the validation
partition (isotonic or Platt). SHAP TreeExplainer gives per-feature contributions.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

HORIZONS = ("5m", "15m", "30m")
HORIZON_SECONDS = {"5m": 300, "15m": 900, "30m": 1800}


@dataclass
class TreeParams:
    algorithm: Literal["lightgbm", "xgboost"] = "lightgbm"
    learning_rate: float = 0.03
    num_leaves: int = 31
    max_depth: int = 6  # LGBM 5-8, XGB 4-6
    min_child_samples: int = 50  # LGBM 30-100
    min_child_weight: float = 10.0  # XGB 5-20
    feature_fraction: float = 0.8
    bagging_fraction: float = 0.8
    subsample: float = 0.8
    colsample_bytree: float = 0.8
    lambda_l2: float = 1.0
    n_rounds: int = 2000
    early_stopping_rounds: int = 100
    calibration: Literal["isotonic", "platt", "none"] = "isotonic"
    seed: int = 42

    def __post_init__(self) -> None:
        if self.algorithm == "lightgbm" and not 5 <= self.max_depth <= 8:
            raise ValueError("LightGBM max_depth must be within 5..8")
        if self.algorithm == "xgboost" and not 4 <= self.max_depth <= 6:
            raise ValueError("XGBoost max_depth must be within 4..6")
        if not 2000 <= self.n_rounds <= 3000 and self.n_rounds >= 50:
            # smoke runs may use fewer rounds but the production ceiling is 2000..3000
            pass


@dataclass
class Calibrator:
    method: str = "isotonic"
    iso_x: list[float] = field(default_factory=list)
    iso_y: list[float] = field(default_factory=list)
    platt_a: float = 1.0
    platt_b: float = 0.0
    fitted: bool = False

    def fit(self, p: np.ndarray, y: np.ndarray) -> Calibrator:
        if self.method == "none" or len(np.unique(y)) < 2 or len(y) < 20:
            self.fitted = False
            return self
        if self.method == "isotonic":
            iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0).fit(p, y)
            self.iso_x, self.iso_y = iso.X_thresholds_.tolist(), iso.y_thresholds_.tolist()
        else:
            z = np.log(np.clip(p, 1e-6, 1 - 1e-6) / (1 - np.clip(p, 1e-6, 1 - 1e-6)))
            lr = LogisticRegression(C=1e6).fit(z[:, None], y)
            self.platt_a, self.platt_b = float(lr.coef_[0, 0]), float(lr.intercept_[0])
        self.fitted = True
        return self

    def transform(self, p: np.ndarray) -> np.ndarray:
        p = np.clip(np.asarray(p, dtype=float), 0.0, 1.0)
        if not self.fitted:
            return p
        if self.method == "isotonic":
            return np.clip(np.interp(p, self.iso_x, self.iso_y), 0.0, 1.0)
        z = np.log(np.clip(p, 1e-6, 1 - 1e-6) / (1 - np.clip(p, 1e-6, 1 - 1e-6)))
        return 1.0 / (1.0 + np.exp(-(self.platt_a * z + self.platt_b)))


class _BinaryBooster:
    """Thin wrapper around a single LightGBM or XGBoost binary model."""

    def __init__(self, params: TreeParams, feature_names: list[str]) -> None:
        self.p = params
        self.features = feature_names
        self.booster: Any = None
        self.best_iteration: int = 0
        self.calibrator = Calibrator(params.calibration)
        self.scale_pos_weight: float = 1.0
        self.trained = False
        self.constant_prediction: float | None = None

    def fit(self, Xtr: np.ndarray, ytr: np.ndarray, Xva: np.ndarray, yva: np.ndarray) -> None:
        pos, neg = float(ytr.sum()), float(len(ytr) - ytr.sum())
        if pos == 0 or neg == 0:
            self.constant_prediction = pos / max(len(ytr), 1)
            self.trained = True
            return
        self.scale_pos_weight = neg / pos
        p = self.p
        if p.algorithm == "lightgbm":
            import lightgbm as lgb

            params = {
                "objective": "binary", "learning_rate": p.learning_rate, "num_leaves": p.num_leaves,
                "max_depth": p.max_depth, "min_child_samples": p.min_child_samples,
                "feature_fraction": p.feature_fraction, "bagging_fraction": p.bagging_fraction,
                "bagging_freq": 1, "lambda_l2": p.lambda_l2, "scale_pos_weight": self.scale_pos_weight,
                "seed": p.seed, "deterministic": True, "force_row_wise": True, "verbosity": -1,
                "metric": "binary_logloss",
            }
            dtr = lgb.Dataset(Xtr, ytr, feature_name=self.features, free_raw_data=False)
            dva = lgb.Dataset(Xva, yva, reference=dtr, free_raw_data=False)
            cbs = [lgb.early_stopping(p.early_stopping_rounds, verbose=False)] if len(np.unique(yva)) > 1 else []
            self.booster = lgb.train(params, dtr, num_boost_round=p.n_rounds, valid_sets=[dva] if cbs else None, callbacks=cbs)
            self.best_iteration = int(self.booster.best_iteration or self.booster.current_iteration())
        else:
            import xgboost as xgb

            params = {
                "objective": "binary:logistic", "tree_method": "hist", "eta": p.learning_rate,
                "max_depth": p.max_depth, "min_child_weight": p.min_child_weight, "subsample": p.subsample,
                "colsample_bytree": p.colsample_bytree, "lambda": p.lambda_l2,
                "scale_pos_weight": self.scale_pos_weight, "seed": p.seed, "eval_metric": "logloss",
            }
            dtr = xgb.DMatrix(Xtr, ytr, feature_names=self.features, missing=np.nan)
            dva = xgb.DMatrix(Xva, yva, feature_names=self.features, missing=np.nan)
            es = len(np.unique(yva)) > 1
            self.booster = xgb.train(params, dtr, num_boost_round=p.n_rounds, evals=[(dva, "val")] if es else [],
                                     early_stopping_rounds=p.early_stopping_rounds if es else None, verbose_eval=False)
            self.best_iteration = int(self.booster.best_iteration) if es else self.booster.num_boosted_rounds() - 1
        self.trained = True
        # calibration on VALIDATION only
        self.calibrator.fit(self.predict_raw(Xva), yva)

    def predict_raw(self, X: np.ndarray) -> np.ndarray:
        if self.constant_prediction is not None:
            return np.full(len(X), self.constant_prediction)
        if self.p.algorithm == "lightgbm":
            return np.asarray(self.booster.predict(X, num_iteration=self.best_iteration or None))
        import xgboost as xgb

        return np.asarray(self.booster.predict(xgb.DMatrix(X, feature_names=self.features, missing=np.nan),
                                               iteration_range=(0, self.best_iteration + 1)))

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.calibrator.transform(self.predict_raw(X))

    def shap_values(self, X: np.ndarray) -> np.ndarray:
        if self.constant_prediction is not None:
            return np.zeros_like(X, dtype=float)
        import shap

        ex = shap.TreeExplainer(self.booster)
        sv = ex.shap_values(X)
        if isinstance(sv, list):  # older API returns [neg, pos]
            sv = sv[1]
        return np.asarray(sv)

    def to_dict(self) -> dict[str, Any]:
        return {
            "best_iteration": self.best_iteration, "calibrator": asdict(self.calibrator),
            "scale_pos_weight": self.scale_pos_weight, "constant_prediction": self.constant_prediction,
        }


class MultiLabelTreeModel:
    """Independent binary classifiers for each ``target@horizon`` (and ``target@now`` for diagnosis)."""

    def __init__(self, params: TreeParams, feature_names: list[str], targets: list[str]) -> None:
        self.params = params
        self.features = list(feature_names)
        self.targets = list(targets)
        self.models: dict[str, _BinaryBooster] = {}
        self.metadata: dict[str, Any] = {}

    def fit(self, Xtr: np.ndarray, Ytr: dict[str, np.ndarray], Xva: np.ndarray, Yva: dict[str, np.ndarray]) -> None:
        if Xtr.shape[1] != len(self.features):
            raise ValueError("feature count mismatch with schema")
        for t in self.targets:
            m = _BinaryBooster(self.params, self.features)
            ktr = ~np.isnan(Ytr[t].astype(float))  # NaN label = excluded (active fault / recovery regime)
            kva = ~np.isnan(Yva[t].astype(float))
            m.fit(Xtr[ktr], Ytr[t][ktr].astype(int), Xva[kva], Yva[t][kva].astype(int))
            self.models[t] = m

    def predict(self, X: np.ndarray) -> dict[str, np.ndarray]:
        if X.shape[1] != len(self.features):
            raise ValueError(f"feature count {X.shape[1]} != schema {len(self.features)}")
        return {t: m.predict(X) for t, m in self.models.items()}

    def predict_raw(self, X: np.ndarray) -> dict[str, np.ndarray]:
        return {t: m.predict_raw(X) for t, m in self.models.items()}

    def shap(self, X: np.ndarray, target: str) -> np.ndarray:
        return self.models[target].shap_values(X)

    # ---- persistence (native boosters + json; no pickle) ------------------------------
    def save(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
        meta = {"params": asdict(self.params), "features": self.features, "targets": self.targets,
                "models": {}, "metadata": self.metadata}
        for t, m in self.models.items():
            safe = t.replace("@", "__at__")
            if m.booster is not None:
                if self.params.algorithm == "lightgbm":
                    m.booster.save_model(str(path / f"{safe}.lgb.txt"))
                else:
                    m.booster.save_model(str(path / f"{safe}.xgb.json"))
            meta["models"][t] = m.to_dict()
        (path / "tree_meta.json").write_text(json.dumps(meta, indent=2))

    @classmethod
    def load(cls, path: Path) -> MultiLabelTreeModel:
        meta = json.loads((path / "tree_meta.json").read_text())
        params = TreeParams(**meta["params"])
        obj = cls(params, meta["features"], meta["targets"])
        obj.metadata = meta.get("metadata", {})
        for t, md in meta["models"].items():
            m = _BinaryBooster(params, obj.features)
            m.best_iteration = md["best_iteration"]
            m.calibrator = Calibrator(**md["calibrator"])
            m.scale_pos_weight = md["scale_pos_weight"]
            m.constant_prediction = md["constant_prediction"]
            safe = t.replace("@", "__at__")
            if m.constant_prediction is None:
                if params.algorithm == "lightgbm":
                    import lightgbm as lgb

                    m.booster = lgb.Booster(model_file=str(path / f"{safe}.lgb.txt"))
                else:
                    import xgboost as xgb

                    m.booster = xgb.Booster()
                    m.booster.load_model(str(path / f"{safe}.xgb.json"))
            m.trained = True
            obj.models[t] = m
        return obj


def target_name(fault: str, horizon: str | None) -> str:
    return f"{fault}@{horizon or 'now'}"


def split_target(target: str) -> tuple[str, str]:
    f, h = target.split("@", 1)
    return f, h
