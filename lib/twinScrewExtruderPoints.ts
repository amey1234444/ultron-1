/**
 * Twin-screw extruder connection points — the single source of truth.
 *
 * Coordinates are SVG user units inside the artwork's own `0 0 1648 928`
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
  | 'TS-TZ9'
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
  /** Position in the artwork's own SVG coordinate space (1648 x 928). */
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
export const TWIN_SCREW_ARTWORK_WIDTH = 1648;
export const TWIN_SCREW_ARTWORK_HEIGHT = 928;

/**
 * How the sheet maps onto the 3D asset.
 *
 * The machine is no longer drawn as SVG. It is rendered from
 * `public/models/machines/twin-screw-extruder.glb` through a fixed
 * orthographic elevation, and these three constants are the entire contract
 * between that asset and this registry:
 *
 *     sheet_x = (world_x - X0) * SCALE
 *     sheet_y = (Y1 - world_y) * SCALE
 *
 * The camera in `TwinScrewExtruder3D.web.tsx` is built from them, and every
 * `x` / `y` below was computed by projecting that part's own geometry through
 * this map -- not measured off a screenshot. A pad therefore sits on the
 * feature it measures by construction.
 *
 * The camera is deliberately not orbitable: `machineConnectors` turns these
 * coordinates into `rx`/`ry` fractions and `TrailBoard` stores every saved
 * trail endpoint against them, so a moving camera would drag every card in
 * every saved layout with it.
 */
