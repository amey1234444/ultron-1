/**
 * The DOC-02 §4–§14 Operating State Engine.
 *
 * Thirteen states, ST-00 to ST-12, and the engine that decides which one a
 * machine is in. Three rules from the document shape the whole design:
 *
 *   §4  STATE PRIORITY RULE — an explicit FAULT/TRIP or MAINTENANCE state from
 *       the control system beats any inferred steady-production state. The
 *       plant knows things the process variables do not.
 *
 *   §13 Explicit high-authority state bits override inferred states, and when
 *       evidence conflicts the answer is UNKNOWN.
 *
 *   §14 DO NOT GUESS — "If state evidence is insufficient, output UNKNOWN and
 *       carry that uncertainty into DOC-03/DOC-04. 'Unknown' is safer than
 *       falsely applying a steady-production baseline."
 *
 * ST-00 UNKNOWN is therefore a real answer this engine reaches on purpose, not
 * a failure to reach one. Every other state requires its mandatory evidence to
 * be present and usable; absent that, the engine says so and DOC-03 declines to
 * select a baseline rather than selecting the wrong one.
 *
 * What is *not* here: numbers. DOC-02 §7 is explicit that "Ready criteria are
 * machine/recipe-specific configuration fields, not universal numbers", and the
 * same holds for every threshold the reference logic implies. So the engine
 * takes a `StateThresholds` object and reports UNKNOWN with a named gap when it
 * has not been given one.
 */

import type {
  OperatingStateDefinition,
  OperatingStateId,
  OperatingStateRecord,
  QualityVerdict,
  TransitionType,
} from './types';

/* 4 — The state master ----------------------------------------------------------- */

function state(
  stateId: OperatingStateId,
  name: string,
  physicalMeaning: string,
  analyticsUse: string,
  baselineLearning: boolean,
  requiredInputs: string[],
  referenceLogic: string,
  expectedBehaviour: string,
  implementationNote: string,
): OperatingStateDefinition {
  return {
    stateId,
    name,
    physicalMeaning,
    analyticsUse,
    baselineLearning,
    requiredInputs,
    referenceLogic,
    expectedBehaviour,
    implementationNote,
  };
}

