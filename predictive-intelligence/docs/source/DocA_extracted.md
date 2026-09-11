TWIN SCREW EXTRUDER
Predictive Diagnosis &Prognosis System
High-Level Design (HLD), Machine-Learning Architecture, Training Strategy, MLOps and Deployment Blueprint
| Recommended architecture | Deterministic Rules + LSTM + LightGBM + SHAP |
| Prediction horizons | 5 min / 15 min / 30 min |
| Production principle | Advisory ML; safety-critical actions remain under validated control logic |

DOCUMENT STATUS
Architecture baseline for implementation planning and model experimentation. Engineering thresholds and fault signatures must be validated against the actual machine, recipe, PLC logic and maintenance history before production use.
## Document Control
| Item | Value |
| Document | TSE Predictive Diagnosis & Prognosis System - HLD |
| Version | 1.0 |
| Date | 03 September 2026 |
| Primary objective | Predict developing process/mechanical issues and provide explainable diagnosis before hard alarm thresholds are reached. |
| Preferred production model | Rules + LSTM temporal model + LightGBM diagnostic classifiers |
| Challenger | XGBoost using the same feature set and chronological splits |
| Initial sampling assumption | 1 Hz process-model dataset; vibration waveform analysis is a separate higher-rate pipeline if required. |
| Control boundary | Advisory predictions only in initial releases; no autonomous machine control from ML output. |

## Table of Contents
1. Executive Summary
2. Goals, Scope and Non-Goals
3. Input Channel Data Dictionary
4. Problem Decomposition: Detection, Diagnosis and Prognosis
5. Recommended HLD Architecture
6. Online Inference Data Flow
7. Offline Training Architecture
8. Hybrid Model Design
9. Feature Engineering Specification
10. Fault Taxonomy and Label Strategy
11. Data Preparation and Time-Series Splitting
12. Model Training Configuration
13. Hyperparameter Tuning
14. Evaluation and Acceptance Gates
15. Explainability and Operator Trust
16. MLOps and Model Lifecycle
17. Deployment Topology and Platform Sizing
18. Interfaces and Data Contracts
19. Reliability, Safety and Security
20. Monitoring and Drift Management
21. Implementation Roadmap
22. Risks and Mitigations
23. Final Recommendation
Appendix A-C. Feature formulas, schemas and references
## 1. Executive Summary
The objective is to build an industrial predictive-diagnostics layer for a Twin Screw Extruder (TSE) using the available process and machine channels. The system must answer three different questions: (1) what is abnormal now, (2) what issue is most likely causing the behavior, and (3) what issue is likely to develop in the next few minutes. These problems should not be collapsed into a single opaque classifier.
| Recommended architecture Keep the existing engineering threshold table as the deterministic safety and state layer. Add an LSTM to learn multivariate temporal behavior and forecast expected sensor trajectories. Feed LSTM residuals/embeddings together with engineered rolling features into LightGBM fault classifiers. Use XGBoost as a challenger and retain whichever model wins on event-level operational metrics. Use SHAP to explain diagnostic probabilities. |

Rules provide deterministic Normal / Warning / Severe state and must remain authoritative for hard limits.
LSTM provides temporal context, future-value forecasts, residual/anomaly features and a compact representation of machine history.
LightGBM provides fast multi-label fault diagnosis on structured features and supports strong operator-facing explainability through SHAP.
XGBoost should be trained on identical features as a benchmark; model choice is decided empirically, not by preference.
Initial prediction horizons should be 5, 15 and 30 minutes, tuned later using real event lead-time distributions.
Chronological validation with leakage gaps is mandatory. Random row-level train/test splitting is prohibited for overlapping windows.
Primary business metrics are severe-fault recall, false alarms per operating hour, event lead time and probability calibration - not raw accuracy.
Production rollout should progress through shadow, canary and champion/challenger phases with full model-version and feature lineage.
## 2. Goals, Scope and Non-Goals
## 2.1 Functional goals
Detect abnormal operating conditions using the existing channel thresholds and data-quality rules.
Predict fault risk before a warning/severe threshold is crossed.
Produce multi-label diagnosis probabilities rather than forcing every moment into exactly one fault class.
Provide 5/15/30-minute prognosis risk and expected trajectories for selected process variables.
Explain each surfaced diagnosis with top contributing signals, trends and contextual deviations.
Persist predictions, model versions, source-data quality and operator outcomes for audit and continuous learning.
## 2.2 Non-goals for the first release
No autonomous manipulation of motor RPM, screw RPM, feed rate, heaters or shutdown logic from ML output.
No attempt to infer detailed bearing/gear defect frequencies from a single RMS vibration channel; high-frequency vibration requires a dedicated signal-processing pipeline.
No reliance on synthetic threshold crossings as a substitute for real fault labels.
No single global model assumption across all recipes/machines until cross-machine and cross-recipe validation proves generalization.
## 3. Input Channel Data Dictionary
The following engineering ranges are the baseline rules supplied for the system. They should be versioned as configuration, not hard-coded inside the ML model, so process engineers can revise them without retraining.
| Ch. | Parameter | Format | Unit | Min | Nom. | Normal | Warning | Severe/Max |
| RPM | Motor RPM | Integer | rpm | 1800 | 2000 | 1950-2050 | <=1900 or >=2100 | <=1800 or >=2250 |
| SRPM | Derived Screw RPM | Float | rpm | 90.0 | 100.0 | 97.5-102.5 | <=95 or >=105 | <=90 or >=112.5 |
| VM | Motor Vibration | Float | mm/s RMS | 0.20 | 1.67 | 0-2.00 | >=2.50 | >=3.00 |
| VG | Gearbox Vibration | Float | mm/s RMS | 0.20 | 1.67 | 0-2.00 | >=2.50 | >=3.00 |
| TMOT | Motor Temperature | Float | deg C | 30.0 | 40.0 | 30-70 | >=80 | >=90 |
| TGB | Gearbox Temperature | Float | deg C | 30.0 | 40.0 | 30-70 | >=80 | >=90 |
| Z1 | Barrel Temperature Zone 1 | Float | deg C | 150.0 | 180.0 | 170-190 | <=160 or >=200 | <=150 or >=210 |
| Z2 | Barrel Temperature Zone 2 | Float | deg C | 170.0 | 210.0 | 195-215 | <=180 or >=220 | <=170 or >=230 |
| Z3 | Barrel Temperature Zone 3 | Float | deg C | 190.0 | 220.0 | 210-230 | <=200 or >=240 | <=190 or >=250 |
| MT | Melt Temperature | Float | deg C | 180.0 | 210.0 | 200-220 | <=190 or >=230 | <=180 or >=240 |
| P | Melt Pressure | Float | MPa | 1.0 | 4.0 | 3.5-4.5 | <=2.0 or >=5.4 | <=1.0 or >=6.0 |
| L | Hopper Level | Percentage/Float | % | 5.0 | 75.0 | 40-90 | <=25 or >=95 | <=10 |
| I | Motor Current | Float | A | 3.0 | 10.0 | 8-12 | <=6 or >=15 | <=3 or >=20 |
| FR | Recipe Feed Rate | Float | kg/h | 10.0 | 50.0 | Recipe-dependent | Not specified | 80.0 |

