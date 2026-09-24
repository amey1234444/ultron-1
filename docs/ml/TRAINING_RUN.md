# Twin Screw Extruder â€” training run record

What went into the models, and what came out. Every figure here was read back
from the artefacts, not from a training log.

**Run date:** 24 Sep 2026
**Dataset:** `ds-merged-2`
**Models:** `lgbm-final:1` (LightGBM 4.5.0), `xgb-final:1` (XGBoost 2.1.1)
**Role:** both `CANDIDATE`. Neither is promoted, and neither may be.

---

## 1. What the models were given

### 1.1 Data

| | |
|---|---|
| rows | 6,800 |
| feature columns | 1,604 |
| populated columns | 1,378 |
| physical events | 88 |
| confirmed events | **0** |
| label quality | `{BRONZE: 88}` |
| `trained_on_real_data` | **false** |
| storage | Parquet |

Built as four independent chunks (`ds-chunk-a..d`, seeds 1001/2002/3003/4004),
each a 2-repeat replay of the 19-scenario catalogue, then merged with the split
recomputed over the whole set. `event_atomic: true` â€” no physical event appears
in two splits.

### 1.2 Splits â€” chronological, event-atomic

| split | rows |
|---|---|
| train | 4,717 |
| valid | 999 |
| test | 971 |
| excluded | 113 |

Excluded rows are those inside another fault's onset uncertainty for the output
being trained. A row can be a trustworthy negative for one fault and excluded
for another, so the filtering is per output, not per dataset.

### 1.3 Feature schema

```
feature_set_version   1.0.0
feature_schema_hash   3acbeb05df8d4edd2e7be0d15ba49728
feature_count         1604
```

Composition: **1,524 engineered + 48 temporal residual + 32 temporal embedding**.

| family | columns | populated | note |
|---|---|---|---|
| ROLLING_DISPERSION | 440 | 440 | std, MAD, range, CV over 30/120/300/600s |
| ROLLING_LOCATION | 279 | 279 | mean, median, percentiles |
| THRESHOLD | 186 | 62 | **124 null â€” no site-approved limits** |
| BASELINE | 186 | 186 | deviation from learned contextual normal |
| TREND | 155 | 155 | slope, rate of change, EWMA slope |
| EXTREME | 124 | 124 | min, max, time-since-extreme |
| PERSISTENCE | 62 | 62 | n-of-m, seconds-in-excursion |
| RESIDUAL | 48 | 48 | LSTM forecast residuals + 300s statistics |
| EMBEDDING | 32 | 32 | 32-D temporal window summary |
| RAW | 31 | 31 | current values |
| SETPOINT | 22 | 0 | **22 null â€” PLC publishes no setpoints** |
| CROSS_SIGNAL | 14 | 14 | pressure ratios, differentials |
| CONTEXT | 10 | 10 | operating state, recipe, config |
| THERMAL | 9 | 9 | zone profile shape |
| QUALITY | 3 | 3 | frame data-quality signals |
| SPEED / LOAD | 3 | 3 | |

**226 of 1,604 columns are null, and all are explained**: 124 threshold
(no approved limits), 22 setpoint (no PLC integration), 80 temporal in datasets
built before the LSTM fill pass. None is a defect; each is a named commissioning
dependency.

### 1.4 Hyperparameters â€” identical for both libraries

```
learning_rate           0.03
num_leaves              31
max_depth               6
min_child_samples       50
n_estimators            2000        (early stopping decides the real count)
early_stopping_rounds   100
feature_fraction        0.8
bagging_fraction        0.8
reg_alpha               0.0
reg_lambda              1.0
seed                    20260918
min_events              8           â† explicit override, see below
```

Class imbalance handled with `scale_pos_weight` computed per output from its own
train-split ratio, not a global constant.

### 1.5 The `--min-events 8` override, and why it was needed

The first run **refused to train at all**:

