import type { MeasurementPointKind } from '../machines';

/** Canonical commissioning registry for the 1200 x 1000 AutoBagger artwork. */

export const AUTO_BAGGER_ARTWORK_WIDTH = 1200;
export const AUTO_BAGGER_ARTWORK_HEIGHT = 1000;

/** Named assemblies in the drawing. Mirrors the scene's own part list. */
export type AutoBaggerPartIdentifier =
  | 'gantry'
  | 'feed-hopper'
  | 'feeder'
  | 'weigh-hopper'
  | 'load-cells'
  | 'fill-spout'
  | 'pneumatics'
  | 'filling-bag'
  | 'stitcher-column'
  | 'stitcher'
  | 'stitched-bags'
  | 'transport'
  | 'check-weigher';

/** The machine tree this template builds, in canvas order. */
export const AUTO_BAGGER_COMPONENT_ORDER = ['Weighing', 'Bagging', 'Stitching', 'Checkweighing'] as const;
export type AutoBaggerComponent = (typeof AUTO_BAGGER_COMPONENT_ORDER)[number];

export type AutoBaggerPointDefinition = {
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
  component: AutoBaggerComponent;
};

/**
 * Every instrument pad on the drawing.
 *
 * **Supplied with the template** — `data/connections.json` unchanged.
 *
 * Four points, and two of them weigh. That is not duplication: the weigh
 * hopper meters the charge going into the bag and the check-weigher confirms
 * what actually left, and a bagger that is overfilling is exactly the machine
 * where those two numbers stop agreeing. `AB-AIR-P` is the one utility pad,
 * the compressed air holding the bag clamp shut.
 */
export const AUTO_BAGGER_POINT_REGISTRY: readonly AutoBaggerPointDefinition[] = [
  { code: 'AB-WEIGH', label: "Weigh hopper load-cell group", kind: 'Weight', x: 298, y: 382, side: 'left', utility: false, location: "Weigh hopper load-cell group", measurements: ['weight'], component: 'Weighing' },
  { code: 'AB-AIR-P', label: "Bag clamp air pressure", kind: 'Pressure', x: 683, y: 457, side: 'right', utility: true, location: "Bag clamp air pressure", measurements: ['pressure'], component: 'Bagging' },
  { code: 'AB-STITCH-I', label: "Stitcher motor current", kind: 'Current', x: 876, y: 535, side: 'right', utility: false, location: "Stitcher motor current", measurements: ['motor_current'], component: 'Stitching' },
  { code: 'AB-CHECK-W', label: "Check-weigher weight", kind: 'Weight', x: 1016, y: 876, side: 'right', utility: false, location: "Check-weigher weight", measurements: ['weight'], component: 'Checkweighing' },
];

/**
 * The assemblies the drawing names, for the component-details flow.
 *
 * Points are deliberately not associated with parts: the supplied data gives
 * a free-text `location` and no part id, so the mapping would be invented
 * here rather than stated by the template.
 */
export const AUTO_BAGGER_PART_LABELS: readonly { id: AutoBaggerPartIdentifier; label: string }[] = [
  { id: 'gantry', label: "Weighing and filling support gantry" },
  { id: 'feed-hopper', label: "Upper supply hopper" },
  { id: 'feeder', label: "Metering feeder and motor" },
  { id: 'weigh-hopper', label: "Suspended weigh hopper" },
  { id: 'load-cells', label: "Left and right weigh-hopper load cells" },
  { id: 'fill-spout', label: "Filling spout and bag-clamp jaws" },
  { id: 'pneumatics', label: "Pneumatic clamp actuator and air preparation" },
  { id: 'filling-bag', label: "Bag at filling station" },
  { id: 'stitcher-column', label: "Stitcher support column" },
  { id: 'stitcher', label: "Bag stitching head and motor" },
  { id: 'stitched-bags', label: "Bags at stitching and weighing stations" },
  { id: 'transport', label: "Bag transport belt and roller frame" },
  { id: 'check-weigher', label: "Isolated check-weigher platform and load cell" },
];

export function autoBaggerPointsForComponent(component: AutoBaggerComponent): AutoBaggerPointDefinition[] {
  return AUTO_BAGGER_POINT_REGISTRY.filter((point) => point.component === component);
}
