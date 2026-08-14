// Single-screw-extruder diagnostic pipeline.
//
// Ported from the digital twin's `diagnostics/pipeline.py`.
//
// Execution chain
//   INPUT -> VALIDATION -> UNIT_NORMALIZATION -> SIGNAL_PREPROCESSING ->
//   FEATURE_EXTRACTION -> BASELINE_COMPARISON -> MACHINE_STATE_INFERENCE ->
//   FAULT_SPECIFIC_EVIDENCE -> SENSOR_FUSION -> OBSERVABILITY ->
//   FAULT_CLASSIFICATION -> CONSTRAINT_CHECK -> RESULT
//
// Layer separation
//   Transport problems, sensor problems and machine problems are diagnosed at
//   three independent layers and reported with an explicit precedence. If the
//   data stream is broken, or a sensor is demonstrably lying, then a plant
//   diagnosis computed from those numbers is not trustworthy and must not be
//   presented as the machine's condition.

import type {
  AnomalyContribution,
  AnomalySummary,
  BaselineRecord,
  Diagnosis,
  MachineAnalysisResult,
  SignalQuality,
} from '../types';
import { baselineOf, baselineRecords, buildBaselineContext, type BaselineContext, type BaselineValue } from './baseline';
import { evaluateConstraints, type ConstraintCheck, type ConstraintOverall } from './constraints';
import {
  contributingSensors,
  fuse,
  isCandidate,
  MatchClass,
  rank,
  type FaultAssessment,
  type FaultEvidence,
} from './evidence';
import {
  AVAILABLE,
  extractFeatures,
  HISTORY_WINDOW_SAMPLES,
  type ExtruderSnapshot,
  type FeatureSet,
  type TelemetryEnvelope,
} from './features';
import {
  classifyIdentifiability,
  getFault,
  getThreshold,
  faultName,
  separatingMeasurements,
  type FaultCategory,
} from './registers';
import { evaluateRules } from './rules';
import { inferState, MachineState, NON_PRODUCTION_STATES, type StateInference } from './stateInference';
import {
  ALL_TAGS,
  CANONICAL_UNITS,
  DIAGNOSTIC_TAGS,
  ESSENTIAL_TAGS,
  normaliseReading,
  resolveSignal,
  TAG_LABELS,
  UnitError,
  type ExtruderTag,
} from './signalMap';

export const EXTRUDER_MODEL_KEY = 'single_screw_extruder';
export const EXTRUDER_MODEL_VERSION = '1.0.0-engineering-development';

/** Layer precedence. A lower index wins when several layers raise candidates. */
const LAYER_ORDER = ['DATA_QUALITY', 'INSTRUMENTATION', 'PLANT'] as const;
export type FaultLayer = (typeof LAYER_ORDER)[number];

const DATA_QUALITY_FAULTS = new Set(['WP3-LOSS', 'WP3-DELAY', 'WP3-DUP', 'WP3-TIME']);
const INSTRUMENTATION_FAULTS = new Set(['WP3-OFFSET', 'WP3-DRIFT', 'WP3-FROZEN', 'WP3-NOISE', 'WP3-DROPOUT', 'WP3-SCALE']);

function layerOf(faultId: string): FaultLayer {
  if (DATA_QUALITY_FAULTS.has(faultId)) return 'DATA_QUALITY';
  if (INSTRUMENTATION_FAULTS.has(faultId)) return 'INSTRUMENTATION';
  return 'PLANT';
}

const QUALITY_STALE_AFTER_MS = 120_000;

// --------------------------------------------------------------------------------------
// Input
// --------------------------------------------------------------------------------------

export type ExtruderInputReading = {
  /** The mapped point's label, used to resolve the canonical pilot tag. */
  label: string;
  /** Stable template identity; absent on legacy/custom boxes. */
  templatePointCode?: string;
  value: number | null;
  unit: string;
  quality?: string;
  valid?: boolean;
  timestamp: string;
  source?: 'gateway' | 'derived' | 'demo' | 'manual';
};

export type ExtruderAnalysisInput = {
  readings: ExtruderInputReading[];
  /** Recent scalar history per canonical tag, oldest first. */
  history?: Partial<Record<ExtruderTag, (number | null)[]>>;
  /** Healthy references the machine configuration cannot supply (V1/V2/T4/T5/L1). */
  learnedBaselines?: Record<string, number | null>;
  telemetry?: TelemetryEnvelope | null;
  recipeId?: string;
  machineCount?: number;
  now?: string;
};

/** A mapped point that the model deliberately does not consume, with the reason. */
export type UnconsumedSignal = {
  label: string;
  reason: string;
};

export type ResolvedSignal = {
  tag: ExtruderTag;
  label: string;
  value: number | null;
  unit: string;
  conversion: string;
  domain: 'velocity' | 'acceleration' | 'scalar';
  timestamp: string;
  quality: string;
  valid: boolean;
  source: string;
};

export type TriggeredThreshold = {
  thresholdId: string;
  faultId: string;
  sensor: string;
  feature: string;
  observed: number | null;
  expectedDirection: string;
  sourceStatus: string;
  fieldCalibrated: boolean;
  notes: string;
};