```
lightgbm training produced no models
  reason: No fault has enough confirmed events to model.
  TSE-DOWN-001@15 (0 confirmed event(s), below the 8 minimum.
                   A model fitted on this many would memorise them.)
```

88 physical events, **0 confirmed**. The floor counts GOLD/SILVER-confirmed
events only, and every synthetic event is BRONZE by construction. Reaching 88
synthetic events bought nothing â€” correctly.

The override is recorded in both contracts:

> *"Trained with --min-events 8, below the 8-event floor. This model is a
> pipeline exercise and must not be promoted."*
> *"Every training row is SYNTHETIC. This model carries no evidence about a real
> machine."*

---

## 2. Faults the models were trained on

12 outputs were requested per fault (4 faults Ã— 3 horizons) across 8 faults;
**18 of 24 trained**, 6 skipped for insufficient positives.

| fault | description | events | band | trained |
|---|---|---|---|---|
| `TSE-DOWN-001` | Screen restriction / blockage | 24 | RESEARCH_VALIDATION | 3 horizons |
| `TSE-INST-004` | Instrumentation drift | 16 | EXPERIMENTAL_ONLY | 3 horizons |
| `TSE-DOWN-003` | Die restriction | 8 | EXPERIMENTAL_ONLY | 3 horizons |
| `TSE-FEED-002` | Feed starvation / instability | 8 | EXPERIMENTAL_ONLY | 3 horizons |
| `TSE-THERM-012` | Zone cooling failure | 8 | EXPERIMENTAL_ONLY | 3 horizons |
| `TSE-INST-007` | Sensor fault | 8 | EXPERIMENTAL_ONLY | 3 horizons |
| `TSE-INST-001` | Frozen transmitter | 8 | EXPERIMENTAL_ONLY | 0 â€” skipped |
| `TSE-INST-006` | Pressure spike artefact | 8 | EXPERIMENTAL_ONLY | 0 â€” skipped |

Horizons: **5, 15 and 30 minutes**. These are process faults developing over
minutes, not component wear â€” the system does not and cannot predict which *day*
a machine will fail.

Capability bands are engineering workflow categories, never statistical claims:
`<8 INSUFFICIENT_FOR_MODEL_EVALUATION`, `8â€“19 EXPERIMENTAL_ONLY`,
`20â€“49 RESEARCH_VALIDATION`, `50+ OFFLINE_EVALUATION_CANDIDATE`.

---

## 3. What came out â€” frozen test split (971 rows)

### 3.1 Row-level metrics say the two models are identical

Both score PR-AUC â‰ˆ 1.000 and ROC-AUC â‰ˆ 1.000 on all 18 outputs.

**This is a warning, not a result.** ROC-AUC of exactly 1.000 means the task is
trivial: the synthetic mutators produce recognisable trajectories and both models
are identifying the generator, not fault physics. On row metrics alone you would
call this a tie and ship either.

### 3.2 Event-level metrics separate them completely

| | LightGBM | XGBoost |
|---|---|---|
| events detected | **3 of 22** | **21 of 22** |
| outputs with recall > 0 | 2 of 18 | 18 of 18 |
| median lead time | 545 s (one output) | 136â€“690 s (all) |
| false alarms / hour | 0.00 | 0.00 |

Per fault, XGBoost:

| output | events | detected | recall | lead time |
|---|---|---|---|---|
| TSE-DOWN-001@5 | 4 | 4 | 1.00 | 197 s |
| TSE-DOWN-001@15 | 4 | 3 | 0.75 | 545 s |
| TSE-DOWN-003@15 | 1 | 1 | 1.00 | 690 s |
| TSE-FEED-002@15 | 1 | 1 | 1.00 | 333 s |
| TSE-INST-004@15 | 2 | 2 | 1.00 | 168 s |
| TSE-INST-007@15 | 1 | 1 | 1.00 | 136 s |
| TSE-THERM-012@15 | 1 | 1 | 1.00 | 414 s |

**The rows-vs-events distinction is the whole point.** A report showing only
PR-AUC would have called these two models equivalent, and you would have shipped
the one that misses 86% of events.

