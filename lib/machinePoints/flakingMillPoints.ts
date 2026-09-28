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
 * Two components, because the drawing marks three instruments and they fall
 * into two groups. There were five, covering drives and feed as well, back
 * when this registry carried seventeen points it had invented.
 */
export const FLAKING_MILL_COMPONENT_ORDER = ['Rolls', 'Hydraulics'] as const;
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
 * Every instrument pad the drawing marks.
 *
 * Three, and the reference drawing says which three: vibration and
 * temperature at the fixed roll bearing, the same at the floating roll
 * bearing, and the hydraulic pressure that loads the rolls. Its own caption
 * puts it plainly — "Minimum sensors: roll-bearing vibration + temperature
 * (fixed & floating roll) • hydraulic pressure".
 *
 * It used to carry seventeen. The extra fourteen — vibration, winding
 * temperature and current on each of the two drives, a speed pickup per roll,
 * hopper level, feeder speed, roll gap and hydraulic oil temperature — were
 * not on the drawing. They were written here to "complete the integration"
 * when the package arrived without a sensor registry, and standard practice
 * for a two-roll mill is a reasonable thing to propose but not a reasonable
 * thing to ship as though the drawing had specified it. Fourteen pads nobody
 * asked for is fourteen cards to wire, fourteen channels to simulate and
 * fourteen trails to route around.
 *
 * A bearing pad carries vibration *and* temperature on one point, which is
 * how a bearing is actually watched and how the hammer mill's two rotor
 * bearings are already handled here: the temperature says it is failing and
 * the vibration says how.
 *
 * Coordinates are unchanged — each was measured off the drawn geometry, so
 * the bearing covers at (425..483, 481..539) and (663..721, 481..539) and the
 * actuator at (807..1036, 478..543) still contain their pads.
 */
export const FLAKING_MILL_POINT_REGISTRY: readonly FlakingMillPointDefinition[] = [
  { code: 'FM_ROLL_1_BRG_VIB', label: 'Fixed Roll Bearing Vibration + Temperature', kind: 'Vibration', x: 454, y: 510, side: 'left', part: 'bearing-1', component: 'Rolls' },
  { code: 'FM_ROLL_2_BRG_VIB', label: 'Floating Roll Bearing Vibration + Temperature', kind: 'Vibration', x: 692, y: 510, side: 'right', part: 'bearing-2', component: 'Rolls' },
  { code: 'FM_HYD_PRESSURE', label: 'Hydraulic Pressure', kind: 'Pressure', x: 900, y: 496, side: 'right', part: 'actuator', component: 'Hydraulics' },
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
