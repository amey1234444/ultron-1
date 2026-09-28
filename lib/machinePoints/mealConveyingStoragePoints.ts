import type { MeasurementPointKind } from '../machines';

/** Canonical commissioning registry for the 1200 x 1000 MealConveyingStorage artwork. */

export const MEAL_CONVEYING_STORAGE_ARTWORK_WIDTH = 1200;
export const MEAL_CONVEYING_STORAGE_ARTWORK_HEIGHT = 1000;

/** Named assemblies in the drawing. Mirrors the scene's own part list. */
export type MealConveyingStoragePartIdentifier =
  | 'screw-supports'
  | 'screw-inlet'
  | 'screw-conveyor'
  | 'screw-drive'
  | 'elevator-boot'
  | 'elevator-legs'
  | 'elevator-head'
  | 'head-drive'
  | 'transfer-chute'
  | 'bin-supports'
  | 'meal-bin'
  | 'level-radar'
  | 'bin-discharge';

/** The machine tree this template builds, in canvas order. */
export const MEAL_CONVEYING_STORAGE_COMPONENT_ORDER = ['Screw', 'Elevator', 'Bin'] as const;
export type MealConveyingStorageComponent = (typeof MEAL_CONVEYING_STORAGE_COMPONENT_ORDER)[number];

export type MealConveyingStoragePointDefinition = {
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
  component: MealConveyingStorageComponent;
};

/**
 * Every instrument pad on the drawing.
 *
 * **Supplied with the template** — `data/connections.json` unchanged.
 *
 * Two zero-speed switches and they are not interchangeable: one is on the
 * collecting screw and one is on the elevator tail, where a stopped tail
 * means a slipping or broken belt with a full leg above it. Grouping them
 * would lose which of those two things happened.
 */
export const MEAL_CONVEYING_STORAGE_POINT_REGISTRY: readonly MealConveyingStoragePointDefinition[] = [
  { code: 'MC-SCREW-ZS', label: "Collecting screw zero speed", kind: 'Speed', x: 461, y: 783, side: 'left', utility: false, location: "Collecting screw zero speed", measurements: ['zero_speed'], component: 'Screw' },
  { code: 'MC-ELEVATOR-ZS', label: "Elevator tail zero speed / belt slip", kind: 'Speed', x: 550, y: 842, side: 'left', utility: false, location: "Elevator tail zero speed / belt slip", measurements: ['zero_speed'], component: 'Elevator' },
  { code: 'MC-HEAD-VIB', label: "Elevator head drive vibration", kind: 'Vibration', x: 678, y: 185, side: 'right', utility: false, location: "Elevator head drive vibration", measurements: ['vibration'], component: 'Elevator' },
  { code: 'MC-BIN-LEVEL', label: "Meal bin radar level", kind: 'Level', x: 1011, y: 256, side: 'right', utility: false, location: "Meal bin radar level", measurements: ['level'], component: 'Bin' },
];

/**
 * The assemblies the drawing names, for the component-details flow.
 *
 * Points are deliberately not associated with parts: the supplied data gives
 * a free-text `location` and no part id, so the mapping would be invented
 * here rather than stated by the template.
 */
export const MEAL_CONVEYING_STORAGE_PART_LABELS: readonly { id: MealConveyingStoragePartIdentifier; label: string }[] = [
  { id: 'screw-supports', label: "Collecting conveyor supports" },
  { id: 'screw-inlet', label: "Collecting screw feed inlet" },
  { id: 'screw-conveyor', label: "Enclosed collecting screw conveyor" },
  { id: 'screw-drive', label: "Collecting screw motor and gearbox" },
  { id: 'elevator-boot', label: "Elevator boot and tail shaft" },
  { id: 'elevator-legs', label: "Bucket elevator up-leg and return-leg" },
  { id: 'elevator-head', label: "Elevator head casing" },
  { id: 'head-drive', label: "Head-shaft gearbox and motor" },
  { id: 'transfer-chute', label: "Enclosed gravity chute into storage bin" },
  { id: 'bin-supports', label: "Storage bin support legs" },
  { id: 'meal-bin', label: "Segmented cylindrical meal bin and cone" },
  { id: 'level-radar', label: "Roof-mounted level radar" },
  { id: 'bin-discharge', label: "Driven rotary outlet to bagger" },
];

export function mealConveyingStoragePointsForComponent(component: MealConveyingStorageComponent): MealConveyingStoragePointDefinition[] {
  return MEAL_CONVEYING_STORAGE_POINT_REGISTRY.filter((point) => point.component === component);
}
