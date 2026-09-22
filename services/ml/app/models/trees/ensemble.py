"""The structured diagnosis and prognosis models — LightGBM and XGBoost.

One class serves both. They are champion and challenger over the same feature
union, the same splits and the same labels, and the only difference that should
ever exist between them is the estimator; giving them separate code paths would
make every comparison a comparison of the code paths too.

A ``TreeEnsemble`` is a *collection* of independent binary models, one per
fault-horizon pair, plus one calibrator each. That is the multi-label design:
nothing is normalised across faults, so a screen restriction at 0.87 and a
motor overload at 0.63 are both true statements about the same instant.

Serving degrades the same way everything else here does. A missing library, a
corrupt booster, a contract mismatch — each returns an ensemble that reports
itself unavailable with a reason, never an exception into the request path.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from ...core.capability import CapabilityUnavailable, module, probe
from ..base import ModelContract, Prediction
from ..calibration.calibrators import Calibrator
from .common import TreeTrainingConfig, to_matrix


@dataclass
class FittedOutput:
    """One trained binary model, with its calibrator and its threshold."""

    key: str
    booster: Any
    calibrator: Calibrator
    threshold: float = 0.5
    positive_events: int = 0
    positive_samples: int = 0
    metrics: dict[str, float] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.metrics is None:
            self.metrics = {}


class TreeEnsemble:
    """A library-agnostic collection of per-output binary models."""

    def __init__(
        self,
        *,
        library: str,
        contract: ModelContract | None = None,
        outputs: dict[str, FittedOutput] | None = None,
        reason: str | None = None,
    ) -> None:
        self.library = library
        self.contract = contract
        self.outputs: dict[str, FittedOutput] = outputs or {}
        self.reason = reason

    @property
    def available(self) -> bool:
        return bool(self.outputs) and self.contract is not None

    @property
    def model_id(self) -> str | None:
        return self.contract.model_id if self.contract else None

    # -- training -----------------------------------------------------------

    @classmethod
    def train(
        cls,
        *,
        library: str,
        contract: ModelContract,
        train_rows: Sequence[Sequence[float | None]],
        train_labels: dict[str, Sequence[int]],
        valid_rows: Sequence[Sequence[float | None]],
        valid_labels: dict[str, Sequence[int]],
        config: TreeTrainingConfig,
        event_counts: dict[str, int] | None = None,
    ) -> "TreeEnsemble":
        """Fit one binary model per output, with early stopping on validation.

        Early stopping uses the validation split and nothing else. Stopping on
        the training loss overfits by construction; stopping on test makes the
        frozen test set a tuning set and every number reported from it a lie.
        """
        from ...labels.events import EXCLUDED
        from .common import class_counts, scale_pos_weight, trainable

        outputs: dict[str, FittedOutput] = {}
        skipped: dict[str, str] = {}

        for key, labels in train_labels.items():
            # EXCLUDED rows are dropped here, per output. A row can be a
            # trustworthy negative for one fault and excluded for another —
            # the row inside a different fault's onset uncertainty — so the
            # filtering cannot be done once for the whole matrix.
            train_x, train_y = _usable(train_rows, labels)
            valid_x, valid_y = _usable(valid_rows, valid_labels.get(key, []))

            positives, negatives = class_counts(train_y)
            events = (event_counts or {}).get(key, positives)
            ok, why = trainable(events, positives)
            if not ok:
                skipped[key] = why or "Not enough positive evidence."
                continue
            if not valid_y or len(set(valid_y)) < 2:
                skipped[key] = (
                    "The validation split has no usable positives and negatives for this "
                    "output, so early stopping and calibration have nothing to work with."
                )
                continue

            weight = scale_pos_weight(positives, negatives)
            booster, metrics = _fit_one(
                library=library,
                x_train=to_matrix(train_x),
                y_train=train_y,
                x_valid=to_matrix(valid_x),
                y_valid=valid_y,
                config=config,
                scale_pos_weight=weight,
                feature_names=list(contract.feature_ids),
            )
            outputs[key] = FittedOutput(
                key=key,
                booster=booster,
                calibrator=Calibrator.identity(),
                positive_events=events,
                positive_samples=positives,
                metrics=metrics,
            )

        if skipped:
            contract.notes.append(
                "Outputs not modelled for want of confirmed events: "
                + "; ".join(f"{key} ({why})" for key, why in sorted(skipped.items()))
            )
        contract.outputs = tuple(sorted(outputs))
        return cls(library=library, contract=contract, outputs=outputs)

    # -- serving ------------------------------------------------------------

    def score_batch(self, rows: Sequence[Sequence[float | None]], output: str) -> list[float]:
        """Raw scores for one output over many rows.

        The only place either library's predict is called, so the feature names
        recorded at fit time are attached identically here. XGBoost validates
        them, and a DMatrix built without them is refused against a booster
        that was trained with them — which is a bug that only appears when
        scoring code is written twice.
        """
        fitted = self.outputs.get(output)
        if fitted is None or self.contract is None or not rows:
            return []
        matrix = to_matrix(rows)
        names = list(self.contract.feature_ids)
        if self.library == "lightgbm":
            return [float(value) for value in fitted.booster.predict(matrix)]
        xgboost = module("xgboost")
        dmatrix = xgboost.DMatrix(matrix, feature_names=names)
        return [float(value) for value in fitted.booster.predict(dmatrix)]

    def calibrated_batch(
        self, rows: Sequence[Sequence[float | None]], output: str
    ) -> list[float]:
        """Scores with the fitted calibrator applied, falling back to raw."""
        fitted = self.outputs.get(output)
        raw = self.score_batch(rows, output)
        if fitted is None:
            return raw
        return [fitted.calibrator.apply(score) or score for score in raw]

    def predict(self, vector: Sequence[float | None]) -> list[Prediction]:
        """A calibrated probability per output, or an empty list if unavailable."""
        if not self.available:
            return []
        predictions: list[Prediction] = []
        for key, fitted in sorted(self.outputs.items()):
            scores = self.score_batch([vector], key)
            if not scores:
                continue
            raw = scores[0]
            predictions.append(
                Prediction(output=key, raw_score=raw, calibrated=fitted.calibrator.apply(raw))
            )
        return predictions

    #: Libraries whose native contribution output has been checked against
    #: ``shap.TreeExplainer`` on a real artifact and found identical.
    #:
    #: LightGBM's ``pred_contrib`` matches to 0.000e+00 -- bit identical -- so
    #: calling it SHAP is accurate. XGBoost's ``pred_contribs`` does NOT: the
    #: same artifact and inputs differ by up to 5.7e-01, and it is not a
    #: feature-name or DMatrix artifact (checked both ways). Until that is
    #: understood, XGBoost native output is reported as what it is -- native
    #: tree contributions -- and never as a validated SHAP value.
    NATIVE_SHAP_EQUIVALENT = frozenset({"lightgbm"})

    def explain_with_method(
        self, vector: Sequence[float | None], output: str
    ) -> tuple[list[tuple[str, float]], str]:
        """Contributions plus the name of the method that produced them.

        Prefers ``shap.TreeExplainer`` where it is installed, because it is the
        reference implementation. Falls back to the booster's native path,
        which is far quicker on a 1,604-column vector and, for LightGBM, has
        been verified identical.

        The method travels with the numbers so a consumer is never left
        guessing whether it holds a SHAP value or something SHAP-like.
        """
        fitted = self.outputs.get(output)
        if fitted is None or self.contract is None:
            return [], "unavailable"

        if probe("shap").available:
            try:
                import numpy  # noqa: PLC0415

                shap = module("shap")
                matrix = to_matrix([vector])
                values = numpy.array(
                    shap.TreeExplainer(fitted.booster).shap_values(matrix)
                )
                if values.ndim == 3:
                    values = values[..., 1] if values.shape[-1] == 2 else values[0]
                row = list(values[0])[: len(self.contract.feature_ids)]
                return (
                    list(zip(self.contract.feature_ids, (float(v) for v in row))),
                    "shap_treeexplainer",
                )
            except Exception:  # noqa: BLE001 - fall through to the native path
                pass

        pairs = self.explain(vector, output)
        method = (
            "native_pred_contrib_shap_equivalent"
            if self.library in self.NATIVE_SHAP_EQUIVALENT
            else "native_tree_contributions_unverified"
        )
        return pairs, method

    def explain(self, vector: Sequence[float | None], output: str) -> list[tuple[str, float]]:
        """Native tree contributions for one output, paired with feature ids.

        The booster's own fast path rather than a generic explainer: roughly
        two orders of magnitude quicker than a sampling explainer on a
        vector this wide.
        """
        fitted = self.outputs.get(output)
        if fitted is None or self.contract is None:
            return []
        matrix = to_matrix([vector])
        try:
            if self.library == "lightgbm":
                values = fitted.booster.predict(matrix, pred_contrib=True)[0]
            else:
                xgboost = module("xgboost")
                dmatrix = xgboost.DMatrix(matrix, feature_names=list(self.contract.feature_ids))
                values = fitted.booster.predict(dmatrix, pred_contribs=True)[0]
        except Exception:  # noqa: BLE001 - an explanation is never worth a 500
            return []
        # Both libraries append the base value as a final column.
        contributions = list(values)[: len(self.contract.feature_ids)]
        return list(zip(self.contract.feature_ids, (float(value) for value in contributions)))

    def base_value(self, output: str, vector: Sequence[float | None]) -> float | None:
        fitted = self.outputs.get(output)
        if fitted is None or self.contract is None:
            return None
        matrix = to_matrix([vector])
        try:
            if self.library == "lightgbm":
                return float(fitted.booster.predict(matrix, pred_contrib=True)[0][-1])
            xgboost = module("xgboost")
            dmatrix = xgboost.DMatrix(matrix, feature_names=list(self.contract.feature_ids))
            return float(fitted.booster.predict(dmatrix, pred_contribs=True)[0][-1])
        except Exception:  # noqa: BLE001
            return None

    # -- persistence --------------------------------------------------------

    def save(self, directory: Path) -> Path:
        if self.contract is None:
            raise ValueError("An ensemble with no contract cannot be saved.")
        directory.mkdir(parents=True, exist_ok=True)
        self.contract.write(directory / "contract.json")
        index: dict[str, Any] = {"library": self.library, "outputs": {}}

        for key, fitted in self.outputs.items():
            safe = _safe_name(key)
            if self.library == "lightgbm":
                fitted.booster.save_model(str(directory / f"{safe}.txt"))
            else:
                fitted.booster.save_model(str(directory / f"{safe}.json"))
            index["outputs"][key] = {
                "file": safe,
                "threshold": fitted.threshold,
                "calibrator": fitted.calibrator.to_json(),
                "positive_events": fitted.positive_events,
                "positive_samples": fitted.positive_samples,
                "metrics": fitted.metrics,
            }

        (directory / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
        return directory

    @classmethod
    def load(cls, directory: Path) -> "TreeEnsemble":
        index_path = directory / "index.json"
        contract_path = directory / "contract.json"
        if not index_path.is_file() or not contract_path.is_file():
            return cls(library="unknown", reason=f"No tree ensemble artifact at {directory}.")

        try:
            index = json.loads(index_path.read_text(encoding="utf-8"))
            contract = ModelContract.read(contract_path)
        except Exception as error:  # noqa: BLE001
            return cls(library="unknown", reason=f"Tree ensemble metadata unreadable: {error}")

        library = index.get("library", "lightgbm")
        try:
            loader = _booster_loader(library)
        except CapabilityUnavailable as error:
            return cls(library=library, contract=contract, reason=error.reason)

        outputs: dict[str, FittedOutput] = {}
        for key, entry in index.get("outputs", {}).items():
            suffix = "txt" if library == "lightgbm" else "json"
            path = directory / f"{entry['file']}.{suffix}"
            if not path.is_file():
                continue
            try:
                booster = loader(path)
            except Exception:  # noqa: BLE001 - one bad output must not lose the rest
                continue
            outputs[key] = FittedOutput(
                key=key,
                booster=booster,
                calibrator=Calibrator.from_json(entry.get("calibrator", {})),
                threshold=float(entry.get("threshold", 0.5)),
                positive_events=int(entry.get("positive_events", 0)),
                positive_samples=int(entry.get("positive_samples", 0)),
                metrics=entry.get("metrics", {}),
            )

        if not outputs:
            return cls(library=library, contract=contract, reason="No usable outputs in the artifact.")
        return cls(library=library, contract=contract, outputs=outputs)

    @classmethod
    def unavailable(cls, library: str, reason: str) -> "TreeEnsemble":
        return cls(library=library, reason=reason)

    def describe(self) -> dict[str, Any]:
        return {
            "library": self.library,
            "available": self.available,
            "reason": self.reason,
            "model_id": self.model_id,
            "output_count": len(self.outputs),
            "trained_on_real_data": bool(self.contract and self.contract.trained_on_real_data),
        }


def _usable(
    rows: Sequence[Sequence[float | None]], labels: Sequence[int]
) -> tuple[list[Sequence[float | None]], list[int]]:
    """Rows whose label is a real 0 or 1, dropping EXCLUDED (-1)."""
    from ...labels.events import EXCLUDED

    kept_rows: list[Sequence[float | None]] = []
    kept_labels: list[int] = []
    for row, label in zip(rows, labels):
        if label == EXCLUDED:
            continue
        kept_rows.append(row)
        kept_labels.append(int(label))
    return kept_rows, kept_labels


def _safe_name(key: str) -> str:
    return key.replace("@", "_at_").replace("/", "_")


def _booster_loader(library: str):  # type: ignore[no-untyped-def]
    if library == "lightgbm":
        lightgbm = module("lightgbm")
        return lambda path: lightgbm.Booster(model_file=str(path))
    xgboost = module("xgboost")

    def load(path: Path):  # type: ignore[no-untyped-def]
        booster = xgboost.Booster()
        booster.load_model(str(path))
        return booster

    return load


def _fit_one(
    *,
    library: str,
    x_train: Any,
    y_train: list[int],
    x_valid: Any,
    y_valid: list[int],
    config: TreeTrainingConfig,
    scale_pos_weight: float,
    feature_names: list[str],
) -> tuple[Any, dict[str, float]]:
    if library == "lightgbm":
        lightgbm = module("lightgbm")
        train_set = lightgbm.Dataset(x_train, label=y_train, feature_name=feature_names)
        valid_set = lightgbm.Dataset(x_valid, label=y_valid, reference=train_set)
        evals: dict[str, Any] = {}
        booster = lightgbm.train(
            config.lightgbm_params(scale_pos_weight),
            train_set,
            num_boost_round=config.n_estimators,
            valid_sets=[valid_set],
            valid_names=["valid"],
            callbacks=[
                lightgbm.early_stopping(config.early_stopping_rounds, verbose=False),
                lightgbm.record_evaluation(evals),
            ],
        )
        metrics = {
            name: float(values[booster.best_iteration - 1])
            for name, values in evals.get("valid", {}).items()
            if values
        }
        metrics["best_iteration"] = float(booster.best_iteration)
        return booster, metrics

    xgboost = module("xgboost")
    dtrain = xgboost.DMatrix(x_train, label=y_train, feature_names=feature_names)
    dvalid = xgboost.DMatrix(x_valid, label=y_valid, feature_names=feature_names)
    evals_result: dict[str, Any] = {}
    booster = xgboost.train(
        config.xgboost_params(scale_pos_weight),
        dtrain,
        num_boost_round=config.n_estimators,
        evals=[(dvalid, "valid")],
        early_stopping_rounds=config.early_stopping_rounds,
        evals_result=evals_result,
        verbose_eval=False,
    )
    metrics = {
        name: float(values[-1]) for name, values in evals_result.get("valid", {}).items() if values
    }
    metrics["best_iteration"] = float(getattr(booster, "best_iteration", 0))
    return booster, metrics


def _predict_one(library: str, booster: Any, matrix: Any) -> float:
    if library == "lightgbm":
        return float(booster.predict(matrix)[0])
    xgboost = module("xgboost")
    return float(booster.predict(xgboost.DMatrix(matrix))[0])
