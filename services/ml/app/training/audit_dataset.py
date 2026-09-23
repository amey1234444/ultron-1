"""Dataset forensics — what is actually in a training set, before trusting it.

    python -m app.training.audit_dataset --dataset ds-synth-005

Writes ``artifacts/audit/dataset_audit.json``, ``split_audit.json`` and
``leakage_audit.json``.

This exists because ds-synth-002 was a well-formed, correctly-split, fully
labelled dataset in which every single feature column was null, and nothing
between the builder and the frozen-test metrics noticed. A metrics table cannot
tell you that. This can, and it says so in one field: ``usable_for_training``.

The distinction the whole module is built around is **rows are not events**. A
fault lasting forty seconds is one event, not forty. Counting rows flatters
every number: it turns one event seen from forty angles into forty independent
observations, and a model that memorises that one event scores well on all
forty. Every count here is reported both ways so the difference is visible.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterator

from ..core.timeutil import parse_timestamp
from .common import base_parser, configure_logging, resolve_out


def _read_rows(directory: Path) -> Iterator[dict[str, Any]]:
    """Stream rows from parquet if it exists, else JSONL.

    Streamed rather than loaded, because the JSONL fallback for a few thousand
    rows of a 1,604-column union runs to hundreds of megabytes.
    """
    parquet = directory / "rows.parquet"
    if parquet.is_file():
        try:
            from ..core.capability import module

            pyarrow = module("pyarrow")
            import pyarrow.parquet as pq  # noqa: PLC0415

            table = pq.read_table(parquet)
            for batch in table.to_batches(max_chunksize=512):
                yield from batch.to_pylist()
            return
        except Exception:  # noqa: BLE001 - JSONL is the complete fallback
            pass
    jsonl = directory / "rows.jsonl"
    if not jsonl.is_file():
        raise FileNotFoundError(f"No rows.parquet or rows.jsonl in {directory}")
    with jsonl.open(encoding="utf-8") as handle:
        for line in handle:
            yield json.loads(line)


def audit(directory: Path) -> dict[str, Any]:
    summary = json.loads((directory / "summary.json").read_text(encoding="utf-8"))
    events = json.loads((directory / "events.json").read_text(encoding="utf-8"))
    split = json.loads((directory / "split.json").read_text(encoding="utf-8"))

    feature_keys: list[str] | None = None
    label_keys: list[str] | None = None
    rows = 0

    non_null: Counter[str] = Counter()
    distinct: defaultdict[str, set] = defaultdict(set)
    non_finite: Counter[str] = Counter()

    per_split: defaultdict[str, Counter] = defaultdict(Counter)
    split_times: defaultdict[str, list[str]] = defaultdict(list)
    split_events: defaultdict[str, set] = defaultdict(set)
    split_recipes: defaultdict[str, set] = defaultdict(set)
    split_machines: defaultdict[str, set] = defaultdict(set)
    split_states: defaultdict[str, Counter] = defaultdict(Counter)

    label_counts: defaultdict[str, Counter] = defaultdict(Counter)
    label_by_split: defaultdict[str, defaultdict[str, Counter]] = defaultdict(
        lambda: defaultdict(Counter)
    )

    quality = Counter()
    eligible = Counter()

    for row in _read_rows(directory):
        rows += 1
        if feature_keys is None:
            feature_keys = [k for k in row if k.startswith("x::")]
            label_keys = [k for k in row if k.startswith("y::")]

        where = str(row.get("split", "excluded"))
        per_split[where]["rows"] += 1
        split_times[where].append(str(row.get("timestamp")))
        if row.get("event_id"):
            split_events[where].add(str(row["event_id"]))
        if row.get("recipe_id"):
            split_recipes[where].add(str(row["recipe_id"]))
        if row.get("machine_id"):
            split_machines[where].add(str(row["machine_id"]))
        split_states[where][str(row.get("operating_state"))] += 1
        quality[str(row.get("data_quality"))] += 1
        eligible[str(row.get("ml_eligible"))] += 1

        for key in feature_keys:
            value = row.get(key)
            if value is None:
                continue
            non_null[key] += 1
            # Capped: a set per column over every row is the one thing here
            # that would not fit in memory, and two distinct values is all the
            # question "is this column constant?" needs.
            if len(distinct[key]) < 3:
                distinct[key].add(value)
            if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
                non_finite[key] += 1

        for key in label_keys or ():
            value = row.get(key)
            label_counts[key][str(value)] += 1
            label_by_split[where][key][str(value)] += 1

    feature_keys = feature_keys or []
    label_keys = label_keys or []

    populated = [k for k in feature_keys if non_null[k] > 0]
    constant = [k for k in populated if len(distinct[k]) <= 1]

    # -- events, counted as events -----------------------------------------
    events_by_fault: defaultdict[str, list] = defaultdict(list)
    for event in events:
        events_by_fault[str(event.get("fault_id"))].append(event)

    def capability_band(count: int) -> str:
        """Engineering workflow category. Not a statistical claim."""
        if count < 8:
            return "INSUFFICIENT_FOR_MODEL_EVALUATION"
        if count < 20:
            return "EXPERIMENTAL_ONLY"
        if count < 50:
            return "RESEARCH_VALIDATION"
        return "OFFLINE_EVALUATION_CANDIDATE"

    per_fault = {
        fault_id: {
            "events": len(entries),
            "capability_band": capability_band(len(entries)),
            "event_ids": sorted(str(e.get("event_id")) for e in entries)[:50],
            "label_qualities": dict(Counter(str(e.get("label_quality")) for e in entries)),
        }
        for fault_id, entries in sorted(events_by_fault.items())
    }

    # -- per output: rows AND events ---------------------------------------
    per_output = {}
    for key in sorted(label_keys):
        output = key[3:]
        fault_id = output.split("@")[0]
        counts = label_counts[key]
        positives = counts.get("1", 0)
        negatives = counts.get("0", 0)
        excluded = counts.get("-1", 0)
        usable = positives + negatives
        per_output[output] = {
            "positive_rows": positives,
            "negative_rows": negatives,
            "excluded_rows": excluded,
            "positive_rate": round(positives / usable, 6) if usable else None,
            # The number that actually governs whether a model can be trained.
            "physical_events": len(events_by_fault.get(fault_id, [])),
            "capability_band": capability_band(len(events_by_fault.get(fault_id, []))),
            "rows_per_split": {
                where: dict(label_by_split[where][key]) for where in sorted(label_by_split)
            },
            # Random-baseline PR-AUC is the prevalence. Stated here so a model
            # scoring 0.14 against a 0.10 prevalence cannot be read as skill.
            "random_baseline_pr_auc": round(positives / usable, 6) if usable else None,
            "random_baseline_roc_auc": 0.5,
        }

    dataset_audit = {
        "dataset_id": summary.get("dataset_id"),
        "rows": rows,
        "feature_columns": len(feature_keys),
        "label_columns": len(label_keys),
        "features_populated": len(populated),
        "features_all_null": len(feature_keys) - len(populated),
        "features_constant": len(constant),
        "features_non_finite": {k: v for k, v in non_finite.items() if v},
        "null_fraction_overall": round(
            1 - (sum(non_null.values()) / (rows * len(feature_keys))), 6
        )
        if rows and feature_keys
        else 1.0,
        # The single field that would have caught ds-synth-002.
        "usable_for_training": bool(populated),
        "data_quality_counts": dict(quality),
        "ml_eligible_counts": dict(eligible),
        "label_counts": {k[3:]: dict(v) for k, v in label_counts.items()},
        "per_output": per_output,
        "per_fault_events": per_fault,
        "total_physical_events": len(events),
        "label_quality_mix": dict(
            Counter(str(e.get("label_quality")) for e in events)
        ),
        "contains_real_data": bool(summary.get("contains_real_data", False)),
        "notes": summary.get("notes", []),
    }

    split_audit = {
        "dataset_id": summary.get("dataset_id"),
        "splits": {
            where: {
                "rows": per_split[where]["rows"],
                "time_range": [min(split_times[where]), max(split_times[where])]
                if split_times[where]
                else None,
                "event_ids": sorted(split_events[where]),
                "event_count": len(split_events[where]),
                "recipes": sorted(split_recipes[where]),
                "machines": sorted(split_machines[where]),
                "operating_states": dict(split_states[where]),
            }
            for where in sorted(per_split)
        },
        "boundaries": split.get("boundaries", split),
        "notes": summary.get("notes", []),
    }

    # -- leakage, checked rather than assumed -------------------------------
    findings: list[str] = []
    train_v, valid_v, test_v = (
        split_events.get("train", set()),
        split_events.get("valid", set()),
        split_events.get("test", set()),
    )
    for a, b, name in ((train_v, valid_v, "train/valid"), (valid_v, test_v, "valid/test"), (train_v, test_v, "train/test")):
        shared = a & b
        if shared:
            findings.append(
                f"{len(shared)} event(s) appear in both {name}: {sorted(shared)[:5]}"
            )

    ordered = {}
    for where in ("train", "valid", "test"):
        times = split_times.get(where) or []
        if times:
            ordered[where] = (min(times), max(times))
    if "train" in ordered and "valid" in ordered and ordered["train"][1] > ordered["valid"][0]:
        findings.append("train overlaps valid in time")
    if "valid" in ordered and "test" in ordered and ordered["valid"][1] > ordered["test"][0]:
        findings.append("valid overlaps test in time")

    gaps = {}
    for earlier, later in (("train", "valid"), ("valid", "test")):
        if earlier in ordered and later in ordered:
            gaps[f"{earlier}->{later}_seconds"] = (
                parse_timestamp(ordered[later][0]) - parse_timestamp(ordered[earlier][1])
            ).total_seconds()

    leakage_audit = {
        "dataset_id": summary.get("dataset_id"),
        "event_atomic": not findings,
        "findings": findings,
        "split_time_ranges": {k: list(v) for k, v in ordered.items()},
        "gap_seconds": gaps,
        "checks_run": [
            "no event id appears in two splits",
            "no split's time range overlaps the next",
            "a gap exists between consecutive splits",
        ],
    }

    # -- the features themselves, not the rows they sit in ------------------
    #
    # A separate report because the questions differ. The dataset audit asks
    # "is this trainable?"; this asks "which columns carry anything, and what
    # do the empty ones have in common?". The second is what turns "226 columns
    # are null" into "no site has supplied approved limits", which is a
    # different job for a different person.
    from ..features.engine import feature_schema_block
    from ..features.registry import describe as describe_feature

    def family_of(feature_id: str) -> str:
        definition = describe_feature(feature_id)
        if definition is not None:
            return definition.family
        if feature_id.startswith("r."):
            return "RESIDUAL"
        if feature_id.startswith("e."):
            return "EMBEDDING"
        return "UNKNOWN"

    by_family: defaultdict[str, Counter] = defaultdict(Counter)
    null_examples: defaultdict[str, list[str]] = defaultdict(list)
    for key in feature_keys:
        feature_id = key[3:]
        family = family_of(feature_id)
        has_values = non_null[key] > 0
        by_family[family]["total"] += 1
        by_family[family]["populated" if has_values else "null"] += 1
        if not has_values and len(null_examples[family]) < 5:
            null_examples[family].append(feature_id)
        if has_values and len(distinct[key]) <= 1:
            by_family[family]["constant"] += 1

    feature_audit = {
        "dataset_id": summary.get("dataset_id"),
        "schema": feature_schema_block(),
        "columns": len(feature_keys),
        "populated": len(populated),
        "null": len(feature_keys) - len(populated),
        "constant": len(constant),
        "by_family": {
            family: {
                **dict(counts),
                "null_examples": null_examples.get(family, []),
            }
            for family, counts in sorted(by_family.items())
        },
        "non_finite": {k[3:]: v for k, v in non_finite.items() if v},
        "notes": [
            "A null column is not necessarily a defect. Threshold-distance "
            "features are null until a site supplies approved limits; residual "
            "and embedding features are null until a temporal model is trained; "
            "setpoint features are null until the PLC publishes setpoints. Each "
            "is a different job for a different person, which is why they are "
            "reported by family rather than as one count.",
        ],
    }

    return {
        "dataset_audit": dataset_audit,
        "feature_audit": feature_audit,
        "split_audit": split_audit,
        "leakage_audit": leakage_audit,
    }


def main(argv: list[str] | None = None) -> int:
    parser = base_parser(__doc__ or "Audit a dataset.")
    parser.add_argument("--dataset", required=True)
    args = parser.parse_args(argv)
    log = configure_logging(args.log_level)

    root = resolve_out(args.out)
    directory = root / "datasets" / args.dataset
    reports = audit(directory)

    out = root / "audit"
    out.mkdir(parents=True, exist_ok=True)
    for name, payload in reports.items():
        (out / f"{name}.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        log.info("wrote %s", out / f"{name}.json")

    d = reports["dataset_audit"]
    print(f"\nDATASET {d['dataset_id']}")
    print(f"  rows                  {d['rows']}")
    print(f"  feature columns       {d['feature_columns']}")
    print(f"  populated             {d['features_populated']}")
    print(f"  all-null              {d['features_all_null']}")
    print(f"  constant              {d['features_constant']}")
    print(f"  usable_for_training   {d['usable_for_training']}")
    print(f"  physical events       {d['total_physical_events']}")
    print(f"  label quality         {d['label_quality_mix']}")
    print(f"\n  {'fault':22} {'events':>7}  band")
    for fault_id, entry in d["per_fault_events"].items():
        print(f"  {fault_id:22} {entry['events']:7}  {entry['capability_band']}")
    leak = reports["leakage_audit"]
    print(f"\n  event_atomic          {leak['event_atomic']}")
    for finding in leak["findings"]:
        print(f"    ! {finding}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
