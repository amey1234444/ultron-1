# ULTRON ML service

Predictive diagnosis and prognosis for the twin-screw extruder.

**Read this first.** There is no trained fault model here. This repository
contains the complete pipeline — ingestion, quality, state, context, features,
baselines, deterministic rules, temporal model, tree ensembles, calibration,
explanation, DOC-04/DOC-07 resolution, DOC-05 decision, persistence filtering,
an API and a model registry — built so that when real historical telemetry and
confirmed maintenance labels arrive, models can be trained without redesigning
the application.

Every artifact the codebase can currently produce is fitted on synthetic
scenarios. Those artifacts are marked `trained_on_real_data: false`, the
registry refuses to promote them to champion, and the Analyzer says so wherever
a risk from one would be shown. None of the numbers they produce is evidence
about a real machine.

---

## Where this sits

```
ULTRON WEB (Next.js)                     this service (Python + FastAPI)
  lib/knowledge/doc0*  DOC-01..07  ──┐
  lib/knowledge/tse/pipeline.ts      │   npm run export:knowledge
    single-frame DOC-02→05 chain,    ├──────────────────────────────▶ knowledge/*.json
    runs in the browser, authoritative│                                (hash-pinned)
                                      │
  src/server/mlClient.ts  ────────────┼── HTTP ──▶  app/api      versioned diagnosis
  src/pages/api/ml/*                  │             app/inference/pipeline.py
  components/console/machine/ml/*  ◀──┘             app/models, app/decision, ...
```

The TypeScript knowledge layer is the **single source of truth** for the ninety
faults, forty anomalies, sixty signals, thirteen operating states and
forty-nine formulas. `scripts/exportKnowledge.ts` writes them to `knowledge/`
as a hash-pinned snapshot; this service loads and verifies it at startup and
refuses to run against a snapshot that does not match its manifest.

`npm run check:knowledge-export` fails the build if the snapshot is stale.

---

## The architecture, and why it is not one model

Four different questions, four different mechanisms:

| Question | Answered by |
|---|---|
| **Detection** — what is abnormal right now? | Contextual baselines and the DOC-04 §3 gates |
| **Diagnosis** — which fault explains the evidence? | DOC-04 patterns, the fault library, the evidence model |
| **Prognosis** — what may develop in the next few minutes? | LightGBM per fault per horizon, over the feature union |
| **Explanation** — why does ULTRON think this? | DOC-07 knowledge for the physics, SHAP for the model |
| **Decision** — how serious, how sure, how urgent, what to do? | DOC-05, five outputs kept separate |

A single network cannot answer these. It would have no access to approved
limits, no evidence model, no way to say "I don't know", and no way to keep a
severity from being lowered by a probability. The hybrid is not an accident of
history; each component exists because a specific failure is otherwise
unpreventable.

### The chain, in order

```
telemetry frame
  ↓ schema validation                 app/schemas/telemetry.py
  ↓ data quality (DQ-001..010)        app/quality/engine.py
  ↓ rolling window store              app/windows/store.py
  ↓ operating state (ST-00..12)       app/state/engine.py
  ↓ context + context_id              app/context/engine.py
  ↓ feature engine (1,572 features)   app/features/
  ↓ contextual baselines              app/baseline/engine.py
  ↓ deterministic rules + authority   app/rules/limits.py
  ├─────────────────────── the answer below this line is advisory ───────────
  ↓ ML eligibility gate               app/inference/eligibility.py
  ↓ LSTM forecast → residuals + 32-D embedding   app/models/temporal/
  ↓ feature union (1,652 columns)     app/features/engine.py
  ↓ LightGBM champion / XGBoost challenger       app/models/trees/
  ↓ probability calibration           app/models/calibration/
  ↓ persistence, hysteresis, cooldown app/persistence/filters.py
  ↓ DOC-04 / DOC-07 resolution        app/diagnosis/
  ↓ DOC-05 decision                   app/decision/engine.py
  ↓ SHAP, where it will be read       app/explanation/
  ↓ versioned diagnosis response      app/schemas/diagnosis.py
```

