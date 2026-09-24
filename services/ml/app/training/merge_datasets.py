"""Combine several built datasets into one, with the split recomputed.

    python -m app.training.merge_datasets --into ds-merged --from ds-chunk-a ds-chunk-b

A dataset large enough to evaluate a model takes longer to build than this
environment reliably allows â€” eleven attempts were killed part-way â€” and a
build that dies at ninety per cent leaves nothing. Chunks that each complete in
minutes do not have that problem, and merging them afterwards is the same
dataset by another route.

Two things this has to get right, and they are the reasons it is a command
rather than a shell loop:

**Time must stay monotonic.** Each chunk was built from the same origin, so
concatenating them raw would interleave four runs that all start on 1 January
and produce a timeline that goes backwards. Each chunk's frames are shifted to
sit after the previous chunk's last frame, with a gap, and every event's onset
and resolution moves with them.

**The split must be recomputed, never concatenated.** Splitting each chunk and
gluing the parts together would put the same fault in train for one chunk and
test for another, which is precisely the leakage the chronological split
exists to prevent. The merged rows are re-split from scratch and re-verified.
"""

from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path
from typing import Any

from ..core.timeutil import iso, parse_timestamp
from ..datasets.splits import check_leakage, chronological_split
from ..labels.events import FaultEvent
from .common import base_parser, configure_logging, require, resolve_out

#: Silence between chunks, so one run's tail is never read as continuous with
#: the next one's head. Longer than the longest feature window.
CHUNK_GAP = timedelta(hours=2)


def _read_rows(directory: Path) -> list[dict[str, Any]]:
    parquet = directory / "rows.parquet"
    if parquet.is_file():
        try:
            from ..core.capability import module

            module("pyarrow")
            import pyarrow.parquet as pq  # noqa: PLC0415

            return pq.read_table(parquet).to_pylist()
        except Exception:  # noqa: BLE001 - JSONL is the complete fallback
            pass
    jsonl = directory / "rows.jsonl"
    require(jsonl.is_file(), f"No rows.parquet or rows.jsonl in {directory}")
    with jsonl.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle]


def _write_rows(directory: Path, rows: list[dict[str, Any]]) -> str:
    """Parquet in row-group batches, JSONL if that is not possible."""
    batch = 256
    try:
        from ..core.capability import module

        pyarrow = module("pyarrow")
        import pyarrow.parquet as pq  # noqa: PLC0415

        first = pyarrow.Table.from_pylist(rows[:batch])
        with pq.ParquetWriter(directory / "rows.parquet", first.schema) as writer:
            writer.write_table(first)
            for start in range(batch, len(rows), batch):
                writer.write_table(
                    pyarrow.Table.from_pylist(rows[start : start + batch], schema=first.schema)
                )
        return "parquet"
    except Exception:  # noqa: BLE001
        (directory / "rows.parquet").unlink(missing_ok=True)
        with (directory / "rows.jsonl").open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row) + "\n")
        return "jsonl"