export const TWIN_SCREW_SHEET_SCALE = 485.0;
export const TWIN_SCREW_SHEET_X0 = -0.0931;
export const TWIN_SCREW_SHEET_Y1 = 1.4897;

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
  { code: 'motor-nde-vib', label: 'Motor Non-Drive-End Vibration', kind: 'Vibration', x: 101, y: 531, side: 'left', component: 'Main Motor', analyzerTag: 'TS-V2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'motor-current-power', label: 'Motor Current / Power', kind: 'Power', x: 142, y: 387, side: 'left', component: 'Main Motor', analyzerTag: 'TS-PM1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'motor-temp', label: 'Motor Temperature', kind: 'Temperature', x: 210, y: 430, side: 'left', component: 'Main Motor', analyzerTag: 'TS-T1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'motor-de-vib', label: 'Motor Drive-End Vibration', kind: 'Vibration', x: 260, y: 531, side: 'left', component: 'Main Motor', analyzerTag: 'TS-V1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'motor-rpm', label: 'Motor Speed', kind: 'Speed', x: 299, y: 531, side: 'left', component: 'Main Motor', analyzerTag: 'TS-E1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },

  // ---- Gearbox: input and output housings stay separate measurements ----
  { code: 'gearbox-in-vib', label: 'Gearbox Input-Side Vibration', kind: 'Vibration', x: 385, y: 490, side: 'left', component: 'Gearbox', analyzerTag: 'TS-V3', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'gearbox-temp', label: 'Gearbox Temperature', kind: 'Temperature', x: 494, y: 344, side: 'left', component: 'Gearbox', analyzerTag: 'TS-T2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'gearbox-out-1-vib', label: 'Gearbox Output-1 Vibration', kind: 'Vibration', x: 622, y: 520, side: 'left', component: 'Gearbox', analyzerTag: 'TS-V4', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'gearbox-out-2-vib', label: 'Gearbox Output-2 Vibration', kind: 'Vibration', x: 622, y: 584, side: 'left', component: 'Gearbox', analyzerTag: 'TS-V5', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'thrust-bearing-temp', label: 'Thrust Bearing Temperature', kind: 'Temperature', x: 608, y: 626, side: 'left', component: 'Gearbox', analyzerTag: 'TS-T3', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },

  // ---- Screw speeds: two shafts, two measurements, never averaged ----
  { code: 'screw-1-rpm', label: 'Screw A Speed', kind: 'Speed', x: 579, y: 520, side: 'left', component: 'Screw A', analyzerTag: 'TS-S1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },
  { code: 'screw-2-rpm', label: 'Screw B Speed', kind: 'Speed', x: 579, y: 584, side: 'left', component: 'Screw B', analyzerTag: 'TS-S2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.drive },

  // ---- Feed throat and the upstream barrel zones ----
  { code: 'feed-throat-temp', label: 'Feed Throat Temperature', kind: 'Temperature', x: 707, y: 436, side: 'left', component: 'Main Feeder', analyzerTag: 'TS-TT0', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-01', label: 'Barrel Temperature Zone 1', kind: 'Temperature', x: 793, y: 406, side: 'left', component: 'Barrel Zones', analyzerTag: 'TS-TZ1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-02', label: 'Barrel Temperature Zone 2', kind: 'Temperature', x: 851, y: 406, side: 'left', component: 'Barrel Zones', analyzerTag: 'TS-TZ2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-03', label: 'Barrel Temperature Zone 3', kind: 'Temperature', x: 910, y: 406, side: 'left', component: 'Barrel Zones', analyzerTag: 'TS-TZ3', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-04', label: 'Barrel Temperature Zone 4', kind: 'Temperature', x: 968, y: 406, side: 'left', component: 'Barrel Zones', analyzerTag: 'TS-TZ4', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },

  // ---- Main hopper and its gravimetric feeder ----
  { code: 'hopper-level', label: 'Main Hopper Level', kind: 'Level', x: 707, y: 150, side: 'right', component: 'Main Feeder', analyzerTag: 'TS-L1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'main-feed-rate', label: 'Main Feeder Rate', kind: 'Flow', x: 707, y: 262, side: 'right', component: 'Main Feeder', analyzerTag: 'TS-F1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'main-feed-rpm', label: 'Main Feeder Speed', kind: 'Speed', x: 707, y: 369, side: 'right', component: 'Main Feeder', analyzerTag: 'TS-N1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'main-feed-current', label: 'Main Feeder Motor Current', kind: 'Current', x: 707, y: 402, side: 'right', component: 'Main Feeder', analyzerTag: 'TS-I1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },

  // ---- Side feeder ----
  { code: 'side-feed-rate', label: 'Side Feeder Rate', kind: 'Flow', x: 1030, y: 293, side: 'right', component: 'Side Feeder', analyzerTag: 'TS-F2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'side-feed-rpm', label: 'Side Feeder Speed', kind: 'Speed', x: 1030, y: 354, side: 'right', component: 'Side Feeder', analyzerTag: 'TS-N2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },
  { code: 'side-feed-current', label: 'Side Feeder Motor Current', kind: 'Current', x: 1030, y: 383, side: 'right', component: 'Side Feeder', analyzerTag: 'TS-I2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.feed },

  // ---- Intermediate process pressure, on the barrel underside ----
  { code: 'p-int-01', label: 'Intermediate Melt Pressure 1', kind: 'Pressure', x: 851, y: 620, side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-P1', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
  { code: 'p-int-02', label: 'Intermediate Melt Pressure 2', kind: 'Pressure', x: 1158, y: 620, side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-P2', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },

  // ---- Downstream barrel zones ----
  { code: 'tz-05', label: 'Barrel Temperature Zone 5', kind: 'Temperature', x: 1094, y: 406, side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-TZ5', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-06', label: 'Barrel Temperature Zone 6', kind: 'Temperature', x: 1158, y: 406, side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-TZ6', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-07', label: 'Barrel Temperature Zone 7', kind: 'Temperature', x: 1221, y: 406, side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-TZ7', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-08', label: 'Barrel Temperature Zone 8', kind: 'Temperature', x: 1358, y: 406, side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-TZ8', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },
  { code: 'tz-09', label: 'Barrel Temperature Zone 9', kind: 'Temperature', x: 1392, y: 406, side: 'right', component: 'Barrel Zones', analyzerTag: 'TS-TZ9', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.barrel },

  // ---- Vent / devolatilisation ----
  { code: 'vent-pressure', label: 'Vent / Vacuum Pressure', kind: 'Pressure', x: 1285, y: 324, side: 'right', component: 'Vent Section', analyzerTag: 'TS-PV', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
  { code: 'vent-temp', label: 'Vent Zone Temperature', kind: 'Temperature', x: 1285, y: 448, side: 'right', component: 'Vent Section', analyzerTag: 'TS-TV', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },

  // ---- Final melt and screen section ----
  { code: 'melt-temp', label: 'Melt Temperature', kind: 'Temperature', x: 1413, y: 418, side: 'right', component: 'Die and Discharge', analyzerTag: 'TS-TM', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
  { code: 'p-screw-in', label: 'Screen Inlet Melt Pressure', kind: 'Pressure', x: 1438, y: 630, side: 'right', component: 'Die and Discharge', analyzerTag: 'TS-P3', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
  { code: 'p-screw-out', label: 'Screen Outlet Melt Pressure', kind: 'Pressure', x: 1496, y: 630, side: 'right', component: 'Die and Discharge', analyzerTag: 'TS-P4', modelStatus: 'integrity-only', analyzerNote: NEEDS_COMMISSIONING.process },
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

/* -------------------------------------------------------------------------- */
/* 3D anchors                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where each instrument physically sits on the 3D asset, in model space.
 *
 * The machine canvas renders `public/models/machines/twin-screw-extruder.glb`
 * on an orbitable stage. A pad can no longer be a fixed point on a sheet: as
 * the camera moves, the instrument moves with the surface it is bolted to. So
 * the canvas projects these anchors every frame and hands the result to
 * `MachineWorkspace`, which feeds them to `TrailBoard` as live `rx`/`ry`
 * fractions of the machine rect. Nothing downstream changes -- snapping,
 * unit-locking and the analysis layer all still address pads by `code`.
 *
 * The glTF is +Y up: x runs along the machine, y is height, z is depth with
 * +z toward the viewer in the reference elevation.
 *
 * x and y were computed by projecting each part's own geometry in Blender and
 * are exact. z places the anchor on the surface the instrument is mounted to
 * and is inferred -- the reference elevation gives no depth information, so a
 * boss on the front face is placed at the front face rather than measured.
 * The `x`/`y` fields above remain the reference-elevation coordinates and are
 * what the 2D fallback and the saved-layout maths still use.
 */
export const TWIN_SCREW_ANCHORS_3D: Readonly<Record<string, readonly [number, number, number]>> = {
  // --- drive train, bosses on the front face of their housings -------------
  'motor-nde-vib': [0.1150, 0.3949, 0.150],
  'motor-current-power': [0.1995, 0.6908, 0.0],
  'motor-temp': [0.3399, 0.6038, 0.0],
  'motor-de-vib': [0.4434, 0.3949, 0.150],
  'motor-rpm': [0.5242, 0.3949, 0.055],
  'gearbox-in-vib': [0.6999, 0.4799, 0.200],
  'gearbox-temp': [0.9263, 0.7799, 0.0],
  'gearbox-out-1-vib': [1.1897, 0.4178, 0.190],
  'gearbox-out-2-vib': [1.1897, 0.2858, 0.190],
  'thrust-bearing-temp': [1.1598, 0.1999, 0.190],

  // --- the two shafts, on their own centrelines inside the bore ------------
  'screw-1-rpm': [1.0998, 0.4178, 0.0],
  'screw-2-rpm': [1.0998, 0.2858, 0.0],

  // --- main feed -----------------------------------------------------------
  'feed-throat-temp': [1.3646, 0.5898, 0.130],
  'hopper-level': [1.3646, 1.1801, 0.225],
  'main-feed-rate': [1.3646, 0.9499, 0.160],
  'main-feed-rpm': [1.3646, 0.7299, 0.090],
  'main-feed-current': [1.3646, 0.6600, 0.090],

  // --- side feed -----------------------------------------------------------
  'side-feed-rate': [2.0309, 0.8848, 0.080],
  'side-feed-rpm': [2.0309, 0.7599, 0.070],
  'side-feed-current': [2.0309, 0.7000, 0.070],

  // --- barrel: zone caps on top, pressure tappings on the front face -------
  'tz-01': [1.5415, 0.6524, 0.0],
  'tz-02': [1.6621, 0.6524, 0.0],
  'tz-03': [1.7827, 0.6524, 0.0],
  'tz-04': [1.9032, 0.6524, 0.0],
  'tz-05': [2.1636, 0.6524, 0.0],
  'tz-06': [2.2937, 0.6524, 0.0],
  'tz-07': [2.4238, 0.6524, 0.0],
  'tz-08': [2.7073, 0.6524, 0.0],
  // The asset carries eight heated modules; the registry declares nine, so
  // TZ-09 sits on the die-end barrel section rather than a cap of its own.
  'tz-09': [2.7772, 0.6524, 0.0],
  'p-int-01': [1.6621, 0.2119, 0.210],
  'p-int-02': [2.2937, 0.2119, 0.210],

  // --- vent ----------------------------------------------------------------
  'vent-pressure': [2.5566, 0.8220, 0.0],
  'vent-temp': [2.5566, 0.5659, 0.075],

  // --- discharge -----------------------------------------------------------
  'melt-temp': [2.8211, 0.6269, 0.0],
  'p-screw-in': [2.8726, 0.1900, 0.0],
  'p-screw-out': [2.9916, 0.1900, 0.0],
};

/** The asset the machine canvas renders for this template. */
export const TWIN_SCREW_MODEL_URL = '/models/machines/twin-screw-extruder.glb';

export function twinScrewAnchor3D(code: string): readonly [number, number, number] | undefined {
  return TWIN_SCREW_ANCHORS_3D[code];
}
