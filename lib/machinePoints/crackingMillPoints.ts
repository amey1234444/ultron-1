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
 * Every instrument pad on the drawing.
 *
 * Seven, down from eighteen. Both roll pairs are watched at the bearing and
 * at the gap — a cracking mill is judged on whether the rolls are still round
 * and still set — each drive reports its current, and the hopper reports its
 * level. The roll speeds went: their ratio is a setting, not a condition,
 * and it is read off the drives.
 *
 * These positions were not supplied with the template — no reference drawing
 * for this machine ships a sensor overlay — so the set is a proposal, chosen
 * the way the drawings that *do* ship one choose theirs: what has to be
 * watched for the machine to be diagnosable, and nothing that is merely
 * available. The reference drawings for the eleven machines that have them
 * mark between three and fourteen pads each and caption them "minimum
 * sensors"; this follows that, rather than instrumenting every part that
 * could carry a transducer.
 *
 * Where a bearing is watched it carries vibration *and* temperature on one
 * pad, as the hammer mill's rotor bearings and the flaking mill's rolls
 * already do here: the temperature says it is failing and the vibration says
 * how.
 *
 * Coordinates are unchanged from the fuller set — each was measured off the
 * drawn geometry, so every surviving pad still lands inside the part it names.
 *
 * **Nobody has confirmed this against a real machine.** Treat it as a
 * commissioning proposal.
 */
export const CRACKING_MILL_POINT_REGISTRY: readonly CrackingMillPointDefinition[] = [
  { code: 'CM_TOP_MOTOR_CURRENT', label: 'Top Stage Motor Current', kind: 'Current', x: 216, y: 450, side: 'left', part: 'top-drive', component: 'Top Drive' },
  { code: 'CM_BOT_MOTOR_CURRENT', label: 'Bottom Stage Motor Current', kind: 'Current', x: 216, y: 686, side: 'left', part: 'bottom-drive', component: 'Bottom Drive' },
  { code: 'CM_TOP_BRG_VIB', label: 'Top Roll Bearing Vibration + Temperature', kind: 'Vibration', x: 519, y: 410, side: 'left', part: 'top-bearings', component: 'Top Rolls' },
  { code: 'CM_TOP_GAP', label: 'Top Roll Gap Position', kind: 'Level', x: 857, y: 410, side: 'right', part: 'top-gap-spring', component: 'Top Rolls' },
  { code: 'CM_BOT_BRG_VIB', label: 'Bottom Roll Bearing Vibration + Temperature', kind: 'Vibration', x: 519, y: 646, side: 'left', part: 'bottom-bearings', component: 'Bottom Rolls' },
  { code: 'CM_BOT_GAP', label: 'Bottom Roll Gap Position', kind: 'Level', x: 855, y: 646, side: 'right', part: 'bottom-gap-spring', component: 'Bottom Rolls' },
  { code: 'CM_HOPPER_LEVEL', label: 'Hopper Level', kind: 'Level', x: 626, y: 143, side: 'right', part: 'hopper', component: 'Feed' },
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
