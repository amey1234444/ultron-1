# ULTRON Predictive Intelligence Engine — Implementation Plan

Status: living document, written before implementation and updated as the build progressed.

## 1. Interpretation of the supplied documents

Two engineering documents were referenced by the brief:

| Document | Machine | Role in this project |
|---|---|---|
| A — *TSE Predictive Diagnosis & Prognosis System – HLD* | Twin-screw extruder (TSE) | Defines the online/offline architecture (rules → windows → features → LSTM → boosted trees → calibration → SHAP → decision), the 14 baseline channels (RPM, SRPM, VM, VG, TMOT, TGB, Z1–Z3, MT, P, L, I, FR), the four logical questions (detection / diagnosis / prognosis / explanation), the LSTM baseline topology (64→32 LSTM, Dropout 0.2, Dense 32), LightGBM primary + XGBoost challenger, the 5/15/30-minute horizons, chronological splitting with a leakage gap, the E0–E7 experiment matrix, and the operational targets (inference every 1–5 s, p95 < 3 s). |
| B — *ULTRON Master Fault Analysis Catalogue* | Single-screw extruder (SSE) | Defines 21 machine/process sections, hundreds of fault records with Frequent/Sometimes/Rare occurrence, D1/D2/D3 detectability, sensor vectors, normal/min/max and fault values, confirmation notes and propagation / cascade scenarios. |

**Document availability caveat.** At the time of implementation only the brief itself was
delivered to the build environment; the two PDFs were not available. Every value that the
brief itself states (channel list, architecture, topology, hyper-parameters, horizons,
splits, decision defaults, operating states, simulator scenarios, propagation example) was
implemented verbatim and is traced in `docs/traceability/DOCUMENT_TRACEABILITY.md`.
Where the brief only *refers* to the documents (exact TSE engineering ranges, the full SSE
catalogue records), the configuration files are marked `source_document_reference:
"PENDING: Document A/B not supplied"` and populated with clearly labelled **engineering
placeholders** consistent with the example telemetry in the brief (RPM≈2000, P≈4.2 MPa,
I≈10.6 A, Z1/Z2/Z3≈181/210/221 °C, MT≈212 °C, L≈72 %, FR≈50 kg/h). They are data — not
code — so replacing them with the real document values is a config-only change with no
model-code impact. The traceability matrix records which rows are `IMPLEMENTED (brief)`
vs `PLACEHOLDER (awaiting document)`.

## 2. TSE vs SSE boundary

* The **shared platform** (`ultron_ml/*`) is machine-agnostic: contracts, data quality,
  rules, features, windows, LSTM, trees, calibration, SHAP, decision, fault-KB abstraction,
  propagation graph, simulator framework, training, evaluation, registry, monitoring, API.
* A **machine profile** (`profiles/<name>/*.yaml`) supplies everything machine specific:
  channels + units + plausibility/normal/warning/severe ranges, operating states, recipes,
  fault taxonomy / catalogue, propagation edges, simulator scenario parameters.
* `profiles/tse/` is derived from Document A. `profiles/sse/` is derived from Document B.
* **No SSE catalogue record is assumed to apply to a TSE.** The SSE catalogue is loaded
  only when `machine_profile == "sse"`. A small `profiles/common/` holds only truly
  generic material: the `DATA_QUALITY_FAULT` family, generic sensor-fault definitions and
  the state machine vocabulary. Cross-profile reuse requires an explicit `applies_to`
  list in the record.

## 3. Target architecture

```
TELEMETRY → SCHEMA + DATA QUALITY → OPERATING STATE GATE → RULE ENGINE
 → ROLLING WINDOW STORE → FEATURE ENGINE → LSTM (forecast + 32-D embedding)
 → RESIDUALS → FEATURE UNION → LightGBM (champion) / XGBoost (challenger)
 → CALIBRATION → SHAP → DECISION LAYER → VERSIONED DIAGNOSIS API
```

The four logical questions map to modules:

| Question | Module(s) |
|---|---|
| Detection | `data_quality`, `rules`, `states` |
| Diagnosis | `features`, `temporal`, `diagnosis` |
| Prognosis | `diagnosis` (per-fault × per-horizon binary heads) |
| Explanation | `explainability` (SHAP + template narrative, no LLM) |