| Important modeling note If SRPM is purely calculated from motor RPM through a fixed gearbox ratio, it is not independent information. Prefer an error feature such as SRPM_error = measured_SRPM - expected_SRPM when an independent measurement exists; otherwise consider omitting SRPM from some models to avoid duplicated signal. |

## 4. Problem Decomposition: Detection, Diagnosis and Prognosis
| Layer | Primary question | Preferred method | Example output |
| Detection | What is abnormal now? | Rules + data-quality checks | Melt pressure warning; gearbox vibration severe |
| Diagnosis | What issue best explains the pattern? | LightGBM multi-label classifier using engineered + LSTM features | Downstream restriction 0.87; motor overload 0.61 |
| Prognosis | What is likely in the near future? | LSTM forecasts + horizon classifiers | Restriction risk: 5m 0.31, 15m 0.78, 30m 0.91 |
| Explanation | Why did the system reach that diagnosis? | SHAP + trend narrative | Pressure slope, current slope and pressure/feed ratio dominate |

A pure threshold engine is excellent at enforcing known limits but cannot reliably anticipate a fault while all channels remain nominal. A pure LSTM can model temporal behavior but is harder to audit as the sole diagnostic classifier. A pure boosted-tree model can diagnose structured patterns very effectively, but only if history is represented using rolling/trend features. The hybrid architecture combines these strengths.
## 5. Recommended HLD Architecture
Figure 1 - End-to-end HLD: plant telemetry, data platform, hybrid inference and application layers.
## 5.1 Component responsibilities
| Component | Responsibility |
| PLC / Gateway | Timestamp sensor measurements, attach machine identity and quality, publish at agreed cadence. |
| MQTT broker | Authenticated transport, topic policy, QoS, buffering/retention as configured. |
| Telemetry ingestion | Schema validation, deduplication, timestamp ordering, unit validation and persistence. |
| Online window store | Maintain low-latency 1-10 minute clean windows per machine for inference. |
| Historical store | Persist raw/resampled telemetry, recipes, setpoints, machine state, faults, maintenance and predictions. |
| Data-quality gate | Detect missing/stale channels, spikes, impossible change rates and out-of-order data. |
| Rule engine | Apply channel-specific Normal/Warning/Severe limits; rules always retain safety priority. |
| Feature engine | Generate rolling, cross-sensor, derivative, setpoint and threshold-distance features. |
| LSTM service | Forecast expected behavior and generate temporal residual/embedding features. |
| LightGBM service | Generate calibrated per-fault probabilities for each prognosis horizon. |
| Decision layer | Apply persistence/hysteresis, combine rules and ML evidence, suppress duplicate alerts. |
| SHAP explainer | Explain surfaced diagnoses and persist top contributors. |
| Diagnosis API | Expose a versioned contract to Analyzer UI and alert adapters. |
| Model registry | Track models, datasets, parameters, metrics, approvals and production aliases. |

## 6. Online Inference Data Flow
Figure 2 - Online prediction flow from a telemetry packet to an explainable diagnosis event.
## 6.1 Proposed inference cadence and latency
| Item | Initial design target | Reasoning |
| Process resampling | 1 Hz | Fast enough for the listed process variables while limiting duplicate highly-correlated samples. |
| Full ML inference | Every 1-5 s | The process is slower than high-frequency vibration; exact cadence should be tuned from plant dynamics. |
| Rolling history | 2, 5 and 10 min candidates | Allows short transient, medium trend and slower thermal/load behavior to be compared. |
| Prediction horizons | 5, 15, 30 min | Provides immediate, operational and early-warning horizons. |
| Prediction latency | p95 < 3 s after eligible sample | Proposed application SLO, not a process-safety guarantee. |
| Alert persistence | Example: 3 of 5 consecutive predictions | Prevents one noisy prediction from becoming an operator alarm. |
| Model fallback | Rules-only when ML window/model unavailable | System remains useful even during model-service degradation. |

