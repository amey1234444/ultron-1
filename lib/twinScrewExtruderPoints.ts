/**
 * Canonical commissioning registry for the 1200 x 760 twin-screw extruder artwork.
 *
 * Same contract as `extruderPoints.ts` for the single screw: one entry per
 * instrument the drawing physically renders, positioned at the spot on the
 * artwork where that instrument actually sits. The canvas snaps trail endpoints
 * to these, the artwork renders their wiring state, and the default trail layout
 * places its cards from the same list — so a card can never be wired to a place
 * the machine has no instrument.
 *
 * The label set is the ULTRON twin-screw sensor schedule: motor, gearbox, twin
 * screws, main and side feeders, eight barrel zones, two intermediate melt
 * pressures, the vent, final melt, and the screen section.
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
  code: string;
  label: string;
  kind: TwinScrewPointKind;
  x: number;
  y: number;
  side: 'left' | 'right';
  /** Signal tag a machine analysis model reads this pad as, when one does. */
  analyzerTag?: string;
  /** Why no model consumes this pad, when none does. */
  analyzerNote?: string;
};

/**
 * No twin-screw condition model has been commissioned yet, so no pad carries an
 * `analyzerTag`. That is stated per section rather than left blank: the canvas
 * shows this note when a channel lands on a pad, and "recorded but not modelled"
 * is a different thing from "wired wrong".
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
  // Motor — fan (non-drive) end, housing, drive-end bracket, terminal box, shaft.
  { code: 'MOTOR_NDE_VIB', label: 'Motor Non-Drive-End Vibration', kind: 'Vibration', x: 66, y: 545, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'MOTOR_TEMP', label: 'Motor Temperature', kind: 'Temperature', x: 100, y: 578, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'MOTOR_DE_VIB', label: 'Motor Drive-End Vibration', kind: 'Vibration', x: 205, y: 545, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'MOTOR_POWER', label: 'Motor Current / Power', kind: 'Power', x: 137, y: 462, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'MOTOR_RPM', label: 'Motor Speed', kind: 'Speed', x: 240, y: 545, side: 'left', analyzerNote: NOT_MODELLED.drive },
  // Gearbox — input bearing housing on the drive axis, the two output bearing
  // housings on the two screw axes, and the oil sight glass.
  { code: 'GEARBOX_IN_VIB', label: 'Gearbox Input-Side Vibration', kind: 'Vibration', x: 318, y: 545, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'GEARBOX_OUT1_VIB', label: 'Gearbox Output-1 Vibration', kind: 'Vibration', x: 434, y: 422, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'GEARBOX_OUT2_VIB', label: 'Gearbox Output-2 Vibration', kind: 'Vibration', x: 434, y: 474, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'GEARBOX_TEMP', label: 'Gearbox Temperature', kind: 'Temperature', x: 350, y: 566, side: 'left', analyzerNote: NOT_MODELLED.drive },
  // Thrust box — the twin-screw thrust bearing, and the two screw-speed pickups
  // on the output shafts as they leave it into the barrel.
  { code: 'THRUST_BRG_TEMP', label: 'Thrust Bearing Temperature', kind: 'Temperature', x: 467, y: 334, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'SCREW1_RPM', label: 'Screw 1 Speed', kind: 'Speed', x: 466, y: 422, side: 'left', analyzerNote: NOT_MODELLED.drive },
  { code: 'SCREW2_RPM', label: 'Screw 2 Speed', kind: 'Speed', x: 466, y: 474, side: 'left', analyzerNote: NOT_MODELLED.drive },
  // Feed throat, then the four upstream barrel zones — all on the drive half of
  // the machine, so their cards stack on the drive-side column.
  { code: 'FEED_THROAT_TEMP', label: 'Feed Throat Temperature', kind: 'Temperature', x: 503, y: 344, side: 'left', analyzerNote: NOT_MODELLED.barrel },
  { code: 'TZ_01', label: 'Barrel Temperature Zone 1', kind: 'Temperature', x: 580, y: 566, side: 'left', analyzerNote: NOT_MODELLED.barrel },
  { code: 'TZ_02', label: 'Barrel Temperature Zone 2', kind: 'Temperature', x: 641, y: 566, side: 'left', analyzerNote: NOT_MODELLED.barrel },
  { code: 'TZ_03', label: 'Barrel Temperature Zone 3', kind: 'Temperature', x: 703, y: 566, side: 'left', analyzerNote: NOT_MODELLED.barrel },
  { code: 'TZ_04', label: 'Barrel Temperature Zone 4', kind: 'Temperature', x: 764, y: 566, side: 'left', analyzerNote: NOT_MODELLED.barrel },
  // Main hopper and its gravimetric feeder.
  { code: 'HOPPER_LEVEL', label: 'Main Hopper Level', kind: 'Level', x: 610, y: 180, side: 'right', analyzerNote: NOT_MODELLED.feed },
  { code: 'MAIN_FEED_RATE', label: 'Main Feeder Rate', kind: 'Flow', x: 605, y: 274, side: 'right', analyzerNote: NOT_MODELLED.feed },
  { code: 'MAIN_FEED_RPM', label: 'Main Feeder Speed', kind: 'Speed', x: 605, y: 306, side: 'right', analyzerNote: NOT_MODELLED.feed },
  { code: 'MAIN_FEED_CURR', label: 'Main Feeder Motor Current', kind: 'Current', x: 605, y: 338, side: 'right', analyzerNote: NOT_MODELLED.feed },
  // Side feeder / stuffer, on its own drive module beside the barrel.
  { code: 'SIDE_FEED_RATE', label: 'Side Feeder Rate', kind: 'Flow', x: 670, y: 268, side: 'right', analyzerNote: NOT_MODELLED.feed },
  { code: 'SIDE_FEED_RPM', label: 'Side Feeder Speed', kind: 'Speed', x: 670, y: 296, side: 'right', analyzerNote: NOT_MODELLED.feed },
  { code: 'SIDE_FEED_CURR', label: 'Side Feeder Motor Current', kind: 'Current', x: 670, y: 324, side: 'right', analyzerNote: NOT_MODELLED.feed },
  // Intermediate melt pressure — one transducer each side of the side-feed port.
  { code: 'P_INT_01', label: 'Intermediate Melt Pressure 1', kind: 'Pressure', x: 700, y: 344, side: 'right', analyzerNote: NOT_MODELLED.process },
  { code: 'P_INT_02', label: 'Intermediate Melt Pressure 2', kind: 'Pressure', x: 866, y: 344, side: 'right', analyzerNote: NOT_MODELLED.process },
  { code: 'TZ_05', label: 'Barrel Temperature Zone 5', kind: 'Temperature', x: 826, y: 566, side: 'right', analyzerNote: NOT_MODELLED.barrel },
  { code: 'TZ_06', label: 'Barrel Temperature Zone 6', kind: 'Temperature', x: 887, y: 566, side: 'right', analyzerNote: NOT_MODELLED.barrel },
  { code: 'TZ_07', label: 'Barrel Temperature Zone 7', kind: 'Temperature', x: 949, y: 566, side: 'right', analyzerNote: NOT_MODELLED.barrel },
  { code: 'TZ_08', label: 'Barrel Temperature Zone 8', kind: 'Temperature', x: 1010, y: 566, side: 'right', analyzerNote: NOT_MODELLED.barrel },
  // Vent / devolatilisation — vacuum line pressure, and the vent-zone melt
  // thermocouple in the barrel wall beside the vent port.
  { code: 'VENT_PRESSURE', label: 'Vent / Vacuum Pressure', kind: 'Pressure', x: 930, y: 198, side: 'right', analyzerNote: NOT_MODELLED.process },
  { code: 'VENT_TEMP', label: 'Vent Zone Temperature', kind: 'Temperature', x: 974, y: 331, side: 'right', analyzerNote: NOT_MODELLED.process },
  // Final melt and screen section, in the adapter and screen-changer body.
  { code: 'MELT_TEMP', label: 'Melt Temperature', kind: 'Temperature', x: 1052, y: 344, side: 'right', analyzerNote: NOT_MODELLED.process },
  { code: 'P_SCR_IN', label: 'Screen Inlet Melt Pressure', kind: 'Pressure', x: 1080, y: 344, side: 'right', analyzerNote: NOT_MODELLED.process },
  { code: 'P_SCR_OUT', label: 'Screen Outlet Melt Pressure', kind: 'Pressure', x: 1106, y: 344, side: 'right', analyzerNote: NOT_MODELLED.process },
] as const;

export function twinScrewPointByCode(code: string | undefined): TwinScrewPointDefinition | undefined {
  return code ? TWIN_SCREW_POINT_REGISTRY.find((point) => point.code === code) : undefined;
}
