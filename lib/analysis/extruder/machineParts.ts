/**
 * MACHINE PARTS — the Analysis layer's grouping axis.
 *
 * The Analysis layer used to be organised by what the *model* reads: tags,
 * thresholds, evidence classes. An operator does not walk to a tag. They walk to
 * the gearbox. So every user-facing analysis view now groups by one of seven
 * controlled machine parts, and the tag stays underneath as the traceable
 * identity it always was:
 *
 *   machinePart = "Gearbox"        <- closed enum, safe to group and navigate by
 *   tag         = "V2"             <- what the pipeline actually read
 *
 * Nothing here is a second diagnostic system. Every state below is *mapped*
 * from a result the pipeline already produced — a candidate fault, a crossed
 * threshold, a violated process constraint, a quality verdict. This module
 * decides only *where on the machine* those results belong.
 */
import { getFault, PROCESS_CONSTRAINTS } from './registers';
import type { ExtruderTag } from './signalMap';

export type MachinePart =
  | 'Motor'
  | 'Gearbox'
  | 'Screw / Drive'
  | 'Hopper'
  | 'Barrel'
  | 'Melt / Process'
  | 'Electrical / Power';

/** Navigation order: drive train first, then process, then supply. */
export const PART_ORDER: MachinePart[] = [
  'Motor',
  'Gearbox',
  'Screw / Drive',
  'Hopper',
  'Barrel',
  'Melt / Process',
  'Electrical / Power',
];

/**
 * Order material actually travels through the machine.
 *
 * Used for the condition strip, so the row reads as the process it is rather
 * than as an alphabetised list. Electrical / Power is deliberately absent: it
 * supplies the machine rather than sitting anywhere in the material path.
 */
export const PART_FLOW: MachinePart[] = ['Hopper', 'Motor', 'Gearbox', 'Screw / Drive', 'Barrel', 'Melt / Process'];

export const PART_DESCRIPTION: Record<MachinePart, string> = {
  Motor: 'Drive motor: speed, temperature and vibration at the motor itself.',
  Gearbox: 'Reduction gearbox: temperature and vibration across the gear train.',
  'Screw / Drive': 'Screw and drive train: alignment, looseness and screw wear.',
  Hopper: 'Feed hopper: how much material is present and how fast it is being used.',
  Barrel: 'Heated barrel zones: the thermal profile along the screw.',
  'Melt / Process': 'Melt conditions at the metering zone, screen pack and die.',
  'Electrical / Power': 'Motor supply as measured by the power meter.',
};

// ---------------------------------------------------------------------------
// Tag ownership
// ---------------------------------------------------------------------------

/**
 * The part a tag physically belongs to.
 *
 * Exactly one owner per tag. Anything a tag merely *informs* is context and
 * goes through `contextPartsForTag` instead, so ownership can never be
 * ambiguous and a signal can never be counted twice.
 */
const TAG_OWNER: Record<ExtruderTag, MachinePart> = {
  E1: 'Motor',
  V1: 'Motor',
  T4: 'Motor',
  V2: 'Gearbox',
  T5: 'Gearbox',
  T1: 'Barrel',
  T2: 'Barrel',
  T3: 'Barrel',
  P1: 'Melt / Process',
  L1: 'Hopper',
  'PM1.current': 'Electrical / Power',
  'PM1.power': 'Electrical / Power',
  'PM1.voltage': 'Electrical / Power',
  'PM1.power_factor': 'Electrical / Power',
};

export function partForTag(tag: ExtruderTag): MachinePart {
  return TAG_OWNER[tag];
}

/**
 * Parts a tag informs without owning.
 *
 * Two cases, both real: motor current is the honest measure of how hard the
 * drive train is working, and motor shaft speed is what screw speed is derived
 * from through the gearbox ratio. Context is additive — it never moves
 * ownership, and a context signal is always labelled as such in the view.
 */
export function contextPartsForTag(tag: ExtruderTag): MachinePart[] {
  if (tag === 'PM1.current' || tag === 'PM1.power') return ['Motor', 'Screw / Drive'];
  if (tag === 'E1') return ['Screw / Drive'];
  return [];
}