## 7. Offline Training Architecture
Figure 3 - Reproducible offline training pipeline with chronological validation and a model registry.
## 7.1 Training pipeline principles
The training dataset must be built from immutable time-bounded snapshots so an experiment can be reproduced later.
All feature transformations, scalers, category encoders and label logic must be versioned with the model artifact.
LSTM features supplied to the boosted-tree model should be generated without contaminating validation/test periods. For rigorous experiments, generate out-of-fold or strictly train-fitted representations.
Keep the final test set untouched until candidate architecture/tuning decisions are complete.
Maintain separate event-based and row-based evaluation reports; production acceptance depends on event metrics.
Register a champion and challenger rather than overwriting a single production model.
## 8. Hybrid Model Design
Figure 4 - Internal hybrid model: LSTM temporal representation and residuals feeding LightGBM diagnosis classifiers.
## 8.1 Why LSTM is useful here
The sensor behavior is multivariate and ordered. A pressure reading of 4.4 MPa has different meaning when it is stable versus when it has climbed steadily from 3.6 MPa while current is increasing and feed rate is unchanged. LSTM layers maintain recurrent state over a sequence and are suitable for learning these temporal dependencies. TensorFlow time-series guidance explicitly structures forecasting around consecutive input windows and supports recurrent models for multi-output and multi-step forecasting [R1].
## 8.2 Why LightGBM is useful here
Once temporal history has been transformed into rolling statistics, cross-sensor features and LSTM residuals/embeddings, the diagnosis problem becomes a structured/tabular classification problem. LightGBM is a highly efficient gradient-boosted decision-tree implementation and provides mature early-stopping and class-imbalance controls [R3, R9]. Its tree structure is also well suited to SHAP explanations.
## 8.3 Why XGBoost remains a challenger
XGBoost is a strong scalable boosted-tree system [R10] with robust early-stopping support [R4]. The production choice between LightGBM and XGBoost should be made from identical splits and operational metrics. If XGBoost materially improves recall/lead-time at an acceptable false-alarm rate, it should become the champion.
## 8.4 Suggested LSTM baseline
| Input: [batch, lookback_steps, feature_count] LSTM(64, return_sequences=True) Dropout(0.20) LSTM(32, return_sequences=False) Dropout(0.20) Dense(32, activation="relu") Head A: forecast selected future process channels Head B: expose 32-D temporal embedding Derived: residual = actual - forecast |

Start small. With approximately 14 primary channels plus context/features, a 64 -> 32 LSTM is a sensible baseline. Larger recurrent networks should only be introduced if learning curves show underfitting. Keras provides standard LSTM layers and EarlyStopping callbacks; early stopping should restore the best validation weights [R2, R8].
## 9. Feature Engineering Specification
## 9.1 Feature families
| Feature family | Examples / purpose |
| Raw state | Current RPM, VM, VG, temperatures, pressure, level, current, feed rate. |
| Rolling location | Mean / median over 30 s, 2 min, 10 min. |
| Rolling dispersion | Std dev, range, coefficient of variation where meaningful. |
| Trend | Linear slope, first difference, rate of change, EWMA slope. |
| Extremes | Rolling min/max and time-since-min/max. |
| Threshold distance | Normalized distance to normal/warning/severe boundary. |
| Setpoint deviation | Actual - recipe/machine setpoint, normalized by expected operating span. |
| Cross-sensor ratios | P/FR, I/RPM, P/I, P/SRPM, FR/RPM, vibration/RPM where meaningful. |
| Thermal relationships | Z2-Z1, Z3-Z2, MT-Z3, temperature slopes. |
| Temporal-model residuals | LSTM forecast error per channel, absolute error, normalized error. |
| Temporal embedding | 32-D LSTM representation of recent machine history. |
| Context | Recipe ID, product grade, operating state, machine ID, shift/batch if justified. |
| Data quality | Missing flags, stale duration, packet delay, clipping/outlier flags. |

## 9.2 Essential setpoint features
Feed rate is recipe-dependent, so absolute FR cannot be interpreted consistently without recipe context. Add recipe_id/product_id and setpoints for feed, motor/screw speed, zone temperatures and expected process ranges. In many cases, normalized deviation features generalize better than absolute sensor values across products.
| FR_error        = FR - FR_setpoint Z1_error        = Z1 - Z1_setpoint P_error_expected= P  - recipe_expected_pressure RPM_error       = RPM - RPM_setpoint thermal_gradient_12 = Z2 - Z1 thermal_gradient_23 = Z3 - Z2 melt_zone_delta = MT - Z3 load_proxy       = I / max(RPM, epsilon) pressure_feed_ratio = P / max(FR, epsilon) |

## 9.3 Operating-state gating
Model behavior must be conditioned on machine state. Startup, warm-up, recipe transition, purge and shutdown legitimately violate steady-production relationships. Either train state-specific models or include the operating state as a categorical feature and suppress inappropriate diagnoses during non-production states.
| Operating state | ML treatment |
| OFF | Do not run production fault models; run sensor/communication checks only. |
| STARTING | Use startup-specific rules; avoid steady-state diagnosis. |
| WARMING | Focus on thermal-control quality; pressure/load predictions may be ineligible. |
| STEADY_PRODUCTION | Full diagnosis and prognosis enabled. |
| RECIPE_CHANGE | Use transitional setpoints and suppress persistence-based alarms until stabilization criteria are met. |
| PURGING | Dedicated transient logic; exclude from normal supervised training unless explicitly modeled. |
| SHUTDOWN | No production diagnosis; verify orderly decay. |
| MAINTENANCE | Exclude from training/inference and mark data accordingly. |

