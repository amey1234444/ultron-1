"""Promote a model to champion, or explain why it cannot be.

    python -m app.training.promote_model --model lgbm-20260918 --approved-by "A. Engineer"
    python -m app.training.promote_model --model lgbm-20260918 --check

Promotion is gated, not a copy. Four conditions, all of which must hold:

  - frozen-test metrics exist;
  - the Golden regression suite passes;
  - the model was trained on real confirmed events;
  - a named engineer approves it.

The third is the one that bites today, and it is meant to. Every artifact this
codebase can currently produce was fitted on synthetic scenarios, and none may
become champion without ``ML_ALLOW_UNTRAINED_CHAMPION=true`` being set
deliberately by somebody who knows what they are doing. That flag exists to
test the promotion path itself, not to ship a model.

``--check`` reports the blockers without attempting anything, which is what to
run before wondering why a promotion failed.

``--demote`` is the rollback, and takes only a model id and a reason, because a
rollback under pressure should have nothing in it to get wrong.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..core.config import settings
from ..core.errors import PromotionRefused
from ..registry.registry import ModelRegistry
from .common import RunRecord, base_parser, configure_logging, print_summary, resolve_out


def main(argv: list[str] | None = None) -> int:
    parser = base_parser(__doc__ or "Promote a model to champion.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--version", default="1")
    parser.add_argument("--approved-by", default=None, help="The engineer approving this.")
    parser.add_argument("--note", default=None)
    parser.add_argument(
        "--check", action="store_true", help="Report the blockers without promoting."
    )
    parser.add_argument("--demote", action="store_true", help="Roll this model back to ARCHIVED.")
    parser.add_argument("--reason", default=None, help="Why, for a demotion.")
    parser.add_argument(
        "--golden",
        type=Path,
        default=None,
        help="Golden results JSON. Defaults to the one run_golden_tests wrote.",
    )

    args = parser.parse_args(argv)
    log = configure_logging(args.log_level)
    registry = ModelRegistry()

    entry = registry.get(args.model, args.version)
    if entry is None:
        log.error("No registered model %s:%s.", args.model, args.version)
        return 2

    if args.demote:
        if not args.reason:
            log.error("--demote requires --reason. A rollback nobody explained is a mystery later.")
            return 2
        registry.demote(args.model, args.version, reason=args.reason)
        print_summary(
            f"Demoted {args.model}:{args.version}",
            {"role": "ARCHIVED", "reason": args.reason},
        )
        return 0

    golden = _load_golden(args.golden, args.model, args.out)
    if golden:
        entry.golden_results = golden

    if args.check:
        blockers = registry.promotion_blockers(entry)
        print_summary(
            f"Promotion check for {args.model}:{args.version}",
            {
                "current_role": entry.role,
                "trained_on_real_data": entry.trained_on_real_data,
                "has_test_metrics": bool(entry.test_metrics),
                "golden_cases": len(entry.golden_results),
                "golden_failing": sorted(
                    name for name, passed in entry.golden_results.items() if not passed
                ),
                "blockers": blockers or ["none"],
                "allow_untrained_champion": settings().allow_untrained_champion,
            },
        )
        return 0 if not blockers else 1

    if not args.approved_by:
        log.error("--approved-by is required. Promotion records a named engineer.")
        return 2

    try:
        promoted = registry.promote(
            args.model,
            args.version,
            approved_by=args.approved_by,
            note=args.note,
            golden_results=golden or None,
        )
    except PromotionRefused as refusal:
        print("\nPromotion refused")
        print("=================")
        for reason in refusal.reasons:
            print(f"  - {reason}")
        print()
        return 1

    RunRecord(
        run_id=f"promote-{args.model}",
        command="promote_model",
        arguments={key: str(value) for key, value in vars(args).items()},
    ).finish(role=promoted.role).write(Path(promoted.artifact_path))

    print_summary(
        f"Promoted {args.model}:{args.version}",
        {
            "role": promoted.role,
            "promoted_at": promoted.promoted_at,
            "approved_by": promoted.approved_by,
            "trained_on_real_data": promoted.trained_on_real_data,
        },
    )
    return 0


def _load_golden(path: Path | None, model_id: str, out: Path | None) -> dict[str, bool]:
    candidate = path or (resolve_out(out, "golden") / f"golden-{model_id}.json")
    if not candidate.is_file():
        return {}
    try:
        payload = json.loads(candidate.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    return {result["case_id"]: bool(result["passed"]) for result in payload.get("results", [])}


if __name__ == "__main__":
    raise SystemExit(main())
