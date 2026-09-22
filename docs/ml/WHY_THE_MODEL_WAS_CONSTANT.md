# Why the model was constant

Written for: engineers reviewing the ULTRON ML pipeline recovery.

Investigated at commit `ceca247185d9db364ec8c8aad3c96a8964c6d4f3`.
Every number below was produced by executing the code, not by inspection.

---

## Verdict

`xgb-pipeline-test:1` did not learn a weak signal. It learned **nothing at
all**, because it was trained on a feature matrix that was **100% NaN**.

The cause is a circular dependency in the dataset builder:

> The builder records the feature vector that the inference pipeline served.
> The pipeline only computes that vector when the ML eligibility gate passes.
> The eligibility gate fails with `NO_MODEL` when no model is loaded.
> No model is loaded when you are building the dataset **in order to train
> one**.

So the first dataset built on a clean machine is always empty of features, and
every model trained from it is a constant predictor. The pipeline reported this
honestly at every stage — the metrics were correct, the promotion gate refused
the model, and nothing was hidden. The defect is that nothing *checked*.

---

## The evidence, in the order it was gathered

### 1. Every tree is a single leaf

Loading all nine saved boosters and walking their dumps:

| output | trees | splits | leaves | max depth |
|---|---|---|---|---|
| TSE-DOWN-003_at_15 | 115 | **0** | 115 | 0 |
| TSE-DOWN-003_at_30 | 115 | **0** | 115 | 0 |
| TSE-DOWN-003_at_5 | 110 | **0** | 110 | 0 |
| TSE-FEED-002_at_15 | 44 | **0** | 44 | 0 |
| TSE-FEED-002_at_30 | 44 | **0** | 44 | 0 |
| TSE-FEED-002_at_5 | 148 | **0** | 148 | 0 |
| TSE-THERM-012_at_15 | 74 | **0** | 74 | 0 |
| TSE-THERM-012_at_30 | 74 | **0** | 74 | 0 |
| TSE-THERM-012_at_5 | 74 | **0** | 74 | 0 |

XGBoost built between 44 and 148 boosting rounds per output and **never split
once**. `base_score` is 0.5 on every booster. A forest of root-only leaves
returns the same number for every input, which is a constant predictor by
construction — not a model that generalised poorly.

This rules out the hypotheses that would otherwise be reasonable here:
early stopping firing too soon (trees were built), `max_depth` misconfigured
(it is 6 in the recorded hyperparameters), and the learning rate being wrong.

### 2. The feature matrix is entirely null

`artifacts/datasets/ds-synth-002/rows.parquet`, 3,600 rows × 1,680 columns:

```
feature cols                                   : 1652
features 100% null                             : 1652
features with any value at all                 : 0
features with >= 2 distinct values             : 0
```

Every feature cell is `None`, and the columns carry pandas `object` dtype
because they contain nothing numeric to infer from. Meanwhile the metadata and
label columns are fully populated — timestamps, `machine_id`, `operating_state`,
`context_id`, `recipe_id`, `data_quality`, and all twelve `y::` label columns.

So the builder ran the whole chain correctly and wrote a correct, well-formed
dataset in which the entire X block is missing. A trainer given only NaN cannot
find a split, which is exactly what the tree dumps show.

### 3. Every row was ML-ineligible

```
ml_eligible value counts across all 3,600 rows:
False    3600
```

Not one row was eligible. That is the link between the empty matrix and the
code path that produced it.

### 4. The code path

`app/inference/pipeline.py:217-235`

```python
vector: list[float | None] = []
...
if eligibility.eligible:
    temporal_output = self._run_temporal(frame, quality, sequence)
    ...
    vector = self._build_vector(features, temporal_output)     # only here
    risks = self._run_classifier(frame, vector, rules, eligible=True)
```

`app/inference/pipeline.py:280`

```python
machine.last_vector = vector or [None] * len(self._feature_ids)
```

`app/datasets/builder.py:278-280`

