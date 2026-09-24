# ULTRON ML pipeline — what it is, why it is built this way, and what to improve

Written for: engineers and reviewers who need to evaluate the design, not just
run it. Every figure was read back from executed runs.

---

## 1. The pipeline, end to end

```
Sensor / PLC
  └─ gateway ──MQTT──▶ EMQX broker
       └─ src/server/ingest/            subscribe, validate, coalesce
            └─ PostgreSQL measurements  value, unit, quality, freshness

src/instrumentation.ts  register()
  └─ src/server/mlFeeder.ts             every ML_FEED_INTERVAL_MS (5 s)
       ├─ getWorkspace() + getLiveState()
       ├─ layout box .templatePointCode         ← the channel→tag mapping
       └─ lib/knowledge/ml/telemetryFrame.ts
            ├─ point.analyzerTag                TS-P3, not a point code
            ├─ normaliseReading()               75 bar → 7.5 MPa
            └─ frameIsWorthSending()            skip a silent machine

  ──HTTP POST /inference──▶  Python service

  1  pydantic validation        extra fields rejected, not ignored
  2  data quality               DQ-001..010, four verdicts
  3  operating state            ST-00..12, measured stability
  4  context + context_id       banded, stable across processes
  5  rolling window store       gaps recorded as gaps
  6  feature engine             1,604 columns
  7  contextual baselines       learned, with eligibility rules
  8  deterministic rules        approved limits, authority ladder
  ─────────────── everything below is advisory ───────────────
  9  eligibility gate           refuses with a structured reason
 10  LSTM                       forecast → 48 residuals + 32 embedding
 11  feature union              1,604 fixed order
 12  LightGBM / XGBoost         independent binary per fault per horizon
 13  calibration                Platt or isotonic, validation split only
 14  persistence filter         N-of-M, hysteresis, cooldown
 15  DOC-04 / DOC-07            pattern → fault → evidence → alternatives
 16  DOC-05 decision            severity / confidence / impact / priority / action
 17  remaining useful time      horizon curve inverted
 18  versioned response

  ◀──  src/server/mlClient.ts            timeouts, one retry, MlResult
       lib/knowledge/ml/contract.ts      validating parser, not a cast
       components/console/machine/ml/    Prognosis + Explanation panels
```

**Verified with real channel values**, not assumed:

```
INPUT   TS-PM1 45.0 kW · TS-S1 250 rpm · TS-TZ1 170 degC · TS-P1 75 bar
ADAPTER reporting=14 silent=0 unitProblems=0 · TS-P1 → 7.5 MPa · data_source REAL
PYTHON  validated · DQ GOOD · state ST-05 · ML correctly INELIGIBLE (RAMP_UP)
```

---

## 2. Why these models, and not the alternatives

This section is the point of the document. Every choice below was made against
a specific failure it prevents.

### 2.1 Why gradient-boosted trees, and not a neural network

| option | why not |
|---|---|
| **Deep net (MLP / 1D-CNN)** | Needs 10⁴–10⁶ labelled examples. We have **88 synthetic events, 0 confirmed**. At this scale a net memorises. |
| **Trees (chosen)** | Work at hundreds of examples, handle 1,604 mixed-scale columns without normalisation, and **take NaN natively** — which matters because 226 of our columns are legitimately null. |

The NaN point is not a convenience. A tree learns a *default direction* for a
missing value; imputing a median would tell the model "this threshold distance
is average" when the truth is "no site has supplied a limit". The logistic
baseline needs imputation and that difference is recorded in every comparison.

Trees are also **inspectable**: `splits > 0` is a one-line check that a model
learned anything. That check is what exposed the original defect — 44–148 trees
per output with **zero splits**, every tree a single leaf. No neural network
offers an equivalent.

### 2.2 Why LightGBM as designated champion, and XGBoost as challenger

| option | assessment |
|---|---|
| **LightGBM** | Leaf-wise growth, fastest on wide sparse data. Designated champion in the HLD. |
| **XGBoost** | Level-wise, more conservative, better-understood regularisation. Challenger. |
| **CatBoost** | Strong on categorical features. We have almost none — the categoricals (operating state, recipe) are already encoded by the context engine. Cost without benefit. |
| **Random Forest** | No boosting, weaker on imbalanced targets, no early stopping on a validation split. |

**The measured result contradicts the designation, and that matters more than
the original preference.** On identical splits, labels and columns:

