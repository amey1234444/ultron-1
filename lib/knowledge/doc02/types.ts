/**
 * ULTRON DOC-02 types — operations, sensors and data requirements.
 *
 * DOC-02 answers the second question in the chain: "How is the machine
 * operating right now, what data is required to understand that operation,
 * where does that data come from, and is the data trustworthy enough to use?"
 * Its section 36 names eight software modules, and this file declares the types
 * they share.
 *
 * The scope boundary in §1.2 is as firm as DOC-01's: DOC-02 identifies state,
 * context, source, metadata and data quality. It does not calculate normal.
 * Statistical baselines and feature formulas are DOC-03, fault diagnosis is
 * DOC-04, severity and action are DOC-05. So nothing here computes a threshold
 * or decides whether a reading is good for the machine — only whether the
 * reading itself can be trusted.
 */

/* 19 — Signal priority --------------------------------------------------------- */

/**
 * How badly the system needs a signal (DOC-02 §19).
 *
 * The class decides behaviour on absence, which is the whole reason it exists:
 * a missing MANDATORY signal degrades dependent logic to INSUFFICIENT_DATA,
 * while a missing SUPPORTING signal lowers confidence and carries on.
 */
export type SignalPriority = 'MANDATORY' | 'RECOMMENDED' | 'SUPPORTING' | 'OPTIONAL';

export const PRIORITY_BEHAVIOUR_IF_MISSING: Record<SignalPriority, string> = {
  MANDATORY:
    'Core state, context or diagnosis cannot be reliable without it. Dependent logic returns degraded or INSUFFICIENT_DATA; nothing is silently assumed.',
  RECOMMENDED: 'Materially improves diagnosis, localisation or normalisation. Run degraded logic where defined and reduce evidence quality.',
  SUPPORTING: 'Improves confidence or root-cause discrimination. Does not block core analytics unless a fault definition requires it.',
  OPTIONAL: 'Traceability or future analytics. No direct effect on core diagnosis by default.',
};

/* 16 — Data classification ----------------------------------------------------- */

/**
 * Where a value came from (DOC-02 §16).
 *
 * Each class carries different obligations, which is why they are kept apart: a
 * MEASURED value needs source, unit, quality and calibration; a CONFIGURED one
 * needs authority and approval; a CALCULATED one needs its formula version; an
 * INFERRED one needs its evidence and confidence.
 */
export type DataClass = 'MEASURED' | 'CONFIGURED' | 'CALCULATED' | 'INFERRED';

export const DATA_CLASS_RULE: Record<DataClass, string> = {
  MEASURED: 'Keep source, unit, quality, timestamp and calibration metadata.',
  CONFIGURED: 'Store authority, source, approval and version.',
  CALCULATED: 'Carry formula id and version, and inherit the quality of its inputs.',
  INFERRED: 'Store evidence, model or rule version, and confidence.',
};

/* 17 — Measurement source hierarchy -------------------------------------------- */

/**
 * Where a signal should preferably come from, best first (DOC-02 §17).
 *
 * The ordering is the policy: "reuse trustworthy data first". ULTRON should not
 * duplicate an existing reliable measurement simply because a new sensor could
 * be installed, so an independent sensor ranks *below* the plant's own
 * controller rather than above it.
 */
export type SourceKind =
  | 'PLANT_CONTROLLER'
  | 'DRIVE_OR_DEDICATED_CONTROLLER'
  | 'MES_QMS_LAB'
  | 'ULTRON_SENSOR'
  | 'OPERATOR_ENTRY';

export const SOURCE_PRIORITY: readonly SourceKind[] = [
  'PLANT_CONTROLLER',
  'DRIVE_OR_DEDICATED_CONTROLLER',
  'MES_QMS_LAB',
  'ULTRON_SENSOR',
  'OPERATOR_ENTRY',
] as const;

export const SOURCE_USE: Record<SourceKind, string> = {
  PLANT_CONTROLLER:
    'Existing PLC, DCS or OEM controller. Preferred when an actual measurement is available, correctly scaled, timestamped and sufficiently responsive.',
  DRIVE_OR_DEDICATED_CONTROLLER:
    'VFD, feeder or dedicated controller. Preferred for drive current, power and torque, feeder actual rate, and controller diagnostics.',
  MES_QMS_LAB: 'Recipe, batch, production and quality context. Not always real-time.',
  ULTRON_SENSOR:
    'Use when data is unavailable, unreliable or too slow, when independent verification is needed, or when the measurement is core to ULTRON.',
  OPERATOR_ENTRY: 'Only for context that cannot be obtained automatically. Manual-entry quality is tracked.',
};