export type FaultAssessmentRecord = {
  faultId: string;
  faultName: string;
  category: FaultCategory | 'UNKNOWN';
  layer: FaultLayer;
  matchClass: FaultAssessment['matchClass'];
  engineeringMatchScore: number;
  scoreSemantics: 'ORDINAL_ENGINEERING_MATCH_SCORE_NOT_A_PROBABILITY';
  contributingSensors: string[];
  primary: FaultEvidence[];
  supporting: FaultEvidence[];
  weak: FaultEvidence[];
  contradicting: FaultEvidence[];
  identifiability: string;
  separatingMeasurement: string;
};

export type ExtruderDetail = {
  primaryDiagnosis: string;
  candidateFaults: string[];
  faultCategory: string;
  faultLayer: FaultLayer | 'NONE';
  identifiability: string;
  separatingMeasurements: string[];
  inferredMachineState: string;
  stateBasis: string[];
  recipeId: string;
  assessments: FaultAssessmentRecord[];
  triggeredThresholds: TriggeredThreshold[];
  constraintStatus: ConstraintOverall;
  constraints: ConstraintCheck[];
  resolvedSignals: ResolvedSignal[];
  unconsumedSignals: UnconsumedSignal[];
  unrecognisedSignals: string[];
  rejectedSignals: { label: string; error: string }[];
  missingTags: { tag: ExtruderTag; label: string; essential: boolean; note?: string }[];
  baseline: BaselineValue[];
  availability: Record<string, string>;
  // Mirrors the twin's `FeatureSet.as_dict()`, so a report can show exactly
  // which numbers the rules read.
  features: {
    scalar: FeatureSet['scalar'];
    vibration: FeatureSet['vibration'];
    temporal: FeatureSet['temporal'];
    telemetry: FeatureSet['telemetry'];
    unitConversions: FeatureSet['conversions'];
  };
  explanation: string;
  trace: string[];
  blockedOutputs: string[];
  validationState: 'NOT_FIELD_VALIDATED';
  automaticActuation: false;
};

export type ExtruderAnalysisResult = MachineAnalysisResult & {
  model: 'single_screw_extruder';
  extruder: ExtruderDetail;
};

// --------------------------------------------------------------------------------------
// Signal resolution
// --------------------------------------------------------------------------------------

/**
 * Why an unmapped tag is unmapped, when the answer is not simply "no card".
 *
 * The electrical channel is the case that matters. PM1 is one meter, so the
 * drawing has one pad for it, and wiring its kilowatt output there is a
 * perfectly reasonable thing to do — but every load threshold in the register
 * is defined on drive current against a controlled 10 A reference, and there is
 * no controlled healthy-power reference to compare kilowatts against. Without
 * this note the page would show "PM1.current not mapped" beside a card that
 * plainly reads Motor Power, which looks like a bug rather than the units
 * question it actually is.
 */
function missingTagNote(tag: ExtruderTag, mapped: Set<ExtruderTag>): string | undefined {
  if (tag === 'PM1.current' && mapped.has('PM1.power')) {
    return 'A kilowatt channel is mapped on the motor electrical pad. The motor-load, feed-starvation and over-feed rules are defined on drive current against the controlled 10 A reference, and no controlled healthy power reference exists to compare kW against, so they stay unevaluated. Wire the meter\'s current output (A) to that pad to enable them.';
  }
  return undefined;
}

function buildSnapshot(
  input: ExtruderAnalysisInput,
  baseline: BaselineContext,
  now: string,
): {
  snapshot: ExtruderSnapshot;
  resolved: ResolvedSignal[];
  unconsumed: UnconsumedSignal[];
  unrecognised: string[];
  rejected: { label: string; error: string }[];
} {
  const normalised: Partial<Record<ExtruderTag, number | null>> = {};
  const conversions: Partial<Record<ExtruderTag, string>> = {};
  const accelerationRmsG: Partial<Record<'V1' | 'V2', number>> = {};
  const resolved: ResolvedSignal[] = [];
  const unconsumed: UnconsumedSignal[] = [];
  const unrecognised: string[] = [];
  const rejected: { label: string; error: string }[] = [];

  // Which point already claimed each tag. A tag is one instrument, so a second
  // point claiming it is a wiring error, not a second opinion — and silently
  // letting the last one win would put an unannounced measurement into every
  // rule that reads that tag.
  const claimedBy = new Map<ExtruderTag, string>();

  for (const reading of input.readings) {
    const resolution = resolveSignal(reading.label, reading.templatePointCode, reading.unit);
    if (resolution.kind === 'unmodelled') {
      unconsumed.push({ label: reading.label, reason: resolution.reason });
      continue;
    }
    if (resolution.kind === 'unrecognised') {
      unrecognised.push(reading.label);
      continue;
    }
    const claimant = claimedBy.get(resolution.tag);
    if (claimant !== undefined) {
      rejected.push({
        label: reading.label,
        error: `${resolution.tag} (${TAG_LABELS[resolution.tag]}) is already supplied by "${claimant}". One tag is one instrument, so this second point is not read — connect it to its own instrument pad on the machine, or unlink one of the two.`,
      });
      continue;
    }
    let converted;
    try {
      converted = normaliseReading(
        resolution.tag,
        reading.value,
        reading.unit,
        resolution.speedDomain,
        baseline.reductionRatio,
      );
    } catch (err) {
      // An unsupported unit is rejected rather than silently assumed. The point
      // is reported so a mis-configured card is visible instead of invisible.
      rejected.push({ label: reading.label, error: err instanceof UnitError ? err.message : String(err) });
      continue;
    }

    const isAcceleration = converted.accelerationRmsG !== undefined;
    if (isAcceleration && (resolution.tag === 'V1' || resolution.tag === 'V2')) {
      accelerationRmsG[resolution.tag] = converted.accelerationRmsG;
    } else {
      normalised[resolution.tag] = converted.value;
    }
    conversions[resolution.tag] = converted.conversion;
    claimedBy.set(resolution.tag, reading.label);
    resolved.push({
      tag: resolution.tag,
      label: reading.label,
      value: isAcceleration ? (converted.accelerationRmsG ?? null) : converted.value,
      unit: isAcceleration ? 'g' : converted.unit,
      conversion: converted.conversion,
      domain: resolution.tag === 'V1' || resolution.tag === 'V2' ? (isAcceleration ? 'acceleration' : 'velocity') : 'scalar',
      timestamp: reading.timestamp,
      quality: reading.quality ?? 'GOOD',
      valid: reading.valid !== false,
      source: reading.source ?? 'gateway',
    });
  }

  return {
    snapshot: {
      timestamp: now,
      normalised,
      conversions,
      accelerationRmsG,
      history: input.history ?? {},
      telemetry: input.telemetry ?? null,
    },
    resolved,
    unconsumed,
    unrecognised,
    rejected,
  };
}

