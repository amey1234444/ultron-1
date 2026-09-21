/**
 * Durable storage for ML predictions, explanations and feedback.
 *
 * The lineage requirement drives the schema: every surfaced prediction must
 * carry enough to reproduce it — which model, which feature-set version, which
 * baseline, which knowledge snapshot, which operating context. So the tables
 * store those as *columns*, not inside a JSON blob, because they are what
 * anybody actually queries on. "Show me every prediction from the model we
 * rolled back" is a WHERE clause; it should not be a JSON scan.
 *
 * Evidence, SHAP contributions and the alternatives list stay as JSON. They
 * are read as a unit when a human opens one prediction, their shape changes
 * with the knowledge layer, and nothing filters on them.
 *
 * The schema extends the existing `analysis_*` tables rather than creating a
 * second database. `ensureMlSchema` is idempotent and is called on first use,
 * matching how `ensureSchema` already works in `db.ts`.
 */

import type { MlDiagnosisResponse } from '../../lib/knowledge/ml/contract';
import { ensureSchema, isDbEnabled, query } from './db';

const globalRef = globalThis as unknown as { __ultronMlSchemaReady?: Promise<void> };

/**
 * Create the ML tables if they are absent.
 *
 * Separate from `ensureSchema` so a deployment that has not adopted the ML
 * layer pays nothing for it, and so a migration failure here cannot stop the
 * existing analysis path from starting.
 */