def main(argv: list[str] | None = None) -> int:
    parser = base_parser(__doc__ or "Merge datasets.")
    parser.add_argument("--into", required=True, help="Dataset id to write.")
    parser.add_argument("--from", dest="sources", nargs="+", required=True)
    parser.add_argument("--train-fraction", type=float, default=0.70)
    parser.add_argument("--valid-fraction", type=float, default=0.15)
    parser.add_argument("--max-lookback-seconds", type=float, default=600.0)
    args = parser.parse_args(argv)
    log = configure_logging(args.log_level)

    root = resolve_out(args.out)
    datasets = root / "datasets"

    merged_rows: list[dict[str, Any]] = []
    merged_events: list[dict[str, Any]] = []
    notes: list[str] = []
    feature_ids: list[str] | None = None
    horizons: list[int] | None = None
    digest: str | None = None
    offset = timedelta(0)
    latest: Any = None
    contains_real = False

    for source_id in args.sources:
        directory = datasets / source_id
        require(directory.is_dir(), f"No dataset at {directory}")
        summary = json.loads((directory / "summary.json").read_text(encoding="utf-8"))
        ids = json.loads((directory / "feature_ids.json").read_text(encoding="utf-8"))
        events = json.loads((directory / "events.json").read_text(encoding="utf-8"))
        rows = _read_rows(directory)
        require(bool(rows), f"{source_id} has no rows.")

        # A merge across different feature schemas would produce a dataset whose
        # columns mean different things in different halves, which no shape
        # check downstream would catch.
        if feature_ids is None:
            feature_ids = ids
            horizons = summary.get("horizons")
            digest = summary.get("knowledge_digest")
        else:
            require(
                ids == feature_ids,
                f"{source_id} has a different feature schema; merging would produce "
                "columns that mean different things in different halves.",
            )
            require(
                summary.get("knowledge_digest") == digest,
                f"{source_id} was built against a different knowledge snapshot.",
            )

        first = parse_timestamp(str(rows[0]["timestamp"]))
        if latest is not None:
            offset = (latest + CHUNK_GAP) - first

        for row in rows:
            moved = parse_timestamp(str(row["timestamp"])) + offset
            row = dict(row)
            row["timestamp"] = iso(moved)
            # Ids are unique within a chunk and not between them.
            if row.get("event_id"):
                row["event_id"] = f"{source_id}:{row['event_id']}"
            row["source_dataset"] = source_id
            merged_rows.append(row)
            latest = moved

        for event in events:
            entry = dict(event)
            entry["event_id"] = f"{source_id}:{event['event_id']}"
            for field in ("confirmed_onset", "resolved_at", "detected_at"):
                if entry.get(field):
                    entry[field] = iso(parse_timestamp(str(entry[field])) + offset)
            merged_events.append(entry)

        contains_real = contains_real or bool(summary.get("contains_real_data", False))
        notes.extend(summary.get("notes", []))
        log.info("%s: %d rows, %d events", source_id, len(rows), len(events))

    require(bool(merged_rows), "Nothing to merge.")
    merged_rows.sort(key=lambda row: str(row["timestamp"]))
    for index, row in enumerate(merged_rows):
        row["index"] = index

    events = [FaultEvent.from_json(entry) for entry in merged_events]

    # Recomputed from scratch, never concatenated. Gluing per-chunk splits
    # together would put one fault in train for one chunk and test for another.
    split = chronological_split(
        [parse_timestamp(str(row["timestamp"])) for row in merged_rows],
        events=events,
        train_fraction=args.train_fraction,
        valid_fraction=args.valid_fraction,
        max_lookback_seconds=args.max_lookback_seconds,
        max_horizon_minutes=max(horizons or [30]),
    )
    notes.extend(split.notes)

    # Not caught. A leaking merged dataset must not be written.
    check_leakage(
        split,
        timestamps=[parse_timestamp(str(row["timestamp"])) for row in merged_rows],
        event_ids=[row.get("event_id") for row in merged_rows],
        events=events,
        max_lookback_seconds=args.max_lookback_seconds,
        max_horizon_minutes=max(horizons or [30]),
    )

    for row in merged_rows:
        row["split"] = split.assignments.get(str(row["index"]), "excluded")

    out = datasets / args.into
    out.mkdir(parents=True, exist_ok=True)
    written = _write_rows(out, merged_rows)
    (out / "feature_ids.json").write_text(json.dumps(feature_ids, indent=2), encoding="utf-8")
    (out / "events.json").write_text(json.dumps(merged_events, indent=2), encoding="utf-8")
    (out / "split.json").write_text(json.dumps(split.to_json(), indent=2), encoding="utf-8")

    counts: dict[str, int] = {}
    for row in merged_rows:
        counts[row["split"]] = counts.get(row["split"], 0) + 1

    # The summary schema the trainer reads, not a convenient one.
    #
    # `events` is per output key and counts *confirmed* events -- GOLD or
    # SILVER -- which for synthetic data is zero on every key. Writing a plain
    # total here instead produced "AttributeError: int object has no attribute
    # items" the first time a merged dataset reached the trainer: a merge that
    # writes a different shape from the builder is not a merge.
    output_keys = [
        f"{fault}@{horizon}"
        for fault in sorted({str(e.get("fault_id")) for e in merged_events})
        for horizon in (horizons or [5, 15, 30])
    ]
    confirmed = {key: 0 for key in output_keys}
    positives = {key: 0 for key in output_keys}
    for event in merged_events:
        fault = str(event.get("fault_id"))
        if str(event.get("label_quality", "")).upper() in {"GOLD", "SILVER"}:
            for horizon in horizons or [5, 15, 30]:
                confirmed[f"{fault}@{horizon}"] = confirmed.get(f"{fault}@{horizon}", 0) + 1
    for row in merged_rows:
        for key in output_keys:
            if row.get(f"y::{key}") == 1:
                positives[key] += 1

    summary = {
        "dataset_id": args.into,
        "merged_from": list(args.sources),
        "rows": len(merged_rows),
        "features": len(feature_ids or []),
        "outputs": len(output_keys),
        "horizons": horizons,
        "split_counts": counts,
        "positives": positives,
        "events": confirmed,
        "total_physical_events": len(merged_events),
        "label_quality": {
            quality: sum(1 for e in merged_events if str(e.get("label_quality")) == quality)
            for quality in sorted({str(e.get("label_quality")) for e in merged_events})
        },
        "knowledge_digest": digest,
        "contains_real_data": contains_real,
        "storage": written,
        "notes": notes
        + [
            f"Merged from {len(args.sources)} chunk(s). Each chunk's timeline was shifted "
            f"to follow the previous one with a {CHUNK_GAP} gap, and the split was "
            "recomputed over the whole set rather than concatenated.",
        ],
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"\nMERGED {args.into}")
    print(f"  sources      {', '.join(args.sources)}")
    print(f"  rows         {len(merged_rows)}")
    print(f"  events       {len(merged_events)}")
    print(f"  splits       {counts}")
    print(f"  storage      {written}")
    log.info("wrote %s", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
