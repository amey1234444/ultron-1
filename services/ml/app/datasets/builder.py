"""Building offline training datasets from telemetry and confirmed events.

The dataset is where every claim about the models is ultimately grounded, so
this module's job is to produce something whose provenance is complete: for
every row, which machine and instant it came from, which feature version
computed it, which baseline it was compared against, which event labelled it
and how much that event's label is worth.

The pipeline is run in *replay*, using the same engines that serve online. That
is not a convenience; it is the only way the training distribution matches the
serving distribution. A dataset built by a separate offline feature script
drifts from the online one within a release, and the resulting model is
evaluated on features it will never actually see.

Three properties the builder enforces rather than assumes:

**Rows excluded from a label are excluded, not zeroed.** ``EXCLUDED`` targets
are dropped per-output, so a row can be a valid negative for one fault and
excluded for another.

**The split is checked before the dataset is returned.** ``check_leakage``
raises, and the builder does not catch it.

**Synthetic is labelled synthetic, forever.** A dataset built from scenarios
carries ``BRONZE`` labels and ``data_source = SYNTHETIC`` on every row, and the
model contract fitted from it records ``trained_on_real_data = False``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Iterable, Sequence

from ..core.config import settings
from ..core.errors import DatasetError
from ..core.timeutil import iso, now as utc_now
from ..core.versions import FEATURE_SET_VERSION, RULE_SET_VERSION
from ..features.engine import union_feature_ids
from ..inference.pipeline import InferencePipeline
from ..knowledge.loader import knowledge
from ..labels.events import EXCLUDED, FaultEvent, LabelPolicy, label_quality_mix, label_row
from ..models.base import output_key
from ..models.trees.common import DEFAULT_HORIZONS
from ..schemas.telemetry import TelemetryFrame
from .splits import SplitDefinition, check_leakage, chronological_split


@dataclass
class DatasetRow:
    """One training row, with everything needed to audit it."""

    index: int
    timestamp: datetime
    machine_id: str
    configuration_version: str | None
    operating_state: str
    context_id: str | None
    recipe_id: str | None
    material_id: str | None
    data_source: str
    event_id: str | None

    features: list[float | None]
    labels: dict[str, int]

    data_quality: str
    baseline_level: str | None
    baseline_confidence: float
    ml_eligible: bool
    rule_severity: str
    anomaly_ids: list[str] = field(default_factory=list)
    diagnosis_fault_ids: list[str] = field(default_factory=list)


@dataclass
class Dataset:
    """A built, split, leakage-checked dataset."""

    dataset_id: str
    feature_ids: tuple[str, ...]
    output_keys: tuple[str, ...]
    rows: list[DatasetRow]
    split: SplitDefinition
    events: list[FaultEvent]
    horizons: tuple[int, ...]
    built_at: str = field(default_factory=lambda: iso(utc_now()))
    feature_set_version: str = FEATURE_SET_VERSION
    rule_set_version: str = RULE_SET_VERSION
    knowledge_digest: str = ""
    notes: list[str] = field(default_factory=list)

    @property
    def contains_real_data(self) -> bool:
        return any(row.data_source == "REAL" for row in self.rows)

    def indices(self, split: str) -> list[int]:
        return [
            row.index
            for row in self.rows
            if self.split.assignments.get(str(row.index)) == split
        ]

    def matrix(self, split: str) -> list[list[float | None]]:
        return [self.rows[index].features for index in self.indices(split)]

    def targets(self, split: str, key: str) -> tuple[list[list[float | None]], list[int]]:
        """Rows and labels for one output, with EXCLUDED rows dropped.

        Dropped per output, not per row: a row can be a trustworthy negative
        for a screen restriction and excluded for a motor overload whose onset
        it sits inside.
        """
        rows: list[list[float | None]] = []
        labels: list[int] = []
        for index in self.indices(split):
            value = self.rows[index].labels.get(key, EXCLUDED)
            if value == EXCLUDED:
                continue
            rows.append(self.rows[index].features)
            labels.append(value)
        return rows, labels

    def timestamps(self) -> list[datetime]:
        return [row.timestamp for row in self.rows]

    def event_ids(self) -> list[str | None]:
        return [row.event_id for row in self.rows]

    def positive_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for row in self.rows:
            for key, value in row.labels.items():
                if value == 1:
                    counts[key] = counts.get(key, 0) + 1
        return counts

    def event_counts(self) -> dict[str, int]:
        """Distinct confirmed events per output. The number that decides
        whether a fault can be modelled at all — a thousand positive rows from
        two events are two events."""
        counts: dict[str, int] = {}
        for key in self.output_keys:
            fault_id = key.split("@")[0]
            counts[key] = sum(
                1
                for event in self.events
                if event.fault_id == fault_id and event.trusted and event.confirmed_onset
            )
        return counts

    def summary(self) -> dict[str, object]:
        return {
            "dataset_id": self.dataset_id,
            "built_at": self.built_at,
            "rows": len(self.rows),
            "features": len(self.feature_ids),
            "outputs": len(self.output_keys),
            "horizons": list(self.horizons),
            "split_counts": self.split.counts,
            "positives": self.positive_counts(),
            "events": self.event_counts(),
            "label_quality": label_quality_mix(self.events),
            "contains_real_data": self.contains_real_data,
            "feature_set_version": self.feature_set_version,
            "rule_set_version": self.rule_set_version,
            "knowledge_digest": self.knowledge_digest,
            "notes": self.notes,
        }

    def write(self, directory: Path | None = None) -> Path:
        """Persist as Parquet where pyarrow is available, JSONL otherwise."""
        base = directory or (settings().datasets_dir / self.dataset_id)
        base.mkdir(parents=True, exist_ok=True)

        (base / "summary.json").write_text(json.dumps(self.summary(), indent=2), encoding="utf-8")
        (base / "split.json").write_text(json.dumps(self.split.to_json(), indent=2), encoding="utf-8")
        (base / "events.json").write_text(
            json.dumps([event.to_json() for event in self.events], indent=2), encoding="utf-8"
        )
        (base / "feature_ids.json").write_text(
            json.dumps(list(self.feature_ids), indent=2), encoding="utf-8"
        )

        records = [
            {
                "index": row.index,
                "timestamp": iso(row.timestamp),
                "machine_id": row.machine_id,
                "configuration_version": row.configuration_version,
                "operating_state": row.operating_state,
                "context_id": row.context_id,
                "recipe_id": row.recipe_id,
                "material_id": row.material_id,
                "data_source": row.data_source,
                "event_id": row.event_id,
                "split": self.split.assignments.get(str(row.index), "excluded"),
                "data_quality": row.data_quality,
                "baseline_level": row.baseline_level,
                "baseline_confidence": row.baseline_confidence,
                "ml_eligible": row.ml_eligible,
                "rule_severity": row.rule_severity,
                **{f"y::{key}": value for key, value in row.labels.items()},
                **{f"x::{fid}": value for fid, value in zip(self.feature_ids, row.features)},
            }
            for row in self.rows
        ]

        # Parquet in row-group batches rather than one table.
        #
        # `Table.from_pylist` over the whole dataset builds every column in
        # memory at once, which for a few thousand rows of a 1,644-column
        # union is enough to fail on an ordinary machine. It did: the first
        # rebuild silently fell back and wrote a 332 MB JSONL for 4,980 rows,
        # where the parquet is a fraction of that. Batching keeps the peak flat
        # and the schema is taken from the first batch so every batch agrees.
        batch_size = 256
        written = False
        try:
            from ..core.capability import module

            pyarrow = module("pyarrow")
            import pyarrow.parquet as parquet  # noqa: PLC0415

            first = pyarrow.Table.from_pylist(records[:batch_size])
            with parquet.ParquetWriter(base / "rows.parquet", first.schema) as writer:
                writer.write_table(first)
                for start in range(batch_size, len(records), batch_size):
                    writer.write_table(
                        pyarrow.Table.from_pylist(
                            records[start : start + batch_size], schema=first.schema
                        )
                    )
            written = True
        except Exception as error:  # noqa: BLE001 - JSONL is a complete fallback
            # Recorded rather than swallowed. A silent fallback is how a
            # 332 MB JSONL appears where a parquet was expected, and nothing
            # downstream can tell the difference until it runs out of memory.
            self.notes.append(
                f"Parquet could not be written ({type(error).__name__}: {error}); "
                "fell back to JSONL, which is larger and slower to read."
            )
            (base / "rows.parquet").unlink(missing_ok=True)

        if not written:
            with (base / "rows.jsonl").open("w", encoding="utf-8") as handle:
                for record in records:
                    handle.write(json.dumps(record) + "\n")

        return base


class DatasetBuilder:
    """Replays telemetry through the serving pipeline and labels the result."""

    def __init__(
        self,
        *,
        horizons: Sequence[int] = DEFAULT_HORIZONS,
        policy: LabelPolicy | None = None,
        fault_ids: Sequence[str] | None = None,
        emit_every: int = 1,
    ) -> None:
        self.horizons = tuple(horizons)
        self.policy = policy or LabelPolicy(horizons_minutes=self.horizons)
        self.fault_ids = tuple(fault_ids) if fault_ids else ()
        self.emit_every = max(1, emit_every)

    def build(
        self,
        *,
        dataset_id: str,
        frames: Iterable[TelemetryFrame],
        events: Sequence[FaultEvent],
        pipeline: InferencePipeline | None = None,
        max_lookback_seconds: float = 600.0,
        train_fraction: float = 0.70,
        valid_fraction: float = 0.15,
    ) -> Dataset:
        """Replay, label, split and verify."""
        pipe = pipeline or InferencePipeline()
        feature_ids = union_feature_ids()
        fault_ids = self.fault_ids or self._faults_with_events(events)
        if not fault_ids:
            raise DatasetError(
                "No fault has any confirmed event, so there is nothing to learn. "
                "A dataset with no positives trains nothing.",
                detail={"events": len(events)},
            )
        output_keys = tuple(
            output_key(fault_id, horizon) for fault_id in fault_ids for horizon in self.horizons
        )

        rows: list[DatasetRow] = []
        notes: list[str] = []

        for position, frame in enumerate(frames):
            if position % self.emit_every != 0:
                pipe.ingest_only(frame)
                continue

            response = pipe.process(frame)
            # The vector the pipeline actually served, not a recomputation.
            # Recomputing would run the stateful state engine over the same
            # frame twice and produce a different transition history.
            features = pipe.last_vector(frame.machine_id)

            labels = {
                output_key(fault_id, horizon): label_row(
                    at=frame.timestamp,
                    machine_id=frame.machine_id,
                    fault_id=fault_id,
                    horizon_minutes=horizon,
                    events=events,
                    policy=self.policy,
                )
                for fault_id in fault_ids
                for horizon in self.horizons
            }

            rows.append(
                DatasetRow(
                    index=len(rows),
                    timestamp=frame.timestamp,
                    machine_id=frame.machine_id,
                    configuration_version=frame.configuration_version,
                    operating_state=response.context.operating_state,
                    context_id=response.context.context_id,
                    recipe_id=response.context.recipe_id,
                    material_id=response.context.material_id,
                    data_source=frame.data_source,
                    event_id=_event_at(frame, events),
                    features=features,
                    labels=labels,
                    data_quality=response.data_quality.overall,
                    baseline_level=response.context.baseline_level,
                    baseline_confidence=_band_to_score(response.context.baseline_confidence),
                    ml_eligible=response.ml.eligible,
                    rule_severity=response.current_condition.rule_state,
                    anomaly_ids=[
                        entry.anomaly_id for entry in response.anomalies if entry.anomaly_id
                    ],
                    diagnosis_fault_ids=[entry.fault_id for entry in response.diagnoses],
                )
            )

        if not rows:
            raise DatasetError("No rows were produced. Check the frame source.")

        # A dataset whose feature block is empty is not a dataset, and it is
        # indistinguishable from a good one until a model trained on it turns
        # out to be a constant predictor. That is not hypothetical: ds-synth-002
        # was written with all 1,652 columns null, and the resulting boosters
        # contained 44-148 trees and zero splits. Nothing between the builder
        # and the frozen-test metrics noticed.
        #
        # Residual and embedding columns are legitimately null on a first pass
        # (the temporal model is trained from this same data and does not exist
        # yet), so the check is on the engineered block only.
        engineered_ids = set(
            union_feature_ids(include_residuals=False, include_embedding=False)
        )
        engineered = [
            index for index, fid in enumerate(feature_ids) if fid in engineered_ids
        ]
        populated = sum(
            1
            for index in engineered
            if any(row.features[index] is not None for row in rows)
        )
        if engineered and populated == 0:
            raise DatasetError(
                f"Every one of the {len(engineered)} engineered feature columns is null "
                f"across all {len(rows)} rows. A model trained on this cannot split on "
                "anything and will be a constant predictor. See "
                "docs/ml/WHY_THE_MODEL_WAS_CONSTANT.md."
            )
        if engineered and populated < 0.5 * len(engineered):
            notes.append(
                f"Only {populated} of {len(engineered)} engineered feature columns carry "
                "any value. Check the feature engine before reading anything into a model "
                "trained from this dataset."
            )

        split = chronological_split(
            [row.timestamp for row in rows],
            events=events,
            train_fraction=train_fraction,
            valid_fraction=valid_fraction,
            max_lookback_seconds=max_lookback_seconds,
            max_horizon_minutes=max(self.horizons),
        )
        notes.extend(split.notes)

        # Not caught. A leaking dataset must not be returned under any
        # circumstance, because every number computed from it afterwards is
        # meaningless and nothing downstream can detect that.
        check_leakage(
            split,
            timestamps=[row.timestamp for row in rows],
            event_ids=[row.event_id for row in rows],
            events=events,
            max_lookback_seconds=max_lookback_seconds,
            max_horizon_minutes=max(self.horizons),
        )

        if not any(row.data_source == "REAL" for row in rows):
            notes.append(
                "Every row in this dataset is SYNTHETIC. A model fitted from it exercises the "
                "pipeline and carries no evidence about a real machine."
            )

        return Dataset(
            dataset_id=dataset_id,
            feature_ids=feature_ids,
            output_keys=output_keys,
            rows=rows,
            split=split,
            events=list(events),
            horizons=self.horizons,
            knowledge_digest=knowledge().digest(),
            notes=notes,
        )

    def _faults_with_events(self, events: Sequence[FaultEvent]) -> tuple[str, ...]:
        return tuple(sorted({event.fault_id for event in events if event.confirmed_onset}))


def _event_at(frame: TelemetryFrame, events: Sequence[FaultEvent]) -> str | None:
    """Which event's span this frame falls inside, if any.

    Used by the split verifier to keep an event atomic, so it must be the
    *whole* span — onset to resolution — not just the onset instant.
    """
    for event in events:
        if event.machine_id != frame.machine_id:
            continue
        span = event.spans()
        if span and span[0] <= frame.timestamp <= span[1]:
            return event.event_id
    return None


def _band_to_score(band: str) -> float:
    return {"HIGH": 0.9, "MEDIUM": 0.6, "LOW": 0.3, "NONE": 0.0}.get(band, 0.0)


# Residual and embedding columns are null on a first pass, because the temporal
# model is trained on this same data and does not exist yet.
# ``app.training.generate_temporal_features`` fills them in a second pass, which
# is the only order that works.
