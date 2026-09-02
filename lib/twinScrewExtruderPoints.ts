/**
 * Twin-screw extruder connection points.
 *
 * Coordinates are SVG user units inside the artwork's own `0 0 1440 700`
 * viewBox — never percentages, never viewport units. The drawing is rendered
 * with `preserveAspectRatio="xMidYMid meet"`, so the machine and its points
 * scale as one object: resizing or zooming the canvas can never slide a marker
 * off the feature it belongs to.
 *
 * Geometry and sensor metadata are kept apart on purpose. This file is the only
 * place a point's position is declared; the artwork renders a green dot at each
 * one, the canvas snaps trail endpoints to them, and the default trail layout
 * places its cards from the same list. Nothing here is drawn as text — `code`
 * exists so the application can later attach gateway / rack / channel data to a
 * point without touching the machine drawing.
 */
export type TwinScrewPointKind =
  | 'Vibration'
  | 'Temperature'
  | 'Speed'
  | 'Pressure'
  | 'Current'
  | 'Power'
  | 'Level'
  | 'Flow';

export type TwinScrewPointDefinition = {
  /** Stable id, used for channel mapping. Never rendered on the drawing. */
  code: string;
  label: string;
  kind: TwinScrewPointKind;
  /** Position in the artwork's own SVG coordinate space (1440 x 700). */
  x: number;
  y: number;
  /** Which card column this point's trail runs out to. */
  side: 'left' | 'right';
  /** Signal tag a machine analysis model reads this point as, when one does. */
  analyzerTag?: string;
  /** Why no model consumes this point, when none does. */
  analyzerNote?: string;
};

/** The artwork's viewBox. Anything mapping a point onto the canvas reads these. */
export const TWIN_SCREW_ARTWORK_WIDTH = 1440;
export const TWIN_SCREW_ARTWORK_HEIGHT = 700;

/**
 * No twin-screw condition model has been commissioned yet, so no point carries
 * an `analyzerTag`. That is stated per section rather than left blank: the
 * canvas shows this note when a channel lands on a point, and "recorded but not
 * modelled" is a different thing from "wired wrong".
 */
const NOT_MODELLED = {
  drive:
    'Recorded for trending and alarms. The commissioned condition models cover the single-screw pilot package; no twin-screw drive rule reads this channel yet.',
  feed: 'Recorded for trending and alarms. Feeder rate, speed and current are gravimetric-feeder signals; no twin-screw feed model consumes them yet.',
  barrel:
    'Recorded for trending and alarms. The eight-zone twin-screw barrel profile has no declared healthy baseline yet, so no heating or cooling rule reads it.',
  process: 'Recorded for trending and alarms. Melt pressure, vent and screen signals have no twin-screw process model behind them yet.',
} as const;

