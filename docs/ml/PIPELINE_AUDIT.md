# ULTRON ML pipeline audit

Written for: engineers recovering and productionising the Twin Screw Extruder
ML pipeline.

Frozen at commit `ceca247185d9db364ec8c8aad3c96a8964c6d4f3`, before any
recovery change. Every figure was produced by executing the code.

---

## 1. Summary

The architecture is sound and the implementation is largely complete. What was
missing was verification: several safety mechanisms existed, were documented,
and were never invoked. The one trained model is a constant predictor, and the
cause is a circular dependency rather than a modelling problem — see
[WHY_THE_MODEL_WAS_CONSTANT.md](./WHY_THE_MODEL_WAS_CONSTANT.md).

| | |
|---|---|
| Python modules / lines | 84 / 17,683 across 27 packages |
| Tests | 195 functions, 13 files, 3,058 lines |
| TypeScript ML integration | 2,767 lines |
| Trained models | 1, `CANDIDATE`, never promoted |
| Models that learned anything | **0** |

---

## 2. Environment

```
python       3.12.4          platform  Windows-11-10.0.22631-SP0
numpy        2.2.6           pandas    2.3.2
scipy        1.14.1          sklearn   1.5.1
xgboost      2.1.1           lightgbm  4.7.0   (installed during this audit)
tensorflow   2.18.0          keras     3.8.0
pyarrow      21.0.0          pydantic  2.10.5
shap         MISSING (ModuleNotFoundError)
numba        MISSING (ImportError)
llvmlite     0.42.0
```

`lightgbm` and `shap` were both recorded as `unavailable` in the trained
model's environment block, so **every result the project has ever produced came
from the challenger**, not the designated champion.

`numba` fails to import against numpy 2.2.6, which is the likely root of the
SHAP install failure — SHAP depends on numba, and llvmlite 0.42 predates numpy
2 support. Not yet confirmed; investigated separately.

---

## 3. Knowledge snapshot

| item | count |
|---|---|
| signals | 60 |
| operating states | 13 |
| formulas | 49 |
| faults | 90 |
| patterns | 12 |
| anomalies | 40 |
| tags | **35** |

`knowledge_digest`: `acf703ebc12ed47a` (at model training time)

TypeScript remains authoritative. `scripts/exportKnowledge.ts` emits 8 JSON
files plus a sha256 manifest; the Python loader verifies every hash at boot and
`check:knowledge-export` reports the snapshot current.

**Defect found.** The tag count moved 36 → 35 in commit `95e7912`, which
removed `TS-TZ9` (42 lines) as a side effect of changing the twin-screw
artwork. Nothing replicated that removal into the synthetic generator, which
kept publishing the tag. DQ-008 then graded it *"published but is not a
declared tag"* → BAD → every healthy frame BAD → 5 test failures across three
modules. The blast radius of a knowledge change was not bounded anywhere.

---

## 4. Feature schema

| | trained model | pipeline at audit |
|---|---|---|
| feature_set_version | `1.0.0` | `1.0.0` |
| feature count | **1,652** | **1,604** |

Composition of the current 1,604: 1,524 declared + 48 residual + 32 embedding,
over 8 forecast tags.

The 48-column difference is exactly the `TS-TZ9.*` features. **The version
string did not move**, so a model and a pipeline that disagreed about 48
columns agreed they were compatible. Loading and predicting raises:

```
ValueError: feature names must have the same length as the number of data
columns, expected 1604, got 1652
```

Loud rather than silently wrong, which is the right failure — but
`app/api/handlers.py` catches only `MLServiceError`, and
`pipeline._run_classifier` called `ensemble.predict(vector)` unguarded, so it
escaped as an unhandled HTTP 500.

**`ModelContract.check_against` existed, was fully documented, and was never
called from anywhere in the codebase.** That is why the mismatch reached
`predict()` at all. Likewise `MLIneligibleReason.FEATURE_SCHEMA_MISMATCH` was
declared in the enum and never raised.

---

## 5. Datasets

| id | rows | features | split (train/valid/test/excl) | usable |
|---|---|---|---|---|
| ds-synth-001 | 720 | 1,652 | 420 / 60 / 0 / 240 | no |
| ds-synth-002 | 3,600 | 1,652 | 2,520 / 500 / 480 / 100 | **no** |