## 4. Repository structure

```
predictive-intelligence/
├── src/ultron_ml/{api,config,contracts,data_quality,states,rules,windows,features,
│                  temporal,diagnosis,explainability,decision,faults,propagation,
│                  simulator,training,evaluation,registry,monitoring,storage,adapters}
├── profiles/{common,tse,sse}/*.yaml
├── tests/{unit,integration,contract,model,training,e2e,property}
├── scripts/            # train, evaluate, evidence capture, benchmark
├── docs/{architecture,validation,evidence,traceability}
├── artifacts/{test-results,reports,models}
├── docker/  migrations/  docker-compose.yml  .env.example  Makefile  pyproject.toml
```

## 5. Dependency choices

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Python 3.12 via `uv` | brief prefers 3.12; all deps compatible |
| Validation | Pydantic v2 | schema-validated configs and contracts |
| Temporal model | TensorFlow/Keras 2.x | brief mandates unless justified otherwise |
| Trees | LightGBM (primary), XGBoost (challenger) | brief |
| Explainability | `shap.TreeExplainer` | exact tree SHAP |
| Calibration | scikit-learn isotonic / sigmoid, selected on validation Brier | brief |
| Tuning | Optuna (optional extra, after baseline) | brief |
| Registry | MLflow (file backend locally, service in compose) | brief |
| API | FastAPI + Uvicorn | brief |
| Storage | SQLAlchemy 2 + Alembic; PostgreSQL/Timescale in compose, SQLite in unit tests | brief |
| Metrics | `prometheus-client` | brief |
| Tests | pytest, hypothesis, pytest-cov | brief |
| Quality | Ruff (lint+format), mypy | brief |

## 6. Schemas

* `TelemetrySample` (input contract v1.0), `DiagnosisResponse` (output contract v1.0).
* `ChannelSpec`, `ThresholdBand`, `OperatingStateSpec`, `RecipeSpec`, `FaultDefinition`,
  `PropagationEdge`, `ProfileConfig` — all Pydantic, all versioned.
* `FeatureSchema` — ordered names, formulas, versions; persisted to `feature_schema.json`
  and checked at inference (mismatch → reject).
* `FaultEvent`, `MaintenanceEvent`, `PredictionEvent`, `DataQualityEvent` ORM models.

## 7. Training plan

1. Simulator → 1 Hz multi-scenario dataset with `FaultEvent` list.
2. Event-aware labels: `fault_x_next_{5,15,30}m`; exclude active-fault, recovery and
   maintenance windows; label confidence carried through.
3. Chronological 70/15/15 split with gap ≥ `max_lookback + max_horizon`; event-group
   integrity assertion; scalers fit on train only.
4. E0 rules-only → E1 LGBM raw → E2 LGBM engineered → E3 XGB engineered → E4 LSTM
   forecast → E5 trees + residuals → E6 trees + residuals + embedding → E7 ablations.
5. Calibration selected on validation; champion/challenger from operational metrics
   (event recall, lead time, false alarms/hour, PR-AUC, Brier), not row accuracy.
6. Everything logged to MLflow with lineage; promotion is explicit (no auto-promote).

## 8. Simulator strategy

Physically-motivated correlated process model: torque/load couples P, I, RPM, TMOT, TGB;
thermal zones follow setpoints with PI-like lag; feed rate drives P and I. Faults are
parameterised progressive trajectories (onset, ramp, plateau). Sensor faults corrupt the
*measurement* not the *process*. Operating states drive setpoint trajectories.
Seeded, configurable noise, duration, rate, recipe, profile.

## 9. Test strategy

Unit (DQ, rules, features, states, ambiguity, decision) · Model (shapes, embeddings,
serialization, seeds, probability range, calibration, SHAP, imbalance) · Training
(split, leakage gap, scaler fit, event grouping, horizons, maintenance exclusion) ·
Contract (input/output schemas, OpenAPI) · Integration (full pipeline) · E2E (simulator
scenarios through API) · Property (hypothesis invariants) · Catalogue-generated
parameterised tests per D1/D2/D3 record.

## 10. Acceptance matrix

Maintained in `docs/traceability/DOCUMENT_TRACEABILITY.md` and summarised in
`docs/validation/VALIDATION_REPORT.md`.
