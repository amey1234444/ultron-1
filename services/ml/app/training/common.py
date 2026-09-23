"""Shared plumbing for the training commands.

Every entry point under ``app.training`` is runnable as
``python -m app.training.<name> --help`` and every one of them records the same
provenance: the code revision, the knowledge digest, the random seed, the
environment and the dataset it saw. A training run whose inputs cannot be
reconstructed is an anecdote.

Seeding is done in one place for the same reason. ``set_seed`` touches Python's
RNG, numpy's and TensorFlow's together, because seeding two of the three
produces a run that is *nearly* reproducible, which is the worst outcome —
reproducible enough to be trusted and not reproducible enough to be right.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import platform
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

from ..core.config import settings
from ..core.timeutil import iso, now as utc_now
from ..core.versions import version_block
from ..knowledge.loader import knowledge

DEFAULT_SEED = 20260918


def configure_logging(level: str | None = None) -> logging.Logger:
    logging.basicConfig(
        level=(level or settings().log_level),
        format="%(asctime)s %(levelname)-7s %(name)s  %(message)s",
    )
    return logging.getLogger("ultron.ml.training")


def set_seed(seed: int = DEFAULT_SEED) -> None:
    """Seed every RNG that can affect a fit, in one call."""
    import random

    random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)

    try:
        import numpy

        numpy.random.seed(seed)
    except Exception:  # noqa: BLE001 - numpy is optional for some commands
        pass

    try:
        import tensorflow

        tensorflow.random.set_seed(seed)
    except Exception:  # noqa: BLE001 - TensorFlow is optional
        pass


def code_revision() -> str | None:
    """The git commit this run was made from, when there is one."""
    try:
        result = subprocess.run(  # noqa: S603, S607 - fixed argv, no shell
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        return result.stdout.strip() or None
    except Exception:  # noqa: BLE001 - not a git checkout, or no git
        return None


def environment() -> dict[str, str]:
    """Dependency versions, so a result can be reproduced or explained."""
    from ..core.capability import capabilities

    out: dict[str, str] = {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
    }
    for name, capability in capabilities().items():
        out[name] = capability.version or ("unavailable" if not capability.available else "unknown")
    return out


@dataclass
class RunRecord:
    """Everything about one training run, written next to its artifact."""

    run_id: str
    command: str
    started_at: str = field(default_factory=lambda: iso(utc_now()))
    finished_at: str | None = None
    seed: int = DEFAULT_SEED
    dataset_id: str | None = None
    arguments: dict[str, Any] = field(default_factory=dict)
    metrics: dict[str, Any] = field(default_factory=dict)
    artifacts: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    code_revision: str | None = field(default_factory=code_revision)
    knowledge_digest: str = field(default_factory=lambda: knowledge().digest())
    versions: dict[str, str] = field(default_factory=version_block)
    environment: dict[str, str] = field(default_factory=environment)

    def finish(self, **metrics: Any) -> "RunRecord":
        self.finished_at = iso(utc_now())
        self.metrics.update(metrics)
        return self

    def write(self, directory: Path) -> Path:
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"run-{self.run_id}.json"
        path.write_text(json.dumps(self.__dict__, indent=2, default=str), encoding="utf-8")
        return path


def base_parser(description: str) -> argparse.ArgumentParser:
    """The flags every training command shares."""
    parser = argparse.ArgumentParser(
        description=description,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="Random seed for this run.")
    parser.add_argument(
        "--log-level", default=None, help="DEBUG, INFO, WARNING. Defaults to ML_LOG_LEVEL."
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory. Defaults to the configured artifacts directory.",
    )
    return parser


def resolve_out(argument: Path | None, *parts: str) -> Path:
    base = argument or settings().artifacts_dir
    path = base.joinpath(*parts)
    path.mkdir(parents=True, exist_ok=True)
    return path


def print_summary(title: str, payload: dict[str, Any]) -> None:
    """Human-readable output. These commands are run by people, at a terminal."""
    print(f"\n{title}")
    print("=" * len(title))
    for key, value in payload.items():
        if isinstance(value, dict):
            print(f"  {key}:")
            for inner_key, inner_value in value.items():
                print(f"    {inner_key}: {inner_value}")
        elif isinstance(value, list) and len(value) > 6:
            print(f"  {key}: {len(value)} entries")
        else:
            print(f"  {key}: {value}")
    print()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"error: {message}")


def load_scenario_frames(
    scenario_ids: Sequence[str],
    machine_id: str = "TSE-01",
    *,
    repeats: int = 1,
    interleave: bool = True,
):  # type: ignore[no-untyped-def]
    """Frames and events from the synthetic catalogue, laid out in time.

    ``repeats`` replays the catalogue several times with different seeds, and
    ``interleave`` alternates the scenarios rather than running all repeats of
    one before the next. Both exist for the same reason: a chronological split
    puts a fault that occurs once entirely in one split, so a single pass
    produces a dataset in which no fault appears in both train and validation.
    That is correct splitting behaviour and a useless dataset, and the fix is
    more events spread across the timeline — which is also what a real site
    would have.

    Every event produced here is BRONZE and SYNTHETIC. That marking is what
    stops a model fitted from these ever becoming champion without an explicit
    override, and it is set here rather than by the caller so it cannot be
    forgotten.
    """
    import random as _random
    from dataclasses import replace
    from datetime import timedelta

    from ..labels.events import FaultEvent
    from ..synthetic.generator import STEADY_LEVELS
    from ..synthetic.scenarios import SCENARIOS_BY_ID

    order: list[tuple[int, str]] = []
    if interleave:
        for repeat in range(repeats):
            order.extend((repeat, scenario_id) for scenario_id in scenario_ids)
    else:
        for scenario_id in scenario_ids:
            order.extend((repeat, scenario_id) for repeat in range(repeats))

    frames = []
    events = []
    cursor = None

    for index, (repeat, scenario_id) in enumerate(order):
        base = SCENARIOS_BY_ID[scenario_id]
        # Every replay is a different realisation of the same fault, not the
        # same trajectory with a different noise seed.
        #
        # A new seed alone leaves the onset, the duration and the development
        # rate byte-for-byte identical, so twelve repeats produced one
        # restriction seen twelve times rather than twelve restrictions. A model
        # can memorise that shape without learning the relationship, and nothing
        # in the metrics would show the difference.
        #
        # Drawn from a generator seeded on the scenario and the repeat, so the
        # variation is exactly as reproducible as the noise it sits beside.
        jitter = _random.Random(base.seed * 7919 + repeat)
        onset = base.onset_second
        if onset is not None:
            # +/-40% of the declared onset, floored so a fault never begins
            # before there is enough history to have noticed it.
            span = max(int(onset * 0.4), 1)
            onset = max(60, onset + jitter.randint(-span, span))
        scenario = replace(
            base,
            seed=base.seed + repeat * 977,
            onset_second=onset,
            duration_seconds=max(
                300, int(base.duration_seconds * jitter.uniform(0.8, 1.25))
            ),
            progression_rate=jitter.uniform(0.6, 1.6),
            # A small standing offset per tag, within what a healthy transmitter
            # drifts to. A generator that starts every tag at exactly its
            # template value teaches a model that the template value is normal,
            # which no instrument on a real machine agrees with.
            sensor_bias={tag: jitter.gauss(0.0, 0.004) for tag in STEADY_LEVELS},
        )
        scenario_frames = list(scenario.frames(machine_id=machine_id, start=cursor))
        if not scenario_frames:
            continue
        frames.extend(scenario_frames)
        # A gap between scenarios, so one run's tail is not read as continuous
        # with the next one's head.
        cursor = scenario_frames[-1].timestamp + timedelta(minutes=30)

        if scenario.fault_id and scenario.onset_second is not None:
            onset = scenario_frames[0].timestamp + timedelta(seconds=scenario.onset_second)
            events.append(
                FaultEvent(
                    event_id=f"EV-{scenario.scenario_id}-{index}",
                    machine_id=machine_id,
                    fault_id=scenario.fault_id,
                    fault_family="",
                    confirmed_onset=onset,
                    onset_uncertainty_seconds=0.0,
                    resolved_at=scenario_frames[-1].timestamp,
                    confirmation_source="SYNTHETIC_SCENARIO",
                    label_quality="BRONZE",
                    data_source="SYNTHETIC",
                    scenario_id=scenario.scenario_id,
                    notes="Generated by the scenario generator. Not a real machine event.",
                )
            )

    return frames, events