export const DOC02_OPERATING_STATES: readonly OperatingStateDefinition[] = [
  state(
    'ST-00',
    'UNKNOWN',
    'Insufficient or contradictory context.',
    'Do not force a diagnosis.',
    false,
    ['Whatever the candidate state required and did not get'],
    'Returned whenever mandatory evidence is missing, unusable, or points at two states at once.',
    'No claim is made about the machine.',
    'Unknown is safer than falsely applying a steady-production baseline.',
  ),
  state(
    'ST-01',
    'STOPPED',
    'No intended rotation or production. The barrel may still be hot immediately after shutdown.',
    'Static and data-quality checks.',
    false,
    ['Motor run/status', 'Screw RPM', 'Feed rate', 'Machine mode', 'Trip/interlock'],
    'Run OFF plus screw RPM near zero plus feed zero, unless a maintenance, purge or manual state overrides.',
    'RPM near zero; feed zero; torque and current off or no-load; pressure decays after process stop; temperatures may remain elevated.',
    'Do not classify hot barrel temperatures after shutdown as a process fault simply because the machine is stopped.',
  ),
  state(
    'ST-02',
    'WARM_UP',
    'Barrel zones are heating toward the recipe or setpoint profile before production.',
    'Thermal trajectory and control checks.',
    false,
    ['Zone actual temperatures', 'Zone setpoints', 'Heater outputs', 'Cooling outputs if active', 'Screw RPM', 'Feed'],
    'RPM near zero plus no material feed plus one or more heating zones actively approaching setpoint.',
    'Temperature rises over time; heater output active; setpoint error reduces; different zones may heat at different normal rates.',
    'DOC-03 uses a trajectory or profile baseline here, not a steady-production baseline.',
  ),
  state(
    'ST-03',
    'READY',
    'Thermal and permissive conditions are satisfied but production has not started.',
    'Readiness checks.',
    false,
    ['Zone actual and setpoint', 'Run permissive', 'Trip status', 'Screw RPM', 'Feed'],
    'Required zones inside the configured ready band, no active trip, screw RPM near zero and feed zero.',
    'Temperatures near setpoints; low temperature rate of change; no process pressure or throughput.',
    'Ready criteria are machine and recipe specific configuration fields, not universal numbers.',
  ),
  state(
    'ST-04',
    'STARTUP',
    'Rotation and feed are introduced; transients are expected.',
    'Startup envelope only.',
    false,
    ['Screw RPM', 'RPM setpoint', 'Feed rate and setpoint', 'Torque', 'Current/power', 'Melt pressure', 'Temperatures', 'Recipe'],
    'Transition from READY or STOPPED into nonzero RPM and/or feed. Remains STARTUP until the defined ramp criteria are met.',
    'RPM rises; feed begins; torque and current rise; pressure develops; short transients may be normal.',
    'Steady-production fault rules must not be blindly applied here.',
  ),
  state(
    'ST-05',
    'RAMP_UP',
    'Producing, but feed, RPM, load and process variables are still moving toward target.',
    'Transition and stability logic.',
    false,
    ['RPM', 'Feed', 'Torque', 'Pressure', 'Throughput', 'Temperatures', 'Recipe/setpoints'],
    'Production present plus context still changing, or stability criteria not yet satisfied.',
    'Trend toward targets; decreasing variability as stable production is approached.',
    'The primary output is "stable enough?" rather than aggressive fault diagnosis.',
  ),
  state(
    'ST-06',
    'STEADY_PRODUCTION',
    'Stable production under a defined machine, recipe, speed and load context.',
    'Full analytics.',
    true,
    ['Run state', 'Screw RPM', 'Feed', 'Torque', 'Pressure', 'Zone profile', 'Recipe/material', 'Throughput', 'Mode'],
    'Run ON plus feed above minimum plus recipe and configuration unchanged plus RPM, feed and key process variables stable for the validated persistence window.',
    'Context stable; full process relationships applicable; eligible for baseline learning only when data quality is GOOD and no anomaly, fault or limit event is active.',
    'The primary state for contextual baselines and most Part-1 diagnostics.',
  ),
  state(
    'ST-07',
    'RECIPE_CHANGE',
    'Recipe, material, product or the commanded thermal/feed profile is intentionally changing.',
    'Transition logic.',
    false,
    ['Recipe ID/material', 'Feed and side feed', 'Temperature setpoints', 'Product/batch', 'RPM target'],
    'A change in recipe, material or product, or an explicit transition flag. Freeze old baseline learning until the new context stabilises.',
    'Torque, pressure and energy can legitimately change; a new steady context must be selected or learned.',
    'A context change is not a fault.',
  ),
  state(
    'ST-08',
    'SHUTDOWN',
    'Production is intentionally reduced toward zero feed and RPM.',
    'Shutdown envelope.',
    false,
    ['Feed', 'RPM', 'Pressure', 'Torque/current', 'Shutdown command', 'Purge status'],
    'Feed reduction or stop plus RPM reduction, or an explicit shutdown command.',
    'Throughput, pressure and torque reduce; temperatures can remain high.',
    'Use the shutdown envelope; avoid steady-state false alarms.',
  ),
  state(
    'ST-09',
    'FAULT_TRIP',
    'A protection or interlock is active.',
    'Event capture and diagnosis.',
    false,
    ['Trip/interlock', 'Mode', 'Core state signals'],
    'Explicit high-authority state bit. Overrides any inferred state.',
    'Analytics restricted to state-appropriate checks.',
    'Prevents inappropriate baseline learning and false process diagnosis.',
  ),
  state(
    'ST-10',
    'MAINTENANCE',
    'Service or manual maintenance state.',
    'Service and data-quality checks only.',
    false,
    ['Maintenance flag', 'Mode', 'Core state signals'],
    'Explicit high-authority state bit. Overrides any inferred state.',
    'Analytics restricted to state-appropriate checks.',
    'Prevents inappropriate baseline learning and false process diagnosis.',
  ),
  state(
    'ST-11',
    'PURGE_CLEANING',
    'Intentional purge or cleaning behaviour.',
    'Dedicated rules if configured.',
    false,
    ['Purge/cleaning flag', 'Mode', 'Feed', 'RPM'],
    'Explicit purge or cleaning flag.',
    'Process variables follow the purge procedure rather than a production envelope.',
    'Prevents inappropriate baseline learning and false process diagnosis.',
  ),
  state(
    'ST-12',
    'MANUAL',
    'Operator or manual control, which may violate automatic relationships.',
    'Limited and context-aware.',
    false,
    ['Operator mode', 'Mode', 'Core state signals'],
    'Explicit manual-mode bit.',
    'Automatic process relationships may not hold.',
    'Usually not eligible for baseline learning.',
  ),
] as const;