export async function ensureMlSchema(): Promise<void> {
  if (!globalRef.__ultronMlSchemaReady) {
    globalRef.__ultronMlSchemaReady = (async () => {
      await ensureSchema();

      await query(`
        CREATE TABLE IF NOT EXISTS ml_models (
          id                  BIGSERIAL PRIMARY KEY,
          model_id            TEXT NOT NULL,
          version             TEXT NOT NULL,
          model_kind          TEXT NOT NULL,
          role                TEXT NOT NULL DEFAULT 'CANDIDATE',
          machine_type        TEXT NOT NULL DEFAULT 'TWIN_SCREW_EXTRUDER',
          feature_set_version TEXT,
          trained_on_dataset  TEXT,
          trained_on_real_data BOOLEAN NOT NULL DEFAULT FALSE,
          knowledge_digest    TEXT,
          code_revision       TEXT,
          random_seed         INTEGER,
          approved_by         TEXT,
          promoted_at         TIMESTAMPTZ,
          registered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          contract            JSONB NOT NULL DEFAULT '{}'::jsonb,
          validation_metrics  JSONB NOT NULL DEFAULT '{}'::jsonb,
          test_metrics        JSONB NOT NULL DEFAULT '{}'::jsonb,
          golden_results      JSONB NOT NULL DEFAULT '{}'::jsonb,
          UNIQUE (model_id, version)
        )`);

      await query(`
        CREATE TABLE IF NOT EXISTS ml_predictions (
          id                   BIGSERIAL PRIMARY KEY,
          prediction_id        UUID NOT NULL UNIQUE,
          machine_id           TEXT NOT NULL,
          observed_at          TIMESTAMPTZ NOT NULL,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          schema_version       TEXT NOT NULL,
          ml_status            TEXT NOT NULL,
          ml_eligible          BOOLEAN NOT NULL,
          eligibility_reason   TEXT,
          ml_mode              TEXT NOT NULL,
          surfaced             BOOLEAN NOT NULL DEFAULT FALSE,
          operating_state      TEXT NOT NULL,
          state_confidence     REAL,
          context_id           TEXT,
          context_confidence   REAL,
          recipe_id            TEXT,
          configuration_version TEXT,
          baseline_id          TEXT,
          baseline_level       TEXT,
          data_quality         TEXT NOT NULL,
          signals_reporting    INTEGER,
          bad_or_missing_count INTEGER,
          condition_verdict    TEXT NOT NULL,
          rule_state           TEXT NOT NULL,
          alert_reached        BOOLEAN NOT NULL DEFAULT FALSE,
          danger_reached       BOOLEAN NOT NULL DEFAULT FALSE,
          trip_active          BOOLEAN NOT NULL DEFAULT FALSE,
          diagnosis_model      TEXT,
          temporal_model       TEXT,
          feature_set_version  TEXT,
          trained_on_real_data BOOLEAN NOT NULL DEFAULT FALSE,
          versions             JSONB NOT NULL DEFAULT '{}'::jsonb,
          payload              JSONB NOT NULL
        )`);
      await query(
        `CREATE INDEX IF NOT EXISTS ml_predictions_machine_time
           ON ml_predictions (machine_id, observed_at DESC)`,
      );

      await query(`
        CREATE TABLE IF NOT EXISTS ml_fault_risks (
          id              BIGSERIAL PRIMARY KEY,
          prediction_id   UUID NOT NULL REFERENCES ml_predictions (prediction_id) ON DELETE CASCADE,
          machine_id      TEXT NOT NULL,
          observed_at     TIMESTAMPTZ NOT NULL,
          fault_id        TEXT NOT NULL,
          horizon_minutes INTEGER NOT NULL,
          probability     REAL NOT NULL,
          calibrated      BOOLEAN NOT NULL,
          threshold       REAL NOT NULL,
          crossed         BOOLEAN NOT NULL,
          persistence_met BOOLEAN NOT NULL,
          surfaced        BOOLEAN NOT NULL DEFAULT FALSE
        )`);
      await query(
        `CREATE INDEX IF NOT EXISTS ml_fault_risks_lookup
           ON ml_fault_risks (machine_id, fault_id, horizon_minutes, observed_at DESC)`,
      );

      await query(`
        CREATE TABLE IF NOT EXISTS ml_diagnosis_events (
          id                  BIGSERIAL PRIMARY KEY,
          prediction_id       UUID NOT NULL REFERENCES ml_predictions (prediction_id) ON DELETE CASCADE,
          machine_id          TEXT NOT NULL,
          observed_at         TIMESTAMPTZ NOT NULL,
          fault_id            TEXT NOT NULL,
          fault_family        TEXT,
          diagnosis_state     TEXT NOT NULL,
          severity            TEXT NOT NULL,
          severity_authority  TEXT,
          priority            TEXT NOT NULL,
          fault_confidence    REAL,
          location_confidence REAL,
          root_cause_confidence REAL,
          source              TEXT NOT NULL,
          surfaced            BOOLEAN NOT NULL DEFAULT FALSE,
          caused_by           TEXT,
          evidence            JSONB NOT NULL DEFAULT '{}'::jsonb,
          action              JSONB NOT NULL DEFAULT '{}'::jsonb
        )`);
      await query(
        `CREATE INDEX IF NOT EXISTS ml_diagnosis_events_lookup
           ON ml_diagnosis_events (machine_id, fault_id, observed_at DESC)`,
      );

      await query(`
        CREATE TABLE IF NOT EXISTS ml_prediction_explanations (
          id              BIGSERIAL PRIMARY KEY,
          prediction_id   UUID NOT NULL REFERENCES ml_predictions (prediction_id) ON DELETE CASCADE,
          fault_id        TEXT NOT NULL,
          horizon_minutes INTEGER NOT NULL,
          model_id        TEXT,
          base_value      REAL,
          contributions   JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);

      await query(`
        CREATE TABLE IF NOT EXISTS ml_anomaly_events (
          id                  BIGSERIAL PRIMARY KEY,
          prediction_id       UUID NOT NULL REFERENCES ml_predictions (prediction_id) ON DELETE CASCADE,
          machine_id          TEXT NOT NULL,
          observed_at         TIMESTAMPTZ NOT NULL,
          signal_id           TEXT NOT NULL,
          anomaly_id          TEXT,
          verdict             TEXT NOT NULL,
          value               REAL,
          expected            REAL,
          percent_deviation   REAL,
          robust_score        REAL,
          persistence_seconds REAL,
          limit_status        TEXT,
          data_quality        TEXT
        )`);

      await query(`
        CREATE TABLE IF NOT EXISTS ml_data_quality_events (
          id            BIGSERIAL PRIMARY KEY,
          prediction_id UUID NOT NULL REFERENCES ml_predictions (prediction_id) ON DELETE CASCADE,
          machine_id    TEXT NOT NULL,
          observed_at   TIMESTAMPTZ NOT NULL,
          signal_id     TEXT NOT NULL,
          rule_id       TEXT NOT NULL,
          verdict       TEXT NOT NULL,
          reason        TEXT NOT NULL,
          suppresses_physical_diagnosis BOOLEAN NOT NULL DEFAULT FALSE
        )`);

      await query(`
        CREATE TABLE IF NOT EXISTS ml_feedback (
          id                    BIGSERIAL PRIMARY KEY,
          feedback_id           UUID NOT NULL UNIQUE,
          prediction_id         UUID,
          machine_id            TEXT NOT NULL,
          submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          submitted_by          TEXT,
          diagnosis_correct     TEXT NOT NULL,
          actual_fault_id       TEXT,
          actual_location       TEXT,
          actual_root_cause     TEXT,
          action_taken          TEXT,
          post_action_result    TEXT,
          primary_anomaly_cleared TEXT,
          false_positive        BOOLEAN NOT NULL DEFAULT FALSE,
          false_negative        BOOLEAN NOT NULL DEFAULT FALSE,
          confirmation_source   TEXT,
          label_quality         TEXT NOT NULL DEFAULT 'UNVERIFIED',
          review_status         TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
          notes                 TEXT
        )`);
      await query(
        `CREATE INDEX IF NOT EXISTS ml_feedback_review
           ON ml_feedback (review_status, submitted_at DESC)`,
      );

      await query(`
        CREATE TABLE IF NOT EXISTS ml_baseline_versions (
          id                   BIGSERIAL PRIMARY KEY,
          baseline_id          TEXT NOT NULL,
          version              TEXT NOT NULL,
          machine_id           TEXT NOT NULL,
          feature_id           TEXT NOT NULL,
          context_id           TEXT NOT NULL,
          operating_state      TEXT,
          configuration_version TEXT,
          level                TEXT NOT NULL,
          status               TEXT NOT NULL,
          sample_count         INTEGER NOT NULL DEFAULT 0,
          duration_seconds     REAL NOT NULL DEFAULT 0,
          statistics           JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (baseline_id, version)
        )`);

      await query(`
        CREATE TABLE IF NOT EXISTS ml_training_runs (
          id                 BIGSERIAL PRIMARY KEY,
          run_id             TEXT NOT NULL UNIQUE,
          command            TEXT NOT NULL,
          dataset_id         TEXT,
          seed               INTEGER,
          code_revision      TEXT,
          knowledge_digest   TEXT,
          started_at         TIMESTAMPTZ,
          finished_at        TIMESTAMPTZ,
          metrics            JSONB NOT NULL DEFAULT '{}'::jsonb,
          arguments          JSONB NOT NULL DEFAULT '{}'::jsonb,
          notes              JSONB NOT NULL DEFAULT '[]'::jsonb
        )`);

      await query(`
        CREATE TABLE IF NOT EXISTS ml_model_promotions (
          id            BIGSERIAL PRIMARY KEY,
          model_id      TEXT NOT NULL,
          version       TEXT NOT NULL,
          from_role     TEXT,
          to_role       TEXT NOT NULL,
          approved_by   TEXT,
          reason        TEXT,
          golden_passed BOOLEAN,
          at            TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
    })();
  }
  return globalRef.__ultronMlSchemaReady;
}

export type PersistResult = { stored: boolean; predictionId?: string; reason?: string };

/**
 * Store one diagnosis and everything hanging off it.
 *
 * Never throws into a request path: a prediction that was shown but not stored
 * is a lineage gap worth reporting, and losing the response as well would make
 * it worse. The caller decides what to do with `stored: false`.
 */
export async function persistMlDiagnosis(response: MlDiagnosisResponse): Promise<PersistResult> {
  if (!isDbEnabled()) {
    return { stored: false, reason: 'DATABASE_URL is not set, so predictions are not persisted.' };
  }

  try {
    await ensureMlSchema();

    await query(
      `INSERT INTO ml_predictions
         (prediction_id, machine_id, observed_at, schema_version, ml_status, ml_eligible,
          eligibility_reason, ml_mode, surfaced, operating_state, state_confidence, context_id,
          context_confidence, recipe_id, configuration_version, baseline_id, baseline_level,
          data_quality, signals_reporting, bad_or_missing_count, condition_verdict, rule_state,
          alert_reached, danger_reached, trip_active, diagnosis_model, temporal_model,
          feature_set_version, trained_on_real_data, versions, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
               $23,$24,$25,$26,$27,$28,$29,$30::jsonb,$31::jsonb)
       ON CONFLICT (prediction_id) DO NOTHING`,
      [
        response.predictionId,
        response.machineId,
        response.timestamp,
        response.schemaVersion,
        response.ml.status,
        response.ml.eligible,
        response.ml.eligibilityReason,
        response.ml.mode,
        response.ml.surfaced,
        response.context.operatingState,
        response.context.stateConfidence,
        response.context.contextId,
        response.context.contextConfidence,
        response.context.recipeId,
        response.context.configurationVersion,
        response.context.baselineId,
        response.context.baselineLevel,
        response.dataQuality.overall,
        response.dataQuality.signalsReporting,
        response.dataQuality.badOrMissingCount,
        response.currentCondition.verdict,
        response.currentCondition.ruleState,
        response.currentCondition.customerAlertReached,
        response.currentCondition.customerDangerReached,
        response.currentCondition.tripActive,
        response.models.diagnosisModel,
        response.models.temporalModel,
        response.models.featureSetVersion,
        response.models.trainedOnRealData,
        JSON.stringify(response.versions),
        JSON.stringify(response),
      ],
    );

    for (const entry of response.diagnoses) {
      await query(
        `INSERT INTO ml_diagnosis_events
           (prediction_id, machine_id, observed_at, fault_id, fault_family, diagnosis_state,
            severity, severity_authority, priority, fault_confidence, location_confidence,
            root_cause_confidence, source, surfaced, caused_by, evidence, action)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb)`,
        [
          response.predictionId,
          response.machineId,
          response.timestamp,
          entry.faultId,
          entry.faultFamily,
          entry.diagnosisState,
          entry.severity,
          entry.severityAuthority,
          entry.priority,
          entry.faultConfidence.score,
          entry.locationConfidence.score,
          entry.rootCauseConfidence.score,
          entry.source,
          entry.surfaced,
          entry.causedBy,
          JSON.stringify({
            supporting: entry.supportingEvidence,
            contradicting: entry.contradictingEvidence,
            missing: entry.missingEvidence,
            alternatives: entry.alternatives,
            rootCauseCandidates: entry.rootCauseCandidates,
            groupedSymptoms: entry.groupedSymptoms,
            what: entry.what,
            where: entry.where,
            why: entry.why,
            mechanism: entry.mechanism,
          }),
          JSON.stringify(entry.recommendedAction),
        ],
      );

      for (const horizon of entry.risk) {
        await query(
          `INSERT INTO ml_fault_risks
             (prediction_id, machine_id, observed_at, fault_id, horizon_minutes, probability,
              calibrated, threshold, crossed, persistence_met, surfaced)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            response.predictionId,
            response.machineId,
            response.timestamp,
            entry.faultId,
            horizon.horizonMinutes,
            horizon.probability,
            horizon.calibrated,
            horizon.threshold,
            horizon.crossed,
            horizon.persistenceMet,
            entry.surfaced,
          ],
        );
      }

      if (entry.shapAvailable && entry.shap.length > 0) {
        const dominant = entry.risk.reduce(
          (best, candidate) => (candidate.probability > (best?.probability ?? -1) ? candidate : best),
          entry.risk[0],
        );
        await query(
          `INSERT INTO ml_prediction_explanations
             (prediction_id, fault_id, horizon_minutes, model_id, contributions)
           VALUES ($1,$2,$3,$4,$5::jsonb)`,
          [
            response.predictionId,
            entry.faultId,
            dominant?.horizonMinutes ?? 0,
            response.models.diagnosisModel,
            JSON.stringify(entry.shap),
          ],
        );
      }
    }

    for (const anomaly of response.anomalies) {
      await query(
        `INSERT INTO ml_anomaly_events
           (prediction_id, machine_id, observed_at, signal_id, anomaly_id, verdict, value,
            expected, percent_deviation, robust_score, persistence_seconds, limit_status, data_quality)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          response.predictionId,
          response.machineId,
          response.timestamp,
          anomaly.signalId,
          anomaly.anomalyId,
          anomaly.verdict,
          anomaly.value,
          anomaly.expected,
          anomaly.percentDeviation,
          anomaly.robustScore,
          anomaly.persistenceSeconds,
          anomaly.limitStatus,
          anomaly.dataQuality,
        ],
      );
    }

    // Only findings that actually suppress a diagnosis, or are BAD or MISSING.
    // Storing every UNCERTAIN finding from every frame would write more rows
    // than the telemetry itself.
    for (const issue of response.dataQuality.issues) {
      if (!issue.suppressesPhysicalDiagnosis && issue.verdict !== 'BAD' && issue.verdict !== 'MISSING') {
        continue;
      }
      await query(
        `INSERT INTO ml_data_quality_events
           (prediction_id, machine_id, observed_at, signal_id, rule_id, verdict, reason,
            suppresses_physical_diagnosis)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          response.predictionId,
          response.machineId,
          response.timestamp,
          issue.signalId,
          issue.ruleId,
          issue.verdict,
          issue.reason,
          issue.suppressesPhysicalDiagnosis,
        ],
      );
    }

    return { stored: true, predictionId: response.predictionId };
  } catch (error) {
    return { stored: false, reason: (error as Error).message };
  }
}

/** Store engineer feedback. Never trains anything directly. */
export async function persistMlFeedback(payload: Record<string, unknown>): Promise<PersistResult> {
  if (!isDbEnabled()) {
    return { stored: false, reason: 'DATABASE_URL is not set.' };
  }
  try {
    await ensureMlSchema();
    const feedbackId = String(payload.feedback_id ?? payload.feedbackId ?? crypto.randomUUID());
    await query(
      `INSERT INTO ml_feedback
         (feedback_id, prediction_id, machine_id, submitted_by, diagnosis_correct, actual_fault_id,
          actual_location, actual_root_cause, action_taken, post_action_result,
          primary_anomaly_cleared, false_positive, false_negative, confirmation_source,
          label_quality, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (feedback_id) DO NOTHING`,
      [
        feedbackId,
        payload.prediction_id ?? null,
        String(payload.machine_id ?? ''),
        payload.submitted_by ?? null,
        String(payload.diagnosis_correct ?? 'UNKNOWN'),
        payload.actual_fault_id ?? null,
        payload.actual_location ?? null,
        payload.actual_root_cause ?? null,
        payload.action_taken ?? null,
        String(payload.post_action_result ?? 'UNKNOWN'),
        String(payload.primary_anomaly_cleared ?? 'UNKNOWN'),
        Boolean(payload.false_positive),
        Boolean(payload.false_negative),
        payload.confirmation_source ?? null,
        String(payload.label_quality ?? 'UNVERIFIED'),
        payload.notes ?? null,
      ],
    );
    return { stored: true, predictionId: feedbackId };
  } catch (error) {
    return { stored: false, reason: (error as Error).message };
  }
}

/** Risk history for one fault, for the prognosis trend chart. */
export async function faultRiskHistory(
  machineId: string,
  faultId: string,
  horizonMinutes: number,
  limit = 240,
): Promise<{ at: string; probability: number; crossed: boolean }[]> {
  if (!isDbEnabled()) return [];
  await ensureMlSchema();
  const rows = await query<{ observed_at: string | Date; probability: number; crossed: boolean }>(
    `SELECT observed_at, probability, crossed
       FROM ml_fault_risks
      WHERE machine_id = $1 AND fault_id = $2 AND horizon_minutes = $3
      ORDER BY observed_at DESC
      LIMIT $4`,
    [machineId, faultId, horizonMinutes, Math.min(1000, Math.max(1, limit))],
  );
  return rows.rows
    .map((row) => ({
      at: new Date(row.observed_at).toISOString(),
      probability: Number(row.probability),
      crossed: Boolean(row.crossed),
    }))
    .reverse();
}
