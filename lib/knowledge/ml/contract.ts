/**
 * The ML service's response contract, in TypeScript.
 *
 * The mirror of `services/ml/app/schemas/diagnosis.py`. Both declare
 * `ML_CONTRACT_VERSION = '1.0'` and a check on each side asserts it, so a
 * change on one that is not made on the other fails a build rather than
 * rendering as `undefined` in front of an operator.
 *
 * The shape encodes the separation DOC-05 §3 insists on, structurally:
 *
 *   currentCondition      what the deterministic system sees now
 *   anomalies             what is abnormal, per signal
 *   diagnoses[].risk      what may develop, per horizon        <- learned
 *   diagnoses[].*Confidence   how sure we are, three ways
 *   diagnoses[].severity / impact / priority / recommendedAction
 *
 * A component cannot accidentally render a risk as a severity, because they
 * are different fields of different types on different objects. That is the
 * point: the confusion DOC-05 exists to prevent is unrepresentable rather than
 * merely discouraged.
 *
 * Field names are camelCase here and snake_case on the wire. `parseDiagnosis`
 * is the single conversion point, and it validates rather than casting —
 * a response from a service version this build does not understand is a
 * `MlContractError`, not a half-rendered panel.
 */

import type {
  ConfidenceLevel,
  ImpactLevel,
  LimitAuthority,
  Priority,
  ProgressionStage,
  Severity,
} from '../doc05/types';
import type { DiagnosisState, EvidenceClass, AnomalyVerdict } from '../doc04/types';
import type { QualityVerdict, OperatingStateId } from '../doc02/types';
import type { BaselineConfidence, BaselineLevel, TrendDirection } from '../doc03/types';

/** The contract version this build understands. Matches `CONTRACT_VERSION`. */
export const ML_CONTRACT_VERSION = '1.0';

/** Why the learned layer declined to answer. */
export type MlIneligibleReason =
  | 'ML_INELIGIBLE_BAD_DATA'
  | 'ML_INELIGIBLE_WRONG_STATE'
  | 'ML_INELIGIBLE_INSUFFICIENT_LOOKBACK'
  | 'ML_INELIGIBLE_CONFIGURATION_MISMATCH'
  | 'ML_INELIGIBLE_MISSING_REQUIRED_SIGNAL'
  | 'ML_INELIGIBLE_FEATURE_SCHEMA_MISMATCH'
  | 'ML_INELIGIBLE_NO_MODEL'
  | 'ML_INELIGIBLE_CONTEXT_UNKNOWN'
  | 'ML_INELIGIBLE_MODE_DISABLED';

export type MlStatus = 'OK' | 'DEGRADED' | 'INELIGIBLE' | 'DISABLED';

export type MlMode = 'disabled' | 'shadow' | 'canary' | 'production';

/**
 * The overall condition verdict.
 *
 * Not a DOC-04 diagnosis state — that describes one *finding*. This describes
 * the machine at an instant, which is what the Overview needs and which no
 * document names.
 */
export type ConditionVerdict =
  | 'NORMAL'
  | 'EXPECTED_PROCESS_RESPONSE'
  | 'ANOMALY_CONFIRMED'
  | 'FAULT_UNKNOWN'
  | 'INSUFFICIENT_EVIDENCE'
  | 'DATA_QUALITY_PROBLEM';

export type MlDataQualityIssue = {
  signalId: string;
  ruleId: string;
  check: string;
  verdict: QualityVerdict;
  reason: string;
  downstreamRule: string;
  suppressesPhysicalDiagnosis: boolean;
};

export type MlDataQuality = {
  overall: QualityVerdict;
  issues: MlDataQualityIssue[];
  signalsReporting: number;
  signalsExpected: number;
  badOrMissingCount: number;
  mandatoryUnavailable: string[];
};

export type MlBlock = {
  eligible: boolean;
  status: MlStatus;
  /** Null when eligible. One of `MlIneligibleReason` otherwise. */
  eligibilityReason: MlIneligibleReason | null;
  reasonDetail: string | null;
  mode: MlMode;
  /** Whether findings from this response may raise an operator alert. */
  surfaced: boolean;
  degradedComponents: string[];
  inferenceLatencyMs: number | null;
};