const BY_ID = new Map(DOC02_OPERATING_STATES.map((entry) => [entry.stateId, entry]));

export function operatingStateDefinition(stateId: OperatingStateId): OperatingStateDefinition | undefined {
  return BY_ID.get(stateId);
}

/**
 * Whether DOC-03 may learn a baseline in this state.
 *
 * Only ST-06 returns true, and an unrecognised state returns false. An
 * unrecognised state is not a licence to assume steady production — it is a
 * reason not to.
 */
export function baselineLearningAllowed(stateId: string): boolean {
  return BY_ID.get(stateId as OperatingStateId)?.baselineLearning ?? false;
}

/* 14 — The engine ---------------------------------------------------------------- */

/**
 * Explicit control-system state, which outranks anything inferred.
 *
 * Each field is tri-state on purpose: `true` asserts the condition, `false`
 * asserts its absence, and `null`/undefined means the plant does not publish
 * that bit. The difference matters — "no trip is active" and "we cannot see
 * whether a trip is active" support different conclusions.
 */
export type ExplicitControlState = {
  tripActive?: boolean | null;
  maintenanceActive?: boolean | null;
  purgeActive?: boolean | null;
  manualMode?: boolean | null;
  recipeChanging?: boolean | null;
  shutdownCommanded?: boolean | null;
  runCommand?: boolean | null;
};

/** Measured evidence the engine reasons over. Null means not available. */
export type StateEvidenceInput = {
  motorRunning: boolean | null;
  screwRpm: number | null;
  feedRate: number | null;
  torque: number | null;
  meltPressure: number | null;
  /** Mean absolute zone setpoint error, where zones are mapped. */
  zoneSetpointError: number | null;
  /** Mean zone temperature slope in degC per minute. */
  zoneTemperatureSlope: number | null;
  /** Whether heater output is commanded on anywhere. */
  heaterActive: boolean | null;
  /** True when RPM and feed have held inside their bands for the persistence window. */
  processStable: boolean | null;
  /** Quality of the mandatory evidence above. */
  evidenceQuality: QualityVerdict;
};

/**
 * Site-declared boundaries the reference logic needs.
 *
 * No defaults. DOC-02 §7 says ready criteria are configuration fields "not
 * universal numbers", and the same applies to what counts as near-zero RPM on a
 * machine whose working range you have not been told. An engine with no
 * thresholds returns UNKNOWN and names them, which is a useful answer to a
 * commissioning engineer and an honest one to an operator.
 */
export type StateThresholds = {
  /** RPM at or below which the screws count as not turning. */
  zeroRpm: number;
  /** Feed rate at or below which no material is entering. */
  zeroFeed: number;
  /** Feed rate above which production is genuinely under way. */
  minProductionFeed: number;
  /** Zone setpoint error within which the barrel counts as at temperature. */
  readyBandDegC: number;
  /** Zone slope above which the barrel counts as actively heating, degC/min. */
  warmUpSlopeDegCPerMin: number;
};

export type StateEngineInput = {
  explicit: ExplicitControlState;
  evidence: StateEvidenceInput;
  thresholds: StateThresholds | null;
  nowMs: number;
  /** The record this engine produced last time, for transition and duration. */
  previous?: OperatingStateRecord | null;
  /**
   * How long a newly inferred state must hold before it replaces the current
   * one (§14 persistence/debounce). Explicit states bypass it.
   */
  persistenceMs?: number;
  /** When the currently pending candidate first appeared. */
  candidateSinceMs?: number | null;
};