// --------------------------------------------------------------------------------------
// Candidate selection
// --------------------------------------------------------------------------------------

function plantCategory(candidates: string[]): string {
  const categories = new Set(candidates.map((id) => getFault(id)?.category).filter(Boolean));
  if (categories.size === 1) return [...categories][0] as string;
  return 'MULTIPLE_SUBSYSTEM_HYPOTHESES';
}

/** Choose the reported candidate set and its category, honouring layer precedence. */
function selectCandidates(
  assessments: FaultAssessment[],
  state: StateInference,
): { candidates: string[]; category: string; layer: FaultLayer | 'NONE' } {
  const viable = assessments.filter(isCandidate);
  if (viable.length === 0) {
    if (
      state.state === MachineState.STARTUP_COLD ||
      state.state === MachineState.STARTUP_WARM ||
      state.state === MachineState.SHUTDOWN ||
      state.state === MachineState.IDLE
    ) {
      return { candidates: [], category: 'MACHINE_STATE_TRANSITION', layer: 'NONE' };
    }
    // "Healthy" and "cannot tell" are different answers and must not share a
    // label. A machine whose measurements all sit inside their controlled
    // envelopes produced no evidence at all. A machine that produced supporting
    // or weak evidence which no controlled signature can resolve is not
    // healthy: something was observed and the installed sensors cannot decide
    // what it is.
    const observed = assessments.some(
      (assessment) =>
        (assessment.matchClass === MatchClass.WEAK || assessment.matchClass === MatchClass.INSUFFICIENT) &&
        assessment.primary.length + assessment.supporting.length + assessment.weak.length > 0,
    );
    return {
      candidates: [],
      category: observed ? 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE' : 'HEALTHY_OR_NO_CONTROLLED_SIGNATURE',
      layer: 'NONE',
    };
  }

  for (const layer of LAYER_ORDER) {
    const inLayer = viable.filter((assessment) => layerOf(assessment.faultId) === layer);
    if (inLayer.length > 0) {
      const candidates = inLayer.map((assessment) => assessment.faultId).sort();
      return { candidates, category: layer === 'PLANT' ? plantCategory(candidates) : layer, layer };
    }
  }
  return { candidates: [], category: 'HEALTHY_OR_NO_CONTROLLED_SIGNATURE', layer: 'NONE' };
}