export type MlContext = {
  operatingState: OperatingStateId;
  operatingStateName: string;
  stateConfidence: number;
  stateSource: string;
  timeInStateSeconds: number | null;
  stateTransition: string | null;
  contextId: string | null;
  contextConfidence: number;
  contextMissing: string[];
  recipeId: string | null;
  materialId: string | null;
  configurationVersion: string | null;
  baselineId: string | null;
  baselineLevel: BaselineLevel | null;
  baselineConfidence: BaselineConfidence;
};

/** What the deterministic layer says, with no learned input at all. */
export type MlCurrentCondition = {
  verdict: ConditionVerdict;
  ruleState: Severity;
  ruleStateReason: string;
  customerAlertReached: boolean;
  customerDangerReached: boolean;
  tripActive: boolean;
  activeAnomalyCount: number;
};

export type MlAnomaly = {
  signalId: string;
  label: string;
  /** The DOC-07 library id, or null rather than a nearest guess. */
  anomalyId: string | null;
  verdict: AnomalyVerdict;
  blockedAtGate: string | null;
  reason: string;
  value: number | null;
  unit: string | null;
  expected: number | null;
  absoluteDeviation: number | null;
  percentDeviation: number | null;
  robustScore: number | null;
  trend: TrendDirection;
  rateOfChangePerMin: number | null;
  persistenceSeconds: number | null;
  limitStatus: 'NONE' | 'ALERT' | 'DANGER' | 'TRIP' | 'UNKNOWN';
  dataQuality: QualityVerdict;
};

export type MlEvidence = {
  evidenceClass: EvidenceClass;
  statement: string;
  signalId: string | null;
  quality: QualityVerdict | null;
};

/**
 * One feature's contribution to the model's output.
 *
 * Not a causal ranking. The field is named `shap` and the UI labels the panel
 * "model contributors" for that reason — the physical WHY comes from the fault
 * library and the measured evidence, which are rendered separately.
 */
export type MlShapContribution = {
  feature: string;
  featureName: string;
  value: number | null;
  unit: string | null;
  shap: number;
  direction: 'increases_risk' | 'decreases_risk';
};

export type MlConfidence = {
  score: number;
  level: ConfidenceLevel;
  basis: string[];
};

export type MlImpact = {
  equipment: ImpactLevel;
  process: ImpactLevel;
  production: ImpactLevel;
  quality: ImpactLevel;
  energy: ImpactLevel;
  safety: ImpactLevel;
  downtime: ImpactLevel;
  horizon: 'CURRENT' | 'POTENTIAL';
};

export type MlRecommendedAction = {
  level: string;
  sequence: string[];
  text: string;
  source: string;
  authority: string;
  sopId: string | null;
};

/**
 * One calibrated probability, with everything needed to read it.
 *
 * `crossed` is the only field the UI may treat as "this is happening": it
 * means the threshold *and* the persistence requirement *and* hysteresis all
 * agreed. A bare probability above a threshold is not an alert.
 */
export type MlRiskHorizon = {
  horizonMinutes: number;
  probability: number;
  calibrated: boolean;
  threshold: number;
  raiseThreshold: number;
  clearThreshold: number;
  persistenceMet: boolean;
  consecutiveEligibleCycles: number;
  crossed: boolean;
};

export type MlDiagnosis = {
  faultId: string;
  diagnosis: string;
  faultFamily: string;
  diagnosisState: DiagnosisState;

  what: string;
  where: string;
  why: string;
  mechanism: string;

  risk: MlRiskHorizon[];

  /** Three confidences, which routinely disagree. DOC-05 §13. */
  faultConfidence: MlConfidence;
  locationConfidence: MlConfidence;
  rootCauseConfidence: MlConfidence;

  supportingEvidence: MlEvidence[];
  contradictingEvidence: MlEvidence[];
  missingEvidence: MlEvidence[];
  alternatives: string[];
  rootCauseCandidates: string[];
  /** Downstream effects rolled up under this cause rather than alarmed. */
  groupedSymptoms: string[];
  /** The fault this one is an effect of, when the direction is known. */
  causedBy: string | null;

  shap: MlShapContribution[];
  shapAvailable: boolean;
  shapUnavailableReason: string | null;

  severity: Severity;
  severityAuthority: LimitAuthority | null;
  severityReason: string;
  progression: ProgressionStage;
  impact: MlImpact;
  priority: Priority;
  priorityReason: string;
  recommendedAction: MlRecommendedAction;

  /** RULES | ML | RULES+ML — which layer put this on the page. */
  source: string;
  /** False in shadow mode: persisted and visible, not alarmed. */
  surfaced: boolean;
};