Caveat that limits all of it: most outputs have **1 event** in the test split.
"Detected 1 of 1" is not a measurement. Only `TSE-DOWN-001` has 4.

### 3.3 Calibration â€” applied after discrimination was established

| model | ECE before | ECE after | ROC-AUC change |
|---|---|---|---|
| XGBoost | 0.0034 | 0.0000 | none |
| LightGBM | 0.0546 | 0.0000 | none |

ROC-AUC unchanged is the check that matters. A previous artefact in this project
recorded ECE 0.4053 â†’ 0.0000 while ROC-AUC sat at exactly 0.50 â€” Platt scaling
perfectly calibrating a constant. ECE cannot tell an informative probability from
a constant one; only a ranking metric can.

### 3.4 Model structure â€” non-degenerate

| | value |
|---|---|
| trees per output | 637â€“2,000 (early stopping) |
| splits per output | 1,601â€“4,268 |
| max depth | 6 |
| `all_boosters_constant` | **false** |

For contrast, the artefact this recovery started from had 44â€“148 trees per
output and **zero splits** â€” every tree a single leaf, because its training
matrix was 100% NaN.

---

## 4. End-to-end verification in the live pipeline

The trained XGBoost artefact loaded into `InferencePipeline` and replayed against
`SC-SCREEN-RESTRICTION` (1,800 frames):

```
component_capabilities   classifier AVAILABLE, temporal NOT_TRAINED,
                         explanation AVAILABLE
schema_error             None                    (1,604-column contract verified)
eligible frames          1,733 of 1,800  (96%)
ml_status                OK,  eligible True
rule_state               NORMAL,  verdict ANOMALY_CONFIRMED
diagnoses                1
  TSE-DOWN-001  state PROBABLE  severity NORMAL  priority P3  risks 3
  action        "Screen Restriction / Blockage is probable at Screen pack /
                 screen changer, but confidence ..."
```

**A fault is raised correctly** with localisation, priority and a DOC-05 action.
Every stage participated.

### 4.1 Risk trajectory - the prognosis fires ahead of onset

Reading the probability at the *final* frame of an 1,800-frame scenario shows
p ~ 0.000, which is correct and says nothing: by then the fault has resolved and
the forward-looking label window has closed. The measurement that matters is the
trajectory across the run.

Onset is at second 600:

| output | peak p | at frame | relative to onset | filter crossed |
|---|---|---|---|---|
| TSE-DOWN-001@5 | 0.9991 | 540 | **-60 s** | frame 387 |
| TSE-DOWN-001@15 | 0.9977 | 66 | **-534 s** | frame 62 |
| TSE-DOWN-001@30 | 0.9977 | 66 | **-534 s** | frame 62 |

The probability reaches 0.999, peaks *before* onset on every horizon, and the
persistence filter crosses at frames 62 and 387 - both well ahead of onset at
600. The longer horizons fire earlier than the short one, which is the correct
ordering for a forward-looking model.

This is prediction, not detection after the fact.

A vector comparison confirms the live and offline paths agree structurally: both
1,604 wide with 1,378 populated columns and **zero** mismatched-nullness
columns, so there is no assembly difference between what the trainer saw and
what the pipeline serves.

---

## 5. What none of this establishes

- **No real-world predictive capability.** 88 synthetic BRONZE events, 0
  confirmed. `trained_on_real_data: false`.
- **No champion.** Both libraries ran on identical splits for the first time and
  the event-recall gap is worth investigating, but on 1-event-per-output test
  data it is not a decision.
- **No promotion.** Three gates refuse: no real training data, 0 confirmed
  events, no named approver. Role stays `CANDIDATE`.
- **Nothing about day-of-failure.** Horizons are 5/15/30 **minutes**.

Required before any promotion: confirmed fault events with GOLD/SILVER labels
from maintenance, approved Alert/Danger limits from site engineering, PLC context
signals, and weeks of shadow-mode comparison against real outcomes.
