/** Canonical commissioning registry for the 1200 x 1000 Flaking Mill M-102 artwork. */

/**
 * The drawing plane the artwork is built on.
 *
 * Taller than the 1200 x 760 the extruder, expander and airlock share, because
 * this machine is a vertical arrangement — hopper over rotor over rolls over
 * discharge — and squeezing it into the shorter frame would have meant either
 * stretching it or shrinking it inside a letterboxed panel. A pad is converted
 * to a fraction of *its own* artwork, so the taller frame stays contained here.
 */
export const FLAKING_MILL_ARTWORK_WIDTH = 1200;
export const FLAKING_MILL_ARTWORK_HEIGHT = 1000;

/** Named assemblies in the drawing. Mirrors the scene's own part list. */
export type FlakingMillPartId =
  | 'frame'
  | 'hopper'
  | 'feed-rotor'
  | 'feeder-drive'
  | 'drive-1'
  | 'drive-2'
  | 'belt-1'
  | 'belt-2'
  | 'roll-1'
  | 'roll-2'
  | 'bearing-1'
  | 'bearing-2'
  | 'scraper-1'
  | 'scraper-2'
  | 'actuator'
  | 'accumulator'
  | 'auxiliary-unit'
  | 'discharge'
  | 'process-flow';

/**
 * The machine tree this template builds.
 *
 * The two roll drives are separate components rather than one "Drive", for the
 * same reason the twin screw keeps Screw A and Screw B apart: they are two
 * motors driving two rolls through two belts, and a fault on one is not a
 * fault on the other. Differential roll speed is the flaking parameter, so
 * losing that distinction would lose the measurement that matters most.
 */
export const FLAKING_MILL_COMPONENT_ORDER = ['Upper Drive', 'Lower Drive', 'Rolls', 'Feed', 'Hydraulics'] as const;
export type FlakingMillComponent = (typeof FLAKING_MILL_COMPONENT_ORDER)[number];

export type FlakingMillPointKind = 'Vibration' | 'Temperature' | 'Speed' | 'Pressure' | 'Current' | 'Level';

export type FlakingMillPointDefinition = {
  code: string;
  label: string;
  kind: FlakingMillPointKind;
  x: number;
  y: number;
  side: 'left' | 'right';
  part: FlakingMillPartId;
  component: FlakingMillComponent;
};

/**
 * Every instrument pad on the drawing, at the spot where that instrument sits.
 *
 * **These points are not from the template, and that is the difference between
 * this registry and `expanderPoints.ts`.** The Expander package shipped
 * thirteen proposed positions; this one ships none and says so — "There is no
 * connector overlay or sensor registry". Without pads the template would be a
 * picture: no card could attach to it, it could have no default layout, and it
 * would build no machine tree. So the set below was written to complete the
 * integration.
 *
 * Each coordinate was taken from the drawn geometry rather than estimated by
 * eye — the scene was built and each assembly's bounding box measured, so
 * every pad lands inside the part it names: the motor housings at
 * (62..237, 318..436) and (62..237, 618..736), the bearing covers at
 * (425..483, 481..539) and (663..721, 481..539), the hopper at
 * (468..678, 83..192), the actuator at (807..1036, 478..543) and the
 * hydraulic unit at (923..1104, 706..789).
 *
 * The bounding boxes are taken from the primitives that carry explicit
 * coordinates — rects, circles, lines and polygons — and not from path data,
 * whose numbers include arc radii and flags that are not positions. Measuring
 * paths as if every number were an x or a y inflates a box: it put the
 * hydraulic unit at (714..1104, 538..789) and placed the oil-temperature pad
 * outside the part it names, which `check:flaking-mill` then caught.
 *
 * The *selection* is standard rotating-equipment practice for a two-roll mill:
 * vibration, winding temperature and current on each drive; vibration and
 * temperature at each roll bearing; a speed pickup per roll because their
 * difference is the process variable; hopper level and feeder speed on the
 * feed side; and pressure, gap position and oil temperature on the hydraulic
 * circuit that loads the rolls.
 *
 * **Nobody has confirmed any of this against a real M-102.** Treat every
 * position and every choice here as a proposal to be checked during
 * commissioning, not as a record of an installation. No analyzer tags are set,
 * because no model in this repo is commissioned on this machine.
 */