function record(
  stateId: OperatingStateId,
  confidence: number,
  evidence: string[],
  quality: QualityVerdict | 'UNKNOWN',
  input: StateEngineInput,
  transitionType: TransitionType,
  unknownReason?: string,
): OperatingStateRecord {
  const previous = input.previous ?? null;
  const continuing = previous?.operatingState === stateId;
  const startTime = continuing && previous?.stateStartTime ? previous.stateStartTime : new Date(input.nowMs).toISOString();
  return {
    operatingState: stateId,
    stateConfidence: confidence,
    stateStartTime: startTime,
    stateDurationMs: input.nowMs - Date.parse(startTime),
    previousState: continuing ? (previous?.previousState ?? null) : (previous?.operatingState ?? null),
    transitionType,
    stateEvidence: evidence,
    stateQuality: quality,
    ...(unknownReason ? { unknownReason } : {}),
  };
}

/**
 * Determine the machine's operating state.
 *
 * Explicit control states are consulted first and returned at full confidence,
 * because §4's priority rule and §13 both say the plant's own bits win. Only
 * when none is asserted does the engine infer from process evidence, and only
 * when it has been given the thresholds to infer against.
 */
export function inferOperatingState(input: StateEngineInput): OperatingStateRecord {
  const { explicit, evidence, thresholds } = input;

  // --- Explicit, high-authority states. §4 priority rule. -------------------
  const explicitState = (
    [
      ['tripActive', 'ST-09', 'Trip or interlock bit active'],
      ['maintenanceActive', 'ST-10', 'Maintenance flag active'],
      ['purgeActive', 'ST-11', 'Purge or cleaning flag active'],
      ['manualMode', 'ST-12', 'Manual mode bit active'],
    ] as const
  ).find(([field]) => explicit[field] === true);

  if (explicitState) {
    const [, stateId, why] = explicitState;
    return record(stateId as OperatingStateId, 1, [why], 'GOOD', input, 'FORCED');
  }

  // --- Recipe change is explicit but not a protection state. ----------------
  if (explicit.recipeChanging === true) {
    return record('ST-07', 1, ['Recipe or product transition flag active'], 'GOOD', input, 'EXPECTED');
  }

  // --- Inference needs thresholds and usable evidence. ----------------------
  if (!thresholds) {
    return record(
      'ST-00',
      0,
      [],
      'UNKNOWN',
      input,
      'UNEXPECTED',
      'No state thresholds are configured for this machine. Zero-RPM, zero-feed, minimum production feed, ready band and warm-up slope are machine-specific configuration fields, and DOC-02 §7 forbids assuming universal numbers for them.',
    );
  }

  if (evidence.evidenceQuality === 'BAD' || evidence.evidenceQuality === 'MISSING') {
    return record(
      'ST-00',
      0,
      [],
      evidence.evidenceQuality,
      input,
      'UNEXPECTED',
      `The mandatory state evidence is ${evidence.evidenceQuality}. A state inferred from untrustworthy signals would be carried into every downstream baseline and diagnosis.`,
    );
  }

  const missing: string[] = [];
  if (evidence.screwRpm === null) missing.push('Screw RPM');
  if (evidence.feedRate === null) missing.push('Feed rate');
  if (evidence.motorRunning === null) missing.push('Motor run status');
  if (missing.length > 0) {
    return record(
      'ST-00',
      0,
      [],
      'UNKNOWN',
      input,
      'UNEXPECTED',
      `Mandatory state signals are not mapped: ${missing.join(', ')}. DOC-02 §14 requires UNKNOWN rather than an assumed state.`,
    );
  }

  const rpm = evidence.screwRpm as number;
  const feed = evidence.feedRate as number;
  const turning = rpm > thresholds.zeroRpm;
  const feeding = feed > thresholds.zeroFeed;
  const producing = feed > thresholds.minProductionFeed;
  const evidenceList: string[] = [`Screw RPM ${rpm}`, `Feed ${feed}`];

  // Quality that is merely UNCERTAIN still yields a state, at reduced confidence.
  const confidence = evidence.evidenceQuality === 'UNCERTAIN' ? 0.6 : 0.9;
  const quality = evidence.evidenceQuality;

  // --- Shutdown: commanded, or production falling away. ---------------------
  if (explicit.shutdownCommanded === true) {
    return record('ST-08', 1, [...evidenceList, 'Shutdown commanded'], quality, input, 'EXPECTED');
  }

  // --- Not turning: stopped, warming, or ready. -----------------------------
  if (!turning && !feeding) {
    if (evidence.heaterActive === true && (evidence.zoneTemperatureSlope ?? 0) >= thresholds.warmUpSlopeDegCPerMin) {
      return record('ST-02', confidence, [...evidenceList, 'Heaters active, zones rising'], quality, input, transitionFrom(input, 'ST-02'));
    }
    if (
      evidence.zoneSetpointError !== null &&
      Math.abs(evidence.zoneSetpointError) <= thresholds.readyBandDegC &&
      explicit.tripActive !== true
    ) {
      return record('ST-03', confidence, [...evidenceList, 'Zones inside the ready band'], quality, input, transitionFrom(input, 'ST-03'));
    }
    return record('ST-01', confidence, [...evidenceList, 'Not turning, no feed'], quality, input, transitionFrom(input, 'ST-01'));
  }

  // --- Turning and producing. ----------------------------------------------
  if (producing && evidence.processStable === true) {
    return record('ST-06', confidence, [...evidenceList, 'Process stable for the persistence window'], quality, input, transitionFrom(input, 'ST-06'));
  }
  if (producing) {
    return record('ST-05', confidence, [...evidenceList, 'Producing, not yet stable'], quality, input, transitionFrom(input, 'ST-05'));
  }
  return record('ST-04', confidence, [...evidenceList, 'Rotation and feed beginning'], quality, input, transitionFrom(input, 'ST-04'));
}