export type MlModels = {
  temporalModel: string | null;
  diagnosisModel: string | null;
  calibrator: string | null;
  champion: string | null;
  featureSetVersion: string | null;
  trainedOnDataset: string | null;
  /** False while the only fitted artifacts came from synthetic fixtures. */
  trainedOnRealData: boolean;
};

export type MlDiagnosisResponse = {
  schemaVersion: string;
  machineId: string;
  timestamp: string;
  predictionId: string;
  dataQuality: MlDataQuality;
  ml: MlBlock;
  context: MlContext;
  currentCondition: MlCurrentCondition;
  anomalies: MlAnomaly[];
  diagnoses: MlDiagnosis[];
  models: MlModels;
  versions: Record<string, string>;
  commissioningNotice: string | null;
  usesUncalibratedLimits: boolean;
  notes: string[];
};

export class MlContractError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message);
    this.name = 'MlContractError';
  }
}

/* -- parsing ---------------------------------------------------------------
 *
 * Validated, not cast. `as MlDiagnosisResponse` on a payload from another
 * process is a lie the type system cannot catch, and the failure mode is a
 * panel that renders `undefined` where a severity should be.
 */

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MlContractError(`Expected an object at ${path}.`, value);
  }
  return value as Record<string, unknown>;
}

function str(source: Record<string, unknown>, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== 'string') throw new MlContractError(`Expected a string at ${path}.${key}`, value);
  return value;
}

