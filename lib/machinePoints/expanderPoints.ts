/** Canonical commissioning registry for the 1200 x 760 Expander X-101 artwork. */

/**
 * The drawing plane the artwork is built on.
 *
 * The same 1200 x 760 frame the Rotary Airlock Valve and the Single Screw
 * Extruder use, so a trail anchor converted against this artwork lands where
 * it does on those two. `machineConnectors.ts` reads these rather than
 * restating the numbers, which is why they live here and not beside the
 * geometry.
 */
export const EXPANDER_ARTWORK_WIDTH = 1200;
export const EXPANDER_ARTWORK_HEIGHT = 760;

/**
 * Named assemblies in the drawing.
 *
 * Declared here rather than in the scene file because a point names the part
 * it sits on, and a part that no longer exists should fail to compile rather
 * than leave a pad attached to nothing.
 */
export type ExpanderPartId =
  | 'main-motor'
  | 'coupling'
  | 'gearbox'
  | 'auxiliary-unit'
  | 'hopper'
  | 'feeder'
  | 'feeder-motor'
  | 'feed-chute'
  | 'barrel'
  | 'main-screw'
  | 'barrel-clamps'
  | 'injection-manifold'
  | 'control-valve'
  | 'outlet-flange'
  | 'outlet-cone'
  | 'cone-actuator'
  | 'actuator-unit'
  | 'discharge-chute'
  | 'process-flow';

/**
 * The machine tree this template builds.
 *
 * Ordered the way the machine is actually built and runs: drive train, then
 * feed, then the barrel it processes in, then the discharge end.
 */
export const EXPANDER_COMPONENT_ORDER = ['Main Motor', 'Gearbox', 'Barrel', 'Discharge'] as const;
export type ExpanderComponent = (typeof EXPANDER_COMPONENT_ORDER)[number];

export type ExpanderPointKind = 'Vibration' | 'Temperature' | 'Speed' | 'Pressure' | 'Current' | 'Level';

export type ExpanderPointDefinition = {
  code: string;
  label: string;
  kind: ExpanderPointKind;
  x: number;
  y: number;
  side: 'left' | 'right';
  part: ExpanderPartId;
  /**
   * Which component of the machine tree owns this point.
   *
   * Declared here, on the point, so a point cannot be listed under two
   * components or dropped from all of them.
   */
  component: ExpanderComponent;
  /** Why no analysis model reads this pad yet. */
  analyzerNote?: string;
};

/**
 * Every instrument pad on the drawing.
 *
 * Six, down from thirteen. The drive is watched for vibration and current,
 * the gearbox for vibration, and the process is the barrel temperature, the
 * outlet pressure and where the discharge cone is sitting — which together
 * say whether the expander is making collets or choking.
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
export const EXPANDER_POINT_REGISTRY: readonly ExpanderPointDefinition[] = [
  { code: 'EX_MOTOR_VIB', label: 'Main Motor Vibration', kind: 'Vibration', x: 170, y: 445, side: 'left', part: 'main-motor', component: 'Main Motor' },
  { code: 'EX_MOTOR_CURRENT', label: 'Main Motor Current', kind: 'Current', x: 112, y: 388, side: 'left', part: 'main-motor', component: 'Main Motor' },
  { code: 'EX_GEARBOX_VIB', label: 'Gearbox Vibration', kind: 'Vibration', x: 321, y: 397, side: 'left', part: 'gearbox', component: 'Gearbox' },
  { code: 'EX_BARREL_TEMP_2', label: 'Barrel Temperature', kind: 'Temperature', x: 678, y: 505, side: 'right', part: 'barrel', component: 'Barrel' },
  { code: 'EX_OUTLET_PRESSURE', label: 'Barrel Outlet Pressure', kind: 'Pressure', x: 933, y: 386, side: 'right', part: 'barrel', component: 'Barrel' },
  { code: 'EX_CONE_POSITION', label: 'Outlet Cone Position', kind: 'Level', x: 1055, y: 420, side: 'right', part: 'cone-actuator', component: 'Discharge' },
];

/** Human labels for the named assemblies, for part selection on the canvas. */
export const EXPANDER_PARTS: readonly { id: ExpanderPartId; label: string }[] = [
  { id: 'main-motor', label: 'Main Drive Motor' },
  { id: 'coupling', label: 'Coupling' },
  { id: 'gearbox', label: 'Gearbox' },
  { id: 'auxiliary-unit', label: 'Drive Auxiliary Unit' },
  { id: 'hopper', label: 'Hopper' },
  { id: 'feeder', label: 'Feeder Screw' },
  { id: 'feeder-motor', label: 'Feeder Motor' },
  { id: 'feed-chute', label: 'Feed Chute' },
  { id: 'barrel', label: 'Barrel' },
  { id: 'main-screw', label: 'Main Screw' },
  { id: 'barrel-clamps', label: 'Barrel Clamps' },
  { id: 'injection-manifold', label: 'Injection Manifold' },
  { id: 'control-valve', label: 'Inlet Control Valve' },
  { id: 'outlet-flange', label: 'Outlet Flange' },
  { id: 'outlet-cone', label: 'Restriction Cone' },
  { id: 'cone-actuator', label: 'Cone Actuator' },
  { id: 'actuator-unit', label: 'Actuator Auxiliary Unit' },
  { id: 'discharge-chute', label: 'Discharge Chute' },
  { id: 'process-flow', label: 'Process Flow' },
];

/** The points that sit on one assembly, in registry order. */
export function expanderPointsForPart(part: ExpanderPartId): ExpanderPointDefinition[] {
  return EXPANDER_POINT_REGISTRY.filter((point) => point.part === part);
}

/** The points that belong to one component of the machine tree, in registry order. */
export function expanderPointsForComponent(component: ExpanderComponent): ExpanderPointDefinition[] {
  return EXPANDER_POINT_REGISTRY.filter((point) => point.component === component);
}