/**
 * Classify a transition.
 *
 * `EXPECTED` covers the moves the operating cycle of §3 describes; anything
 * else that changes state is `UNEXPECTED`, which is itself worth recording —
 * a jump straight from STOPPED to STEADY_PRODUCTION means the evidence or the
 * thresholds are wrong.
 */
const EXPECTED_TRANSITIONS: Record<string, OperatingStateId[]> = {
  'ST-01': ['ST-02', 'ST-04', 'ST-09', 'ST-10', 'ST-11', 'ST-12'],
  'ST-02': ['ST-03', 'ST-01', 'ST-09', 'ST-10'],
  'ST-03': ['ST-04', 'ST-01', 'ST-02', 'ST-09', 'ST-10'],
  'ST-04': ['ST-05', 'ST-08', 'ST-01', 'ST-09'],
  'ST-05': ['ST-06', 'ST-08', 'ST-04', 'ST-09'],
  'ST-06': ['ST-05', 'ST-07', 'ST-08', 'ST-09', 'ST-10'],
  'ST-07': ['ST-05', 'ST-06', 'ST-08', 'ST-09'],
  'ST-08': ['ST-01', 'ST-03', 'ST-11', 'ST-09'],
  'ST-09': ['ST-01', 'ST-10'],
  'ST-10': ['ST-01', 'ST-03'],
  'ST-11': ['ST-01', 'ST-03'],
  'ST-12': ['ST-01', 'ST-06'],
};

function transitionFrom(input: StateEngineInput, next: OperatingStateId): TransitionType {
  const previous = input.previous?.operatingState;
  if (!previous || previous === next) return 'EXPECTED';
  if (previous === 'ST-00') return 'EXPECTED';
  return EXPECTED_TRANSITIONS[previous]?.includes(next) ? 'EXPECTED' : 'UNEXPECTED';
}

/** Whether a record is usable as context for baseline selection. */
export function stateIsUsableContext(record: OperatingStateRecord): boolean {
  return record.operatingState !== 'ST-00' && record.stateQuality !== 'UNKNOWN' && record.stateQuality !== 'BAD';
}
