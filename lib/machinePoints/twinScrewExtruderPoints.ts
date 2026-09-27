/**
 * Twin-screw extruder connection points — the single source of truth.
 *
 * Coordinates are image units inside the supplied artwork's native
 * `0 0 1700 670` frame, never percentages or viewport units. The image and its
 * overlay share that frame, so resizing or zooming cannot slide a pad off the
 * feature it measures.
 *
 * Geometry and instrument metadata are kept apart on purpose. This file is the
 * only place a point's position is declared. The artwork renders one pad per
 * entry and nothing else, the canvas snaps trail endpoints to the same list,
 * and the default trail layout places its cards from it — so a card can only
 * ever be wired to a place the machine actually has an instrument.
 *
 * Every entry carries `analyzerTag` (the machine's own canonical signal
 * identity) and `modelStatus` (whether a commissioned rule consumes it). Those
 * are different questions: a signal can be correctly identified and still have
 * no rule behind it, and saying so is the point. See `lib/analysis/twinScrew/`.
 */

/** What the instrument measures. Locks a pad to channels of the same quantity. */
export type TwinScrewPointKind =
  | 'Vibration'
  | 'Temperature'
  | 'Speed'
  | 'Pressure'
  | 'Current'
  | 'Power'
  | 'Level'
  | 'Flow';

/**
 * The machine's canonical signal tags.
 *
 * This is the twin screw's own namespace, not the single-screw pilot's. The two
 * are different equipment with different instruments, and reusing `E1`/`V1`/`T1`
 * here would invite the SSE's commissioned limits to be compared against a
 * machine they were never declared for.
 */
export type TwinScrewTag =
  // Drive train
  | 'TS-E1' // motor shaft speed
  | 'TS-V1' // motor drive-end vibration
  | 'TS-V2' // motor non-drive-end vibration
  | 'TS-V3' // gearbox input-side vibration
  | 'TS-V4' // gearbox output-1 vibration
  | 'TS-V5' // gearbox output-2 vibration
  | 'TS-T1' // motor temperature
  | 'TS-T2' // gearbox oil temperature
  | 'TS-T3' // thrust bearing temperature
  | 'TS-PM1' // motor electrical — current or power, decided by the channel unit
  | 'TS-S1' // screw A speed
  | 'TS-S2' // screw B speed
  // Feeding
  | 'TS-L1' // main hopper level
  | 'TS-F1' // main feeder rate
  | 'TS-N1' // main feeder speed
  | 'TS-I1' // main feeder motor current
  | 'TS-F2' // side feeder rate
  | 'TS-N2' // side feeder speed
  | 'TS-I2' // side feeder motor current
  // Barrel
  | 'TS-TT0' // feed throat temperature
  | 'TS-TZ1'
  | 'TS-TZ2'
  | 'TS-TZ3'
  | 'TS-TZ4'
  | 'TS-TZ5'
  | 'TS-TZ6'
  | 'TS-TZ7'
  | 'TS-TZ8'
  | 'TS-TZ9' // legacy channel compatibility; the supplied 35-point image ends at zone 8
  | 'TS-P1' // intermediate melt pressure 1
  | 'TS-P2' // intermediate melt pressure 2
  // Devolatilisation and discharge
  | 'TS-PV' // vent / vacuum pressure
  | 'TS-TV' // vent zone temperature
  | 'TS-TM' // melt temperature
  | 'TS-P3' // screen inlet melt pressure
  | 'TS-P4'; // screen outlet melt pressure

/**
 * Whether a commissioned rule consumes this signal.
 *
 * `integrity-only` is the honest state for this machine today: the signal is
 * identified and its unit domain is policed, but no threshold has been declared
 * for it, so only machine-independent integrity checks (freeze, dropout, unit
 * violation) run. `derived` marks a value computed from others rather than
 * measured. Nothing is ever promoted to `modelled` to avoid an empty state.
 */
export type TwinScrewModelStatus = 'modelled' | 'integrity-only' | 'derived';

/** Which component of the machine tree owns this point. */
export type TwinScrewComponent =
  | 'Main Motor'
  | 'Gearbox'
  | 'Main Feeder'
  | 'Side Feeder'
  | 'Screw A'
  | 'Screw B'
  | 'Barrel Zones'
  | 'Vent Section'
  | 'Die and Discharge';