## 10. Fault Taxonomy and Label Strategy
## 10.1 Initial diagnosis taxonomy (SME validation required)
| Diagnostic hypothesis | Indicative evidence - not a final engineering rule |
| Downstream restriction / die blockage | P rising; I/load rising; FR stable; SRPM/RPM may soften; MT/Z3 relationship changes. |
| Motor overload | I elevated/rising; RPM deviation; TMOT rise; process load context. |
| Motor mechanical abnormality | VM increase/instability with RPM/load context; possible current variability. |
| Gearbox mechanical abnormality | VG increase; TGB rise; speed relationship instability. |
| Feed starvation | Low L; low/declining FR; P and I may decline. |
| Overfeeding / high process load | FR above expected; P and I rise; potential speed/thermal impact. |
| Barrel thermal-control issue | Zone deviation from setpoint; excessive oscillation; abnormal gradient between zones. |
| Melt thermal issue | MT deviation inconsistent with zone setpoints/load. |
| Drive/screw-speed anomaly | RPM/SRPM relationship deviates from expected gearbox ratio or commanded speed. |
| Cooling degradation | TMOT/TGB rising disproportionately to load and ambient/reference conditions. |
| Sensor/data fault | Frozen values, impossible jump, clipping, stale channel, broken cross-sensor correlation. |
| General process instability | Oscillatory or unstable multichannel behavior without a single confirmed root cause. |

## 10.2 Multi-label targets
A machine may experience more than one developing problem at the same time. Therefore, represent each diagnosis as an independent binary target per prediction horizon rather than forcing a single multiclass output.
| restriction_next_5m       0/1 restriction_next_15m      0/1 restriction_next_30m      0/1 motor_overload_next_5m    0/1 motor_overload_next_15m   0/1 ... gearbox_issue_next_30m    0/1 |

## 10.3 Event-aware label generation
Figure 5 - Prognosis labeling relative to a confirmed fault onset; repair/reset periods are excluded from normal training.
Create fault_onset and fault_clear timestamps from maintenance/operator-confirmed events.
For a horizon H, a sample is positive when a confirmed fault onset occurs in (t, t+H].
Exclude active-fault and immediate post-repair windows from pre-fault negatives; they represent different process regimes.
When exact onset is uncertain, store label confidence and perform sensitivity analysis around the onset interval.
Keep events grouped during train/validation/test creation so windows from one physical event cannot leak across partitions.
## 11. Data Preparation and Time-Series Splitting
## 11.1 Data-quality gate
| Check | Example rule | Action |
| Freshness | timestamp lag > configured limit | Set stale flag; do not silently forward-fill long outages. |
| Range sanity | physically impossible sensor value | Quarantine observation and create data-quality event. |
| Rate-of-change | single-step jump exceeds plausible process change | Flag spike; retain raw data for investigation. |
| Frozen sensor | same value beyond allowable duration | Mark stale/frozen; exclude from ML or add missing flag. |
| Ordering | out-of-order timestamps / duplicates | Reorder within small buffer; dedupe exact repeats. |
| Missingness | short gap vs long gap | Short gaps may be cautiously interpolated; long gaps remain missing/ineligible. |
| Unit/schema | wrong unit/type/channel | Reject or transform only under explicit schema version. |

## 11.2 Chronological splitting
Do not randomly shuffle overlapping time windows across train and test. Neighboring windows share almost the same observations, which can produce unrealistically high scores. Use time-ordered partitions and a gap at least as large as the maximum lookback plus forecast horizon. Scikit-learn explicitly recommends time-series-aware splitting for ordered data and supports a gap between training and test portions [R5].
| Example baseline split by time: Train       = earliest 70% Validation  = next 15% Test        = final 15% Gap between partitions >= max_lookback + max_prediction_horizon Additional validation when multiple machines exist: Train: TSE-01 + TSE-02 Test : TSE-03 (unseen-machine generalization) |

## 11.3 Scaling and categorical handling
LSTM numeric inputs: StandardScaler or RobustScaler fitted on training data only; persist scaler with model.
Boosted trees: scaling is generally unnecessary, but use the same deterministic feature definitions.
Recipe/state categorical values: use stable IDs; LightGBM can use categorical features or encoded representations, while LSTM may use embeddings/one-hot depending on cardinality.
Do not compute normalization statistics from validation/test data.
Use machine-aware normalization only if it improves cross-machine validation and does not hide real degradation.
## 12. Model Training Configuration
## 12.1 LSTM baseline training plan
| Setting | Recommended starting point |
| Objective | Forecast selected future channels and/or reconstruct expected normal behavior; expose temporal embedding. |
| Lookback candidates | 120 s, 300 s, 600 s at 1 Hz (2/5/10 min). |
| Prediction step | Start with next 30-60 s forecast or direct multi-step horizon; compare empirically. |
| Architecture | LSTM 64 -> Dropout 0.2 -> LSTM 32 -> Dropout 0.2 -> Dense 32. |
| Optimizer | Adam. |
| Initial learning rate | 1e-3 baseline; tune 1e-4 to 3e-3. |
| Batch size | 128 baseline; compare 64/128/256 based on GPU memory and convergence. |
| Maximum epochs | 100. |
| Early stopping | Patience 10-15 on validation loss; restore best weights [R2]. |
| Gradient clipping | Global norm around 1.0 baseline to reduce unstable updates. |
| Loss | MAE/Huber for robust forecasting; weighted multi-output loss if channels have unequal importance. |
| Regularization | Dropout 0.1-0.3; avoid oversized networks until underfitting is demonstrated. |
| Seed/reproducibility | Record random seeds, library/container versions and data snapshot. |

## 12.2 LightGBM baseline training plan
| Setting | Recommended starting point |
| Objective | Binary classifier per fault/horizon or MultiOutput wrapper of independent classifiers. |
| learning_rate | 0.03 |
| num_leaves | 31 baseline; tune 15-127 |
| max_depth | 5-8 candidate range; -1 only if regularization prevents overfit. |
| min_child_samples | 30-100 |
| n_estimators / rounds | Up to 2,000-3,000 with early stopping rather than a fixed final count. |
| feature_fraction / colsample | ~0.8 baseline |
| bagging_fraction / subsample | ~0.8 baseline with suitable frequency |
| L1/L2 regularization | Tune; especially useful with many correlated rolling features. |
| Class imbalance | Class weights / scale_pos_weight; validate probability calibration afterward. |
| Early stopping | ~100 rounds on validation PR-AUC/logloss; LightGBM supports early stopping [R3]. |