function primaryLabel(candidates: string[], state: StateInference, category: string): string {
  if (candidates.length === 0) {
    if (category === 'MACHINE_STATE_TRANSITION') return `MACHINE_STATE:${state.state}`;
    if (category === 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE') return 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE';
    return 'NO_CONTROLLED_SIGNATURE_MATCH';
  }
  if (candidates.length === 1) return candidates[0];
  return `AMBIGUOUS:${candidates.join(',')}`;
}

// --------------------------------------------------------------------------------------
// Adapters onto the shared result contract
// --------------------------------------------------------------------------------------

// Urgency is a presentational ranking for the maintenance queue, derived from
// the subsystem and the layer. It is deliberately NOT a severity number: the
// twin has no calibrated severity model and blocks `absolute_severity_percent`.
const URGENCY_BY_CATEGORY: Record<FaultCategory, Diagnosis['urgency']> = {
  MECHANICAL: 'inspect_promptly',
  ELECTRICAL_DRIVE: 'inspect_soon',
  PROCESS: 'inspect_soon',
  THERMAL: 'inspect_soon',
  MATERIAL_DISTURBANCE: 'monitor',
  INSTRUMENTATION: 'inspect_soon',
  DATA_QUALITY: 'inspect_soon',
};

function urgencyFor(faultId: string, constraintStatus: ConstraintOverall): Diagnosis['urgency'] {
  if (constraintStatus === 'VIOLATION') return 'urgent';
  const category = getFault(faultId)?.category;
  return category ? URGENCY_BY_CATEGORY[category] : 'monitor';
}

const RECOVERY_ACTIONS: Record<string, string> = {
  SCREEN_REPLACEMENT: 'Plan a screen-pack change at the next safe stop.',
  COMPONENT_REPLACEMENT: 'Plan component replacement; confirm the affected part by inspection first.',
  MAINTENANCE_RESET: 'Return the affected setting to its recipe value and re-observe.',
  HEATER_RESTORATION: 'Check the zone heater circuit, contactor and thermocouple wiring.',
  COOLING_RESTORATION: 'Check coolant supply, flow and jacket circulation across the barrel.',
  MATERIAL_CHANGE: 'Verify the material batch, grade and drying state against the recipe.',
  SENSOR_REPLACEMENT: 'Verify the measurement chain (sensor, wiring, card scaling) before acting on the reading.',
  DAQ_CORRECTION: 'Fix the data stream first. A plant diagnosis computed from a broken stream is not trustworthy.',
};

const SAFETY_STEPS = [
  'Follow site lockout/tagout procedures before any physical inspection.',
  'Confirm zero energy and that the barrel has cooled before opening guards or access panels.',
  'This ranking is not a confirmed fault.',
];

function buildDiagnoses(
  candidates: string[],
  assessments: FaultAssessment[],
  constraintStatus: ConstraintOverall,
): Diagnosis[] {
  const selected = assessments.filter((assessment) => candidates.includes(assessment.faultId));
  const topScore = Math.max(1, ...selected.map((assessment) => assessment.engineeringMatchScore));
  return selected.map((assessment) => {
    const record = getFault(assessment.faultId);
    const identity = classifyIdentifiability([assessment.faultId]);
    const separating = separatingMeasurements([assessment.faultId]);
    return {
      code: assessment.faultId,
      title: faultName(assessment.faultId),
      // Ordinal position within this candidate set, NOT a probability.
      confidence: assessment.engineeringMatchScore / topScore,
      confidenceBasis: 'ORDINAL_ENGINEERING_MATCH_SCORE' as const,
      urgency: urgencyFor(assessment.faultId, constraintStatus),
      supporting: [...assessment.primary, ...assessment.supporting, ...assessment.weak].map(
        (item) => `${item.sensor}: ${item.description}`,
      ),
      contradicting: assessment.contradicting.map((item) => `${item.sensor}: ${item.description}`),
      limitations: [
        `Match class ${assessment.matchClass} (ordinal engineering match score ${assessment.engineeringMatchScore}; not a probability).`,
        `Identifiability: ${identity}.`,
        ...(separating.length > 0 ? [`Separating information required: ${separating.join('; ')}.`] : []),
        ...(record?.limitations ? [record.limitations] : []),
        'Every threshold behind this result is an engineering-development value and none is field calibrated.',
      ],
      immediateAction: RECOVERY_ACTIONS[record?.recoveryAction ?? ''] ?? 'Review the evidence below before acting.',
      inspection: [
        ...(record ? [`Subsystem: ${record.subsystem.replace(/_/g, ' ')}.`] : []),
        ...(record && record.sensorObservations.length > 0
          ? [`Corroborating measurements: ${record.sensorObservations.join(', ')}.`]
          : []),
        ...SAFETY_STEPS,
      ],
    };
  });
}

/**
 * Anomaly contributors, expressed as how many analytical-redundancy consistency
 * bands each measurement sits away from its healthy reference. That band is a
 * registered value (TH-CONSISTENCY-RATIO / TH-CONSISTENCY-TEMP), so the number
 * is traceable rather than invented.
 */
/**
 * Anomaly severity deliberately does NOT read the constraint status.
 *
 * "Is the machine outside its safe envelope" and "has the machine departed from
 * its healthy reference" are two independent questions, and the whole point of
 * keeping the constraint layer separate is that an in-limit machine can carry a
 * developing fault while an out-of-limit machine can be mechanically healthy.
 * Folding a limit breach into the anomaly score would collapse that distinction
 * and report a departure the baseline evidence does not support. A breach drives
 * the maintenance priority and its own alert instead.
 */
function buildAnomaly(
  features: FeatureSet,
  candidates: string[],
  assessments: FaultAssessment[],
  state: StateInference,
): AnomalySummary {
  const ratioBand = getThreshold('TH-CONSISTENCY-RATIO').value;
  const temperatureBand = getThreshold('TH-CONSISTENCY-TEMP').value;
  const contributors: AnomalyContribution[] = [];

  const addRatio = (code: string, ratio: number | undefined, label: string) => {
    if (ratio === undefined || !Number.isFinite(ratio)) return;
    const deviation = Math.abs(ratio - 1);
    if (deviation < ratioBand) return;
    contributors.push({
      code,
      score: Math.round((deviation / ratioBand) * 10) / 10,
      direction: ratio > 1 ? 'high' : 'low',
      description: `${label} is ${(deviation * 100).toFixed(1)}% from its healthy reference (${(deviation / ratioBand).toFixed(1)} consistency bands).`,
    });
  };
  const addResidual = (code: string, residual: number | undefined, label: string) => {
    if (residual === undefined || !Number.isFinite(residual)) return;
    if (Math.abs(residual) < temperatureBand) return;
    contributors.push({
      code,
      score: Math.round((Math.abs(residual) / temperatureBand) * 10) / 10,
      direction: residual > 0 ? 'high' : 'low',
      description: `${label} is ${residual > 0 ? '+' : ''}${residual.toFixed(1)} degC from its reference (${(Math.abs(residual) / temperatureBand).toFixed(1)} consistency bands).`,
    });
  };

  addRatio('P1', features.scalar.pressure_ratio_to_baseline, TAG_LABELS.P1);
  addRatio('PM1.current', features.scalar.current_ratio_to_baseline, TAG_LABELS['PM1.current']);
  addRatio('E1', features.scalar.speed_ratio_to_baseline, TAG_LABELS.E1);
  for (const tag of ['T1', 'T2', 'T3'] as const) {
    addResidual(tag, features.scalar[`${tag}.zone_setpoint_residual_c`], TAG_LABELS[tag]);
  }
  for (const tag of ['T4', 'T5'] as const) {
    addResidual(tag, features.scalar[`${tag}.temperature_residual_c`], TAG_LABELS[tag]);
  }
  for (const tag of ['V1', 'V2'] as const) {
    const velocity = features.vibration[tag]?.amplitude_ratio_to_baseline;
    const acceleration = features.vibration[tag]?.acceleration_rms_ratio_to_baseline;
    if (typeof velocity === 'number') addRatio(tag, velocity, `${TAG_LABELS[tag]} velocity RMS`);
    else if (typeof acceleration === 'number') addRatio(tag, acceleration, `${TAG_LABELS[tag]} acceleration RMS`);
  }

  contributors.sort((a, b) => b.score - a.score);
  const trimmed = contributors.slice(0, 6);
  const score = Math.round(trimmed.reduce((sum, item) => sum + item.score, 0) * 10) / 10;

  // Startup, shutdown and idle are legitimate operating states, not faults. A
  // stopped machine sits a long way from its production operating point by
  // design, so those deviations are still shown but must not be scored as an
  // anomaly — the same reason the rules themselves are gated on state.
  if (NON_PRODUCTION_STATES.has(state.state)) {
    return {
      state: 'none',
      severity: 'none',
      score,
      contributors: trimmed,
      limitations: [
        `The machine is in ${state.state}, so it is not at its production operating point by design. Departures from the controlled reference are expected here and are reported without being scored as an anomaly.`,
      ],
    };
  }

  const strong = assessments.some(
    (assessment) => candidates.includes(assessment.faultId) && assessment.matchClass === MatchClass.STRONG_CANDIDATE,
  );
  const observedButUnresolved = assessments.some(
    (assessment) =>
      assessment.matchClass === MatchClass.WEAK &&
      assessment.primary.length + assessment.supporting.length + assessment.weak.length > 0,
  );

  const severity: AnomalySummary['severity'] = strong
    ? 'high'
    : candidates.length > 0
      ? 'medium'
      : observedButUnresolved || trimmed.length > 0
        ? 'low'
        : 'none';
  const episodeState: AnomalySummary['state'] =
    severity === 'none' ? 'none' : candidates.length > 0 ? 'active' : 'candidate';

  const limitations: string[] = [];
  if (trimmed.length === 0) {
    limitations.push('No measurement is outside its analytical-redundancy consistency band.');
  }
  limitations.push(
    'Deviations are expressed in consistency bands from the controlled reference, not in calibrated severity units. `absolute_severity_percent` is a blocked output for this model.',
  );

  return { state: episodeState, severity, score, contributors: trimmed, limitations };
}

function buildSignalQuality(
  resolved: ResolvedSignal[],
  features: FeatureSet,
  instrumentationFaults: FaultAssessment[],
  nowMs: number,
): SignalQuality[] {
  const byTag = new Map<string, ResolvedSignal>();
  for (const signal of resolved) byTag.set(signal.tag, signal);
  const suspectTags = new Set(
    instrumentationFaults
      .filter(isCandidate)
      .flatMap((assessment) => [...assessment.primary, ...assessment.supporting].map((item) => item.sensor)),
  );

  return ALL_TAGS.map((tag) => {
    const signal = byTag.get(tag);
    if (!signal) {
      return {
        code: tag,
        status: 'UNAVAILABLE' as const,
        checks: ['NOT_MAPPED'],
        limitations: [`${TAG_LABELS[tag]} is not mapped to a rack channel on this machine.`],
        latestValue: null,
        unit: CANONICAL_UNITS[tag],
      };
    }
    const checks: string[] = [];
    const limitations: string[] = [];
    if (!signal.valid) checks.push('SOURCE_QUALITY');
    if (signal.quality && signal.quality !== 'GOOD') checks.push('SOURCE_QUALITY');
    if (signal.value === null || !Number.isFinite(signal.value)) checks.push('FINITE_VALUE');
    const age = nowMs - Date.parse(signal.timestamp);
    if (Number.isFinite(age) && age > QUALITY_STALE_AFTER_MS) checks.push('DATA_AGE');
    if (suspectTags.has(tag)) checks.push('INSTRUMENTATION_HYPOTHESIS_RAISED');
    const sampleCount = features.temporal[`${tag}.sample_count`];
    const run = features.temporal[`${tag}.identical_sample_run_length`];
    if (sampleCount !== undefined && run !== undefined && run >= sampleCount) checks.push('FLATLINE');
    if (sampleCount === undefined) {
      limitations.push('Too few recent samples to assess noise, flatline or continuity confidently.');
    }
    if (signal.source === 'demo') {
      limitations.push('This value is a simulated reading, not a gateway measurement.');
    }
    const status: SignalQuality['status'] = checks.length >= 2 ? 'BAD' : checks.length === 1 ? 'DEGRADED' : 'GOOD';
    return {
      code: tag,
      status,
      checks: checks.length > 0 ? checks : ['OK'],
      limitations,
      latestValue: signal.value,
      unit: signal.unit,
    };
  });
}

function buildBaselines(records: BaselineValue[], history: Partial<Record<ExtruderTag, (number | null)[]>>): BaselineRecord[] {
  return records.map((item) => {
    const samples = (history[item.tag as ExtruderTag] ?? []).filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
    const maturity: BaselineRecord['maturity'] =
      samples.length >= 60 ? 'mature' : samples.length >= 20 ? 'learning' : samples.length > 0 ? 'immature' : 'unavailable';
    const limitations = [`Provenance: ${item.provenance}.`];
    if (item.value === null) limitations.push('No healthy reference exists for this tag; dependent evidence is not evaluated.');
    if (item.status === 'ENGINEERING_DEVELOPMENT') limitations.push('Engineering-development placeholder; requires a field baseline.');
    if (item.status === 'LEARNED') limitations.push('Learned from this machine’s own recent history; not field calibrated.');
    return {
      code: item.tag,
      available: item.value !== null,
      maturity,
      sampleCount: samples.length,
      median: item.value,
      mad: null,
      limitations,
    };
  });
}

function buildExplanation(
  candidates: string[],
  identity: string,
  separating: string[],
  state: StateInference,
  features: FeatureSet,
): string {
  const parts = [`Inferred machine state: ${state.state}.`];
  if (candidates.length === 0) parts.push('No controlled fault signature was met by the mapped measurements.');
  else if (candidates.length === 1) parts.push(`Single hypothesis retained (${identity}).`);
  else parts.push(`Ambiguity retained across ${candidates.length} hypotheses (${identity}).`);
  if (separating.length > 0) parts.push(`Separating information required: ${separating.join('; ')}.`);
  const blocked = Object.entries(features.availability)
    .filter(([, status]) => status.startsWith('NOT_EVALUATED'))
    .map(([key]) => key)
    .sort();
  if (blocked.length > 0) {
    parts.push(
      `${blocked.length} feature group(s) unavailable: ${blocked.slice(0, 6).join(', ')}${blocked.length > 6 ? '…' : ''}.`,
    );
  }
  parts.push('Thresholds are engineering-development values and are not field calibrated.');
  return parts.join(' ');
}

// --------------------------------------------------------------------------------------
// Public entry point
// --------------------------------------------------------------------------------------

export function analyzeExtruder(input: ExtruderAnalysisInput): ExtruderAnalysisResult {
  const now = input.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const trace = ['INPUT', 'VALIDATION', 'UNIT_NORMALIZATION', 'SIGNAL_PREPROCESSING'];

  const baseline = buildBaselineContext(input.recipeId, input.learnedBaselines);
  const { snapshot, resolved, unconsumed, unrecognised, rejected } = buildSnapshot(input, baseline, now);

  const features = extractFeatures(snapshot, baseline);
  trace.push('FEATURE_EXTRACTION', 'BASELINE_COMPARISON');

  const state = inferState(features.scalar, features.temporal);
  trace.push('MACHINE_STATE_INFERENCE');

  const rawEvidence = evaluateRules({ features, state });
  trace.push('FAULT_SPECIFIC_EVIDENCE');

  const byFault = new Map<string, FaultEvidence[]>();
  for (const item of rawEvidence) {
    const bucket = byFault.get(item.faultId);
    if (bucket) bucket.push(item);
    else byFault.set(item.faultId, [item]);
  }
  const assessments = rank([...byFault.entries()].map(([faultId, items]) => fuse(faultId, items)));
  trace.push('SENSOR_FUSION');

  const { candidates, category, layer } = selectCandidates(assessments, state);
  trace.push('OBSERVABILITY', 'FAULT_CLASSIFICATION');

  const { overall: constraintStatus, checks: constraints } = evaluateConstraints(
    snapshot.normalised,
    baseline.reductionRatio,
  );
  trace.push('CONSTRAINT_CHECK', 'RESULT');

  const identity = classifyIdentifiability(candidates);
  const separating = separatingMeasurements(candidates);
  const diagnoses = buildDiagnoses(candidates, assessments, constraintStatus);
  const anomaly = buildAnomaly(features, candidates, assessments, state);
  const records = baselineRecords(baseline);
  const quality = buildSignalQuality(
    resolved,
    features,
    assessments.filter((assessment) => layerOf(assessment.faultId) === 'INSTRUMENTATION'),
    nowMs,
  );

  const mappedTags = new Set(resolved.map((signal) => signal.tag));
  const missingEssential = ESSENTIAL_TAGS.filter((tag) => !mappedTags.has(tag));
  const missingDiagnostic = DIAGNOSTIC_TAGS.filter((tag) => !mappedTags.has(tag));
  const badQuality = quality.filter((item) => item.status === 'BAD').length;
  const readinessScore = Math.max(
    0,
    Math.round(100 - missingEssential.length * 12 - missingDiagnostic.length * 5 - badQuality * 8),
  );

  const readinessLimitations: string[] = [];
  if (missingEssential.length > 0) {
    readinessLimitations.push(
      `Missing essential evidence: ${missingEssential.map((tag) => `${tag} (${TAG_LABELS[tag]})`).join(', ')}.`,
    );
  }
  if (missingDiagnostic.length > 0) {
    readinessLimitations.push(
      `Missing diagnostic evidence: ${missingDiagnostic.map((tag) => `${tag} (${TAG_LABELS[tag]})`).join(', ')}.`,
    );
  }
  if (features.availability['vibration.V1'] !== AVAILABLE && features.availability['vibration.V2'] !== AVAILABLE) {
    readinessLimitations.push(
      'No raw vibration waveform reaches this app, so bearing, gear, imbalance, misalignment and looseness sub-types cannot be separated from a scalar amplitude alone.',
    );
  }
  for (const item of rejected) readinessLimitations.push(`${item.label}: ${item.error}`);

  const derived = Object.entries(features.scalar)
    .filter(([, value]) => Number.isFinite(value))
    .map(([code, value]) => ({
      code,
      value,
      unit: code.endsWith('_ratio_to_baseline') ? 'ratio' : code.endsWith('_c') ? 'degC' : '',
      quality: 'GOOD',
      valid: true,
      timestamp: now,
      source: 'derived' as const,
    }));

  const triggeredThresholds: TriggeredThreshold[] = rawEvidence
    .filter((item) => item.thresholdId)
    .map((item) => {
      const limit = getThreshold(item.thresholdId as string);
      return {
        thresholdId: limit.thresholdId,
        faultId: item.faultId,
        sensor: item.sensor,
        feature: item.feature,
        observed: item.observedValue,
        expectedDirection: item.expectedDirection,
        sourceStatus: limit.sourceStatus,
        fieldCalibrated: limit.fieldCalibrated,
        notes: limit.notes,
      };
    });

  const assessmentRecords: FaultAssessmentRecord[] = assessments.map((assessment) => ({
    faultId: assessment.faultId,
    faultName: faultName(assessment.faultId),
    category: getFault(assessment.faultId)?.category ?? 'UNKNOWN',
    layer: layerOf(assessment.faultId),
    matchClass: assessment.matchClass,
    engineeringMatchScore: assessment.engineeringMatchScore,
    scoreSemantics: 'ORDINAL_ENGINEERING_MATCH_SCORE_NOT_A_PROBABILITY',
    contributingSensors: contributingSensors(assessment),
    primary: assessment.primary,
    supporting: assessment.supporting,
    weak: assessment.weak,
    contradicting: assessment.contradicting,
    identifiability: classifyIdentifiability([assessment.faultId]),
    separatingMeasurement: separatingMeasurements([assessment.faultId]).join('; '),
  }));

  const top = diagnoses[0];
  const maintenancePriority: MachineAnalysisResult['maintenance']['priority'] =
    constraintStatus === 'VIOLATION'
      ? 'critical'
      : anomaly.severity === 'high'
        ? 'high'
        : candidates.length > 0
          ? 'medium'
          : anomaly.severity === 'low'
            ? 'low'
            : 'none';

  const maintenance: MachineAnalysisResult['maintenance'] =
    candidates.length === 0 && constraintStatus !== 'VIOLATION'
      ? {
          caseRequired: false,
          priority: 'none',
          title: 'No maintenance case required',
          recommendedActions: [],
          verificationSteps: [],
          similarCaseSignals: [],
        }
      : {
          caseRequired: true,
          priority: maintenancePriority,
          title:
            candidates.length > 1
              ? `Ambiguous condition: ${candidates.map(faultName).join(' / ')}`
              : (top?.title ?? 'Hard process constraint exceeded'),
          recommendedActions: [
            ...(constraintStatus === 'VIOLATION'
              ? constraints
                  .filter((check) => check.status === 'VIOLATION')
                  .map((check) => `${check.name} is outside its ${check.hardSoft.toLowerCase()} limit (${check.value} ${check.unit}, limit ${check.operator} ${check.limit}). Address this before continuing production.`)
              : []),
            ...(top ? [top.immediateAction, ...top.inspection] : []),
            ...(separating.length > 0
              ? [`To separate the remaining hypotheses, the following is required: ${separating.join('; ')}.`]
              : []),
          ],
          verificationSteps: [
            'Confirm the affected measurements return inside their controlled references after the action.',
            'Record the technician finding and close only after the evidence is normal.',
            'Do not mark resolved only because an action was completed.',
            'This model is advisory only: automatic actuation is false and real RUL is a blocked output.',
          ],
          similarCaseSignals: candidates,
        };

  const explanation = buildExplanation(candidates, identity, separating, state, features);

  const partial: Omit<MachineAnalysisResult, 'doctorReport' | 'plantSummary'> = {
    model: EXTRUDER_MODEL_KEY,
    modelVersion: EXTRUDER_MODEL_VERSION,
    generatedAt: now,
    readiness: {
      ready: missingEssential.length === 0,
      score: readinessScore,
      missingEssential,
      missingDiagnostic,
      limitations: readinessLimitations,
    },
    derived,
    quality,
    baselines: buildBaselines(records, snapshot.history),
    operatingState: {
      state: state.state,
      // The state rule is deterministic, so the reported number is a coverage
      // measure — how much of the evidence the rule wanted was actually there.
      confidence: state.state === MachineState.UNDETERMINED ? 0 : state.speedRatio !== null && state.meanZoneSlope !== null ? 0.9 : 0.6,
      supporting: state.basis,
      contradicting: [],
      limitations: [
        'No authoritative drive run-command signal is available; the state is inferred from speed, zone residuals and zone trend.',
        ...(state.meanZoneSlope === null
          ? ['No zone temperature history is available yet, so startup and shutdown cannot be separated from a heater fault.']
          : []),
      ],
    },
    anomaly,
    diagnoses,
    maintenance,
  };

  const doctorReport: MachineAnalysisResult['doctorReport'] = {
    summary:
      candidates.length === 0
        ? category === 'MACHINE_STATE_TRANSITION'
          ? `The machine is in ${state.state}; process and thermal deviation rules are suppressed because the machine is not at its production operating point by design.`
          : category === 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE'
            ? 'Something was observed, but no controlled signature can resolve what it is with the installed sensor package. This is not the same as healthy.'
            : 'All mapped measurements sit inside their controlled envelopes and no controlled fault signature was met.'
        : candidates.length === 1
          ? `${faultName(candidates[0])} is the retained hypothesis (${identity}).`
          : `${candidates.length} hypotheses are retained and the installed sensors cannot separate them: ${candidates.map(faultName).join(', ')}.`,
    safety: SAFETY_STEPS,
    whatChanged: anomaly.contributors.map((item) => item.description),
    nextChecks:
      separating.length > 0
        ? separating.map((item) => `Obtain: ${item}.`)
        : top?.inspection.slice(0, 3) ?? ['Map the remaining pilot tags to widen what the model can separate.'],
    caveats: [
      ...readinessLimitations,
      ...anomaly.limitations,
      'Blocked outputs for this model: real_rul, field_calibrated_probability, absolute_severity_percent.',
    ],
  };

  const plantSummary: MachineAnalysisResult['plantSummary'] = {
    status:
      constraintStatus === 'VIOLATION' || maintenance.priority === 'critical'
        ? 'critical'
        : maintenance.priority === 'high' || maintenance.priority === 'medium'
          ? 'attention'
          : readinessScore < 80 || anomaly.severity === 'low'
            ? 'watch'
            : 'healthy',
    machineCount: input.machineCount ?? 1,
    activeIssues: maintenance.caseRequired ? Math.max(1, candidates.length) : 0,
    highestUrgency: maintenance.priority,
  };

  const extruder: ExtruderDetail = {
    primaryDiagnosis: primaryLabel(candidates, state, category),
    candidateFaults: candidates,
    faultCategory: category,
    faultLayer: layer,
    identifiability: identity,
    separatingMeasurements: separating,
    inferredMachineState: state.state,
    stateBasis: state.basis,
    recipeId: baseline.recipeId,
    assessments: assessmentRecords,
    triggeredThresholds,
    constraintStatus,
    constraints,
    resolvedSignals: resolved,
    unconsumedSignals: unconsumed,
    unrecognisedSignals: unrecognised,
    rejectedSignals: rejected,
    missingTags: [...missingEssential, ...missingDiagnostic].map((tag) => ({
      tag,
      label: TAG_LABELS[tag],
      essential: missingEssential.includes(tag),
      note: missingTagNote(tag, mappedTags),
    })),
    baseline: records,
    availability: features.availability,
    features: {
      scalar: features.scalar,
      vibration: features.vibration,
      temporal: features.temporal,
      telemetry: features.telemetry,
      unitConversions: features.conversions,
    },
    explanation,
    trace,
    blockedOutputs: ['real_rul', 'field_calibrated_probability', 'absolute_severity_percent'],
    validationState: 'NOT_FIELD_VALIDATED',
    automaticActuation: false,
  };

  return { ...partial, doctorReport, plantSummary, model: EXTRUDER_MODEL_KEY, extruder };
}

/**
 * Append the latest normalised values onto a rolling history buffer.
 *
 * The twin's pipeline keeps its own history so temporal features (trend,
 * repetition, dispersion) become available after a few samples. Callers hold
 * this buffer across renders and pass it back in on the next run.
 */
export function appendHistory(
  history: Partial<Record<ExtruderTag, (number | null)[]>>,
  result: ExtruderAnalysisResult,
  windowSamples = HISTORY_WINDOW_SAMPLES,
): Partial<Record<ExtruderTag, (number | null)[]>> {
  const next: Partial<Record<ExtruderTag, (number | null)[]>> = { ...history };
  for (const signal of result.extruder.resolvedSignals) {
    if (signal.domain === 'acceleration') continue;
    const bucket = [...(next[signal.tag] ?? []), signal.value];
    next[signal.tag] = bucket.slice(-windowSamples);
  }
  return next;
}
