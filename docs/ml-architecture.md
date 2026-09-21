# ULTRON predictive diagnosis and prognosis

Written for: engineers joining the ULTRON codebase who need to know where the
ML layer sits, what it is allowed to do, and what it is currently worth.

---

## The one-paragraph version

The Analyzer's existing DOC-02 → DOC-05 chain runs in the browser, judges one
frame at a time, and is authoritative. A new Python service
([services/ml/](../services/ml/)) adds everything temporal and learned: rolling
windows, a versioned feature engine, contextual baselines, an LSTM, LightGBM
and XGBoost, calibration, SHAP, and a decision filter. It is **advisory**. With
`ML_SERVICE_URL` unset, or the service down, or every model failing to load,
the Analyzer behaves exactly as it did before and says why the Prognosis tab is
empty.

There is no trained fault model. The pipeline is complete and tested; the
models are not, because no confirmed production fault history exists yet.

---

## Why it is not one neural network

Four questions, which look similar and are not:

| | Question | Answered by |
|---|---|---|
| **Detection** | What is abnormal right now? | Contextual baselines, DOC-04 §3 gates |
| **Diagnosis** | Which physical fault explains the evidence? | DOC-04 patterns + fault library + evidence model |
| **Prognosis** | What may develop in the next few minutes? | LightGBM, per fault per horizon |
| **Explanation** | Why does ULTRON think this? | DOC-07 for the physics, SHAP for the model |
| **Decision** | How serious, how sure, how urgent, what to do? | DOC-05, five outputs kept apart |

A single network answering all five would have no access to approved limits, no
evidence model, no way to say "I don't know", and no way to stop a probability
lowering a severity. Each component below exists because a specific failure is
otherwise unpreventable.

---

## Where things live

```
lib/knowledge/           DOC-01..07 as TypeScript. The source of truth.
lib/knowledge/tse/pipeline.ts
                         The existing single-frame chain. Still runs, still
                         authoritative, unchanged by any of this.
lib/knowledge/ml/contract.ts
                         The response contract, mirrored from Python, with a
                         validating parser rather than a cast.

scripts/exportKnowledge.ts
                         Writes the knowledge to services/ml/knowledge/*.json,
                         hash-pinned. `npm run check:knowledge-export` fails the
                         build if it is stale.

services/ml/             The Python service. See its README for the internals.

src/server/mlClient.ts   Timeouts, one retry, and a degraded result rather than
                         a thrown exception. Returns MlResult, so a caller
                         cannot use the payload without handling its absence.
src/server/mlPersistence.ts
                         ml_* tables. Lineage as columns, evidence as JSON.
src/pages/api/ml/*       diagnosis, prognosis, explanation, feedback, health.

components/console/machine/ml/
                         PrognosisPanel, ExplanationPanel, useMlDiagnosis.
                         Wired as a fourth tab on the twin-screw Analyzer.
```

### The knowledge bridge

Ninety faults, forty anomalies, sixty signals, thirteen operating states and
forty-nine formulas live in TypeScript. Retyping them in Python would create a
second copy that is wrong within a release, so `scripts/exportKnowledge.ts`
generates a JSON snapshot with a sha256 per file, and the Python loader
verifies every hash at startup. A half-updated snapshot fails at boot rather
than producing diagnoses that cite ids nothing else recognises.

`app/knowledge/enums.py` declares the shared vocabulary as Python literals, and
a test asserts every one of them against `enums.json`. A severity renamed on
the TypeScript side fails the Python suite on the next export.

---

## The chain

```
telemetry frame
  ↓ schema validation
  ↓ data quality           DQ-001..010, four verdicts
  ↓ rolling window store   time-based, gaps recorded as gaps
  ↓ operating state        ST-00..12, with measured stability
  ↓ context + context_id   banded, stable across processes
  ↓ feature engine         1,572 declared features
  ↓ contextual baselines   learned, with eligibility rules
  ↓ deterministic rules    approved limits, authority ladder
  ├──────────── everything below this line is advisory ────────────
  ↓ ML eligibility gate    refuses with a structured reason
  ↓ LSTM                   forecast → residuals + 32-D embedding
  ↓ feature union          1,652 columns, fixed order
  ↓ LightGBM / XGBoost     independent binary per fault per horizon
  ↓ calibration            Platt or isotonic, on validation only
  ↓ persistence filter     N-of-M, hysteresis, cooldown
  ↓ DOC-04 / DOC-07        pattern → fault → evidence → alternatives
  ↓ DOC-05 decision        severity / confidence / impact / priority / action
  ↓ versioned response
```