function optionalStr(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

function num(source: Record<string, unknown>, key: string, fallback = 0): number {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optionalNum(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(source: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = source[key];
  return typeof value === 'boolean' ? value : fallback;
}

function strings(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function list(source: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null);
}

function parseConfidence(raw: Record<string, unknown> | undefined): MlConfidence {
  if (!raw) return { score: 0, level: 'LOW', basis: [] };
  return {
    score: num(raw, 'score'),
    level: (optionalStr(raw, 'level') ?? 'LOW') as ConfidenceLevel,
    basis: strings(raw, 'basis'),
  };
}

function parseImpact(raw: Record<string, unknown> | undefined): MlImpact {
  const source = raw ?? {};
  const level = (key: string): ImpactLevel => (optionalStr(source, key) ?? 'NONE') as ImpactLevel;
  return {
    equipment: level('equipment'),
    process: level('process'),
    production: level('production'),
    quality: level('quality'),
    energy: level('energy'),
    safety: level('safety'),
    downtime: level('downtime'),
    horizon: (optionalStr(source, 'horizon') ?? 'CURRENT') as 'CURRENT' | 'POTENTIAL',
  };
}

function parseEvidence(raw: Record<string, unknown>): MlEvidence {
  return {
    evidenceClass: (optionalStr(raw, 'evidence_class') ?? 'SUPPORTING') as EvidenceClass,
    statement: optionalStr(raw, 'statement') ?? '',
    signalId: optionalStr(raw, 'signal_id'),
    quality: optionalStr(raw, 'quality') as QualityVerdict | null,
  };
}

function parseRisk(raw: Record<string, unknown>): MlRiskHorizon {
  return {
    horizonMinutes: num(raw, 'horizon_minutes'),
    probability: num(raw, 'probability'),
    calibrated: bool(raw, 'calibrated'),
    threshold: num(raw, 'threshold'),
    raiseThreshold: num(raw, 'raise_threshold'),
    clearThreshold: num(raw, 'clear_threshold'),
    persistenceMet: bool(raw, 'persistence_met'),
    consecutiveEligibleCycles: num(raw, 'consecutive_eligible_cycles'),
    crossed: bool(raw, 'crossed'),
  };
}

function parseDiagnosisEntry(raw: Record<string, unknown>, index: number): MlDiagnosis {
  const path = `diagnoses[${index}]`;
  const action = asRecord(raw.recommended_action ?? {}, `${path}.recommended_action`);
  return {
    faultId: str(raw, 'fault_id', path),
    diagnosis: str(raw, 'diagnosis', path),
    faultFamily: optionalStr(raw, 'fault_family') ?? '',
    diagnosisState: (optionalStr(raw, 'diagnosis_state') ?? 'NOT_EVALUATED') as DiagnosisState,
    what: optionalStr(raw, 'what') ?? '',
    where: optionalStr(raw, 'where') ?? '',
    why: optionalStr(raw, 'why') ?? '',
    mechanism: optionalStr(raw, 'mechanism') ?? '',
    risk: list(raw, 'risk').map(parseRisk),
    faultConfidence: parseConfidence(raw.fault_confidence as Record<string, unknown> | undefined),
    locationConfidence: parseConfidence(raw.location_confidence as Record<string, unknown> | undefined),
    rootCauseConfidence: parseConfidence(raw.root_cause_confidence as Record<string, unknown> | undefined),
    supportingEvidence: list(raw, 'supporting_evidence').map(parseEvidence),
    contradictingEvidence: list(raw, 'contradicting_evidence').map(parseEvidence),
    missingEvidence: list(raw, 'missing_evidence').map(parseEvidence),
    alternatives: strings(raw, 'alternatives'),
    rootCauseCandidates: strings(raw, 'root_cause_candidates'),
    groupedSymptoms: strings(raw, 'grouped_symptoms'),
    causedBy: optionalStr(raw, 'caused_by'),
    shap: list(raw, 'shap').map((entry) => ({
      feature: optionalStr(entry, 'feature') ?? '',
      featureName: optionalStr(entry, 'feature_name') ?? '',
      value: optionalNum(entry, 'value'),
      unit: optionalStr(entry, 'unit'),
      shap: num(entry, 'shap'),
      direction: (optionalStr(entry, 'direction') ?? 'increases_risk') as
        | 'increases_risk'
        | 'decreases_risk',
    })),
    shapAvailable: bool(raw, 'shap_available'),
    shapUnavailableReason: optionalStr(raw, 'shap_unavailable_reason'),
    severity: (optionalStr(raw, 'severity') ?? 'NORMAL') as Severity,
    severityAuthority: optionalStr(raw, 'severity_authority') as LimitAuthority | null,
    severityReason: optionalStr(raw, 'severity_reason') ?? '',
    progression: (optionalStr(raw, 'progression') ?? 'EARLY') as ProgressionStage,
    impact: parseImpact(raw.impact as Record<string, unknown> | undefined),
    priority: (optionalStr(raw, 'priority') ?? 'P4') as Priority,
    priorityReason: optionalStr(raw, 'priority_reason') ?? '',
    recommendedAction: {
      level: optionalStr(action, 'level') ?? 'MONITOR',
      sequence: strings(action, 'sequence'),
      text: optionalStr(action, 'text') ?? '',
      source: optionalStr(action, 'source') ?? 'DOC05/DOC07',
      authority: optionalStr(action, 'authority') ?? 'ULTRON_RECOMMENDATION',
      sopId: optionalStr(action, 'sop_id'),
    },
    source: optionalStr(raw, 'source') ?? 'RULES',
    surfaced: bool(raw, 'surfaced', true),
  };
}

/** Parse and validate a response from the ML service. */
export function parseDiagnosis(payload: unknown): MlDiagnosisResponse {
  const raw = asRecord(payload, 'response');
  const version = str(raw, 'schema_version', 'response');
  if (version !== ML_CONTRACT_VERSION) {
    throw new MlContractError(
      `The ML service speaks contract ${version}; this build understands ${ML_CONTRACT_VERSION}.`,
      { received: version, expected: ML_CONTRACT_VERSION },
    );
  }

  const quality = asRecord(raw.data_quality ?? {}, 'data_quality');
  const ml = asRecord(raw.ml ?? {}, 'ml');
  const context = asRecord(raw.context ?? {}, 'context');
  const condition = asRecord(raw.current_condition ?? {}, 'current_condition');
  const models = asRecord(raw.models ?? {}, 'models');

  return {
    schemaVersion: version,
    machineId: str(raw, 'machine_id', 'response'),
    timestamp: str(raw, 'timestamp', 'response'),
    predictionId: optionalStr(raw, 'prediction_id') ?? '',
    dataQuality: {
      overall: (optionalStr(quality, 'overall') ?? 'MISSING') as QualityVerdict,
      issues: list(quality, 'issues').map((entry) => ({
        signalId: optionalStr(entry, 'signal_id') ?? '',
        ruleId: optionalStr(entry, 'rule_id') ?? '',
        check: optionalStr(entry, 'check') ?? '',
        verdict: (optionalStr(entry, 'verdict') ?? 'MISSING') as QualityVerdict,
        reason: optionalStr(entry, 'reason') ?? '',
        downstreamRule: optionalStr(entry, 'downstream_rule') ?? '',
        suppressesPhysicalDiagnosis: bool(entry, 'suppresses_physical_diagnosis'),
      })),
      signalsReporting: num(quality, 'signals_reporting'),
      signalsExpected: num(quality, 'signals_expected'),
      badOrMissingCount: num(quality, 'bad_or_missing_count'),
      mandatoryUnavailable: strings(quality, 'mandatory_unavailable'),
    },
    ml: {
      eligible: bool(ml, 'eligible'),
      status: (optionalStr(ml, 'status') ?? 'INELIGIBLE') as MlStatus,
      eligibilityReason: optionalStr(ml, 'eligibility_reason') as MlIneligibleReason | null,
      reasonDetail: optionalStr(ml, 'reason_detail'),
      mode: (optionalStr(ml, 'mode') ?? 'shadow') as MlMode,
      surfaced: bool(ml, 'surfaced'),
      degradedComponents: strings(ml, 'degraded_components'),
      inferenceLatencyMs: optionalNum(ml, 'inference_latency_ms'),
    },
    context: {
      operatingState: (optionalStr(context, 'operating_state') ?? 'ST-00') as OperatingStateId,
      operatingStateName: optionalStr(context, 'operating_state_name') ?? 'UNKNOWN',
      stateConfidence: num(context, 'state_confidence'),
      stateSource: optionalStr(context, 'state_source') ?? 'UNKNOWN',
      timeInStateSeconds: optionalNum(context, 'time_in_state_seconds'),
      stateTransition: optionalStr(context, 'state_transition'),
      contextId: optionalStr(context, 'context_id'),
      contextConfidence: num(context, 'context_confidence'),
      contextMissing: strings(context, 'context_missing'),
      recipeId: optionalStr(context, 'recipe_id'),
      materialId: optionalStr(context, 'material_id'),
      configurationVersion: optionalStr(context, 'configuration_version'),
      baselineId: optionalStr(context, 'baseline_id'),
      baselineLevel: optionalStr(context, 'baseline_level') as BaselineLevel | null,
      baselineConfidence: (optionalStr(context, 'baseline_confidence') ?? 'NONE') as BaselineConfidence,
    },
    currentCondition: {
      verdict: (optionalStr(condition, 'verdict') ?? 'NORMAL') as ConditionVerdict,
      ruleState: (optionalStr(condition, 'rule_state') ?? 'NORMAL') as Severity,
      ruleStateReason: optionalStr(condition, 'rule_state_reason') ?? '',
      customerAlertReached: bool(condition, 'customer_alert_reached'),
      customerDangerReached: bool(condition, 'customer_danger_reached'),
      tripActive: bool(condition, 'trip_active'),
      activeAnomalyCount: num(condition, 'active_anomaly_count'),
    },
    anomalies: list(raw, 'anomalies').map((entry) => ({
      signalId: optionalStr(entry, 'signal_id') ?? '',
      label: optionalStr(entry, 'label') ?? '',
      anomalyId: optionalStr(entry, 'anomaly_id'),
      verdict: (optionalStr(entry, 'verdict') ?? 'NOT_EVALUATED') as AnomalyVerdict,
      blockedAtGate: optionalStr(entry, 'blocked_at_gate'),
      reason: optionalStr(entry, 'reason') ?? '',
      value: optionalNum(entry, 'value'),
      unit: optionalStr(entry, 'unit'),
      expected: optionalNum(entry, 'expected'),
      absoluteDeviation: optionalNum(entry, 'absolute_deviation'),
      percentDeviation: optionalNum(entry, 'percent_deviation'),
      robustScore: optionalNum(entry, 'robust_score'),
      trend: (optionalStr(entry, 'trend') ?? 'UNKNOWN') as TrendDirection,
      rateOfChangePerMin: optionalNum(entry, 'rate_of_change_per_min'),
      persistenceSeconds: optionalNum(entry, 'persistence_seconds'),
      limitStatus: (optionalStr(entry, 'limit_status') ?? 'NONE') as MlAnomaly['limitStatus'],
      dataQuality: (optionalStr(entry, 'data_quality') ?? 'GOOD') as QualityVerdict,
    })),
    diagnoses: list(raw, 'diagnoses').map(parseDiagnosisEntry),
    models: {
      temporalModel: optionalStr(models, 'temporal_model'),
      diagnosisModel: optionalStr(models, 'diagnosis_model'),
      calibrator: optionalStr(models, 'calibrator'),
      champion: optionalStr(models, 'champion'),
      featureSetVersion: optionalStr(models, 'feature_set_version'),
      trainedOnDataset: optionalStr(models, 'trained_on_dataset'),
      trainedOnRealData: bool(models, 'trained_on_real_data'),
    },
    versions: (raw.versions && typeof raw.versions === 'object'
      ? (raw.versions as Record<string, string>)
      : {}),
    commissioningNotice: optionalStr(raw, 'commissioning_notice'),
    usesUncalibratedLimits: bool(raw, 'uses_uncalibrated_limits', true),
    notes: strings(raw, 'notes'),
  };
}

/**
 * The highest calibrated risk across every fault and horizon.
 *
 * What the Overview shows as "highest prognosis risk". Returns the entry
 * rather than the number, because a probability without its fault and its
 * horizon is not a thing anybody can act on.
 */
export function highestRisk(
  response: MlDiagnosisResponse,
): { faultId: string; diagnosis: string; horizon: MlRiskHorizon } | null {
  let best: { faultId: string; diagnosis: string; horizon: MlRiskHorizon } | null = null;
  for (const entry of response.diagnoses) {
    for (const horizon of entry.risk) {
      if (!best || horizon.probability > best.horizon.probability) {
        best = { faultId: entry.faultId, diagnosis: entry.diagnosis, horizon };
      }
    }
  }
  return best;
}

/** Diagnoses the current mode permits showing as alerts. */
export function surfacedDiagnoses(response: MlDiagnosisResponse): MlDiagnosis[] {
  return response.diagnoses.filter((entry) => entry.surfaced);
}

/**
 * A one-line account of the ML layer's state, for the status band.
 *
 * Every branch says something an engineer can act on. "Unavailable" is not an
 * answer; "no model has been promoted, so the deterministic rules are
 * answering" is.
 */
export function mlStatusLine(response: MlDiagnosisResponse): string {
  const { ml, models } = response;
  if (ml.status === 'DISABLED') return 'ML is disabled. Deterministic rules are answering.';
  if (ml.status === 'DEGRADED') {
    return `ML is degraded: ${ml.degradedComponents.join('; ') || 'a model failed to load'}. Deterministic rules are answering.`;
  }
  if (!ml.eligible) {
    return ml.reasonDetail ?? `ML is not eligible (${ml.eligibilityReason ?? 'unknown reason'}).`;
  }
  if (!models.trainedOnRealData) {
    return 'ML is running on a model fitted from synthetic data. Its risk numbers carry no evidence about this machine.';
  }
  if (ml.mode === 'shadow') return 'ML is in shadow mode: predictions are recorded but do not raise alerts.';
  if (ml.mode === 'canary') return 'ML is in canary mode: alerts are limited to selected machines and faults.';
  return 'ML is active.';
}