## 12.3 XGBoost challenger configuration
| Setting | Recommended starting point |
| tree_method | hist |
| learning_rate | 0.03 |
| max_depth | 4-6 baseline |
| min_child_weight | 5-20 |
| subsample | 0.8 |
| colsample_bytree | 0.8 |
| n_estimators / rounds | Up to 2,000-3,000 with early stopping. |
| regularization | Tune reg_alpha, reg_lambda and gamma. |
| Class imbalance | scale_pos_weight as a starting technique; tune by validation. |
| Early stopping | ~100 rounds; XGBoost exposes best_iteration/best_score [R4]. |

## 12.4 Epochs: what "perfect training" actually means
| Do not select a fixed epoch count in advance Set a generous maximum (for example 100 epochs) and use validation-driven EarlyStopping. One dataset may converge at epoch 24 and another at epoch 63. The correct model is the checkpoint with the best held-out validation behavior, not the one that completes a predetermined number of epochs. |

## 13. Hyperparameter Tuning
Use Optuna or an equivalent search framework only after baseline pipelines are correct. Optuna supports programmatic search over model hyperparameters [R7]. The highest-value parameters for this use case are often data-window and feature parameters rather than model size alone.
| Model / layer | Tune first | Tune later |
| Data window | lookback, resampling cadence, prediction horizon | multiple parallel windows, state-specific windows |
| LSTM | units, layers, dropout, learning rate, batch size | loss weighting, forecast head design |
| LightGBM | num_leaves, max_depth, min_child_samples, learning rate | regularization, bagging, feature fraction |
| XGBoost | max_depth, min_child_weight, learning rate, subsample | gamma, alpha/lambda |
| Decision layer | probability threshold, persistence N-of-M, cooldown | dynamic threshold by state/recipe if justified |

Optimize for PR-AUC/recall under a false-alarm constraint rather than generic accuracy.
Use nested or well-separated validation/test periods if tuning is extensive.
Keep the search space bounded; giant searches on a leaky split only produce confidently wrong models.
Log every trial, feature-set hash, data snapshot and code revision to the experiment tracker.
## 14. Evaluation and Acceptance Gates
## 14.1 Required metrics
| Metric | Why it matters |
| Precision | Fraction of raised diagnoses that are actually correct. |
| Recall / sensitivity | Fraction of real faults detected; particularly important for severe events. |
| F1 | Balances precision and recall when a single comparison number is useful. |
| PR-AUC | More informative than raw accuracy for rare fault events. |
| ROC-AUC | Useful secondary discrimination metric, but can look optimistic under extreme imbalance. |
| False alarms / operating hour | Direct operator-burden metric. |
| Median and p10 warning lead time | How early the system warns before confirmed onset. |
| % faults detected >= 5/15/30 min early | Direct prognosis usefulness. |
| Missed severe events | Must be explicitly enumerated and reviewed. |
| Calibration error / reliability curve | Whether probability values are trustworthy enough for risk thresholds. |
| Inference latency | Ensures predictions arrive before they are operationally stale. |

## 14.2 Event-level evaluation
Row-level classification can mislead. A 10-minute fault produces hundreds of one-second rows; detecting only the final minute may look numerically strong but provide almost no operational value. Evaluation must group predictions by physical event and measure first valid alarm time relative to fault onset.
| Example event report Fault onset:                14:30:00 First persistent prediction:14:16:42 Lead time:                  13m 18s Peak risk before onset:     0.91 False alerts in prior 8 h:  0 Outcome:                    detected >= 5m and >= 10m early |

## 14.3 Proposed production acceptance gate (to be finalized with SMEs)
| Gate | Proposed criterion |
| Safety boundary | No ML output directly executes safety-critical control action. |
| Data-quality fallback | Rules-only operation works when ML inputs are ineligible. |
| Severe-fault recall | Target defined per fault class from plant risk analysis; review every miss. |
| False-alarm burden | Explicit maximum false alarms per operating hour/shift, set with operators. |
| Lead time | Minimum useful lead time defined per fault type. |
| Calibration | Reliability acceptable for thresholds used in UI/alerts. |
| Generalization | Pass future-time test; pass unseen-machine/recipe test where data exists. |
| Reproducibility | Registered model can be rebuilt from recorded data/code/config lineage. |
| Rollback | Previous champion can be restored without retraining. |

## 15. Explainability and Operator Trust
Use SHAP for the boosted-tree layer. SHAP provides explainers for model outputs and is widely used to attribute prediction contribution to individual features [R6]. Explanations should be limited to the top few stable factors so operators see a concise, consistent story rather than hundreds of engineered features.
| Example diagnosis card Issue: Downstream restriction Probability: 0.87 Horizon: 15 min Top evidence: 1. pressure_slope_2m          +0.31 contribution 2. motor_current_slope_2m    +0.23 3. pressure_feed_ratio        +0.18 4. srpm_error_30s             +0.11 5. lstm_pressure_residual     +0.08 Rule state now: Normal Interpretation: risk is predictive, not a current hard alarm. |

