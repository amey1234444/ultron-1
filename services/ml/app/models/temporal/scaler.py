"""Scaling for the sequence model, fitted on train and on nothing else.

The rule that makes this file worth having as its own module: **preprocessing
statistics are fitted on the training split only.** A scaler fitted on all the
data has seen the test set's mean, and every metric computed afterwards is
optimistic by an amount nobody can measure. It is the most common leak in
time-series ML and the easiest to commit by accident, so the fit method records
which split it saw and ``tests/unit/test_leakage.py`` asserts it.

Two scalers, because they fail differently:

``StandardScaler`` is right when a channel is roughly symmetric.
``RobustScaler`` (median and IQR) is right when it is not — which on an
extruder is most pressure and load signals, where startup transients drag a
mean around and leave the median where it belongs.

Gaps stay gaps. A ``None`` in the input is a ``None`` in the output, and the
sequence builder decides what to do about it. Scaling a missing value to zero
would place it at the training mean, which tells the network the machine was
average at a moment when it published nothing at all.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Literal, Sequence

from ...features import families

ScalerKind = Literal["standard", "robust", "none"]


@dataclass
class SequenceScaler:
    """Per-column centre and scale, with the split it was fitted on recorded."""

    kind: ScalerKind = "robust"
    columns: tuple[str, ...] = ()
    centre: tuple[float, ...] = ()
    scale: tuple[float, ...] = ()
    fitted_on_split: str | None = None
    fitted_sample_count: int = 0
    notes: list[str] = field(default_factory=list)

    @property
    def fitted(self) -> bool:
        return bool(self.columns) and len(self.centre) == len(self.columns)

    def fit(
        self,
        rows: Sequence[Sequence[float | None]],
        columns: Sequence[str],
        *,
        split: str,
    ) -> "SequenceScaler":
        """Fit on rows from one split. ``split`` is recorded, not decorative."""
        if split != "train":
            raise ValueError(
                f"A sequence scaler may only be fitted on the train split; got {split!r}. "
                "Fitting on validation or test leaks their distribution into every "
                "metric computed afterwards."
            )

        centres: list[float] = []
        scales: list[float] = []
        for index in range(len(columns)):
            values = [row[index] for row in rows if index < len(row) and row[index] is not None]
            numeric = [float(value) for value in values]
            if not numeric:
                # A column with no training data is passed through unscaled
                # rather than being given a fabricated centre of zero.
                centres.append(0.0)
                scales.append(1.0)
                continue
            if self.kind == "robust":
                centre = families.median(numeric) or 0.0
                spread = families.mad(numeric)
                if spread is None or spread < 1e-9:
                    spread = families.std_dev(numeric) or 1.0
            elif self.kind == "standard":
                centre = families.mean(numeric) or 0.0
                spread = families.std_dev(numeric) or 1.0
            else:
                centre, spread = 0.0, 1.0
            centres.append(float(centre))
            # A constant column has no scale. Dividing by its zero spread would
            # produce infinities; leaving it at 1.0 makes it a constant zero
            # after centring, which is what a constant column should be.
            scales.append(float(spread) if spread and abs(spread) > 1e-9 else 1.0)

        self.columns = tuple(columns)
        self.centre = tuple(centres)
        self.scale = tuple(scales)
        self.fitted_on_split = split
        self.fitted_sample_count = len(rows)
        return self

    def transform_row(self, row: Sequence[float | None]) -> list[float | None]:
        if not self.fitted:
            return list(row)
        out: list[float | None] = []
        for index, value in enumerate(row):
            if value is None or index >= len(self.centre):
                out.append(None if value is None else float(value))
                continue
            out.append((float(value) - self.centre[index]) / self.scale[index])
        return out

    def transform(self, rows: Sequence[Sequence[float | None]]) -> list[list[float | None]]:
        return [self.transform_row(row) for row in rows]

    def inverse_column(self, column: str, value: float) -> float:
        """Take one scaled value back to engineering units.

        Needed for every residual the UI shows: a forecast is produced in
        scaled space and a residual of 0.4 means nothing to an operator until
        it is 0.4 MPa.
        """
        if not self.fitted or column not in self.columns:
            return value
        index = self.columns.index(column)
        return value * self.scale[index] + self.centre[index]

    def scale_of(self, column: str) -> float:
        if not self.fitted or column not in self.columns:
            return 1.0
        return self.scale[self.columns.index(column)]

    def to_json(self) -> dict[str, object]:
        payload = asdict(self)
        payload["columns"] = list(self.columns)
        payload["centre"] = list(self.centre)
        payload["scale"] = list(self.scale)
        return payload

    @classmethod
    def from_json(cls, payload: dict[str, object]) -> "SequenceScaler":
        return cls(
            kind=payload.get("kind", "robust"),  # type: ignore[arg-type]
            columns=tuple(payload.get("columns", ())),  # type: ignore[arg-type]
            centre=tuple(payload.get("centre", ())),  # type: ignore[arg-type]
            scale=tuple(payload.get("scale", ())),  # type: ignore[arg-type]
            fitted_on_split=payload.get("fitted_on_split"),  # type: ignore[arg-type]
            fitted_sample_count=int(payload.get("fitted_sample_count", 0) or 0),
            notes=list(payload.get("notes", [])),  # type: ignore[arg-type]
        )

    def write(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_json(), indent=2), encoding="utf-8")
        return path

    @classmethod
    def read(cls, path: Path) -> "SequenceScaler":
        return cls.from_json(json.loads(path.read_text(encoding="utf-8")))


def residual_scale(residuals: Sequence[float]) -> float:
    """The scale a residual is normalised by, measured on the training set.

    Robust by construction: the MAD of the training residuals, falling back to
    their standard deviation. A normalised residual of 3 then means "three
    times the model's typical training error", which is comparable across
    channels whose units and magnitudes are nothing alike.
    """
    numeric = [float(value) for value in residuals if value is not None]
    if not numeric:
        return 1.0
    spread = families.mad(numeric)
    if spread is None or spread < 1e-9:
        spread = families.std_dev(numeric)
    if spread is None or spread < 1e-9:
        return 1.0
    return float(spread)
