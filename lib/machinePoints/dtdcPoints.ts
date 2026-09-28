import type { MeasurementPointKind } from '../machines';

/** Canonical commissioning registry for the 1200 x 1000 DTDC artwork. */

/**
 * The drawing plane the artwork is built on.
 *
 * 1200 x 1000. A desolventiser-toaster-dryer-cooler is one tall stack of
 * trays: the meal falls through desolventising, toasting, drying and cooling
 * in turn, so the machine is drawn as the column it is.
 */
export const DTDC_ARTWORK_WIDTH = 1200;
export const DTDC_ARTWORK_HEIGHT = 1000;

/** Named assemblies in the drawing. Mirrors the scene's own part list. */
export type DtdcPartIdentifier =
  | 'process-ducts'
  | 'vessel-shell'
  | 'duct-flange-767-623'
  | 'duct-flange-872-623'
  | 'duct-flange-771-756'
  | 'duct-flange-843-756'
  | 'duct-flange-388-655'
  | 'duct-flange-315-655'
  | 'dt-dc-boundary'
  | 'feed-gate'
  | 'air-heater'
  | 'hot-air-fan'
  | 'cooling-fan'
  | 'exhaust-cyclone'
  | 'exhaust-fan'
  | 'steam-inlet'
  | 'meal-discharge'
  | 'drive-shaft'
  | 'main-gearbox'
  | 'main-coupling'
  | 'main-motor';

/** The machine tree this template builds, in canvas order. */
export const DTDC_COMPONENT_ORDER = ['Drive', 'Trays', 'Steam', 'Drying', 'Cooling', 'Vapour', 'Discharge'] as const;
export type DtdcComponent = (typeof DTDC_COMPONENT_ORDER)[number];

export type DtdcPointDefinition = {
  code: string;
  label: string;
  kind: MeasurementPointKind;
  x: number;
  y: number;
  side: 'left' | 'right';
  /** True for steam/cooling-water utility pads, which the template draws blue. */
  utility: boolean;
  /** Where the instrument sits, in the template's own words. */
  location: string;
  /** Every quantity this one pad carries. Usually one; see the note above. */
  measurements: readonly string[];
  component: DtdcComponent;
};

/**
 * Every instrument pad on the drawing.
 *
 * **Supplied with the template.** These rows are `data/connections.json`
 * unchanged — ids, labels, locations and coordinates all the vendor's.
 *
 * Ten points for four processes stacked in one vessel, which is why the
 * grouping below follows the stages rather than the hardware: one fan belongs
 * to drying and another to cooling even though they are the same kind of
 * machine, because a hot-air fan failing and a cooling fan failing mean
 * different things about the meal leaving the bottom.
 *
 * `M08-UT-03` is the one utility pad — sparge steam flow into the toasting
 * tray. The template colours utility blue and process green, and that is a
 * category, not a health state.
 */
export const DTDC_POINT_REGISTRY: readonly DtdcPointDefinition[] = [
  { code: 'M08-MS-01', label: 'Vapour outlet temperature', kind: 'Temperature', x: 656, y: 107, side: 'right', utility: false, location: 'Dome vapour line', measurements: ['Vapour outlet temperature'], component: 'Vapour' },
  { code: 'M08-MS-02', label: 'Toasting meal temperature', kind: 'Temperature', x: 724, y: 544, side: 'right', utility: false, location: 'Bottom DT tray', measurements: ['Toasting meal temperature'], component: 'Trays' },
  { code: 'M08-UT-03', label: 'Sparge steam flow', kind: 'Flow', x: 915, y: 533, side: 'right', utility: true, location: 'Live-steam line to sparge tray', measurements: ['Sparge steam flow'], component: 'Steam' },
  { code: 'M08-MS-04', label: 'Hot-air fan vibration', kind: 'Vibration', x: 998, y: 599, side: 'right', utility: false, location: 'Hot-air fan bearing', measurements: ['Hot-air fan vibration'], component: 'Drying' },
  { code: 'M08-MS-05', label: 'Cooling fan vibration', kind: 'Vibration', x: 940, y: 736, side: 'right', utility: false, location: 'Cooling fan bearing', measurements: ['Cooling fan vibration'], component: 'Cooling' },
  { code: 'M08-MS-06', label: 'Exhaust fan vibration', kind: 'Vibration', x: 159, y: 445, side: 'left', utility: false, location: 'Exhaust fan bearing', measurements: ['Exhaust fan vibration'], component: 'Vapour' },
  { code: 'M08-MS-07', label: 'Meal outlet moisture', kind: 'Moisture', x: 541, y: 891, side: 'left', utility: false, location: 'Meal discharge', measurements: ['Meal outlet moisture'], component: 'Discharge' },
  { code: 'M08-MS-08', label: 'Meal outlet temperature', kind: 'Temperature', x: 543, y: 919, side: 'left', utility: false, location: 'Meal discharge', measurements: ['Meal outlet temperature'], component: 'Discharge' },
  { code: 'M08-MS-09', label: 'Main gearbox vibration', kind: 'Vibration', x: 652, y: 865, side: 'right', utility: false, location: 'Main gearbox housing', measurements: ['Main gearbox vibration'], component: 'Drive' },
  { code: 'M08-MS-10', label: 'Drive motor current', kind: 'Current', x: 774, y: 871, side: 'right', utility: false, location: 'Main motor / electrical panel', measurements: ['Drive motor current'], component: 'Drive' },
];

/**
 * The assemblies the drawing names, for the component-details flow.
 *
 * Points are deliberately not associated with parts here. The supplied
 * connection data carries a free-text `location` and no part id, so any
 * mapping between the two would be one this integration invented rather than
 * one the template stated. `location` is kept verbatim instead.
 */
export const DTDC_PART_LABELS: readonly { id: DtdcPartIdentifier; label: string }[] = [
  { id: 'process-ducts', label: 'Process Ducts' },
  { id: 'vessel-shell', label: 'Vessel Shell' },
  { id: 'duct-flange-767-623', label: 'Duct Flange 767 623' },
  { id: 'duct-flange-872-623', label: 'Duct Flange 872 623' },
  { id: 'duct-flange-771-756', label: 'Duct Flange 771 756' },
  { id: 'duct-flange-843-756', label: 'Duct Flange 843 756' },
  { id: 'duct-flange-388-655', label: 'Duct Flange 388 655' },
  { id: 'duct-flange-315-655', label: 'Duct Flange 315 655' },
  { id: 'dt-dc-boundary', label: 'Dt Dc Boundary' },
  { id: 'feed-gate', label: 'Feed Gate' },
  { id: 'air-heater', label: 'Air Heater' },
  { id: 'hot-air-fan', label: 'Hot Air Fan' },
  { id: 'cooling-fan', label: 'Cooling Fan' },
  { id: 'exhaust-cyclone', label: 'Exhaust Cyclone' },
  { id: 'exhaust-fan', label: 'Exhaust Fan' },
  { id: 'steam-inlet', label: 'Steam Inlet' },
  { id: 'meal-discharge', label: 'Meal Discharge' },
  { id: 'drive-shaft', label: 'Drive Shaft' },
  { id: 'main-gearbox', label: 'Main Gearbox' },
  { id: 'main-coupling', label: 'Main Coupling' },
  { id: 'main-motor', label: 'Main Motor' },
];

export function dtdcPointsForComponent(component: DtdcComponent): DtdcPointDefinition[] {
  return DTDC_POINT_REGISTRY.filter((point) => point.component === component);
}