Show raw values and units beside derived features when possible.
Clearly distinguish a hard engineering threshold alarm from an ML risk prediction.
Store the model version and explanation payload with every surfaced alert.
Do not let a generative model invent root-cause explanations. Any narrative should be template-driven from validated feature evidence and SOP text.
## 16. MLOps and Model Lifecycle
Figure 6 - Model lifecycle: validated data and outcomes continuously improve future champion models.
## 16.1 Model registry and lineage
Use an experiment tracker/model registry such as MLflow. The MLflow Model Registry supports model versioning, aliases/tags and deployment-oriented workflows [R13]. Store model artifact, scaler, feature schema, label configuration, training data snapshot identifier, code commit, environment lockfile, metrics and approval metadata.
| Artifact / metadata | Must be recorded |
| Model binaries | LSTM SavedModel/Keras artifact; LightGBM/XGBoost model file. |
| Feature schema | Feature names, order, type, units and version. |
| Preprocessing | Scaler parameters, category mapping, missingness policy. |
| Training config | Hyperparameters, random seeds, early-stopping result. |
| Data lineage | Snapshot/time range, included machines, recipes and event IDs. |
| Evaluation | Row metrics, event metrics, calibration, confusion matrices. |
| Approval | Who approved promotion and on what evidence. |
| Runtime contract | Expected input schema and output schema versions. |

## 16.2 Retraining triggers
Enough new confirmed fault events have accumulated to materially change class coverage.
Feature/input drift persists beyond agreed thresholds.
Calibration degrades or false-alarm rate increases.
Recipe/product portfolio changes substantially.
Machine hardware/gear ratio/sensor locations change.
A production incident exposes a missed fault signature.
Periodic review (for example monthly/quarterly) may check need, but retraining should be evidence-driven rather than automatic.
## 17. Deployment Topology and Platform Sizing
Figure 7 - Recommended centralized inference topology, with optional edge buffering for connectivity resilience.
## 17.1 Recommended technology stack
| Layer | Recommended starting technology | Notes |
| Messaging | EMQX / MQTT | Reuse authenticated telemetry transport; enforce topic/schema conventions. |
| Ingestion | Node.js or Python service | Validate packets and persist; separate from heavy training workloads. |
| Historical telemetry | PostgreSQL + Timescale extension or equivalent TSDB | Good fit when PostgreSQL is already in the stack; partition/retention policy required. |
| Online window/cache | Redis | Fast per-machine rolling windows and state. |
| Feature/inference | Python 3.x service | TensorFlow/Keras + LightGBM + SHAP; expose internal REST/gRPC. |
| Experiment tracking | MLflow | Runs, artifacts, registry and champion/challenger aliases. |
| Object storage | S3-compatible storage | Model artifacts, dataset snapshots and reports. |
| UI/API | Existing application backend + Analyzer UI | Do not run model logic in the browser. |
| Monitoring | Prometheus/Grafana or existing observability stack | Latency, error rate, drift, model outputs and data quality. |

## 17.2 Training hardware
| Workload | Practical starting point |
| Feature engineering / LightGBM / XGBoost | 8+ CPU cores, 32 GB RAM, SSD. CPU is usually enough for initial model sizes. |
| LSTM PoC training | NVIDIA GPU with ~8-16 GB VRAM is comfortable for this modest sequence model; CPU works but is slower. |
| Large-scale history / many machines | Scale memory/CPU or use distributed data processing only when data volume requires it. |
| Production inference | CPU may be sufficient for both small LSTM and tree model at 1-5 s cadence; benchmark p95 latency before deciding on GPU. |
| Development platform | Local Linux/WSL GPU workstation or managed GPU notebook/VM. Production training should run from a reproducible container/pipeline, not a one-off notebook. |

## 17.3 Centralized vs edge inference
| Option | Advantages | Trade-offs | Recommendation |
| Centralized service | Simpler model updates, shared registry, easier monitoring | Depends on plant-to-service connectivity | Recommended first release with local buffering/fallback rules. |
| Edge inference | Lowest latency, works during WAN outage | Harder fleet model updates/monitoring, hardware diversity | Future option for sites requiring offline ML. |
| Hybrid | Local rules/quality + central ML | More moving parts | Strong long-term architecture if WAN reliability is a concern. |

## 18. Interfaces and Data Contracts
## 18.1 Telemetry event
| {   "schema_version": "1.0",   "machine_id": "TSE-01",   "timestamp": "2026-09-03T17:30:01.000Z",   "operating_state": "STEADY_PRODUCTION",   "recipe_id": "RCP-42",   "channels": {     "RPM": 1998,     "VM": 1.72,     "VG": 1.64,     "TMOT": 46.3,     "TGB": 44.9,     "Z1": 181.2,     "Z2": 209.8,     "Z3": 221.1,     "MT": 212.5,     "P": 4.18,     "L": 72.0,     "I": 10.6,     "FR": 50.0   },   "quality": {"P": "GOOD", "VG": "GOOD"} } |

## 18.2 Diagnosis API output
| {   "machine_id": "TSE-01",   "prediction_time": "2026-09-03T17:30:02.120Z",   "rule_state": "NORMAL",   "ml_eligible": true,   "model": {     "lstm_version": "tse-temporal@champion",     "diagnosis_version": "tse-diagnosis@champion"   },   "diagnoses": [     {       "code": "DOWNSTREAM_RESTRICTION",       "risk": {"5m": 0.31, "15m": 0.87, "30m": 0.94},       "severity": "PREDICTIVE_WARNING",       "persistent": true,       "top_factors": [         {"feature": "P_slope_2m", "contribution": 0.31},         {"feature": "I_slope_2m", "contribution": 0.23}       ]     }   ],   "data_quality": {"status": "GOOD", "missing_channels": []} } |

## 18.3 Minimum database entities
| Entity | Key fields |
| telemetry_raw | timestamp, machine_id, channel values, quality, schema version |
| telemetry_1s | resampled clean values + missing flags |
| machine_context | machine_id, gear ratio, sensor config, commissioning version |
| recipe_context | recipe_id, setpoints, expected bands, product metadata |
| fault_event | event_id, fault_code, onset, confirmation, clear time, confidence, notes |
| maintenance_event | work order, action, component, start/end, outcome |
| feature_snapshot | optional materialized features for reproducibility/debugging |
| prediction_event | prediction timestamp, model versions, probabilities, rule state, SHAP factors |
| operator_feedback | prediction/alert id, acknowledge, confirmed/false positive, root cause |