| | LightGBM | XGBoost |
|---|---|---|
| PR-AUC / ROC | ~1.000 | ~1.000 |
| **events detected** | **3 of 22** | **21 of 22** |
| lead time | 545 s (1 output) | 136–690 s (all) |

Row metrics call it a tie. Event metrics do not. **No champion has been named**,
because most test outputs hold one event and "1 of 1" is not a measurement —
but the gap is large enough that LightGBM's designation cannot be assumed.

A note on LightGBM 4.7.0: it **segfaults** in `LGBM_DatasetSetField` on this
platform (`access violation reading 0x0`, every label dtype and the sklearn
API). Pinned to 4.5.0. Root cause undiagnosed.

### 2.3 Why one binary model per fault per horizon, and not multiclass or multitask

| option | why not |
|---|---|
| **Multiclass** | Assumes faults are mutually exclusive. They are not — GT-011 requires two independent faults to be retained simultaneously. |
| **Multi-label single net** | One model's failure takes every fault with it, and a fault with 8 events shares capacity with one that has 24. |
| **Per-fault-per-horizon binary (chosen)** | 18 independent models. One can be refused for want of events while the others train — which is exactly what happened: 18 of 24 trained, 6 refused. |

The cost is 24 models to manage. The benefit is that **`TSE-DOWN-003` having
too few events cannot silently degrade `TSE-DOWN-001`**.

### 2.4 Why an LSTM for the temporal layer, and not alternatives

| option | assessment |
|---|---|
| **ARIMA / Holt-Winters** | Univariate. Cannot express "pressure rose *while* feed held steady", which is the whole diagnostic content. |
| **Transformer** | Needs far more data than an LSTM at this scale; attention over a 30-step window buys nothing. |
| **GRU** | Defensible and cheaper. LSTM chosen for the explicit cell state over longer windows; the difference is small and untested here. |
| **LSTM (chosen)** | Two heads: a forecast, and a 32-D embedding. |

**The LSTM's honest role is normal-behaviour modelling, not fault prediction.**
It learns what healthy operation looks like and reports the *residual* — how far
the machine has departed from its own recent behaviour. That is defensible with
zero fault labels, which is the situation we are in.

Its current status is `NOT_TRAINED` in production terms: one smoke artefact
exists (`best_epoch 1 of 7`, five validation sequences), which proves the
training path executes and nothing more.

**It has not earned its place yet**, and the ablation exists to decide that:
E2 (engineered) vs E5 (+residuals) vs E6 (+embedding). Until those separate on
real events, the embedding in particular is a 32-column cost nobody can read.

### 2.5 Why Platt calibration, and when isotonic

| option | when |
|---|---|
| **Platt (sigmoid)** | Two parameters. Correct at our sample sizes. Used. |
| **Isotonic** | Non-parametric, more flexible, **overfits below ~1,000 validation samples**. Available, not used here. |
| **None** | A threshold on an uncalibrated score is arbitrary across faults. |

Measured: ECE 0.0034 → 0.0000 (XGBoost), 0.0546 → 0.0000 (LightGBM), **ROC-AUC
unchanged**.

That last clause is the whole check. A previous artefact recorded ECE
0.4053 → 0.0000 while ROC-AUC sat at exactly **0.50** — Platt scaling perfectly
calibrating a constant. **ECE cannot distinguish an informative probability from
a constant one.** Only a ranking metric can, so calibration is applied *after*
discrimination is established and never reported without it.

### 2.6 Why TreeSHAP, and why the claim was verified

| option | assessment |
|---|---|
| **Permutation importance** | Global only. Cannot explain one prediction. |
| **LIME** | Local surrogate, unstable across runs. |
| **TreeSHAP (chosen)** | Exact for trees, additive, per prediction. |

`shap_explainer.py` originally used the boosters' native `pred_contrib` and
called it SHAP without ever importing the library. Measured on real artefacts:

```
lightgbm  max_abs_diff  0.000e+00   ← bit identical
xgboost   max_abs_diff  5.668e-01   ← not equivalent
```

So LightGBM's native path may honestly be called SHAP and XGBoost's may not. The
code now returns the **method alongside the numbers**
(`shap_treeexplainer` / `native_pred_contrib_shap_equivalent` /
`native_tree_contributions_unverified`), and a test asserts xgboost is not on
the verified list.

### 2.7 Why remaining useful *time*, and not remaining useful *life*