export function sourceRank(source: SourceKind): number {
  return SOURCE_PRIORITY.indexOf(source);
}

/* 21 — Acquisition classes ----------------------------------------------------- */

/**
 * How often a signal has to be read (DOC-02 §21).
 *
 * Classes rather than rates, and deliberately so. DOC-02 carries a NO FAKE
 * UNIVERSAL RATES rule: it must not claim every pressure signal is 10 Hz or
 * every temperature 1 Hz, because the real rate depends on process dynamics,
 * the source's own update rate, the fault-detection objective and the network
 * design. A class is a design intent a site then validates into a number.
 */
export type AcquisitionClass = 'STATE_EVENT' | 'SLOW_PROCESS' | 'NORMAL_PROCESS' | 'FAST_EVENT' | 'WAVEFORM';

export const ACQUISITION_CHARACTER: Record<AcquisitionClass, string> = {
  STATE_EVENT:
    'Trip bits, mode, recipe change. On change plus reliable polling or heartbeat; transitions must not be missed, and timestamps come from source or gateway where possible.',
  SLOW_PROCESS: 'Barrel, bearing and ambient temperatures. Seconds-level — enough to capture process dynamics without unnecessary traffic.',
  NORMAL_PROCESS:
    'Feed, pressure, RPM, torque, current, power. Sub-second to a few seconds depending on the process and the control source.',
  FAST_EVENT: 'Speed pulses and protection events. As needed for reliable event detection; may be processed locally before the backend.',
  WAVEFORM:
    'Vibration waveform. High-frequency acquisition handled by Advanced Condition Monitoring; derived Part-1 values are stored separately.',
};

/* 20 / 29 — Location model and canonical tags ---------------------------------- */

/**
 * A canonical measurement location (DOC-02 §20).
 *
 * DOC-02 attaches a rule to this table that the type is built around: "A
 * pressure value without its physical tap location is not enough for reliable
 * diagnosis. ULTRON should store location as structured metadata, not only in
 * the tag name." So location is its own field on every signal, and the tag is
 * composed from it rather than being the only place it lives.
 */
export type CanonicalLocation = string;

/* 15 — The sensor / data point master ------------------------------------------ */

export type SignalGroup =
  | 'DRIVE_MECHANICAL'
  | 'FEEDING_MATERIAL'
  | 'BARREL_THERMAL'
  | 'MELT_DOWNSTREAM'
  | 'UTILITY_PRODUCTION';

/** One row of the DOC-02 §15 sensor and data-point master. */
export type SignalDefinition = {
  /** The document's own id, D001 through D060. */
  signalId: string;
  parameter: string;
  /** Physical location as the document words it. */
  location: string;
  /** Preferred source as the document words it, before ranking. */
  preferredSourceText: string;
  /** The §17 rank that text resolves to. */
  preferredSource: SourceKind;
  priority: SignalPriority;
  unit: string;
  primaryUse: string;
  group: SignalGroup;
  /** The §29 canonical tag, composed rather than typed. */
  canonicalTag: string;
  /** The §20 structured location this signal is measured at. */
  canonicalLocation: CanonicalLocation;
  acquisitionClass: AcquisitionClass;
  dataClass: DataClass;
};

/* 22 — Data quality ------------------------------------------------------------ */

/**
 * The verdict on one reading (DOC-02 §22).
 *
 * Four values, not two. UNCERTAIN is the one that earns its place: a reading
 * that is late, near a range boundary or partially contradicted is not good
 * enough to found a fault on and not bad enough to discard, and collapsing it
 * either way loses the distinction DOC-03 needs.
 */
export type QualityVerdict = 'GOOD' | 'UNCERTAIN' | 'BAD' | 'MISSING';

export const QUALITY_RANK: Record<QualityVerdict, number> = {
  GOOD: 0,
  UNCERTAIN: 1,
  BAD: 2,
  MISSING: 3,
};

/** The worst verdict in a set — how a calculated value inherits its inputs' quality. */
export function worstQuality(verdicts: readonly QualityVerdict[]): QualityVerdict {
  return verdicts.reduce<QualityVerdict>(
    (worst, verdict) => (QUALITY_RANK[verdict] > QUALITY_RANK[worst] ? verdict : worst),
    'GOOD',
  );
}

/** One of the DOC-02 §22 checks. */
export type QualityRuleId =
  | 'DQ-001'
  | 'DQ-002'
  | 'DQ-003'
  | 'DQ-004'
  | 'DQ-005'
  | 'DQ-006'
  | 'DQ-007'
  | 'DQ-008'
  | 'DQ-009'
  | 'DQ-010';

