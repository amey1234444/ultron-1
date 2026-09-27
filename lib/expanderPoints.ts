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
export const EXPANDER_COMPONENT_ORDER = ['Main Motor', 'Gearbox', 'Feed', 'Barrel', 'Discharge'] as const;
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
 * Every instrument pad on the drawing, at the spot where that instrument sits.
 *
 * Positions come from the supplied template unchanged. The `kind` on each entry
 * does not: the template ships code, label, side, part and coordinates only,
 * and this console needs the measured quantity as well, because a pad is a
 * locking point — it accepts a channel only when the channel reports the
 * quantity the instrument at that spot measures. Without a kind every pad would
 * accept every channel, and a thermocouple wired to the outlet-pressure
 * transducer would be discovered by the analysis layer rather than refused at
 * the canvas.
 *
 * **These positions are proposed, not commissioned.** The source drawing
 * documented no sensors, so each one is an engineering reading of where the
 * instrument would physically go. Confirm against the real installation before
 * anyone maps a channel to them in anger.
 *
 * No analyzer tags are set. The extruder and twin-screw models read their own
 * machines' tags, and reusing one here would silently feed expander readings to
 * a model commissioned on a different machine.
 */
export const EXPANDER_POINT_REGISTRY: readonly ExpanderPointDefinition[] = [
  // Main drive — rear shaft, housing, frame and terminal box.
  { code: 'EX_MOTOR_RPM', label: 'Main Motor Speed', kind: 'Speed', x: 43, y: 445, side: 'left', part: 'main-motor' , component: 'Main Motor' },
  { code: 'EX_MOTOR_VIB', label: 'Main Motor Vibration', kind: 'Vibration', x: 170, y: 445, side: 'left', part: 'main-motor' , component: 'Main Motor' },
  { code: 'EX_MOTOR_TEMP', label: 'Main Motor Temperature', kind: 'Temperature', x: 73, y: 483, side: 'left', part: 'main-motor' , component: 'Main Motor' },
  { code: 'EX_MOTOR_CURRENT', label: 'Main Motor Current', kind: 'Current', x: 112, y: 388, side: 'left', part: 'main-motor' , component: 'Main Motor' },
  // Gearbox — housing and oil sight glass.
  { code: 'EX_GEARBOX_VIB', label: 'Gearbox Vibration', kind: 'Vibration', x: 321, y: 397, side: 'left', part: 'gearbox' , component: 'Gearbox' },
  { code: 'EX_GEARBOX_TEMP', label: 'Gearbox Temperature', kind: 'Temperature', x: 278, y: 493, side: 'left', part: 'gearbox' , component: 'Gearbox' },
  // Feed — hopper and the separate feeder drive.
  { code: 'EX_HOPPER_LEVEL', label: 'Hopper Level', kind: 'Level', x: 520, y: 123, side: 'right', part: 'hopper' , component: 'Feed' },
  { code: 'EX_FEEDER_RPM', label: 'Feeder Screw Speed', kind: 'Speed', x: 722, y: 267, side: 'right', part: 'feeder-motor' , component: 'Feed' },
  // Barrel — three section thermocouples and the outlet transducer.
  { code: 'EX_BARREL_TEMP_1', label: 'Barrel Section 1 Temperature', kind: 'Temperature', x: 560, y: 505, side: 'right', part: 'barrel' , component: 'Barrel' },
  { code: 'EX_BARREL_TEMP_2', label: 'Barrel Section 2 Temperature', kind: 'Temperature', x: 678, y: 505, side: 'right', part: 'barrel' , component: 'Barrel' },
  { code: 'EX_BARREL_TEMP_3', label: 'Barrel Section 3 Temperature', kind: 'Temperature', x: 796, y: 505, side: 'right', part: 'barrel' , component: 'Barrel' },
  { code: 'EX_OUTLET_PRESSURE', label: 'Barrel Outlet Pressure', kind: 'Pressure', x: 933, y: 386, side: 'right', part: 'barrel' , component: 'Barrel' },
  // Discharge — the cone's position feedback.
  //
  // Typed as a Level, which is what makes it lock correctly: the actuator
  // reports a normalised opening, `parameterKindForUnit` reads '%' and
  // 'fraction' as Level, and a position channel in those units therefore
  // matches. There is no Position kind, and adding one for a single pad would
  // put a new case through every kind switch in the analysis and rack layers
  // for no gain. Revisit if a second machine reports a travel in millimetres.
  { code: 'EX_CONE_POSITION', label: 'Outlet Cone Position', kind: 'Level', x: 1055, y: 420, side: 'right', part: 'cone-actuator' , component: 'Discharge' },
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
