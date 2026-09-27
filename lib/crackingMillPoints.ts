/** Canonical commissioning registry for the 1200 x 1000 Cracking Mill M-101 artwork. */

/**
 * The drawing plane the artwork is built on.
 *
 * 1200 x 1000, as the flaking mill uses and for the same reason: this is a
 * two-stage machine stacked vertically — hopper, feed roll, the coarse pair,
 * the fine pair, outlet hopper — and the template says not to stretch it onto
 * the wider extruder canvas.
 */
export const CRACKING_MILL_ARTWORK_WIDTH = 1200;
export const CRACKING_MILL_ARTWORK_HEIGHT = 1000;

/** Named assemblies in the drawing. Mirrors the scene's own part list. */
export type CrackingMillPartId =
  | 'housing' | 'hopper' | 'feed-roll' | 'feeder-drive'
  | 'top-drive' | 'bottom-drive' | 'top-belt' | 'bottom-belt'
  | 'top-fast-roll' | 'top-slow-roll' | 'bottom-fast-roll' | 'bottom-slow-roll'
  | 'top-bearings' | 'bottom-bearings' | 'top-gap-spring' | 'bottom-gap-spring'
  | 'top-scrapers' | 'bottom-scrapers' | 'discharge' | 'material-flow';

/**
 * The machine tree this template builds.
 *
 * The two stages are kept apart, and within each stage the fast and slow rolls
 * are measured separately. A cracking mill works by the *difference* between
 * the two roll speeds in a pair, so a single averaged speed per stage would
 * discard the variable the machine is set by.
 */
export const CRACKING_MILL_COMPONENT_ORDER = ['Top Drive', 'Bottom Drive', 'Top Rolls', 'Bottom Rolls', 'Feed'] as const;
export type CrackingMillComponent = (typeof CRACKING_MILL_COMPONENT_ORDER)[number];

export type CrackingMillPointKind = 'Vibration' | 'Temperature' | 'Speed' | 'Pressure' | 'Current' | 'Level';

export type CrackingMillPointDefinition = {
  code: string;
  label: string;
  kind: CrackingMillPointKind;
  x: number;
  y: number;
  side: 'left' | 'right';
  part: CrackingMillPartId;
  component: CrackingMillComponent;
};

/**
 * Every instrument pad on the drawing, at the spot where that instrument sits.
 *
 * **Written during integration, not supplied.** Like the flaking mill and
 * unlike the expander, this template ships no sensor registry, and without pads
 * it could hold no cards, have no default layout and build no machine tree.
 *
 * Positions are taken from the drawn geometry — the scene was built and each
 * assembly's bounding box measured from the primitives that carry explicit
 * coordinates — so every pad lands inside the part it names: the motors at
 * (80..246, 354..472) and (80..246, 590..708), the bearing covers at
 * (493..737, 384..436) and (493..734, 620..672), the relief springs at
 * (737..976, 386..434) and (734..976, 622..670).
 *
 * The selection is standard for a four-roll mill: vibration, winding
 * temperature and current on each stage motor; a speed pickup on all four
 * rolls, because each pair is set by its fast/slow differential; vibration and
 * temperature at each stage's bearing block; the tramp-relief spring position
 * per stage; and hopper level with feed-roll speed on the inlet.
 *
 * **Nobody has confirmed any of this against a real M-101.** Every position and
 * every choice is a proposal to check at commissioning. No analyzer tags are
 * set, because no model here is commissioned on this machine.
 */