## 19. Reliability, Safety and Security
## 19.1 Safety boundary
| Mandatory design rule The ML system is an advisory diagnostic layer. Hard shutdowns, interlocks and safety-critical control must remain in validated PLC/control logic unless a separate functional-safety engineering process approves any future closed-loop ML use. |

## 19.2 Failure modes and fallbacks
| Failure mode | Expected behavior |
| ML service unavailable | Continue rule engine; UI shows ML unavailable rather than stale probability. |
| Insufficient history | Rules-only until the minimum clean lookback is available. |
| Sensor missing/stale | Mark data-quality issue; do not fabricate long gaps; suppress diagnoses dependent on missing sensor. |
| Model artifact corrupt/load failure | Fail closed to rules-only; alarm engineering observability. |
| Feature schema mismatch | Reject inference request; never reorder/guess silently. |
| Prediction burst/noise | Persistence/hysteresis and cooldown limit alert storms. |
| Clock drift | Monitor gateway/server timestamp offsets; exclude badly skewed windows. |
| Database outage | Use bounded buffering where possible; inference can continue from online cache if safe, then reconcile logs. |

## 19.3 Security controls
MQTT authentication/authorization per gateway; least-privilege topic ACLs.
TLS for telemetry and service-to-service traffic; rotate credentials and secrets.
Validate payload schema and enforce bounded numeric values before storage/inference.
Network-separate the ML/application layer from safety PLC control paths where appropriate.
Sign or checksum model artifacts; restrict who can promote a model alias to production.
Persist audit logs for model promotion, configuration changes and operator acknowledgements.
Do not expose raw model-management endpoints to the public application surface.
## 20. Monitoring and Drift Management
## 20.1 Runtime observability
| Category | Metrics / signals |
| Data quality | missing %, stale %, duplicates, out-of-order rate, sensor freeze duration, input distribution. |
| Inference health | request rate, p50/p95/p99 latency, error rate, fallback rate, model-load status. |
| Model outputs | risk distribution by fault/horizon, alarm rate, persistence rate, calibration where outcomes are available. |
| Operational outcomes | true positives, false positives, missed events, lead-time distribution, operator acknowledgement. |
| Drift | feature PSI/KS or suitable distribution measures; residual drift; recipe/machine mix shift. |
| Infrastructure | CPU/RAM/GPU utilization, Redis memory, DB ingest lag, broker backlog. |

## 20.2 Drift response
Drift is not automatically a model failure; first determine whether the cause is a new recipe, sensor replacement, process improvement or degradation.
When drift is due to a known configuration change, update context/config and validate before retraining.
When outcome performance worsens, create a new challenger; do not mutate the champion in place.
Keep enough historical feature snapshots to reproduce high-impact false positives/misses.
## 21. Implementation Roadmap
| Phase | Scope | Exit criterion |
| Phase 0 - Instrumentation audit | Confirm channel semantics, actual sample rates, gear ratio/SRPM derivation, sensor locations, recipe/setpoint availability and timestamp quality. | Exit: signed channel dictionary + event-label taxonomy. |
| Phase 1 - Deterministic baseline | Implement rule engine, data-quality checks, telemetry persistence and Analyzer status. | Exit: reliable Normal/Warning/Severe and quality flags. |
| Phase 2 - Dataset + labels | Build fault/maintenance event table, label generation and chronological dataset builder. | Exit: reproducible training snapshot with event inventory. |
| Phase 3 - Boosted-tree baseline | Train LightGBM/XGBoost on engineered rolling features. | Exit: baseline event metrics and SHAP explanations. |
| Phase 4 - LSTM temporal model | Train forecast/anomaly LSTM; evaluate residual quality and early-drift detection. | Exit: validated temporal model and residual features. |
| Phase 5 - Hybrid model | Add LSTM residuals/embeddings to tree model; calibrate horizon probabilities. | Exit: measurable improvement over tree-only baseline. |
| Phase 6 - Shadow production | Run online without operator alerts; compare predictions with real outcomes. | Exit: stable latency/data quality and verified event behavior. |
| Phase 7 - Canary alerts | Enable limited machines/operators with acknowledgement feedback. | Exit: acceptable false-alarm burden and lead time. |
| Phase 8 - Production + MLOps | Champion/challenger, monitoring, retraining workflow and rollback. | Exit: operational ownership and periodic review process. |

## 22. Risks and Mitigations
| Risk | Impact | Mitigation |
| Few real fault events | A supervised model can memorize thresholds or individual events. | Begin with rules + healthy-state LSTM anomaly features; aggressively improve event labeling; avoid claiming fault-specific accuracy without enough independent events. |
| Label ambiguity | Fault onset may be documented late. | Store onset confidence/window; sensitivity-test labels; use maintenance/operator validation. |
| Recipe confounding | Normal behavior changes by product/recipe. | Include recipe/setpoints; validate by held-out recipes; use normalized deviation features. |
| Startup/transient false alarms | Steady-state model sees legitimate transients as anomalies. | Operating-state gating and state-specific rules/models. |
| Sensor drift/failure | Model interprets sensor problem as process fault. | Data-quality model, redundancy/correlation checks and sensor-fault class. |
| Leakage from overlapping windows | Unrealistically high offline metrics. | Chronological splits with a gap and event grouping. |
| Class imbalance | Healthy rows dominate accuracy. | Class weights, PR-AUC, event-level recall and calibrated thresholds. |
| Alert fatigue | Too many predictive warnings reduce trust. | Persistence, cooldown, per-fault thresholds and operator feedback. |
| Model drift after hardware changes | Sensor/gearbox replacement changes distribution. | Version machine configuration and trigger revalidation. |
| Opaque diagnosis | Operators cannot trust "AI anomaly". | SHAP, raw signal trends, rule state and clear uncertainty. |
| ML service failure | Application loses diagnosis. | Rules-only fallback and health monitoring. |
| Unsafe automation | Risk score directly drives control action. | Keep ML advisory; any future closed loop requires independent safety engineering and validation. |