**Everything above the line runs unconditionally.** TensorFlow failing to
import, a corrupt booster, an inference timeout — each degrades the response to
`ML_STATUS = DEGRADED` with a reason, and the operator still gets the
deterministic verdict, the anomalies, the severity, the priority and the
recommended action. That is enforced by `app/core/capability.py`: no module
imports a heavy library at module scope, and a test asserts it.

---

## Install

```bash
cd services/ml

pip install -e .              # the deterministic chain, Golden suite, datasets
pip install -e ".[api]"       # + the HTTP surface
pip install -e ".[all]"       # + TensorFlow, LightGBM, XGBoost, SHAP, pandas
```

The base install has three dependencies. That is deliberate: the chain that
must never go down should not need a 600 MB tensor library to start.

## Run

```bash
export ML_MODE=shadow                 # the default, and the right one to start in
export ML_INTERNAL_TOKEN=$(openssl rand -hex 24)
uvicorn app.api.app:build --factory --port 8080
```

Then, in the Next.js application:

```bash
export ML_SERVICE_URL=http://127.0.0.1:8080
export ML_INTERNAL_TOKEN=...          # the same token
```

With `ML_SERVICE_URL` unset the Analyzer runs exactly as it did before, and the
Prognosis tab says why there is nothing in it.

---

## Modes

| `ML_MODE` | Models run | Predictions persisted | Operators alerted |
|---|---|---|---|
| `disabled` | no | no | no |
| `shadow` | **yes** | **yes** | no |
| `canary` | yes | yes | only `ML_CANARY_MACHINES` / `ML_CANARY_FAULTS` |
| `production` | yes | yes | yes |

Shadow is the default and the point of it is that it produces data: engineering
compares what the model predicted against what actually happened, over weeks,
before anybody is paged. Rolling back is an environment variable.

---

## Training

Every command is `python -m app.training.<name> --help`.

```bash
# 1. Build a dataset. Replays telemetry through the serving pipeline, labels it
#    from confirmed events, splits it chronologically with a leakage gap, and
#    verifies the split. A leaking split raises; it is never returned.
python -m app.training.build_dataset --dataset-id ds-001 \
    --source synthetic --repeats 6 --emit-every 15

# 2. Train the temporal model. Scaler fitted on train only; the saved model is
#    the best validation epoch, restored.
python -m app.training.train_temporal --dataset ds-001 --lookback 300

# 3. Fill the residual and embedding columns, using train-fitted weights.
python -m app.training.generate_temporal_features --dataset ds-001 --model temporal-...

# 4. Train the champion and the challenger, on identical inputs.
python -m app.training.train_lightgbm --dataset ds-001
python -m app.training.train_xgboost  --dataset ds-001

# 5. Calibrate on validation. Train or test raise.
python -m app.training.calibrate --dataset ds-001 --model lgbm-...

# 6. Evaluate. Per fault, per horizon. Run --split test once, at the end.
python -m app.training.evaluate --dataset ds-001 --model lgbm-... --split valid
python -m app.training.evaluate --dataset ds-001 --model lgbm-... --split test \
    --false-alarm-report

# 7. Golden regression. All twelve must pass before promotion.
python -m app.training.run_golden_tests --model lgbm-...

# 8. Promote. Gated, and it will refuse.
python -m app.training.promote_model --model lgbm-... --check
python -m app.training.promote_model --model lgbm-... --approved-by "A. Engineer"
```

The whole sequence, on synthetic data, in one command:

```bash
bash scripts/lifecycle_demo.sh
```

It ends by attempting a promotion and **expecting the refusal**, then prints
the measured frozen-test metrics so nobody has to take the result on trust.

### Promotion is gated

Four conditions, all of which must hold:

1. frozen-test metrics exist;
2. every Golden case passes;
3. the model was trained on **real confirmed events**;
4. a named engineer approved it.

