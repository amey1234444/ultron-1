/** Canonical commissioning registry for the 1200 x 760 extruder artwork. */
export type ExtruderPointKind = 'Vibration' | 'Temperature' | 'Speed' | 'Pressure' | 'Current' | 'Power' | 'Level';

export type ExtruderAnalyzerTag = 'E1' | 'PM1' | 'V1' | 'V2' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'L1' | 'P1';

export type ExtruderPointDefinition = {
  code: string;
  label: string;
  kind: ExtruderPointKind;
  x: number;
  y: number;
  side: 'left' | 'right';
  analyzerTag?: ExtruderAnalyzerTag;
  analyzerNote?: string;
};

/**
 * Every instrument pad on the drawing, at the spot on the artwork where that
 * instrument physically sits.
 *
 * Coordinates are read straight off the 1200 x 760 artwork, so each pad lands
 * on the feature it measures — the terminal box for motor power, the input and
 * output bearing housings for the two gearbox accelerometers, the oil sight
 * glass for gearbox temperature, the thermocouple block on each heater zone.
 * The canvas snaps connections to these, and the trail-layout generator places
 * its cards from the same list, so a card can only ever be wired to a place the
 * machine actually has an instrument.
 */
export const EXTRUDER_POINT_REGISTRY: readonly ExtruderPointDefinition[] = [
  // Motor — non-drive (fan) end, housing, drive end, terminal box, rear shaft.
  { code: 'MOTOR_NDE_VIB', label: 'Motor Non Driving End Vibration', kind: 'Vibration', x: 64, y: 494, side: 'left', analyzerNote: 'The pilot package carries one accelerometer per housing (V1 motor, V2 gearbox). A second non-drive-end motor channel has no declared healthy baseline and no rule of its own.' },
  { code: 'MOTOR_TEMP', label: 'Motor Temperature', kind: 'Temperature', x: 96, y: 522, side: 'left', analyzerTag: 'T4' },
  { code: 'MOTOR_DE_VIB', label: 'Motor Driving End Vibration', kind: 'Vibration', x: 198, y: 494, side: 'left', analyzerTag: 'V1' },
  { code: 'MOTOR_POWER', label: 'Motor Power', kind: 'Power', x: 135, y: 429, side: 'left', analyzerTag: 'PM1' },
  { code: 'MOTOR_RPM', label: 'Motor RPM', kind: 'Speed', x: 214, y: 494, side: 'left', analyzerTag: 'E1' },
  // Gearbox — the input bearing housing on the drive axis, the output bearing
  // housing on the barrel axis, and the oil sight glass.
  { code: 'GEARBOX_VIB_IN', label: 'Gearbox Vibration at In', kind: 'Vibration', x: 288, y: 494, side: 'left', analyzerNote: 'V2 is the single controlled gearbox accelerometer and is taken at the output housing. An input-side channel has no declared healthy baseline of its own, so it is recorded but not fed to the gear rules.' },
  { code: 'GEARBOX_VIB', label: 'Gearbox Vibration at Out', kind: 'Vibration', x: 400, y: 356, side: 'left', analyzerTag: 'V2' },
  { code: 'GEARBOX_TEMP', label: 'Gearbox Temperature', kind: 'Temperature', x: 348, y: 556, side: 'left', analyzerTag: 'T5' },
  { code: 'SCREW_RPM', label: 'Screw RPM', kind: 'Speed', x: 448, y: 425, side: 'left', analyzerNote: 'Derived from motor speed and gearbox ratio by the current model.' },
  // Feed and barrel — hopper radar, then the thermocouple block on each of the
  // five heater zones.
  { code: 'HOPPER_LEVEL', label: 'Hopper Level', kind: 'Level', x: 518, y: 120, side: 'right', analyzerTag: 'L1' },
  { code: 'BARREL_Z1_TEMP', label: 'Barrel Zone 1 Temperature', kind: 'Temperature', x: 566, y: 319, side: 'right', analyzerTag: 'T1' },
  { code: 'BARREL_Z2_TEMP', label: 'Barrel Zone 2 Temperature', kind: 'Temperature', x: 646, y: 319, side: 'right', analyzerTag: 'T2' },
  { code: 'BARREL_Z3_TEMP', label: 'Barrel Zone 3 Temperature', kind: 'Temperature', x: 726, y: 319, side: 'right', analyzerTag: 'T3' },
  { code: 'BARREL_Z4_TEMP', label: 'Barrel Zone 4 Temperature', kind: 'Temperature', x: 806, y: 319, side: 'right', analyzerNote: 'Outside the current three-zone pilot model.' },
  { code: 'BARREL_Z5_TEMP', label: 'Barrel Zone 5 Temperature', kind: 'Temperature', x: 886, y: 319, side: 'right', analyzerNote: 'Outside the current three-zone pilot model.' },
  // Metering zone — transducer boss and melt thermocouple ahead of the breaker plate.
  { code: 'MELT_PRESSURE', label: 'Melt Pressure', kind: 'Pressure', x: 955, y: 334, side: 'right', analyzerTag: 'P1' },
  { code: 'MELT_TEMP', label: 'Melt Temperature', kind: 'Temperature', x: 990, y: 334, side: 'right', analyzerNote: 'The melt temperature is a recipe target, not one of the three controlled barrel-zone measurements the heater and cooling rules compare against.' },
] as const;

export function extruderPointByCode(code: string | undefined): ExtruderPointDefinition | undefined {
  return code ? EXTRUDER_POINT_REGISTRY.find((point) => point.code === code) : undefined;
}
