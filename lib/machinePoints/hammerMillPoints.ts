import type { MeasurementPointKind } from '../machines';

/** Canonical commissioning registry for the 1200 x 1000 HammerMill artwork. */

export const HAMMER_MILL_ARTWORK_WIDTH = 1200;
export const HAMMER_MILL_ARTWORK_HEIGHT = 1000;

/** Named assemblies in the drawing. Mirrors the scene's own part list. */
export type HammerMillPartIdentifier =
  | 'base'
  | 'feed-hopper'
  | 'magnet'
  | 'discharge'
  | 'shaft'
  | 'grinding-chamber'
  | 'nde-bearing'
  | 'de-bearing'
  | 'coupling'
  | 'motor';

/** The machine tree this template builds, in canvas order. */
export const HAMMER_MILL_COMPONENT_ORDER = ['Rotor', 'Drive'] as const;
export type HammerMillComponent = (typeof HAMMER_MILL_COMPONENT_ORDER)[number];

export type HammerMillPointDefinition = {
  code: string;
  label: string;
  kind: MeasurementPointKind;
  x: number;
  y: number;
  side: 'left' | 'right';
  /** True for utility pads — compressed air, steam — which the template draws blue. */
  utility: boolean;
  location: string;
  /** Every quantity this one pad carries. `kind` names the one to match on. */
  measurements: readonly string[];
  component: HammerMillComponent;
};

/**
 * Every instrument pad on the drawing.
 *
 * **Supplied with the template** — `data/connections.json` unchanged.
 *
 * Three points for a machine that is essentially one fast shaft. Both rotor
 * bearings carry vibration *and* temperature on one pad, which is how a
 * bearing is actually watched: the temperature says it is failing and the
 * vibration says how. They stay one logical point each, per the template.
 */
export const HAMMER_MILL_POINT_REGISTRY: readonly HammerMillPointDefinition[] = [
  { code: 'HM-NDE', label: "Non-drive-end rotor bearing", kind: 'Vibration', x: 258, y: 610, side: 'left', utility: false, location: "Non-drive-end rotor bearing", measurements: ['vibration', 'temperature'], component: 'Rotor' },
  { code: 'HM-DE', label: "Drive-end rotor bearing", kind: 'Vibration', x: 761, y: 610, side: 'right', utility: false, location: "Drive-end rotor bearing", measurements: ['vibration', 'temperature'], component: 'Rotor' },
  { code: 'HM-MOTOR-I', label: "Main motor current", kind: 'Current', x: 990, y: 557, side: 'right', utility: false, location: "Main motor current", measurements: ['motor_current'], component: 'Drive' },
];

/**
 * The assemblies the drawing names, for the component-details flow.
 *
 * Points are deliberately not associated with parts: the supplied data gives
 * a free-text `location` and no part id, so the mapping would be invented
 * here rather than stated by the template.
 */
export const HAMMER_MILL_PART_LABELS: readonly { id: HammerMillPartIdentifier; label: string }[] = [
  { id: 'base', label: "Common base with bolted pedestals" },
  { id: 'feed-hopper', label: "Flanged feed hopper" },
  { id: 'magnet', label: "Inlet magnetic separator" },
  { id: 'discharge', label: "Ground-meal outlet" },
  { id: 'shaft', label: "Rotor shaft between both bearings and coupling" },
  { id: 'grinding-chamber', label: "Closed grinding chamber and hinged screen-access door" },
  { id: 'nde-bearing', label: "Non-drive-end rotor bearing" },
  { id: 'de-bearing', label: "Drive-end rotor bearing" },
  { id: 'coupling', label: "Flexible coupling and perforated guard" },
  { id: 'motor', label: "Main drive motor and mounting base" },
];

export function hammerMillPointsForComponent(component: HammerMillComponent): HammerMillPointDefinition[] {
  return HAMMER_MILL_POINT_REGISTRY.filter((point) => point.component === component);
}
