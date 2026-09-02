/**
 * Twin-screw extruder connection points — the single source of truth.
 *
 * Coordinates are SVG user units inside the artwork's own `0 0 1440 700`
 * viewBox, never percentages or viewport units. The drawing is rendered with
 * `preserveAspectRatio="xMidYMid meet"`, so machine and points scale as one
 * object: resizing or zooming can never slide a pad off the feature it measures.
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
  label: string;
  kind: TwinScrewPointKind;
  /** Position in the artwork's own SVG coordinate space (1440 x 700). */
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

/** The artwork's viewBox. Anything mapping a point onto the canvas reads these. */
export const TWIN_SCREW_ARTWORK_WIDTH = 1440;
export const TWIN_SCREW_ARTWORK_HEIGHT = 700;

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
  { code: 'motor-nde-vib', label: 'Motor Non-Drive-End Vibration', kind: 'Vibration', x: 88, y: 444, side: 'left', component: 'Main Motor', analyzerTag: 'TS-V2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'motor-current-power', label: 'Motor Current / Power', kind: 'Power', x: 197, y: 370, side: 'left', component: 'Main Motor', analyzerTag: 'TS-PM1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'motor-temp', label: 'Motor Temperature', kind: 'Temperature', x: 236, y: 370, side: 'left', component: 'Main Motor', analyzerTag: 'TS-T1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'motor-de-vib', label: 'Motor Drive-End Vibration', kind: 'Vibration', x: 306, y: 443, side: 'left', component: 'Main Motor', analyzerTag: 'TS-V1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'motor-rpm', label: 'Motor Speed', kind: 'Speed', x: 266, y: 483, side: 'left', component: 'Main Motor', analyzerTag: 'TS-E1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },

  // ---- Gearbox: input and output housings stay separate measurements ----
  { code: 'gearbox-in-vib', label: 'Gearbox Input-Side Vibration', kind: 'Vibration', x: 382, y: 375, side: 'left', component: 'Gearbox', analyzerTag: 'TS-V3', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'gearbox-temp', label: 'Gearbox Temperature', kind: 'Temperature', x: 470, y: 300, side: 'left', component: 'Gearbox', analyzerTag: 'TS-T2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'gearbox-out-1-vib', label: 'Gearbox Output-1 Vibration', kind: 'Vibration', x: 551, y: 377, side: 'left', component: 'Gearbox', analyzerTag: 'TS-V4', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'gearbox-out-2-vib', label: 'Gearbox Output-2 Vibration', kind: 'Vibration', x: 528, y: 570, side: 'left', component: 'Gearbox', analyzerTag: 'TS-V5', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'thrust-bearing-temp', label: 'Thrust Bearing Temperature', kind: 'Temperature', x: 455, y: 570, side: 'left', component: 'Gearbox', analyzerTag: 'TS-T3', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },

  // ---- Screw speeds: two shafts, two measurements, never averaged ----
  { code: 'screw-1-rpm', label: 'Screw A Speed', kind: 'Speed', x: 621, y: 449, side: 'left', component: 'Screw A', analyzerTag: 'TS-S1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'screw-2-rpm', label: 'Screw B Speed', kind: 'Speed', x: 621, y: 499, side: 'left', component: 'Screw B', analyzerTag: 'TS-S2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },

  // ---- Feed throat and the upstream barrel zones ----
  { code: 'feed-throat-temp', label: 'Feed Throat Temperature', kind: 'Temperature', x: 678, y: 366, side: 'left', component: 'Main Feeder', analyzerTag: 'TS-TT0', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-01', label: 'Barrel Temperature Zone 1', kind: 'Temperature', x: 752, y: 407, side: 'left', component: 'Barrel Zones', analyzerTag: 'TS-TZ1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-02', label: 'Barrel Temperature Zone 2', kind: 'Temperature', x: 808, y: 407, side: 'left', component: 'Barrel Zones', analyzerTag: 'TS-TZ2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-03', label: 'Barrel Temperature Zone 3', kind: 'Temperature', x: 864, y: 407, side: 'left', component: 'Barrel Zones', analyzerTag: 'TS-TZ3', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-04', label: 'Barrel Temperature Zone 4', kind: 'Temperature', x: 920, y: 407, side: 'left', component: 'Barrel Zones', analyzerTag: 'TS-TZ4', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },

  // ---- Main hopper and its gravimetric feeder ----
  { code: 'hopper-level', label: 'Main Hopper Level', kind: 'Level', x: 726, y: 142, side: 'right', component: 'Main Feeder', analyzerTag: 'TS-L1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'main-feed-rate', label: 'Main Feeder Rate', kind: 'Flow', x: 717, y: 239, side: 'right', component: 'Main Feeder', analyzerTag: 'TS-F1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'main-feed-rpm', label: 'Main Feeder Speed', kind: 'Speed', x: 709, y: 268, side: 'right', component: 'Main Feeder', analyzerTag: 'TS-N1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'main-feed-current', label: 'Main Feeder Motor Current', kind: 'Current', x: 700, y: 296, side: 'right', component: 'Main Feeder', analyzerTag: 'TS-I1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },

  // ---- Side feeder ----
  { code: 'side-feed-rate', label: 'Side Feeder Rate', kind: 'Flow', x: 969, y: 290, side: 'right', component: 'Side Feeder', analyzerTag: 'TS-F2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'side-feed-rpm', label: 'Side Feeder Speed', kind: 'Speed', x: 969, y: 322, side: 'right', component: 'Side Feeder', analyzerTag: 'TS-N2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'side-feed-current', label: 'Side Feeder Motor Current', kind: 'Current', x: 969, y: 350, side: 'right', component: 'Side Feeder', analyzerTag: 'TS-I2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },

  // ---- Intermediate process pressure, on the barrel underside ----
  { code: 'p-int-01', label: 'Intermediate Melt Pressure 1', kind: 'Pressure', x: 838, y: 557, side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-P1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
  { code: 'p-int-02', label: 'Intermediate Melt Pressure 2', kind: 'Pressure', x: 1065, y: 557, side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-P2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },

  // ---- Downstream barrel zones ----
  { code: 'tz-05', label: 'Barrel Temperature Zone 5', kind: 'Temperature', x: 1037, y: 407, side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-TZ5', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-06', label: 'Barrel Temperature Zone 6', kind: 'Temperature', x: 1098, y: 407, side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-TZ6', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-07', label: 'Barrel Temperature Zone 7', kind: 'Temperature', x: 1160, y: 407, side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-TZ7', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-08', label: 'Barrel Temperature Zone 8', kind: 'Temperature', x: 1287, y: 407, side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-TZ8', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },

  // ---- Vent / devolatilisation ----
  { code: 'vent-pressure', label: 'Vent / Vacuum Pressure', kind: 'Pressure', x: 1238, y: 290, side: 'right', component: 'Vent Section', analyzerTag: 'TS-PV', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
  { code: 'vent-temp', label: 'Vent Zone Temperature', kind: 'Temperature', x: 1252, y: 341, side: 'right', component: 'Vent Section', analyzerTag: 'TS-TV', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },

  // ---- Final melt and screen section ----
  { code: 'melt-temp', label: 'Melt Temperature', kind: 'Temperature', x: 1330, y: 449, side: 'right', component: 'Die and Discharge', analyzerTag: 'TS-TM', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
  { code: 'p-screw-in', label: 'Screen Inlet Melt Pressure', kind: 'Pressure', x: 1308, y: 557, side: 'right', component: 'Die and Discharge', analyzerTag: 'TS-P3', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
  { code: 'p-screw-out', label: 'Screen Outlet Melt Pressure', kind: 'Pressure', x: 1364, y: 557, side: 'right', component: 'Die and Discharge', analyzerTag: 'TS-P4', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
] as const;

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