## 23. Final Recommendation
| Production target architecture Rules + Data Quality + LSTM + LightGBM + SHAP, with XGBoost maintained as the challenger. The rule engine answers current state; LSTM learns how the machine evolves; boosted trees map temporal/process evidence to fault probabilities; SHAP explains the diagnosis. |

The biggest determinants of success will not be whether LightGBM beats XGBoost by a small offline score. They will be the quality of fault-event labels, correct recipe/setpoint context, chronological leakage-free validation, sufficient independent failures, operating-state handling, sensor quality and whether the alert thresholds are tuned to operator burden and useful lead time.
The most effective implementation sequence is therefore: reliable deterministic rules -> clean/event-labeled dataset -> engineered-feature tree baseline -> LSTM temporal model -> hybrid model -> shadow deployment -> canary alerts -> production champion/challenger. This sequence provides useful capability early while keeping every additional ML layer measurable and reversible.
## Appendix A - Recommended Feature Formula Catalogue
| Feature | Formula / definition |
| Normalized nominal deviation | (x - nominal) / max(|nominal|, eps) |
| Setpoint deviation | x - x_setpoint |
| Normalized setpoint deviation | (x - x_setpoint) / expected_span |
| Slope | least-squares slope over rolling window |
| Rate of change | (x_t - x_t-k) / delta_time |
| EWMA | alpha*x_t + (1-alpha)*EWMA_(t-1) |
| Pressure/feed ratio | P / max(FR, eps) |
| Load proxy | I / max(RPM, eps) |
| Thermal zone gradient 1-2 | Z2 - Z1 |
| Thermal zone gradient 2-3 | Z3 - Z2 |
| Melt-zone delta | MT - Z3 |
| Expected screw-speed error | SRPM_measured - RPM/gear_ratio |
| LSTM residual | actual - forecast |
| Normalized residual | (actual - forecast) / training_residual_scale |
| Threshold distance | signed normalized distance to nearest warning/severe boundary |

## Appendix B - Training Experiment Matrix
| ID | Model | Inputs | Purpose |
| E0 | Rules only | Current sensors + thresholds | Trusted deterministic baseline |
| E1 | LightGBM raw | Current sensors | Quantify value of raw snapshot only |
| E2 | LightGBM engineered | Raw + rolling/trend/context | Primary tabular baseline |
| E3 | XGBoost engineered | Same as E2 | Challenger comparison |
| E4 | LSTM forecast | Raw/context sequence | Forecast quality + anomaly residuals |
| E5 | Hybrid residual | E2 + LSTM residuals | Test temporal residual value |
| E6 | Hybrid residual+embedding | E2 + residuals + embedding | Full recommended candidate |
| E7 | Ablations | Remove feature groups one at a time | Determine what actually adds value |

## Appendix C - References and Technical Basis
| Reference | URL | Use in this design |
| [R1] TensorFlow - Time series forecasting | https://www.tensorflow.org/tutorials/structured_data/time_series | Window-based time-series modeling, recurrent and multi-step forecasting examples. |
| [R2] Keras - EarlyStopping | https://keras.io/api/callbacks/early_stopping/ | Validation-driven stopping and restoring best weights. |
| [R3] LightGBM documentation - Parameters | https://lightgbm.readthedocs.io/en/latest/Parameters.html | Boosting parameters, class imbalance and early stopping. |
| [R4] XGBoost Python introduction / early stopping | https://xgboost.readthedocs.io/en/stable/python/python_intro.html | Validation-based early stopping and best iteration. |
| [R5] scikit-learn - TimeSeriesSplit | https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html | Time-ordered cross-validation and gap support. |
| [R6] SHAP - Explainer documentation | https://shap.readthedocs.io/en/latest/generated/shap.Explainer.html | Feature attribution/explanation interface. |
| [R7] Optuna | https://optuna.org/ | Hyperparameter optimization framework. |
| [R8] Hochreiter & Schmidhuber (1997), Long Short-Term Memory | https://doi.org/10.1162/neco.1997.9.8.1735 | Foundational LSTM architecture. |
| [R9] Ke et al. (2017), LightGBM: A Highly Efficient Gradient Boosting Decision Tree | https://papers.nips.cc/paper/6907-lightgbm-a-highly-efficient-gradient-boosting-decision-tree | LightGBM algorithm and efficiency design. |
| [R10] Chen & Guestrin (2016), XGBoost: A Scalable Tree Boosting System | https://arxiv.org/abs/1603.02754 | XGBoost design and scalable tree boosting. |
| [R11] Malhotra et al. (2016), LSTM-based Encoder-Decoder for Multi-sensor Anomaly Detection | https://arxiv.org/abs/1607.00148 | Normal-behavior reconstruction for multi-sensor anomaly detection. |
| [R12] Filonov et al. (2016), Fault Detection Using an LSTM-based Predictive Data Model | https://arxiv.org/abs/1612.06676 | Industrial multivariate time-series fault detection using LSTM prediction errors. |
| [R13] MLflow Model Registry documentation | https://mlflow.org/docs/latest/ml/model-registry/tutorial | Model registration, versioning, aliases and lifecycle workflow. |