export const TWIN_SCREW_POINT_REGISTRY: readonly TwinScrewPointDefinition[] = [
  // MOTOR
  { code: 'motor-nde-vib', label: 'Motor Non-Drive-End Vibration', kind: 'Vibration', x: 88, y: 444, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'motor-current-power', label: 'Motor Current / Power', kind: 'Power', x: 197, y: 370, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'motor-temp', label: 'Motor Temperature', kind: 'Temperature', x: 236, y: 370, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'motor-de-vib', label: 'Motor Drive-End Vibration', kind: 'Vibration', x: 306, y: 443, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'motor-rpm', label: 'Motor Speed', kind: 'Speed', x: 266, y: 483, side: 'left', analyzerNote: NOT_MODELLED.drive },

  // GEARBOX
  { code: 'gearbox-in-vib', label: 'Gearbox Input-Side Vibration', kind: 'Vibration', x: 382, y: 375, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'gearbox-temp', label: 'Gearbox Temperature', kind: 'Temperature', x: 470, y: 300, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'gearbox-out-1-vib', label: 'Gearbox Output-1 Vibration', kind: 'Vibration', x: 551, y: 377, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'gearbox-out-2-vib', label: 'Gearbox Output-2 Vibration', kind: 'Vibration', x: 528, y: 570, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'thrust-bearing-temp', label: 'Thrust Bearing Temperature', kind: 'Temperature', x: 455, y: 570, side: 'left', analyzerNote: NOT_MODELLED.drive },

  // SCREW DRIVE
  { code: 'screw-1-rpm', label: 'Screw 1 Speed', kind: 'Speed', x: 621, y: 449, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'screw-2-rpm', label: 'Screw 2 Speed', kind: 'Speed', x: 621, y: 499, side: 'left', analyzerNote: NOT_MODELLED.drive },

  // FEED THROAT AND THE UPSTREAM BARREL ZONES
  { code: 'feed-throat-temp', label: 'Feed Throat Temperature', kind: 'Temperature', x: 678, y: 366, side: 'left', analyzerNote: NOT_MODELLED.barrel },
  { code: 'tz-01', label: 'Barrel Temperature Zone 1', kind: 'Temperature', x: 752, y: 407, side: 'left', analyzerNote: NOT_MODELLED.barrel },
  { code: 'tz-02', label: 'Barrel Temperature Zone 2', kind: 'Temperature', x: 808, y: 407, side: 'left', analyzerNote: NOT_MODELLED.barrel },
  { code: 'tz-03', label: 'Barrel Temperature Zone 3', kind: 'Temperature', x: 864, y: 407, side: 'left', analyzerNote: NOT_MODELLED.barrel },
  { code: 'tz-04', label: 'Barrel Temperature Zone 4', kind: 'Temperature', x: 920, y: 407, side: 'left', analyzerNote: NOT_MODELLED.barrel },

  // MAIN HOPPER AND ITS GRAVIMETRIC FEEDER
  { code: 'hopper-level', label: 'Main Hopper Level', kind: 'Level', x: 726, y: 142, side: 'right', analyzerNote: NOT_MODELLED.feed },
  { code: 'main-feed-rate', label: 'Main Feeder Rate', kind: 'Flow', x: 717, y: 239, side: 'right', analyzerNote: NOT_MODELLED.feed },
  { code: 'main-feed-rpm', label: 'Main Feeder Speed', kind: 'Speed', x: 709, y: 268, side: 'right', analyzerNote: NOT_MODELLED.feed },
  { code: 'main-feed-current', label: 'Main Feeder Motor Current', kind: 'Current', x: 700, y: 296, side: 'right', analyzerNote: NOT_MODELLED.feed },

  // SIDE FEEDER
  { code: 'side-feed-rate', label: 'Side Feeder Rate', kind: 'Flow', x: 969, y: 290, side: 'right', analyzerNote: NOT_MODELLED.feed },
  { code: 'side-feed-rpm', label: 'Side Feeder Speed', kind: 'Speed', x: 969, y: 322, side: 'right', analyzerNote: NOT_MODELLED.feed },
  { code: 'side-feed-current', label: 'Side Feeder Motor Current', kind: 'Current', x: 969, y: 350, side: 'right', analyzerNote: NOT_MODELLED.feed },

  // INTERMEDIATE PROCESS PRESSURE
  { code: 'p-int-01', label: 'Intermediate Melt Pressure 1', kind: 'Pressure', x: 838, y: 557, side: 'right', analyzerNote: NOT_MODELLED.process },
  { code: 'p-int-02', label: 'Intermediate Melt Pressure 2', kind: 'Pressure', x: 1065, y: 557, side: 'right', analyzerNote: NOT_MODELLED.process },

  // DOWNSTREAM BARREL ZONES
  { code: 'tz-05', label: 'Barrel Temperature Zone 5', kind: 'Temperature', x: 1037, y: 407, side: 'right', analyzerNote: NOT_MODELLED.barrel },
  { code: 'tz-06', label: 'Barrel Temperature Zone 6', kind: 'Temperature', x: 1098, y: 407, side: 'right', analyzerNote: NOT_MODELLED.barrel },
  { code: 'tz-07', label: 'Barrel Temperature Zone 7', kind: 'Temperature', x: 1160, y: 407, side: 'right', analyzerNote: NOT_MODELLED.barrel },
  { code: 'tz-08', label: 'Barrel Temperature Zone 8', kind: 'Temperature', x: 1287, y: 407, side: 'right', analyzerNote: NOT_MODELLED.barrel },

  // VENT / DEVOLATILISATION
  { code: 'vent-pressure', label: 'Vent / Vacuum Pressure', kind: 'Pressure', x: 1238, y: 290, side: 'right', analyzerNote: NOT_MODELLED.process },
  { code: 'vent-temp', label: 'Vent Zone Temperature', kind: 'Temperature', x: 1252, y: 341, side: 'right', analyzerNote: NOT_MODELLED.process },

  // FINAL MELT AND SCREEN SECTION
  { code: 'melt-temp', label: 'Melt Temperature', kind: 'Temperature', x: 1330, y: 449, side: 'right', analyzerNote: NOT_MODELLED.process },
  { code: 'p-screw-in', label: 'Screen Inlet Melt Pressure', kind: 'Pressure', x: 1308, y: 557, side: 'right', analyzerNote: NOT_MODELLED.process },
  { code: 'p-screw-out', label: 'Screen Outlet Melt Pressure', kind: 'Pressure', x: 1364, y: 557, side: 'right', analyzerNote: NOT_MODELLED.process },
] as const;

export function twinScrewPointByCode(code: string | undefined): TwinScrewPointDefinition | undefined {
  return code ? TWIN_SCREW_POINT_REGISTRY.find((point) => point.code === code) : undefined;
}