/** Every part a tag is relevant to, owner first. */
export function relatedParts(tag: ExtruderTag): MachinePart[] {
  return [partForTag(tag), ...contextPartsForTag(tag)];
}

// ---------------------------------------------------------------------------
// Fault ownership
// ---------------------------------------------------------------------------

/**
 * Fault subsystem → machine part.
 *
 * The fault register already records a `subsystem` for every fault, so the part
 * is read off the register rather than re-derived from the fault's sensors —
 * `F-MOTOR-EFF` is a motor fault even though both of its sensors are electrical.
 *
 * Instrumentation and data-quality faults map to no part on purpose: a frozen
 * sensor is not a condition of the gearbox, and filing it under one would be
 * exactly the mis-grouping this enum exists to prevent.
 */
const SUBSYSTEM_PART: Record<string, MachinePart> = {
  motor: 'Motor',
  motor_bearing: 'Motor',
  rotor: 'Motor',
  drive: 'Motor',
  gearbox: 'Gearbox',
  gearbox_bearing: 'Gearbox',
  drive_train: 'Screw / Drive',
  mounting: 'Screw / Drive',
  extrusion_section: 'Screw / Drive',
  feed: 'Hopper',
  heater: 'Barrel',
  cooling: 'Barrel',
  screen_pack: 'Melt / Process',
  die: 'Melt / Process',
  material: 'Melt / Process',
};

/** Null for instrumentation / communications faults, which own no machine part. */
export function partForFault(faultId: string): MachinePart | null {
  const record = getFault(faultId);
  if (!record) return null;
  return SUBSYSTEM_PART[record.subsystem] ?? null;
}

// ---------------------------------------------------------------------------
// Process constraints
// ---------------------------------------------------------------------------

/**
 * The tags a process constraint is written on.
 *
 * The register stores these as display strings — `T1-T3`, `V1/V2` — because
 * that is how the engineering document writes them. Expanding them here keeps
 * that register verbatim while still letting a violated limit find its part.
 */
export function tagsForConstraint(constraintId: string): ExtruderTag[] {
  const constraint = PROCESS_CONSTRAINTS.find((entry) => entry.constraintId === constraintId);
  const raw = constraint?.tag ?? '';
  if (!raw) return [];
  if (raw === 'T1-T3') return ['T1', 'T2', 'T3'];
  if (raw === 'V1/V2') return ['V1', 'V2'];
  if (raw === 'PM1') return ['PM1.current', 'PM1.power'];
  return raw
    .split(/[/,]/)
    .map((part) => part.trim())
    .filter((part): part is ExtruderTag => part in TAG_OWNER);
}

export function partsForConstraint(constraintId: string): MachinePart[] {
  const parts = tagsForConstraint(constraintId).map(partForTag);
  return [...new Set(parts)];
}

// ---------------------------------------------------------------------------
// Contextual analysis
// ---------------------------------------------------------------------------

/**
 * What kind of measurement a tag is.
 *
 * This is what makes the analysis contextual: a temperature channel is
 * structurally unable to show a vibration spectrum, so the tools offered for it
 * must be different ones rather than the same tools greyed out.
 */
export type SignalKind = 'vibration' | 'temperature' | 'speed' | 'pressure' | 'level' | 'power';

const TAG_KIND: Record<ExtruderTag, SignalKind> = {
  E1: 'speed',
  V1: 'vibration',
  V2: 'vibration',
  T1: 'temperature',
  T2: 'temperature',
  T3: 'temperature',
  T4: 'temperature',
  T5: 'temperature',
  P1: 'pressure',
  L1: 'level',
  'PM1.current': 'power',
  'PM1.power': 'power',
  'PM1.voltage': 'power',
  'PM1.power_factor': 'power',
};

export function signalKindForTag(tag: ExtruderTag): SignalKind {
  return TAG_KIND[tag];
}

export const KIND_LABEL: Record<SignalKind, string> = {
  vibration: 'Vibration',
  temperature: 'Temperature',
  speed: 'Speed',
  pressure: 'Pressure',
  level: 'Level',
  power: 'Electrical',
};