export const CRACKING_MILL_POINT_REGISTRY: readonly CrackingMillPointDefinition[] = [
  // Top-pair motor.
  { code: 'CM_TOP_MOTOR_VIB', label: 'Top Stage Motor Vibration', kind: 'Vibration', x: 163, y: 366, side: 'left', part: 'top-drive', component: 'Top Drive' },
  { code: 'CM_TOP_MOTOR_TEMP', label: 'Top Stage Motor Temperature', kind: 'Temperature', x: 110, y: 450, side: 'left', part: 'top-drive', component: 'Top Drive' },
  { code: 'CM_TOP_MOTOR_CURRENT', label: 'Top Stage Motor Current', kind: 'Current', x: 216, y: 450, side: 'left', part: 'top-drive', component: 'Top Drive' },
  // Bottom-pair motor.
  { code: 'CM_BOT_MOTOR_VIB', label: 'Bottom Stage Motor Vibration', kind: 'Vibration', x: 163, y: 602, side: 'left', part: 'bottom-drive', component: 'Bottom Drive' },
  { code: 'CM_BOT_MOTOR_TEMP', label: 'Bottom Stage Motor Temperature', kind: 'Temperature', x: 110, y: 686, side: 'left', part: 'bottom-drive', component: 'Bottom Drive' },
  { code: 'CM_BOT_MOTOR_CURRENT', label: 'Bottom Stage Motor Current', kind: 'Current', x: 216, y: 686, side: 'left', part: 'bottom-drive', component: 'Bottom Drive' },
  // Coarse pair — both speeds, because their ratio is the crack setting.
  { code: 'CM_TOP_FAST_SPEED', label: 'Top Fast Roll Speed', kind: 'Speed', x: 519, y: 350, side: 'left', part: 'top-fast-roll', component: 'Top Rolls' },
  { code: 'CM_TOP_SLOW_SPEED', label: 'Top Slow Roll Speed', kind: 'Speed', x: 711, y: 350, side: 'right', part: 'top-slow-roll', component: 'Top Rolls' },
  { code: 'CM_TOP_BRG_VIB', label: 'Top Roll Bearing Vibration', kind: 'Vibration', x: 519, y: 410, side: 'left', part: 'top-bearings', component: 'Top Rolls' },
  { code: 'CM_TOP_BRG_TEMP', label: 'Top Roll Bearing Temperature', kind: 'Temperature', x: 711, y: 410, side: 'right', part: 'top-bearings', component: 'Top Rolls' },
  { code: 'CM_TOP_GAP', label: 'Top Roll Gap Position', kind: 'Level', x: 857, y: 410, side: 'right', part: 'top-gap-spring', component: 'Top Rolls' },
  // Fine pair.
  { code: 'CM_BOT_FAST_SPEED', label: 'Bottom Fast Roll Speed', kind: 'Speed', x: 519, y: 586, side: 'left', part: 'bottom-fast-roll', component: 'Bottom Rolls' },
  { code: 'CM_BOT_SLOW_SPEED', label: 'Bottom Slow Roll Speed', kind: 'Speed', x: 708, y: 586, side: 'right', part: 'bottom-slow-roll', component: 'Bottom Rolls' },
  { code: 'CM_BOT_BRG_VIB', label: 'Bottom Roll Bearing Vibration', kind: 'Vibration', x: 519, y: 646, side: 'left', part: 'bottom-bearings', component: 'Bottom Rolls' },
  { code: 'CM_BOT_BRG_TEMP', label: 'Bottom Roll Bearing Temperature', kind: 'Temperature', x: 708, y: 646, side: 'right', part: 'bottom-bearings', component: 'Bottom Rolls' },
  { code: 'CM_BOT_GAP', label: 'Bottom Roll Gap Position', kind: 'Level', x: 855, y: 646, side: 'right', part: 'bottom-gap-spring', component: 'Bottom Rolls' },
  // Inlet.
  { code: 'CM_HOPPER_LEVEL', label: 'Hopper Level', kind: 'Level', x: 626, y: 143, side: 'right', part: 'hopper', component: 'Feed' },
  { code: 'CM_FEED_ROLL_SPEED', label: 'Feed Roll Speed', kind: 'Speed', x: 873, y: 235, side: 'right', part: 'feeder-drive', component: 'Feed' },
];

/** Human labels for the named assemblies, for part selection on the canvas. */
export const CRACKING_MILL_PART_LABELS: readonly { id: CrackingMillPartId; label: string }[] = [
  { id: 'housing', label: 'Frame and Housing' },
  { id: 'hopper', label: 'Feed Hopper' },
  { id: 'feed-roll', label: 'Metering Feed Roll' },
  { id: 'feeder-drive', label: 'Feed Drive' },
  { id: 'top-drive', label: 'Top Stage Motor' },
  { id: 'bottom-drive', label: 'Bottom Stage Motor' },
  { id: 'top-belt', label: 'Top V-Belt Drive' },
  { id: 'bottom-belt', label: 'Bottom V-Belt Drive' },
  { id: 'top-fast-roll', label: 'Top Fast Roll' },
  { id: 'top-slow-roll', label: 'Top Slow Roll' },
  { id: 'bottom-fast-roll', label: 'Bottom Fast Roll' },
  { id: 'bottom-slow-roll', label: 'Bottom Slow Roll' },
  { id: 'top-bearings', label: 'Top Roll Bearings' },
  { id: 'bottom-bearings', label: 'Bottom Roll Bearings' },
  { id: 'top-gap-spring', label: 'Top Gap and Relief Spring' },
  { id: 'bottom-gap-spring', label: 'Bottom Gap and Relief Spring' },
  { id: 'top-scrapers', label: 'Top Scrapers' },
  { id: 'bottom-scrapers', label: 'Bottom Scrapers' },
  { id: 'discharge', label: 'Outlet Hopper' },
  { id: 'material-flow', label: 'Material Flow' },
];

/** The points that belong to one component of the machine tree, in registry order. */
export function crackingMillPointsForComponent(component: CrackingMillComponent): CrackingMillPointDefinition[] {
  return CRACKING_MILL_POINT_REGISTRY.filter((point) => point.component === component);
}
