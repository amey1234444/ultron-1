import type { MeasurementPointKind } from '../machines';

/** Canonical commissioning registry for the 1200 x 1000 MealSifter artwork. */

export const MEAL_SIFTER_ARTWORK_WIDTH = 1200;
export const MEAL_SIFTER_ARTWORK_HEIGHT = 1000;

/** Named assemblies in the drawing. Mirrors the scene's own part list. */
export type MealSifterPartIdentifier =
  | 'frame'
  | 'inlet'
  | 'undersize-hopper'
  | 'isolation'
  | 'screen-deck'
  | 'vibro-motor-1'
  | 'vibro-motor-2'
  | 'oversize-outlet';

/** The machine tree this template builds, in canvas order. */
export const MEAL_SIFTER_COMPONENT_ORDER = ['Inlet', 'Drive'] as const;
export type MealSifterComponent = (typeof MEAL_SIFTER_COMPONENT_ORDER)[number];

export type MealSifterPointDefinition = {
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
  component: MealSifterComponent;
};

/**
 * Every instrument pad on the drawing.
 *
 * **Supplied with the template** — `data/connections.json` unchanged.
 *
 * The two vibro motors are separate points because a sifter driven by two
 * out-of-balance motors relies on them staying in step; one drifting is the
 * fault, and a single averaged point could not show it. Each carries
 * vibration and current on one pad.
 */
export const MEAL_SIFTER_POINT_REGISTRY: readonly MealSifterPointDefinition[] = [
  { code: 'MS-INLET-HL', label: "Inlet choke / high level", kind: 'Level', x: 306, y: 217, side: 'left', utility: false, location: "Inlet choke / high level", measurements: ['level_switch'], component: 'Inlet' },
  { code: 'MS-MOTOR-1', label: "Vibro motor 1", kind: 'Vibration', x: 499, y: 469, side: 'left', utility: false, location: "Vibro motor 1", measurements: ['vibration', 'motor_current'], component: 'Drive' },
  { code: 'MS-MOTOR-2', label: "Vibro motor 2", kind: 'Vibration', x: 769, y: 520, side: 'right', utility: false, location: "Vibro motor 2", measurements: ['vibration', 'motor_current'], component: 'Drive' },
];

/**
 * The assemblies the drawing names, for the component-details flow.
 *
 * Points are deliberately not associated with parts: the supplied data gives
 * a free-text `location` and no part id, so the mapping would be invented
 * here rather than stated by the template.
 */
export const MEAL_SIFTER_PART_LABELS: readonly { id: MealSifterPartIdentifier; label: string }[] = [
  { id: 'frame', label: "Spring-isolated support structure" },
  { id: 'inlet', label: "Flanged feed inlet" },
  { id: 'undersize-hopper', label: "Sifted-meal collection hopper" },
  { id: 'isolation', label: "Coil springs" },
  { id: 'screen-deck', label: "Inclined screen casing and inspection covers" },
  { id: 'vibro-motor-1', label: "First eccentric vibration motor" },
  { id: 'vibro-motor-2', label: "Second eccentric vibration motor" },
  { id: 'oversize-outlet', label: "Oversize chute to hammer mill" },
];

export function mealSifterPointsForComponent(component: MealSifterComponent): MealSifterPointDefinition[] {
  return MEAL_SIFTER_POINT_REGISTRY.filter((point) => point.component === component);
}