/**
 * The analysis tools each kind of signal exposes.
 *
 * `available: false` means the tool is real for this measurement but cannot be
 * computed from what the gateway carries — the gateway delivers scalars, and
 * waveform, spectrum and envelope all need the raw record. Those are listed and
 * disabled with the reason rather than hidden, because "this machine cannot
 * show you a spectrum" is information an operator needs before they conclude
 * anything from its absence.
 */
export type AnalysisTool = {
  key: string;
  label: string;
  available: boolean;
  /** What the tool shows, or why it cannot be shown. */
  note: string;
};

const SCALAR_TREND: AnalysisTool = {
  key: 'trend',
  label: 'Trend',
  available: true,
  note: 'How the measurement has moved across the samples held for this session.',
};

export const TOOLS_FOR_KIND: Record<SignalKind, AnalysisTool[]> = {
  vibration: [
    SCALAR_TREND,
    { key: 'level', label: 'Level', available: true, note: 'Current amplitude against the registered decision boundaries.' },
    {
      key: 'waveform',
      label: 'Waveform',
      available: false,
      note: 'Needs the raw acceleration record. The gateway carries band-limited scalars only.',
    },
    {
      key: 'spectrum',
      label: 'Spectrum',
      available: false,
      note: 'Needs the raw acceleration record, so 1x/2x fractions and gear-mesh orders cannot be computed here.',
    },
    {
      key: 'envelope',
      label: 'Envelope',
      available: false,
      note: 'Needs the raw acceleration record; bearing repetition rates live in its demodulated spectrum.',
    },
  ],
  temperature: [
    SCALAR_TREND,
    { key: 'rate', label: 'Rate of change', available: true, note: 'How fast the temperature is moving, per sample interval.' },
    {
      key: 'setpoint',
      label: 'Setpoint deviation',
      available: true,
      note: 'Distance from the zone setpoint the recipe defines.',
    },
  ],
  speed: [
    SCALAR_TREND,
    { key: 'stability', label: 'Stability', available: true, note: 'Spread of the speed around its own recent mean.' },
  ],
  pressure: [
    SCALAR_TREND,
    { key: 'variation', label: 'Variation', available: true, note: 'Spread of the pressure around its own recent mean.' },
    {
      key: 'ripple',
      label: 'Ripple',
      available: false,
      note: 'Needs a high-rate pressure record. The gateway delivers one scalar per sample interval.',
    },
  ],
  level: [
    SCALAR_TREND,
    { key: 'consumption', label: 'Depletion', available: true, note: 'Direction and rate at which the hopper is emptying.' },
  ],
  power: [
    SCALAR_TREND,
    { key: 'load', label: 'Load', available: true, note: 'Current draw against the registered process constraint.' },
    {
      key: 'imbalance',
      label: 'Imbalance',
      available: false,
      note: 'Needs per-phase measurements. The meter reports the three-phase aggregate.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Part condition
// ---------------------------------------------------------------------------

/**
 * Condition of one part.
 *
 * Mapped from what the pipeline already decided, never computed independently:
 * FAULT from a candidate fault owned by the part, ALARM from a violated hard
 * process constraint, ATTENTION from a crossed registered threshold, WATCH from
 * an anomaly contribution that has not crossed anything, UNAVAILABLE when the
 * part has no trustworthy reading at all, NORMAL otherwise.
 */
export type PartState = 'NORMAL' | 'WATCH' | 'ATTENTION' | 'ALARM' | 'FAULT' | 'UNAVAILABLE';

const STATE_RANK: Record<PartState, number> = {
  FAULT: 5,
  ALARM: 4,
  ATTENTION: 3,
  WATCH: 2,
  UNAVAILABLE: 1,
  NORMAL: 0,
};

export function worsePartState(a: PartState, b: PartState): PartState {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}

export const PART_STATE_LABEL: Record<PartState, string> = {
  NORMAL: 'Normal',
  WATCH: 'Watch',
  ATTENTION: 'Attention',
  ALARM: 'Alarm',
  FAULT: 'Fault',
  UNAVAILABLE: 'No data',
};