Condition 3 is the one that bites today, and it is meant to. Overriding it
needs `ML_ALLOW_UNTRAINED_CHAMPION=true`, set deliberately, and the override is
recorded in the model's contract.

---

## What is enforced, not merely documented

These are the properties with tests behind them. Each names the failure it
prevents.

| Property | Where | Failure prevented |
|---|---|---|
| A BAD input never becomes a valid feature | `features/engine.py` | A broken sensor diagnosed as a machine fault |
| A frozen sensor is BAD, not "stable" | `quality/engine.py` DQ-005 | A dead channel learned as a perfect baseline |
| Scalers fit on train only | `models/temporal/scaler.py` | Every metric optimistic by an unmeasurable amount |
| Calibrators fit on validation only | `models/calibration/` | The frozen test set becomes a tuning set |
| An event lives in one split | `datasets/splits.py` | PR-AUC that measures memorisation |
| Split gap ≥ lookback + horizon | `datasets/splits.py` | A row's window reaching into the next split |
| Severity computed before confidence | `decision/engine.py` | DOC-05 §16: an approved Danger downgraded |
| A learned anomaly cannot reach DANGER | `rules/limits.py` | Analytics redefining plant severity |
| Unknown stays unknown | `diagnosis/resolver.py` | The nearest known fault, confidently wrong |
| Instrumentation cleared before physics | `rules/limits.py`, `resolver.py` | Stripping a screen pack on a drifting transmitter |
| One sample never alerts | `persistence/filters.py` | Alerts that flicker and get ignored |
| A hard limit bypasses the filter | `persistence/filters.py` | A trip waiting three cycles for confirmation |
| Feature order is a contract | `models/base.py` | A reordered vector, silently confident and wrong |
| Synthetic never becomes real | `labels/events.py`, registry | A pipeline test promoted to production |

Run them:

```bash
python -m pytest tests/unit -q            # fast
python -m pytest tests/integration -q     # replays full scenarios; minutes
python -m app.training.run_golden_tests   # the twelve locked cases
```

---

## Ablation

`app/evaluation/ablation.py` defines E0–E7, from rules-only to the full stack.
E0 is the one that matters: **if the deterministic rules catch the same events
at the same lead time, the learned stack is a liability rather than a feature.**
`AblationReport.verdicts()` states, per added layer, whether it measurably
improved PR-AUC or false alarms per hour, and says so when it did not.

Nothing is kept because it is sophisticated.

---

## Evaluation

Accuracy is not reported anywhere. At a 0.2% positive rate a model that always
answers "no fault" is 99.8% accurate and worth nothing. What is reported, per
fault and per horizon: PR-AUC, precision, recall, F1, FPR, FNR, **false alarms
per operating hour**, **event-level recall**, **lead time (median and p10)**,
Brier score, calibration curve and expected calibration error.

The false-alarm report lists every alarm with its operating state, state
confidence, recipe, baseline level, data quality and top contributing features,
plus a first-pass triage reason. Forty false alarms is a number nobody can act
on; "thirty-one were startup transients" is a fix.

---

## Current state, honestly

**Built and tested:** the whole chain above, 12/12 Golden cases passing on the
deterministic path, leakage guards proven to fire, the DOC-05 separation
enforced structurally, the full train → calibrate → evaluate → promote
lifecycle exercised end to end.

**Not built, and cannot be:** a trained fault model. The synthetic dataset
exercised here produced PR-AUC between 0.03 and 0.14 on the frozen test split
with zero events detected — which is the correct outcome for a model fitted on
six generated events and is reported rather than hidden.

**What it needs:** confirmed fault events with GOLD or SILVER labels. Eight per
fault is the floor below which `app/models/trees/common.py` refuses to fit at
all, and that floor is low. Until those exist, every finding the Analyzer shows
comes from the deterministic DOC-02..DOC-05 chain, which is exactly where it
should come from.
