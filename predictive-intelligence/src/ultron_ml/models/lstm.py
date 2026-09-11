"""LSTM temporal model (Doc A §8.2; brief: LSTM SPECIFICATION).

Input  ``[batch, lookback_steps, feature_count]`` (channels scaled with a train-only scaler).
Output ``forecast`` ``[batch, forecast_steps, feature_count]`` and ``embedding`` ``[batch, 32]``.

Architecture: LSTM(64, seq) -> Dropout(0.2) -> LSTM(32) -> Dropout(0.2) -> Dense(32, relu)=embedding
-> Dense(forecast_steps*feature_count) reshaped. Adam(1e-3), Huber loss, clipnorm=1.0,
EarlyStopping(restore_best_weights). Residual = actual - forecast; normalised by the training
residual scale (per feature MAD*1.4826, stored in metadata).

TensorFlow is imported lazily so the rest of the platform (rules, DQ, trees) works without it.
"""

from __future__ import annotations

import json
import os
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

EMBEDDING_DIM = 32
LOOKBACK_CANDIDATES = (120, 300, 600)


@dataclass
class LSTMConfig:
    lookback_steps: int = 120
    forecast_steps: int = 30
    feature_count: int = 14
    units_1: int = 64
    units_2: int = 32
    dropout: float = 0.20
    embedding_dim: int = EMBEDDING_DIM
    learning_rate: float = 1e-3
    clipnorm: float = 1.0
    loss: str = "huber"  # or "mae"
    max_epochs: int = 100
    patience: int = 8
    batch_size: int = 64
    seed: int = 42

    def __post_init__(self) -> None:
        if self.lookback_steps not in LOOKBACK_CANDIDATES:
            raise ValueError(f"lookback_steps must be one of {LOOKBACK_CANDIDATES}")
        if self.embedding_dim != EMBEDDING_DIM:
            raise ValueError(f"embedding_dim is fixed at {EMBEDDING_DIM} by the brief")


@dataclass
class StandardScaler:
    """Train-only scaler (fit on the training partition, never on val/test)."""

    mean: list[float] = field(default_factory=list)
    scale: list[float] = field(default_factory=list)
    fitted: bool = False

    def fit(self, x: np.ndarray) -> StandardScaler:
        x2 = x.reshape(-1, x.shape[-1])
        self.mean = np.nanmean(x2, axis=0).tolist()
        sd = np.nanstd(x2, axis=0)
        sd[sd < 1e-9] = 1.0
        self.scale = sd.tolist()
        self.fitted = True
        return self

    def transform(self, x: np.ndarray) -> np.ndarray:
        if not self.fitted:
            raise RuntimeError("scaler not fitted")
        return (x - np.asarray(self.mean)) / np.asarray(self.scale)

    def inverse(self, x: np.ndarray) -> np.ndarray:
        return x * np.asarray(self.scale) + np.asarray(self.mean)


def set_global_seed(seed: int) -> None:
    os.environ["PYTHONHASHSEED"] = str(seed)
    os.environ.setdefault("TF_DETERMINISTIC_OPS", "1")
    random.seed(seed)
    np.random.seed(seed)
    try:
        import tensorflow as tf

        tf.keras.utils.set_random_seed(seed)
    except ImportError:  # pragma: no cover
        pass


def make_windows(x: np.ndarray, lookback: int, horizon: int, stride: int = 1) -> tuple[np.ndarray, np.ndarray]:
    """Slice a contiguous [T, F] series into (X[n, lookback, F], Y[n, horizon, F]). Only past -> future."""
    n = (len(x) - lookback - horizon) // stride + 1
    if n <= 0:
        return np.empty((0, lookback, x.shape[1])), np.empty((0, horizon, x.shape[1]))
    idx = np.arange(n) * stride
    X = np.stack([x[i : i + lookback] for i in idx])
    Y = np.stack([x[i + lookback : i + lookback + horizon] for i in idx])
    return X, Y