RUL in the wear sense needs three things that do not exist here:

1. **An end-of-life definition per component.** DOC-01..07 contain none — a
   search for "remaining", "wear" and "life" returns **0 hits**.
2. **A degradation model.** Wear is monotonic and consumes life. These faults
   are *cleared*: a blocked screen pack is cleaned and the clock resets.
3. **Run-to-failure histories.** Several complete cycles per component,
   typically a year or more including real failures.

So the pipeline inverts the horizon probability curve into **remaining useful
time in minutes**, which is what the models were actually trained to know:

```
[(5,0.12),(15,0.48),(30,0.83)]  →  15.9 min  (band 8.6–26.6)
[(5,0.01),(15,0.02),(30,0.04)]  →  censored: "beyond 30 min"
```

The censoring rule is the safeguard: on a healthy machine the honest answer is
*"beyond the modelled window"*, never a number from extending a line.
**Extrapolating past the last trained horizon is how a 30-minute model starts
claiming to see days.**

### 2.8 Why the deterministic chain stays authoritative

The learned layer is advisory, permanently. With `ML_SERVICE_URL` unset, the
service down, or every model failing to load, the Analyzer behaves exactly as
before.

This was tested involuntarily: scipy's BLAS died mid-run, the model failed to
load, the pipeline reported `ML_INELIGIBLE_NO_MODEL` carrying the real
`ImportError`, and the deterministic chain kept answering. No 500, no crash, no
silent wrong answer.

---

## 3. What to improve

### 3.1 Blocking, and not solvable in software

| # | Item | Owner |
|---|---|---|
| 1 | **Confirmed fault events**, GOLD/SILVER labelled | Maintenance. Months. Blocks everything about model quality. |
| 2 | Approved Alert/Danger limits → `configs/limits/` | Site engineering. Unblocks 124 threshold features and the DANGER branch. |
| 3 | PLC context: mode, trip, recipe, config, 7 zone setpoints | Automation. Unblocks 22 setpoint features and declared operating state. |
| 4 | Channel mapping in the console | Instrumentation. Unblocks everything. |

**146 of 1,604 features (9%) are null purely from 2 and 3.**

### 3.2 Software, worth doing

| item | why |
|---|---|
| **Champion decision on real events** | The 3-vs-21 event gap needs explaining, not averaging away. Investigate LightGBM's score distribution against the persistence filter. |
| **Ablation E0–E7 on real events** | The only way the LSTM earns or loses its place. |
| **Longer horizons (60/120/240 min)** | Shift-length forecasting. Needs a dataset rebuild, not new physics. |
| **SHAP feature ids in the payload** | Contributions arrive without names; the Explanation panel needs them. |
| **`location` field unpopulated** | The action text names the screen pack; the structured field is empty. |
| **Isotonic calibration** | Once validation splits exceed ~1,000 samples. |
| **Drift detection** | `app/monitoring/drift.py` exists and is not wired. |

### 3.3 Environment, already repaired but worth recording

Four NumPy-2 ABI breaks, all fixed by forcing prebuilt wheels:

```
numexpr  2.8.7 → 2.14.2    ← killed training at set_seed, AttributeError
                              escaping pandas' errors="warn" (catches ImportError)
pyarrow  21.0.0 → 25.0.1   ← DLL load failed; datasets fell back to 332 MB JSONL
numba/llvmlite → 0.67/0.49 ← blocked SHAP entirely
lightgbm 4.7.0 → 4.5.0     ← segfault, root cause undiagnosed
```

**No numpy downgrade was needed.** The deployed container builds from
`services/ml/Dockerfile` with pinned versions and avoids this class entirely —
a strong argument for running training there rather than on a dev machine.

---

## 4. Current state

| | |
|---|---|
| Tests | 267 passed, 1 skipped, 0 failed |
| Golden (deterministic) | 12/12 |
| Golden (ML, model loaded) | 12/12, 10 with `ml_status: OK` |
| Models | `lgbm-final:1`, `xgb-final:1` — both `CANDIDATE` |
| `trained_on_real_data` | **false** |
| Confirmed events | **0** |
| Production build | passing |

**No model is promoted, and none may be.** Three promotion gates refuse: no
real training data, too few physical events (1–4 against a floor of 8), and no
named approver.

The deterministic DOC-02 → DOC-05 chain is complete, tested and authoritative.
It is what an operator sees today, and it works the moment channels are mapped.
