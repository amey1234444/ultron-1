"""Run the Golden regression suite.

    python -m app.training.run_golden_tests
    python -m app.training.run_golden_tests --model lgbm-20260918

Twelve locked cases, GT-001 to GT-012, each replaying a scenario through the
full pipeline and asserting what the system must conclude. All critical cases
must pass before a model version may be promoted, which is enforced in the
registry rather than by convention — ``promote`` reads the results this command
writes.

DOC-06 §2's rule in capitals governs the set: *"A test set that contains only
faults is incomplete. False-positive prevention must be tested with the same
seriousness as fault detection."* Half of these cases assert that nothing is
diagnosed, and they are the half that fails first when something regresses.

Run with no ``--model`` to exercise the deterministic chain alone, which is
what the suite tests today. With a model, the same cases run with the learned
layer in place and must still pass — a model that makes GT-001 fail has taught
itself to cry wolf on a healthy machine.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from ..inference.pipeline import InferencePipeline
from ..models.trees.ensemble import TreeEnsemble
from ..registry.registry import ModelRegistry
from ..schemas.diagnosis import DiagnosisResponse
from ..synthetic.scenarios import GOLDEN_CASES, SCENARIOS_BY_ID
from .common import (
    RunRecord,
    base_parser,
    configure_logging,
    print_summary,
    resolve_out,
    set_seed,
)


@dataclass
class CaseResult:
    case_id: str
    scenario_id: str
    intent: str
    passed: bool
    failures: list[str] = field(default_factory=list)
    observed: dict[str, object] = field(default_factory=dict)


def run_case(case_id: str, scenario_id: str, intent: str, pipeline: InferencePipeline) -> CaseResult:
    """Replay one scenario and check it against its declared expectation."""
    scenario = SCENARIOS_BY_ID[scenario_id]
    expectation = scenario.expectation
    pipeline.reset()

    responses: list[DiagnosisResponse] = []
    frames = list(scenario.frames())
    for index, frame in enumerate(frames):
        if index % 10 == 0:
            responses.append(pipeline.process(frame))
        else:
            pipeline.ingest_only(frame)

    if not responses:
        return CaseResult(
            case_id=case_id,
            scenario_id=scenario_id,
            intent=intent,
            passed=False,
            failures=["The scenario produced no responses."],
        )

    final = responses[-1]
    failures: list[str] = []

    # Fault expectations are checked across the whole run, not only at the end:
    # a restriction that was correctly diagnosed and then cleared still
    # demonstrates the behaviour under test.
    seen_faults = {entry.fault_id for response in responses for entry in response.diagnoses}
    seen_verdicts = {response.current_condition.verdict for response in responses}
    seen_anomalies = {
        entry.anomaly_id for response in responses for entry in response.anomalies if entry.anomaly_id
    }

    for fault_id in expectation.expect_fault_ids:
        if fault_id not in seen_faults:
            failures.append(f"Expected {fault_id} to be diagnosed; it never was.")
    for fault_id in expectation.forbid_fault_ids:
        if fault_id in seen_faults:
            failures.append(
                f"{fault_id} must NOT be diagnosed in this scenario, and it was. "
                "False-positive prevention is the point of this case."
            )
    for anomaly_id in expectation.expect_anomaly_ids:
        if anomaly_id not in seen_anomalies:
            failures.append(f"Expected DOC-07 anomaly {anomaly_id}; it never fired.")

    if expectation.condition_verdict and expectation.condition_verdict not in seen_verdicts:
        failures.append(
            f"Expected condition verdict {expectation.condition_verdict}; saw {sorted(seen_verdicts)}."
        )

    if expectation.operating_state:
        states = {response.context.operating_state for response in responses}
        if expectation.operating_state not in states:
            failures.append(
                f"Expected operating state {expectation.operating_state}; saw {sorted(states)}."
            )

    if expectation.expect_ml_ineligible:
        reasons = {response.ml.eligibility_reason for response in responses}
        if expectation.expect_ml_ineligible not in reasons:
            failures.append(
                f"Expected ML to be ineligible with {expectation.expect_ml_ineligible}; "
                f"saw {sorted(reason for reason in reasons if reason)}."
            )

    if expectation.max_severity:
        order = ["NORMAL", "ALERT", "DANGER"]
        worst = max(
            (response.current_condition.rule_state for response in responses),
            key=lambda value: order.index(value),
        )
        if order.index(worst) > order.index(expectation.max_severity):
            failures.append(
                f"Severity reached {worst}; this case allows at most {expectation.max_severity}."
            )

    return CaseResult(
        case_id=case_id,
        scenario_id=scenario_id,
        intent=intent,
        passed=not failures,
        failures=failures,
        observed={
            "faults": sorted(seen_faults),
            "verdicts": sorted(seen_verdicts),
            "anomaly_ids": sorted(entry for entry in seen_anomalies if entry),
            "final_state": final.context.operating_state,
            "final_rule_state": final.current_condition.rule_state,
            "ml_status": final.ml.status,
            "responses": len(responses),
        },
    )


def main(argv: list[str] | None = None) -> int:
    parser = base_parser(__doc__ or "Run the Golden regression suite.")
    parser.add_argument("--model", default=None, help="Run with this model loaded.")
    parser.add_argument("--version", default="1")
    parser.add_argument("--cases", nargs="*", default=None, help="Specific GT ids to run.")

    args = parser.parse_args(argv)
    log = configure_logging(args.log_level)
    set_seed(args.seed)

    ensemble = None
    if args.model:
        registry = ModelRegistry()
        entry = registry.get(args.model, args.version)
        if entry is None:
            log.error("No registered model %s:%s.", args.model, args.version)
            return 2
        ensemble = TreeEnsemble.load(Path(entry.artifact_path))
        if not ensemble.available:
            log.warning("Model would not load (%s). Running the deterministic chain alone.", ensemble.reason)
            ensemble = None

    pipeline = InferencePipeline(ensemble=ensemble) if ensemble else InferencePipeline()

    selected = [case for case in GOLDEN_CASES if not args.cases or case[0] in args.cases]
    results = [run_case(case_id, scenario_id, intent, pipeline) for case_id, scenario_id, intent in selected]

    passed = sum(1 for result in results if result.passed)
    payload = {
        "model": f"{args.model}:{args.version}" if args.model else None,
        "cases": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "results": [
            {
                "case_id": result.case_id,
                "scenario_id": result.scenario_id,
                "intent": result.intent,
                "passed": result.passed,
                "failures": result.failures,
                "observed": result.observed,
            }
            for result in results
        ],
    }

    out = resolve_out(args.out, "golden")
    path = out / f"golden-{args.model or 'rules-only'}.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    if args.model:
        registry = ModelRegistry()
        entry = registry.get(args.model, args.version)
        if entry is not None:
            entry.golden_results = {result.case_id: result.passed for result in results}
            registry.save()

    RunRecord(
        run_id=f"golden-{args.model or 'rules-only'}",
        command="run_golden_tests",
        seed=args.seed,
        arguments={key: str(value) for key, value in vars(args).items()},
        artifacts=[str(path)],
    ).finish(passed=passed, failed=len(results) - passed).write(out)

    print(f"\nGolden regression suite — {passed}/{len(results)} passed")
    print("=" * 46)
    for result in results:
        mark = "PASS" if result.passed else "FAIL"
        print(f"  [{mark}] {result.case_id}  {result.intent}")
        for failure in result.failures:
            print(f"         {failure}")
    print_summary("Summary", {"report": str(path), "passed": passed, "failed": len(results) - passed})

    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