export const FLAKING_MILL_POINT_REGISTRY: readonly FlakingMillPointDefinition[] = [
  // Upper roll motor — housing, winding and terminal box.
  { code: 'FM_MOTOR_1_VIB', label: 'Upper Roll Motor Vibration', kind: 'Vibration', x: 150, y: 330, side: 'left', part: 'drive-1', component: 'Upper Drive' },
  { code: 'FM_MOTOR_1_TEMP', label: 'Upper Roll Motor Temperature', kind: 'Temperature', x: 96, y: 414, side: 'left', part: 'drive-1', component: 'Upper Drive' },
  { code: 'FM_MOTOR_1_CURRENT', label: 'Upper Roll Motor Current', kind: 'Current', x: 208, y: 414, side: 'left', part: 'drive-1', component: 'Upper Drive' },
  // Lower roll motor — the independent second drive.
  { code: 'FM_MOTOR_2_VIB', label: 'Lower Roll Motor Vibration', kind: 'Vibration', x: 150, y: 630, side: 'left', part: 'drive-2', component: 'Lower Drive' },
  { code: 'FM_MOTOR_2_TEMP', label: 'Lower Roll Motor Temperature', kind: 'Temperature', x: 96, y: 714, side: 'left', part: 'drive-2', component: 'Lower Drive' },
  { code: 'FM_MOTOR_2_CURRENT', label: 'Lower Roll Motor Current', kind: 'Current', x: 208, y: 714, side: 'left', part: 'drive-2', component: 'Lower Drive' },
  // Left roll — bearing cover, housing below it, and a speed pickup on the face.
  { code: 'FM_ROLL_1_BRG_VIB', label: 'Left Roll Bearing Vibration', kind: 'Vibration', x: 454, y: 510, side: 'left', part: 'bearing-1', component: 'Rolls' },
  { code: 'FM_ROLL_1_BRG_TEMP', label: 'Left Roll Bearing Temperature', kind: 'Temperature', x: 454, y: 566, side: 'left', part: 'roll-1', component: 'Rolls' },
  { code: 'FM_ROLL_1_SPEED', label: 'Left Roll Speed', kind: 'Speed', x: 396, y: 452, side: 'left', part: 'roll-1', component: 'Rolls' },
  // Right roll — the same three, on the opposite shaft.
  { code: 'FM_ROLL_2_BRG_VIB', label: 'Right Roll Bearing Vibration', kind: 'Vibration', x: 692, y: 510, side: 'right', part: 'bearing-2', component: 'Rolls' },
  { code: 'FM_ROLL_2_BRG_TEMP', label: 'Right Roll Bearing Temperature', kind: 'Temperature', x: 692, y: 566, side: 'right', part: 'roll-2', component: 'Rolls' },
  { code: 'FM_ROLL_2_SPEED', label: 'Right Roll Speed', kind: 'Speed', x: 750, y: 452, side: 'right', part: 'roll-2', component: 'Rolls' },
  // Feed — hopper level and the metering rotor's drive.
  { code: 'FM_HOPPER_LEVEL', label: 'Hopper Level', kind: 'Level', x: 573, y: 138, side: 'right', part: 'hopper', component: 'Feed' },
  { code: 'FM_FEEDER_RPM', label: 'Feeder Rotor Speed', kind: 'Speed', x: 880, y: 236, side: 'right', part: 'feeder-drive', component: 'Feed' },
  // Hydraulics — the circuit that loads the rolls and sets the gap.
  { code: 'FM_HYD_PRESSURE', label: 'Roll Loading Pressure', kind: 'Pressure', x: 900, y: 496, side: 'right', part: 'actuator', component: 'Hydraulics' },
  // Gap is typed Level for the same reason the expander's cone position is: the
  // transducer reports a normalised opening, and parameterKindForUnit reads '%'
  // and 'fraction' as Level. A gap published in millimetres has no mapped unit
  // and so reads as unknown, which the canvas allows rather than refuses.
  { code: 'FM_ROLL_GAP', label: 'Roll Gap Position', kind: 'Level', x: 990, y: 528, side: 'right', part: 'actuator', component: 'Hydraulics' },
  { code: 'FM_HYD_OIL_TEMP', label: 'Hydraulic Oil Temperature', kind: 'Temperature', x: 1014, y: 748, side: 'right', part: 'auxiliary-unit', component: 'Hydraulics' },
];

/** Human labels for the named assemblies, for part selection on the canvas. */
export const FLAKING_MILL_PART_LABELS: readonly { id: FlakingMillPartId; label: string }[] = [
  { id: 'frame', label: 'Main Housing' },
  { id: 'hopper', label: 'Feed Hopper' },
  { id: 'feed-rotor', label: 'Metering Rotor' },
  { id: 'feeder-drive', label: 'Feeder Motor' },
  { id: 'drive-1', label: 'Upper Roll Motor' },
  { id: 'drive-2', label: 'Lower Roll Motor' },
  { id: 'belt-1', label: 'Upper Belt Drive' },
  { id: 'belt-2', label: 'Lower Belt Drive' },
  { id: 'roll-1', label: 'Left Roll' },
  { id: 'roll-2', label: 'Right Roll' },
  { id: 'bearing-1', label: 'Left Roll Bearing Cover' },
  { id: 'bearing-2', label: 'Right Roll Bearing Cover' },
  { id: 'scraper-1', label: 'Left Scraper' },
  { id: 'scraper-2', label: 'Right Scraper' },
  { id: 'actuator', label: 'Roll Loading Actuator' },
  { id: 'accumulator', label: 'Accumulator Vessel' },
  { id: 'auxiliary-unit', label: 'Hydraulic Auxiliary Unit' },
  { id: 'discharge', label: 'Discharge Funnel' },
  { id: 'process-flow', label: 'Material Flow' },
];

/** The points that belong to one component of the machine tree, in registry order. */
export function flakingMillPointsForComponent(component: FlakingMillComponent): FlakingMillPointDefinition[] {
  return FLAKING_MILL_POINT_REGISTRY.filter((point) => point.component === component);
}
