"""Build a training dataset.

    python -m app.training.build_dataset --source synthetic --dataset-id ds-001

Replays telemetry through the serving pipeline, labels it from confirmed
events, splits it chronologically with a leakage gap, verifies the split and
writes the result with its full provenance.

The ``--source synthetic`` path is for exercising the pipeline. Every row it
produces is marked SYNTHETIC and every event BRONZE, and a model trained from
it cannot be promoted to champion without an explicit override. That marking is
the whole reason the flag is named after the source rather than being a silent
default.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..datasets.builder import DatasetBuilder
from ..inference.pipeline import InferencePipeline
from ..labels.events import FaultEvent, LabelPolicy
from ..models.trees.common import DEFAULT_HORIZONS
from ..schemas.telemetry import TelemetryFrame
from ..synthetic.scenarios import SCENARIOS
from .common import (
    RunRecord,
    base_parser,
    configure_logging,
    load_scenario_frames,
    print_summary,
    require,
    resolve_out,
    set_seed,
)


def main(argv: list[str] | None = None) -> int:
    parser = base_parser(__doc__ or "Build a training dataset.")
    parser.add_argument("--dataset-id", required=True, help="Identifier for this dataset version.")
    parser.add_argument(
        "--source",
        choices=("synthetic", "jsonl"),
        default="synthetic",
        help="Where the telemetry comes from.",
    )
    parser.add_argument(
        "--frames",
        type=Path,
        default=None,
        help="JSONL of canonical telemetry frames, for --source jsonl.",
    )
    parser.add_argument(
        "--events",
        type=Path,
        default=None,
        help="JSON array of confirmed fault events, for --source jsonl.",
    )
    parser.add_argument(
        "--scenarios",
        nargs="*",
        default=None,
        help="Scenario ids to replay. Defaults to the whole catalogue.",
    )
    parser.add_argument(
        "--repeats",
        type=int,
        default=1,
        help=(
            "Replay the scenario set N times with different seeds. A fault that occurs "
            "once lands entirely in one chronological split, so a single pass produces a "
            "dataset no fault can be trained and validated on."
        ),
    )
    parser.add_argument(
        "--horizons",
        nargs="*",
        type=int,
        default=list(DEFAULT_HORIZONS),
        help="Prognosis horizons in minutes.",
    )
    parser.add_argument(
        "--emit-every",
        type=int,
        default=5,
        help="Emit one row per N frames. Windows are still updated on every frame.",
    )
    parser.add_argument(
        "--max-lookback-seconds",
        type=float,
        default=600.0,
        help="Longest window any feature or model uses. Sets the leakage gap.",
    )
    parser.add_argument("--train-fraction", type=float, default=0.70)
    parser.add_argument("--valid-fraction", type=float, default=0.15)
    parser.add_argument(
        "--allow-unverified",
        action="store_true",
        help="Include UNVERIFIED and BRONZE labels as positives. Required for synthetic.",
    )

    args = parser.parse_args(argv)
    log = configure_logging(args.log_level)
    set_seed(args.seed)

    if args.source == "synthetic":
        scenario_ids = args.scenarios or [entry.scenario_id for entry in SCENARIOS]
        log.info("Replaying %d synthetic scenarios.", len(scenario_ids))
        frames, events = load_scenario_frames(scenario_ids, repeats=args.repeats)
        # Synthetic events are BRONZE, so positives only exist if untrusted
        # labels are admitted. Forcing the flag on means nobody builds a
        # synthetic dataset believing it contains verified truth.
        allow_unverified = True
    else:
        require(args.frames is not None, "--frames is required for --source jsonl")
        frames = [
            TelemetryFrame.model_validate(json.loads(line))
            for line in args.frames.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        events = (
            [FaultEvent.from_json(row) for row in json.loads(args.events.read_text(encoding="utf-8"))]
            if args.events
            else []
        )
        allow_unverified = args.allow_unverified

    log.info("%d frames, %d events.", len(frames), len(events))

    policy = LabelPolicy(
        horizons_minutes=tuple(args.horizons),
        trusted_only=not allow_unverified,
    )
    builder = DatasetBuilder(
        horizons=tuple(args.horizons), policy=policy, emit_every=args.emit_every
    )

    record = RunRecord(
        run_id=args.dataset_id,
        command="build_dataset",
        seed=args.seed,
        dataset_id=args.dataset_id,
        arguments=vars(args) | {"frames": str(args.frames), "events": str(args.events)},
    )

    dataset = builder.build(
        dataset_id=args.dataset_id,
        frames=frames,
        events=events,
        pipeline=InferencePipeline(),
        max_lookback_seconds=args.max_lookback_seconds,
        train_fraction=args.train_fraction,
        valid_fraction=args.valid_fraction,
    )

    out = resolve_out(args.out, "datasets")
    path = dataset.write(out / args.dataset_id)
    record.artifacts.append(str(path))
    record.notes.extend(dataset.notes)
    record.finish(**{key: value for key, value in dataset.summary().items() if key != "notes"})
    record.write(out / args.dataset_id)

    print_summary(f"Dataset {args.dataset_id}", dataset.summary())
    for note in dataset.notes:
        print(f"  note: {note}")
    print(f"  written to: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