export type TwinScrewPointDefinition = {
  /** Stable id used for channel mapping. Never rendered on the drawing. */
  code: string;
  /** Sensor id from the supplied 1700x670 reference template. */
  referenceSensorId: TwinScrewReferenceSensorId;
  label: string;
  kind: TwinScrewPointKind;
  /** Position in the supplied artwork's native image coordinate space. */
  x: number;
  y: number;
  /** Which card column this point's trail runs out to. */
  side: 'left' | 'right';
  /** Component of the machine tree this point belongs to. */
  component: TwinScrewComponent;
  /** The machine's canonical signal identity for this instrument. */
  analyzerTag: TwinScrewTag;
  modelStatus: TwinScrewModelStatus;
  /** Why no commissioned rule reads this signal. Required unless `modelled`. */
  analyzerNote?: string;
  /** For derived values, the tags this one is computed from. */
  derivedFrom?: readonly TwinScrewTag[];
};

/**
 * Native frame and measured sensor centers from the supplied exact template.
 *
 * These values intentionally mirror `twin_screw_exact/TwinScrewExtruder.tsx`
 * from `twin_screw_exact_typescript.zip`. Keeping the source ids here gives the
 * app's semantic point codes a one-to-one, auditable mapping to every visible
 * green marker in the reference PNG.
 */
export const TWIN_SCREW_ARTWORK_WIDTH = 1700;
export const TWIN_SCREW_ARTWORK_HEIGHT = 670;

export const TWIN_SCREW_REFERENCE_SENSORS = {
  S01: { x: 821.4, y: 89.3 },
  S02: { x: 807.5, y: 183.4 },
  S03: { x: 796.5, y: 209.4 },
  S04: { x: 497.5, y: 213.4 },
  S05: { x: 1083.2, y: 215.4 },
  S06: { x: 1335.4, y: 233.5 },
  S07: { x: 785.8, y: 235.5 },
  S08: { x: 1075.3, y: 241.3 },
  S09: { x: 1067.4, y: 261.2 },
  S10: { x: 1355.4, y: 291.3 },
  S11: { x: 777.4, y: 307.3 },
  S12: { x: 801.5, y: 347.4 },
  S13: { x: 861.5, y: 347.4 },
  S14: { x: 921.5, y: 347.4 },
  S15: { x: 981.5, y: 347.4 },
  S16: { x: 1107.5, y: 347.4 },
  S17: { x: 1179.5, y: 347.4 },
  S18: { x: 1251.5, y: 347.4 },
  S19: { x: 1391.5, y: 347.4 },
  S20: { x: 209.5, y: 367.3 },
  S21: { x: 603.5, y: 369.4 },
  S22: { x: 263.4, y: 371.1 },
  S23: { x: 413.6, y: 375.3 },
  S24: { x: 1429.5, y: 397.4 },
  S25: { x: 655.4, y: 407.3 },
  S26: { x: 357.5, y: 439.2 },
  S27: { x: 115.6, y: 455.4 },
  S28: { x: 655.4, y: 455.3 },
  S29: { x: 321.6, y: 485.3 },
  S30: { x: 915.5, y: 521.3 },
  S31: { x: 1179.7, y: 521.1 },
  S32: { x: 1407.5, y: 521.3 },
  S33: { x: 1489.5, y: 521.3 },
  S34: { x: 495.5, y: 541.4 },
  S35: { x: 577.5, y: 575.4 },
} as const;

export type TwinScrewReferenceSensorId = keyof typeof TWIN_SCREW_REFERENCE_SENSORS;

function referenceSensor(referenceSensorId: TwinScrewReferenceSensorId) {
  return { referenceSensorId, ...TWIN_SCREW_REFERENCE_SENSORS[referenceSensorId] };
}


