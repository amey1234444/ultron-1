"""Train the temporal (LSTM) model.

    python -m app.training.train_temporal --dataset ds-001 --lookback 300

Fits the two-headed sequence model: a forecast of the configured channels and a
32-dimensional embedding of the window. The residual scale is measured on the
training set afterwards and persisted with the model, because a residual is
uninterpretable without it.

Three commitments this command makes, and the artifact records:

  - the scaler is fitted on the training split only, and refuses otherwise;
  - the saved model is the best validation epoch, restored, not the last one;
  - the forecast channel list is configuration, stored in the contract, so a
    model can never be served against a different set than it was fitted on.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..core.capability import probe
from ..core.timeutil import iso, now as utc_now, parse_timestamp
from ..core.versions import FEATURE_SET_VERSION
from ..features.registry import default_forecast_tags
from ..models.base import ModelContract
from ..models.temporal.builder import TemporalArchitecture, build_model, training_callbacks
from ..models.temporal.scaler import SequenceScaler, residual_scale
from ..models.temporal.sequences import build_sequences
from ..registry.registry import ModelRegistry, artifact_dir, timestamp_id
from .common import (
    RunRecord,
    base_parser,
    configure_logging,
    environment,
    print_summary,
    require,
    resolve_out,
    set_seed,
)


def main(argv: list[str] | None = None) -> int:
    parser = base_parser(__doc__ or "Train the temporal model.")
    parser.add_argument("--dataset", required=True, help="Dataset id to train from.")
    parser.add_argument("--lookback", type=int, default=300, help="Sequence length in steps.")
    parser.add_argument("--step-seconds", type=float, default=1.0)
    parser.add_argument("--horizon-steps", type=int, default=1, help="Steps ahead to forecast.")
    parser.add_argument("--batch-size", type=int, default=128, choices=(64, 128, 256))
    parser.add_argument("--epochs", type=int, default=100, help="Maximum. Early stopping decides.")
    parser.add_argument("--patience", type=int, default=12)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--dropout", type=float, default=0.20)
    parser.add_argument("--scaler", choices=("robust", "standard"), default="robust")
    parser.add_argument(
        "--channels",
        nargs="*",
        default=None,
        help="Forecast channels. Defaults to the configured process variables.",
    )
    parser.add_argument("--model-id", default=None)

    args = parser.parse_args(argv)
    log = configure_logging(args.log_level)
    set_seed(args.seed)

    capability = probe("tensorflow")
    require(
        capability.available,
        f"TensorFlow is required to train the temporal model. {capability.reason}",
    )

    dataset_dir = resolve_out(args.out, "datasets") / args.dataset
    require(dataset_dir.is_dir(), f"No dataset at {dataset_dir}. Run build_dataset first.")

    rows, columns, timestamps, splits = _load_series(dataset_dir)
    require(bool(rows), "The dataset contains no usable rows.")

    requested = tuple(args.channels) if args.channels else default_forecast_tags()
    channels = tuple(channel for channel in requested if channel in columns)
    require(
        bool(channels),
        f"None of {list(requested)} exist in the dataset's channel columns.",
    )

    architecture = TemporalArchitecture(
        lookback_steps=args.lookback,
        feature_count=len(columns),
        forecast_channels=channels,
        dropout=args.dropout,
        learning_rate=args.learning_rate,
    )

    train_indices = [index for index, split in enumerate(splits) if split == "train"]
    valid_indices = [index for index, split in enumerate(splits) if split == "valid"]
    require(len(train_indices) > args.lookback, "Not enough training rows for this lookback.")

    scaler = SequenceScaler(kind=args.scaler).fit(
        [rows[index] for index in train_indices], columns, split="train"
    )

    def sequences_for(indices: list[int]):  # type: ignore[no-untyped-def]
        grid = [timestamps[index] for index in indices]
        values = scaler.transform([rows[index] for index in indices])
        return build_sequences(
            grid=grid,
            rows=values,
            columns=columns,
            forecast_columns=channels,
            lookback=args.lookback,
            horizon_steps=args.horizon_steps,
        )

    train_set = sequences_for(train_indices)
    valid_set = sequences_for(valid_indices)
    require(len(train_set) > 0, "No training sequences survived the gap policy.")
    require(len(valid_set) > 0, "No validation sequences survived the gap policy.")
    log.info("Sequences: %d train, %d validation.", len(train_set), len(valid_set))

    model = build_model(architecture)
    x_train, y_train = train_set.to_arrays()
    x_valid, y_valid = valid_set.to_arrays()

    model_id = args.model_id or timestamp_id("temporal")
    out = artifact_dir("TEMPORAL_LSTM", model_id, "1")
    out.mkdir(parents=True, exist_ok=True)

    history = model.fit(
        x_train,
        y_train,
        validation_data=(x_valid, y_valid),
        epochs=args.epochs,
        batch_size=args.batch_size,
        callbacks=training_callbacks(patience=args.patience),
        verbose=2,
    )
    losses = history.history["val_loss"]
    best_epoch = int(min(range(len(losses)), key=lambda index: losses[index]))
    log.info(
        "Best epoch %d of %d (val_loss %.5f). The saved weights are that epoch, not the last.",
        best_epoch + 1,
        len(losses),
        losses[best_epoch],
    )

    # The residual scale is measured on training predictions, never on
    # validation: it is a property of the fitted model's typical error, and
    # measuring it on data the model did not fit makes every normalised
    # residual optimistic.
    predictions = model.predict(x_train, verbose=0)
    scales: dict[str, float] = {}
    for index, channel in enumerate(channels):
        residuals = [
            scaler.inverse_column(channel, float(actual[index]))
            - scaler.inverse_column(channel, float(predicted[index]))
            for actual, predicted in zip(y_train, predictions)
        ]
        scales[channel] = residual_scale(residuals)

    model.save(out / "model.keras")
    scaler.write(out / "scaler.json")

    contract = ModelContract(
        model_id=model_id,
        model_kind="TEMPORAL_LSTM",
        version="1",
        feature_ids=tuple(columns),
        feature_set_version=FEATURE_SET_VERSION,
        outputs=channels,
        lookback_seconds=int(args.lookback * args.step_seconds),
        step_seconds=args.step_seconds,
        trained_on_dataset=args.dataset,
        trained_on_real_data=_dataset_is_real(dataset_dir),
        random_seed=args.seed,
        trained_at=iso(utc_now()),
        hyperparameters=architecture.summary() | {"batch_size": args.batch_size, "epochs": args.epochs},
        validation_metrics={
            "best_epoch": best_epoch + 1,
            "epochs_run": len(losses),
            "val_loss": float(losses[best_epoch]),
            "val_mae": float(history.history.get("val_mae", [0.0])[best_epoch]),
        },
        scaler={"kind": scaler.kind, "fitted_on_split": scaler.fitted_on_split or ""},
        residual_scale=scales,
        environment=environment(),
    )
    contract.write(out / "contract.json")

    registry = ModelRegistry()
    entry = registry.register(
        contract=contract,
        artifact_path=out,
        validation_metrics=contract.validation_metrics,
        notes=["Temporal model. Registration is not promotion."],
    )

    RunRecord(
        run_id=model_id,
        command="train_temporal",
        seed=args.seed,
        dataset_id=args.dataset,
        arguments={key: str(value) for key, value in vars(args).items()},
        artifacts=[str(out)],
    ).finish(**contract.validation_metrics).write(out)

    print_summary(
        f"Temporal model {model_id}",
        {
            "artifact": str(out),
            "forecast_channels": list(channels),
            "lookback_steps": args.lookback,
            "sequences": {"train": len(train_set), "valid": len(valid_set)},
            "validation": contract.validation_metrics,
            "residual_scale": {key: round(value, 4) for key, value in scales.items()},
            "registry_role": entry.role,
            "trained_on_real_data": contract.trained_on_real_data,
        },
    )
    return 0


def _load_series(directory: Path):  # type: ignore[no-untyped-def]
    """Read a built dataset back as aligned raw-channel rows.

    Only ``x::TAG.value`` columns are used. A sequence model over a thousand
    engineered features would be learning the feature engine rather than the
    machine, and the engineered features are the tree ensemble's job.
    """
    records = _read_rows(directory)
    if not records:
        return [], [], [], []

    columns = sorted(
        key[len("x::") : -len(".value")]
        for key in records[0]
        if key.startswith("x::") and key.endswith(".value")
    )
    rows = [[record.get(f"x::{column}.value") for column in columns] for record in records]
    timestamps = [parse_timestamp(record["timestamp"]) for record in records]
    splits = [record.get("split", "excluded") for record in records]
    return rows, columns, timestamps, splits


def _read_rows(directory: Path) -> list[dict]:
    parquet_path = directory / "rows.parquet"
    if parquet_path.is_file():
        try:
            import pyarrow.parquet as parquet

            return parquet.read_table(parquet_path).to_pylist()
        except Exception:  # noqa: BLE001 - JSONL is a complete fallback
            pass
    jsonl = directory / "rows.jsonl"
    if not jsonl.is_file():
        return []
    return [
        json.loads(line)
        for line in jsonl.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _dataset_is_real(directory: Path) -> bool:
    summary = directory / "summary.json"
    if not summary.is_file():
        return False
    return bool(json.loads(summary.read_text(encoding="utf-8")).get("contains_real_data", False))


if __name__ == "__main__":
    raise SystemExit(main())