`ds-synth-002` feature-matrix audit:

```
feature columns                  1652
features 100% null               1652
features with any value at all      0
features with >= 2 distinct         0
null_fraction_overall             1.0
ml_eligible                 {False: 3600}
usable_for_training             false
```

The X block is entirely absent. Labels and metadata are fully populated, so the
dataset is well formed and completely untrainable.

Event counts per output were 0 or 1. `TSE-THERM-012` carried 40 labelled
positive rows and **zero events** — and `event_recall` reported `0.0` for it,
which is not a poor score but an undefined one.

---

## 6. Models

One artifact: `xgb-pipeline-test:1`.

```
role                 CANDIDATE
promoted_at          null
approved_by          null
trained_on_real_data false
label_quality_mix    {BRONZE: 24}
trained_on_dataset   ds-synth-002
environment          lightgbm: unavailable, shap: unavailable
```

Booster forensics — every output:

| output | trees | splits | leaves | max depth |
|---|---|---|---|---|
| TSE-DOWN-003_at_5/15/30 | 110–115 | **0** | 110–115 | 0 |
| TSE-FEED-002_at_5/15/30 | 44–148 | **0** | 44–148 | 0 |
| TSE-THERM-012_at_5/15/30 | 74 | **0** | 74 | 0 |

`all_boosters_constant: true`. Frozen-test ROC-AUC is exactly 0.50 on all nine
outputs, with a single reliability bin each and precision = recall = F1 = 0.

Calibration recorded `ECE 0.4053 → 0.0`, which is Platt scaling mapping a
constant onto the base rate. Calibration cannot distinguish an informative
probability from a constant one; only a ranking metric can, and it was pinned
at chance throughout.

---

## 7. Golden tests

12 of 12 pass — and all 12 report `ml_status: INELIGIBLE`. The suite validates
the deterministic DOC-02 → DOC-05 chain only. **No golden case has ever
exercised a model prediction.** The deterministic suite is genuinely green and
should stay; it simply does not say what it was being read as saying.

---

## 8. Test suite at audit

195 functions, 5 failing:

```
tests/integration/test_pipeline.py::test_screen_restriction_is_diagnosed_without_any_model
tests/integration/test_pipeline.py::test_model_runs_and_produces_risk
tests/unit/test_quality.py::test_healthy_frame_is_good
tests/unit/test_quality.py::test_missing_optional_signal_does_not_drag_the_frame_down
tests/unit/test_state_context_baseline.py::test_missing_recipe_lowers_confidence_and_is_named
```

All five trace to the single `TS-TZ9` deletion in §3.

---

## 9. Defects, ranked

| # | defect | consequence |
|---|---|---|
| 1 | Feature computation gated behind ML eligibility | Every first-build dataset is 100% NaN; every model trained from it is constant |
| 2 | `check_against` never called | Stale contracts reach `predict()` |
| 3 | `predict()` unguarded; API catches only `MLServiceError` | Model failure becomes HTTP 500 |
| 4 | Feature set changed without a version bump | Model/pipeline silently "compatible" while disagreeing on 48 columns |
| 5 | `TS-TZ9` removed from knowledge, not from generator | Every healthy frame BAD; 5 tests failing |
| 6 | Zero-denominator event recall reported as `0.0` | Undefined read as total failure |
| 7 | No constant-predictor or ranking gate | A model that learned nothing produced a promotable-looking artifact |
| 8 | Parquet writer swallowed its exception | Silent fallback to a 332 MB JSONL |
| 9 | LSTM never trained outside a unit test | 80 of 1,604 columns permanently null; hybrid architecture is nominal |
| 10 | Golden suite does not exercise ML | "12/12" misread as ML validation |

Defects 1–8 are fixed. 9 and 10 are outstanding.

---

## 10. What is preserved

`artifacts/models/xgboost/xgb-pipeline-test-1/` is kept **unmodified** as
regression evidence, along with `artifacts/audit/model_debug.json`. Any future
constant-predictor gate must fail against this artifact; if it passes it, the
gate does not work.