```python
response = pipe.process(frame)
# The vector the pipeline actually served, not a recomputation.
features = pipe.last_vector(frame.machine_id)
```

`app/inference/eligibility.py:180-187`

```python
# Last: the observation would have been eligible, and there is no model.
if not model_available:
    return EligibilityResult(
        eligible=False,
        reason=MLIneligibleReason.NO_MODEL,
        ...
    )
```

Chained together:

```
build_dataset  (no model exists yet — that is the point of building it)
  → pipeline.process(frame)
      → eligibility: model_available is False  →  eligible=False, NO_MODEL
      → `if eligibility.eligible:` is False     →  vector stays []
      → last_vector = [None] * 1652
  → builder records [None] * 1652 as the row's features
  → 3,600 rows × 1,652 NaN, with correct labels
    → XGBoost finds no split candidate in any column
      → 44-148 root-only trees per output
        → constant prediction
          → ROC-AUC exactly 0.50 on all 9 outputs
          → PR-AUC ≈ positive prevalence
          → precision = recall = F1 = 0
          → reliability collapses to one bin
```

### 5. Why calibration appeared to "fix" it

The calibration record shows `ece_before 0.4053 → ece_after 0.0`. Platt scaling
mapped a single constant score onto the observed base rate, which is a perfect
calibration of a useless prediction. ECE cannot distinguish "well calibrated and
informative" from "well calibrated and constant" — only a ranking metric can,
and ROC-AUC was pinned at 0.50 throughout.

This is the concrete instance of the rule that calibration must never be read as
discrimination.

---

## Contributing defect: the design conflates two different questions

The eligibility gate answers *"should this observation drive an operator-facing
prediction?"*. The dataset builder needs the answer to a different question:
*"what did the feature engine compute for this frame?"*

These coincide in production and diverge completely during training. Feature
computation is deterministic and has no dependency on a model existing;
gating it behind `model_available` is the actual bug.

`NO_MODEL` is also, correctly, the *last* gate in `eligibility.py` — it fires
only for observations that would otherwise have been eligible. That ordering is
right for inference and is what makes the failure total during dataset builds:
every otherwise-good frame lands on it.

---

## What was *not* the cause

Ruled out by evidence, so that they are not re-investigated:

- **Insufficient events.** Real, and separately a problem (see the dataset
  audit), but not this. With zero usable features, no quantity of events could
  have produced a split.
- **Uninformative or weakly separable features.** Not reachable as a
  hypothesis — no feature value ever reached the trainer.
- **Label misalignment.** The labels are present and correctly shaped; the
  `y::` columns carry 0/1/-1 as designed.
- **Leakage.** The leakage guards fire correctly on deliberately broken splits.
- **Hyperparameters.** `max_depth 6`, `learning_rate 0.03`,
  `min_child_samples 50`, `n_estimators 2000` are all reasonable and were
  applied; trees were built, they simply had nothing to split on.
- **`TS-TZ9` removal.** A genuine and separate defect (see the pipeline audit)
  that invalidates the saved contract, but it postdates this training run and
  is not why the model was constant.

---

## Required fixes

1. **Decouple feature computation from ML eligibility.** The feature union must
   be computed for every processed frame. Eligibility governs whether the
   classifier *runs* and whether a result may *surface* — never whether
   features exist.
2. **Fail the dataset build on an empty feature matrix.** A dataset whose X
   block is entirely or overwhelmingly null is not a dataset. The builder must
   refuse rather than write it.
3. **Add a constant-predictor gate to training and evaluation.** If
   `std(prediction) ≈ 0`, or a model contains zero splits, training must fail
   loudly instead of producing an artifact.
4. **Add a ranking sanity gate.** On deliberately separable synthetic data, a
   model that scores ROC-AUC ≈ 0.50 must fail the run.

Each of these turns this class of silent failure into a loud one. The original
pipeline reported every number honestly; what it lacked was any assertion that
the numbers were *possible*.