export type QualityFinding = {
  ruleId: QualityRuleId;
  check: string;
  verdict: QualityVerdict;
  /** Why this verdict, in a sentence naming what was observed. */
  reason: string;
  /** What DOC-02 says happens downstream when this rule fires. */
  downstreamRule: string;
};

/** The quality of one signal, with every finding that contributed. */
export type SignalQuality = {
  signalId: string;
  verdict: QualityVerdict;
  findings: QualityFinding[];
  /** True when a MANDATORY signal is BAD or MISSING (the §22 instrumentation-first rule). */
  suppressesPhysicalDiagnosis: boolean;
};

/* 4 / 14 — Operating state ------------------------------------------------------ */

/** The thirteen states of DOC-02 §4. */
export type OperatingStateId =
  | 'ST-00'
  | 'ST-01'
  | 'ST-02'
  | 'ST-03'
  | 'ST-04'
  | 'ST-05'
  | 'ST-06'
  | 'ST-07'
  | 'ST-08'
  | 'ST-09'
  | 'ST-10'
  | 'ST-11'
  | 'ST-12';

export type OperatingStateDefinition = {
  stateId: OperatingStateId;
  name: string;
  physicalMeaning: string;
  analyticsUse: string;
  /** Whether DOC-03 may learn a baseline in this state. */
  baselineLearning: boolean;
  /** Signals the state logic needs before it can conclude anything. */
  requiredInputs: string[];
  /** The reference logic, as the document states it. Site-validated at deployment. */
  referenceLogic: string;
  expectedBehaviour: string;
  /** The trap this state exists to avoid. */
  implementationNote: string;
};

export type TransitionType = 'EXPECTED' | 'UNEXPECTED' | 'FORCED' | 'MANUAL';

/** The §14 engine output. Every field the document lists. */
export type OperatingStateRecord = {
  operatingState: OperatingStateId;
  /** 0..1. Explicit control states can be marked authoritative at 1. */
  stateConfidence: number;
  stateStartTime: string | null;
  stateDurationMs: number | null;
  previousState: OperatingStateId | null;
  transitionType: TransitionType;
  /** Signals and rules that established the state. */
  stateEvidence: string[];
  /** Quality of the evidence the state rests on. */
  stateQuality: QualityVerdict | 'UNKNOWN';
  /** Present when the state could not be determined, saying what was missing. */
  unknownReason?: string;
};

/* 26 / 27 — Context ------------------------------------------------------------- */

export type ContextFieldClass = 'MANDATORY' | 'RECOMMENDED' | 'IF_INSTALLED';

export type ContextFieldDefinition = {
  field: string;
  class: ContextFieldClass;
  whyItMatters: string;
};

/**
 * The context an observation happened in (DOC-02 §26).
 *
 * DOC-03 selects a baseline with this, so an incomplete context is not a
 * cosmetic problem: it is the difference between comparing a reading against
 * the right normal and against somebody else's. `confidence` and `missing`
 * travel with it so a consumer can tell those apart.
 */
export type ContextObject = {
  /** Stable hash of the mandatory keys. Null when they are not all present. */
  contextId: string | null;
  machineId: string | null;
  machineVariant: string | null;
  configurationVersion: string | null;
  operatingState: OperatingStateId | null;
  recipeId: string | null;
  screwRpm: number | null;
  mainFeedRate: number | null;
  temperatureSetpointProfile: string | null;
  sideFeed: number | null;
  vacuumMode: string | null;
  coolingMode: string | null;
  productBatch: string | null;
  /** 0..1, reduced by every missing or uncertain mandatory key. */
  confidence: number;
  /** Mandatory context fields that are absent. */
  missing: string[];
};

/* 25 — Persistence and hysteresis ----------------------------------------------- */

/**
 * The configuration fields a persisted limit needs (DOC-02 §25).
 *
 * DOC-02 defines that these fields exist and are controlled configuration; what
 * the analytical layer does with them is DOC-03 and DOC-05. The separate clear
 * threshold is the point of the structure — a condition that enters at one
 * boundary and clears at the same one chatters.
 */
export type HysteresisConfig = {
  configId: string;
  /** The signal or derived feature this governs. */
  subject: string;
  enterThreshold: number | null;
  /** How long, or how many valid samples, the condition must persist. */
  enterPersistenceSeconds: number | null;
  clearThreshold: number | null;
  clearPersistenceSeconds: number | null;
  /** Whether an approved hard Danger or Trip condition skips persistence. */
  hardLimitBypass: boolean;
  /** States and context the rule is valid in. Empty means unrestricted. */
  applicableStates: OperatingStateId[];
  applicableContext: string | null;
  /** Who approved these values. Required before the config may be used. */
  sourceAuthority: string | null;
  approvedBy: string | null;
  version: string | null;
};