/**
 * Why nothing on this machine is `modelled` yet.
 *
 * The commissioned condition models in this project belong to the single-screw
 * pilot and to the rotary airlock valve. Their limits are process-engineering
 * sign-offs against those specific machines — an 8 mm/s vibration bound, a
 * 250 degC barrel maximum, a 112.5 rpm screw-speed ceiling. None was declared
 * for a twin screw, whose barrel profile, element configuration and drive train
 * are different equipment. Copying them across would produce confident numbers
 * with nothing behind them, so rules that need a threshold report
 * CONFIGURATION_REQUIRED and name what is missing instead.
 */
const NEEDS_COMMISSIONING = {
  drive:
    'Signal identity and unit domain are enforced, but no twin-screw drive threshold has been commissioned. The single-screw pilot limits are process-engineering sign-offs against that machine and are not transferable. Declare a healthy baseline to enable the drive rules.',
  feed: 'Signal identity and unit domain are enforced. Gravimetric feeder rate, speed and current have no declared twin-screw baseline, so only integrity checks run on them.',
  barrel:
    'Signal identity and unit domain are enforced. The eight-zone twin-screw barrel profile has no commissioned setpoint or tolerance band, so the heating, cooling and gradient rules report configuration-required rather than comparing against a single-screw limit.',
  process:
    'Signal identity and unit domain are enforced. Melt pressure, vent and screen signals have no commissioned twin-screw envelope, so only integrity checks run on them.',
} as const;

/**
 * Every point, in process order: drive train, then feed, barrel and discharge.
 *
 * The order is deterministic and is the order the default layout stacks its
 * cards, so a regenerated layout is identical to the previous one.
 */