class LSTMTemporalModel:
    def __init__(self, cfg: LSTMConfig) -> None:
        self.cfg = cfg
        self.scaler = StandardScaler()
        self.residual_scale: np.ndarray | None = None
        self._model: Any = None
        self._embed: Any = None
        self.history: dict[str, list[float]] = {}

    # ---- architecture -----------------------------------------------------------------
    def build(self) -> Any:
        import tensorflow as tf
        from tensorflow import keras

        set_global_seed(self.cfg.seed)
        c = self.cfg
        inp = keras.Input(shape=(c.lookback_steps, c.feature_count), name="sequence")
        x = keras.layers.LSTM(c.units_1, return_sequences=True, name="lstm_1")(inp)
        x = keras.layers.Dropout(c.dropout, name="drop_1")(x)
        x = keras.layers.LSTM(c.units_2, return_sequences=False, name="lstm_2")(x)
        x = keras.layers.Dropout(c.dropout, name="drop_2")(x)
        emb = keras.layers.Dense(c.embedding_dim, activation="relu", name="embedding")(x)
        out = keras.layers.Dense(c.forecast_steps * c.feature_count, name="forecast_flat")(emb)
        out = keras.layers.Reshape((c.forecast_steps, c.feature_count), name="forecast")(out)
        model = keras.Model(inp, [out, emb], name="ultron_lstm")
        loss = keras.losses.Huber() if c.loss == "huber" else keras.losses.MeanAbsoluteError()
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=c.learning_rate, clipnorm=c.clipnorm),
            loss=[loss, None],
            metrics=[[keras.metrics.MeanAbsoluteError(name="mae")], []],
        )
        self._model = model
        self._embed = keras.Model(inp, emb, name="ultron_lstm_embed")
        del tf
        return model

    # ---- training ---------------------------------------------------------------------
    def fit(self, train: np.ndarray, val: np.ndarray, epochs: int | None = None, verbose: int = 0) -> dict[str, list[float]]:
        """``train``/``val`` are contiguous [T, F] raw series (already partitioned chronologically)."""
        from tensorflow import keras

        if self._model is None:
            self.build()
        self.scaler.fit(train)  # TRAIN ONLY
        tr = np.nan_to_num(self.scaler.transform(train), nan=0.0)
        va = np.nan_to_num(self.scaler.transform(val), nan=0.0)
        Xtr, Ytr = make_windows(tr, self.cfg.lookback_steps, self.cfg.forecast_steps)
        Xva, Yva = make_windows(va, self.cfg.lookback_steps, self.cfg.forecast_steps)
        if len(Xtr) == 0:
            raise ValueError("training series too short for lookback+forecast")
        cbs = [keras.callbacks.EarlyStopping(monitor="val_loss", patience=self.cfg.patience, restore_best_weights=True)]
        dtr = np.zeros((len(Xtr), self.cfg.embedding_dim), dtype=np.float32)
        dva = np.zeros((len(Xva), self.cfg.embedding_dim), dtype=np.float32)
        h = self._model.fit(
            Xtr, [Ytr, dtr], validation_data=(Xva, [Yva, dva]) if len(Xva) else None,
            epochs=epochs or self.cfg.max_epochs, batch_size=self.cfg.batch_size, callbacks=cbs if len(Xva) else [],
            verbose=verbose, shuffle=True,
        )
        self.history = {k: [float(x) for x in v] for k, v in h.history.items()}
        # residual scale from training residuals (robust)
        fc, _ = self._model.predict(Xtr, verbose=0)
        res = (Ytr - fc).reshape(-1, self.cfg.feature_count)
        mad = np.median(np.abs(res - np.median(res, axis=0)), axis=0) * 1.4826
        mad[mad < 1e-6] = 1.0
        self.residual_scale = mad
        return self.history

    # ---- inference --------------------------------------------------------------------
    def predict(self, seq: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """seq raw [lookback, F] or [B, lookback, F] -> (forecast in raw units [B, H, F], embedding [B, 32])."""
        if self._model is None:
            raise RuntimeError("model not built/loaded")
        x = seq if seq.ndim == 3 else seq[None]
        if x.shape[1:] != (self.cfg.lookback_steps, self.cfg.feature_count):
            raise ValueError(f"expected [*, {self.cfg.lookback_steps}, {self.cfg.feature_count}], got {x.shape}")
        xs = np.nan_to_num(self.scaler.transform(x), nan=0.0)
        fc, emb = self._model.predict(xs, verbose=0)
        return self.scaler.inverse(fc), emb

    def residuals(self, seq: np.ndarray, actual_future: np.ndarray) -> dict[str, np.ndarray]:
        """actual - forecast (raw), |residual|, and residual normalised by training scale."""
        fc, _ = self.predict(seq)
        fut = actual_future if actual_future.ndim == 3 else actual_future[None]
        res = fut - fc
        scale = self.residual_scale if self.residual_scale is not None else np.ones(self.cfg.feature_count)
        return {"residual": res, "abs_residual": np.abs(res), "normalized_residual": res / scale}

    def one_step_residual(self, seq: np.ndarray, actual_next: np.ndarray) -> np.ndarray:
        """Per-feature normalised residual for the first forecast step, [F]."""
        r = self.residuals(seq, np.broadcast_to(actual_next, (1, self.cfg.forecast_steps, self.cfg.feature_count)).copy())
        return r["normalized_residual"][0, 0]

    # ---- persistence ------------------------------------------------------------------
    def save(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
        self._model.save(path / "model.keras")
        meta = {
            "config": asdict(self.cfg),
            "scaler": asdict(self.scaler),
            "residual_scale": None if self.residual_scale is None else self.residual_scale.tolist(),
            "history": self.history,
        }
        (path / "lstm_meta.json").write_text(json.dumps(meta, indent=2))

    @classmethod
    def load(cls, path: Path) -> LSTMTemporalModel:
        from tensorflow import keras

        meta = json.loads((path / "lstm_meta.json").read_text())
        m = cls(LSTMConfig(**meta["config"]))
        m.scaler = StandardScaler(**meta["scaler"])
        m.residual_scale = None if meta["residual_scale"] is None else np.asarray(meta["residual_scale"])
        m.history = meta.get("history", {})
        m._model = keras.models.load_model(path / "model.keras", compile=False)
        m._embed = keras.Model(m._model.input, m._model.get_layer("embedding").output)
        return m