**Everything above the advisory line runs unconditionally.** No module imports
TensorFlow, LightGBM or SHAP at module scope; `app/core/capability.py` probes
them lazily and records why an import failed, and a test asserts that importing
`app` with the heavy libraries hidden still succeeds. A model that will not
load produces `ML_STATUS = DEGRADED` with a reason, and the operator still gets
the deterministic verdict, the anomalies, the severity and the action.

---

## Separations the code enforces

These are not conventions. Each is structural, and each has a test naming the
failure it prevents.

**Severity is computed before confidence exists.** `DecisionEngine._severity`
takes the diagnosis and the rule result and nothing else. DOC-05 §16's
failure — an approved Danger downgraded because the model was unsure — cannot
be written without adding a parameter, and a test asserts the signature.

**A learned anomaly cannot reach DANGER.** The authority ladder floors
`ULTRON_LEARNED` at NORMAL. Analytics may raise severity to ALERT when several
independent signals agree; only an approved limit or a trip reaches DANGER.

**Three confidences, not one.** Fault, location and root cause are separate
fields with separate scores, and they routinely disagree — a restriction can be
near-certain while *why* the screen loaded up is a list nobody can separate
without opening the machine.

**A probability is never a severity, a confidence or a priority.** Risk lives
on `diagnoses[].risk[]`, a different field of a different type from
`diagnoses[].severity`. The UI renders them in different tabs with different
visual language, and an uncrossed risk is muted however high it is.

**Unknown stays unknown.** A strong multi-signal anomaly matching no pattern
returns `FAULT_UNKNOWN`. The nearest known fault is not offered, because the
nearest fault to an unknown one is a wrong answer with a fault id attached.

**Instrumentation is cleared before physics.** When one signal claims something
dramatic and everything that would have to corroborate it does not, the
measurement chain is the suspect. The check is relative, not absolute: a
transmitter drifting fifty per cent over fifteen minutes never crosses a fixed
threshold, and that is exactly the case worth catching.

**Synthetic never silently becomes real.** Every generated frame carries
`data_source: SYNTHETIC`, every scenario event is `BRONZE`, every model fitted
from them records `trained_on_real_data: false`, the registry refuses to
promote such a model, and the Analyzer says so wherever its risk would show.

---

## Modes

| `ML_MODE` | Models run | Persisted | Operators alerted |
|---|---|---|---|
| `disabled` | no | no | no |
| `shadow` | **yes** | **yes** | no |
| `canary` | yes | yes | only the named machines and faults |
| `production` | yes | yes | yes |

Shadow is the default and produces data: engineering compares what the model
predicted against what actually happened, over weeks, before anyone is paged.
Rolling back is one environment variable.

---

## Promotion is gated

Four conditions, all of which must hold:

1. frozen-test metrics exist;
2. every Golden case passes;
3. the model was trained on real confirmed events;
4. a named engineer approved it.

`python -m app.training.promote_model --model X --check` lists the blockers.
Condition 3 is the one that currently refuses everything, and it is meant to.

---

## Current state, honestly

**Working and tested.** The whole chain above. 12/12 Golden cases pass on the
deterministic path. The leakage guards fire on deliberately broken splits. The
DOC-05 separations are enforced structurally. The full lifecycle — build
dataset → train → calibrate → evaluate → golden → promote — has been exercised
end to end, and the promotion correctly refused.

**Measured, and poor.** The synthetic exercise produced PR-AUC between 0.03 and
0.14 on the frozen test split, with zero events detected. That is the right
outcome for a model fitted on six generated events, and it is reported rather
than hidden. Nothing here should be read as a claim about real-world accuracy.

**What it needs.** Confirmed fault events with GOLD or SILVER labels. Eight per
fault is the floor below which the trainer refuses to fit at all, and that
floor is generous. Until then, every finding the Analyzer shows comes from the
deterministic DOC-02..DOC-05 chain — which is exactly where it should come
from.

**Known gaps.**

- Nine of thirty-six mandatory DOC-02 signals have no instrument or no
  integration on this machine (run states, mode, trip bits, zone setpoints,
  recipe id). Until they arrive the operating state is inferred rather than
  declared, which caps every downstream confidence. The Signals tab lists them.
- No site has supplied approved Alert or Danger limits, so
  `configs/limits/` is empty and threshold-distance features are null. That is
  the honest state, not a bug.
- Baselines are engineering-development template references, not field
  calibrated. Every response carries the commissioning notice saying so.