export const TWIN_SCREW_POINT_REGISTRY: readonly TwinScrewPointDefinition[] = [
  // ---- Motor: terminal box for electrical, bearing brackets for vibration ----
  { code: 'motor-nde-vib', ...referenceSensor('S27'), label: 'Motor Non-Drive-End Vibration', kind: 'Vibration', side: 'left', component: 'Main Motor', analyzerTag: 'TS-V2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'motor-current-power', ...referenceSensor('S20'), label: 'Motor Current / Power', kind: 'Power', side: 'left', component: 'Main Motor', analyzerTag: 'TS-PM1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'motor-temp', ...referenceSensor('S22'), label: 'Motor Temperature', kind: 'Temperature', side: 'left', component: 'Main Motor', analyzerTag: 'TS-T1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'motor-de-vib', ...referenceSensor('S29'), label: 'Motor Drive-End Vibration', kind: 'Vibration', side: 'left', component: 'Main Motor', analyzerTag: 'TS-V1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'motor-rpm', ...referenceSensor('S26'), label: 'Motor Speed', kind: 'Speed', side: 'left', component: 'Main Motor', analyzerTag: 'TS-E1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },

  // ---- Gearbox: input and output housings stay separate measurements ----
  { code: 'gearbox-in-vib', ...referenceSensor('S23'), label: 'Gearbox Input-Side Vibration', kind: 'Vibration', side: 'left', component: 'Gearbox', analyzerTag: 'TS-V3', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'gearbox-temp', ...referenceSensor('S04'), label: 'Gearbox Temperature', kind: 'Temperature', side: 'left', component: 'Gearbox', analyzerTag: 'TS-T2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'gearbox-out-1-vib', ...referenceSensor('S21'), label: 'Gearbox Output-1 Vibration', kind: 'Vibration', side: 'left', component: 'Gearbox', analyzerTag: 'TS-V4', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'gearbox-out-2-vib', ...referenceSensor('S35'), label: 'Gearbox Output-2 Vibration', kind: 'Vibration', side: 'left', component: 'Gearbox', analyzerTag: 'TS-V5', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'thrust-bearing-temp', ...referenceSensor('S34'), label: 'Thrust Bearing Temperature', kind: 'Temperature', side: 'left', component: 'Gearbox', analyzerTag: 'TS-T3', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },

  // ---- Screw speeds: two shafts, two measurements, never averaged ----
  { code: 'screw-1-rpm', ...referenceSensor('S25'), label: 'Screw A Speed', kind: 'Speed', side: 'left', component: 'Screw A', analyzerTag: 'TS-S1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'screw-2-rpm', ...referenceSensor('S28'), label: 'Screw B Speed', kind: 'Speed', side: 'left', component: 'Screw B', analyzerTag: 'TS-S2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },

  // ---- Feed throat and the upstream barrel zones ----
  { code: 'feed-throat-temp', ...referenceSensor('S11'), label: 'Feed Throat Temperature', kind: 'Temperature', side: 'left', component: 'Main Feeder', analyzerTag: 'TS-TT0', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-01', ...referenceSensor('S12'), label: 'Barrel Temperature Zone 1', kind: 'Temperature', side: 'left', component: 'Barrel Zones', analyzerTag: 'TS-TZ1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-02', ...referenceSensor('S13'), label: 'Barrel Temperature Zone 2', kind: 'Temperature', side: 'left', component: 'Barrel Zones', analyzerTag: 'TS-TZ2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-03', ...referenceSensor('S14'), label: 'Barrel Temperature Zone 3', kind: 'Temperature', side: 'left', component: 'Barrel Zones', analyzerTag: 'TS-TZ3', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-04', ...referenceSensor('S15'), label: 'Barrel Temperature Zone 4', kind: 'Temperature', side: 'left', component: 'Barrel Zones', analyzerTag: 'TS-TZ4', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },

  // ---- Main hopper and its gravimetric feeder ----
  { code: 'hopper-level', ...referenceSensor('S01'), label: 'Main Hopper Level', kind: 'Level', side: 'right', component: 'Main Feeder', analyzerTag: 'TS-L1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'main-feed-rate', ...referenceSensor('S02'), label: 'Main Feeder Rate', kind: 'Flow', side: 'right', component: 'Main Feeder', analyzerTag: 'TS-F1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'main-feed-rpm', ...referenceSensor('S03'), label: 'Main Feeder Speed', kind: 'Speed', side: 'right', component: 'Main Feeder', analyzerTag: 'TS-N1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'main-feed-current', ...referenceSensor('S07'), label: 'Main Feeder Motor Current', kind: 'Current', side: 'right', component: 'Main Feeder', analyzerTag: 'TS-I1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },

  // ---- Side feeder ----
  { code: 'side-feed-rate', ...referenceSensor('S05'), label: 'Side Feeder Rate', kind: 'Flow', side: 'right', component: 'Side Feeder', analyzerTag: 'TS-F2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'side-feed-rpm', ...referenceSensor('S08'), label: 'Side Feeder Speed', kind: 'Speed', side: 'right', component: 'Side Feeder', analyzerTag: 'TS-N2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'side-feed-current', ...referenceSensor('S09'), label: 'Side Feeder Motor Current', kind: 'Current', side: 'right', component: 'Side Feeder', analyzerTag: 'TS-I2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },

  // ---- Intermediate process pressure, on the barrel underside ----
  { code: 'p-int-01', ...referenceSensor('S30'), label: 'Intermediate Melt Pressure 1', kind: 'Pressure', side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-P1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
  { code: 'p-int-02', ...referenceSensor('S31'), label: 'Intermediate Melt Pressure 2', kind: 'Pressure', side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-P2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },

  // ---- Downstream barrel zones ----
  { code: 'tz-05', ...referenceSensor('S16'), label: 'Barrel Temperature Zone 5', kind: 'Temperature', side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-TZ5', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-06', ...referenceSensor('S17'), label: 'Barrel Temperature Zone 6', kind: 'Temperature', side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-TZ6', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-07', ...referenceSensor('S18'), label: 'Barrel Temperature Zone 7', kind: 'Temperature', side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-TZ7', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-08', ...referenceSensor('S19'), label: 'Barrel Temperature Zone 8', kind: 'Temperature', side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-TZ8', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },

  // ---- Vent / devolatilisation ----
  { code: 'vent-pressure', ...referenceSensor('S06'), label: 'Vent / Vacuum Pressure', kind: 'Pressure', side: 'right', component: 'Vent Section', analyzerTag: 'TS-PV', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
  { code: 'vent-temp', ...referenceSensor('S10'), label: 'Vent Zone Temperature', kind: 'Temperature', side: 'right', component: 'Vent Section', analyzerTag: 'TS-TV', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },

  // ---- Final melt and screen section ----
  { code: 'melt-temp', ...referenceSensor('S24'), label: 'Melt Temperature', kind: 'Temperature', side: 'right', component: 'Die and Discharge', analyzerTag: 'TS-TM', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
  { code: 'p-screw-in', ...referenceSensor('S32'), label: 'Screen Inlet Melt Pressure', kind: 'Pressure', side: 'right', component: 'Die and Discharge', analyzerTag: 'TS-P3', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
  { code: 'p-screw-out', ...referenceSensor('S33'), label: 'Screen Outlet Melt Pressure', kind: 'Pressure', side: 'right', component: 'Die and Discharge', analyzerTag: 'TS-P4', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
] as const;

/**
 * Point IDs used by layouts saved before the 3D registry was introduced.
 *
 * This is deliberately an explicit list instead of a case/character rewrite:
 * only identities that are known to mean the same physical instrument migrate.
 */
export const TWIN_SCREW_LEGACY_CODE_ALIASES: Readonly<Record<string, string>> = {
  MOTOR_NDE_VIB: 'motor-nde-vib',
  MOTOR_TEMP: 'motor-temp',
  MOTOR_DE_VIB: 'motor-de-vib',
  MOTOR_POWER: 'motor-current-power',
  MOTOR_RPM: 'motor-rpm',
  GEARBOX_IN_VIB: 'gearbox-in-vib',
  GEARBOX_OUT1_VIB: 'gearbox-out-1-vib',
  GEARBOX_OUT2_VIB: 'gearbox-out-2-vib',
  GEARBOX_TEMP: 'gearbox-temp',
  THRUST_BRG_TEMP: 'thrust-bearing-temp',
  SCREW1_RPM: 'screw-1-rpm',
  SCREW2_RPM: 'screw-2-rpm',
  FEED_THROAT_TEMP: 'feed-throat-temp',
  TZ_01: 'tz-01',
  TZ_02: 'tz-02',
  TZ_03: 'tz-03',
  TZ_04: 'tz-04',
  TZ_05: 'tz-05',
  TZ_06: 'tz-06',
  TZ_07: 'tz-07',
  TZ_08: 'tz-08',
  HOPPER_LEVEL: 'hopper-level',
  MAIN_FEED_RATE: 'main-feed-rate',
  MAIN_FEED_RPM: 'main-feed-rpm',
  MAIN_FEED_CURR: 'main-feed-current',
  SIDE_FEED_RATE: 'side-feed-rate',
  SIDE_FEED_RPM: 'side-feed-rpm',
  SIDE_FEED_CURR: 'side-feed-current',
  P_INT_01: 'p-int-01',
  P_INT_02: 'p-int-02',
  VENT_PRESSURE: 'vent-pressure',
  VENT_TEMP: 'vent-temp',
  MELT_TEMP: 'melt-temp',
  P_SCR_IN: 'p-screw-in',
  P_SCR_OUT: 'p-screw-out',
};

export function normalizeTwinScrewPointCode(code: string | undefined): string | undefined {
  return code ? TWIN_SCREW_LEGACY_CODE_ALIASES[code] ?? code : undefined;
}

/** Component order for the machine tree, upstream to downstream. */
export const TWIN_SCREW_COMPONENT_ORDER: readonly TwinScrewComponent[] = [
  'Main Motor',
  'Gearbox',
  'Main Feeder',
  'Side Feeder',
  'Screw A',
  'Screw B',
  'Barrel Zones',
  'Vent Section',
  'Die and Discharge',
] as const;

const BY_CODE = new Map(TWIN_SCREW_POINT_REGISTRY.map((point) => [point.code, point]));
const BY_TAG = new Map(TWIN_SCREW_POINT_REGISTRY.map((point) => [point.analyzerTag, point]));

export function twinScrewPointByCode(code: string | undefined): TwinScrewPointDefinition | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

export function twinScrewPointByTag(tag: TwinScrewTag): TwinScrewPointDefinition | undefined {
  return BY_TAG.get(tag);
}

export function twinScrewPointsForComponent(component: TwinScrewComponent): TwinScrewPointDefinition[] {
  return TWIN_SCREW_POINT_REGISTRY.filter((point) => point.component === component);
}

