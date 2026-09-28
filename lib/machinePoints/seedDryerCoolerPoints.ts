import type { MeasurementPointKind } from '../machines';

/** Canonical commissioning registry for the 1200 x 1000 Seed Dryer Cooler artwork. */

/**
 * The drawing plane the artwork is built on.
 *
 * 1200 x 1000. A rectangular column with the drying zone above the cooling
 * zone, the steam air heater standing beside it and the ductwork running
 * between the two.
 */
export const SEED_DRYER_COOLER_ARTWORK_WIDTH = 1200;
export const SEED_DRYER_COOLER_ARTWORK_HEIGHT = 1000;

/** Named assemblies in the drawing. Mirrors the scene's own part list. */
export type SeedDryerCoolerPartIdentifier =
  | 'air-ducts'
  | 'support-legs'
  | 'tower'
  | 'drying-zone'
  | 'cooling-zone'
  | 'zone-divider'
  | 'tower-fasteners'
  | 'discharge-cone'
  | 'outlet-drive'
  | 'exhaust-cyclone'
  | 'exhaust-fan'
  | 'hot-air-heater'
  | 'steam-inlet'
  | 'condensate-outlet'
  | 'hot-air-fan'
  | 'cooling-fan'
  | 'duct-flanges';

/** The machine tree this template builds, in canvas order. */
export const SEED_DRYER_COOLER_COMPONENT_ORDER = ['Heating', 'Cooling', 'Exhaust', 'Steam', 'Discharge'] as const;
export type SeedDryerCoolerComponent = (typeof SEED_DRYER_COOLER_COMPONENT_ORDER)[number];

export type SeedDryerCoolerPointDefinition = {
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
  component: SeedDryerCoolerComponent;
};

/**
 * Every instrument pad on the drawing.
 *
 * **Supplied with the template.** These rows are `data/connections.json`
 * unchanged.
 *
 * Eight points, six process and two utility. `SD-EXH-CO` is not a process
 * measurement at all — it is a carbon-monoxide detector in the exhaust duct,
 * there because a seed dryer that starts to smoulder announces itself as CO
 * long before anything else moves. It is kept as its own kind for that
 * reason: nothing should ever offer it a temperature channel.
 */
export const SEED_DRYER_COOLER_POINT_REGISTRY: readonly SeedDryerCoolerPointDefinition[] = [
  { code: 'SD-EXH-CO', label: 'CO gas detection', kind: 'Gas', x: 368, y: 237, side: 'left', utility: false, location: 'Dryer exhaust duct', measurements: ['CO gas detection'], component: 'Exhaust' },
  { code: 'SD-EXH-VIB', label: 'Exhaust fan vibration', kind: 'Vibration', x: 132, y: 304, side: 'left', utility: false, location: 'Exhaust fan bearing', measurements: ['Exhaust fan vibration'], component: 'Exhaust' },
  { code: 'SD-AIR-T', label: 'Hot-air temperature', kind: 'Temperature', x: 785, y: 475, side: 'right', utility: false, location: 'Heater outlet duct', measurements: ['Hot-air temperature'], component: 'Heating' },
  { code: 'SD-HOT-VIB', label: 'Hot-air fan vibration', kind: 'Vibration', x: 1068, y: 451, side: 'right', utility: false, location: 'Hot-air fan bearing', measurements: ['Hot-air fan vibration'], component: 'Heating' },
  { code: 'SD-COOL-VIB', label: 'Cooling fan vibration', kind: 'Vibration', x: 933, y: 675, side: 'right', utility: false, location: 'Cooling fan bearing', measurements: ['Cooling fan vibration'], component: 'Cooling' },
  { code: 'SD-SEED-M', label: 'Seed outlet moisture', kind: 'Moisture', x: 579, y: 902, side: 'left', utility: false, location: 'Seed discharge', measurements: ['Seed outlet moisture'], component: 'Discharge' },
  { code: 'SD-STEAM-P', label: 'Steam supply pressure', kind: 'Pressure', x: 897, y: 359, side: 'right', utility: true, location: 'Air-heater steam inlet', measurements: ['Steam supply pressure'], component: 'Steam' },
  { code: 'SD-TRAP', label: 'Steam trap monitor', kind: 'Leak', x: 928, y: 572, side: 'right', utility: true, location: 'Heater condensate outlet', measurements: ['Steam trap monitor'], component: 'Steam' },
];

/**
 * The assemblies the drawing names, for the component-details flow.
 *
 * Points are deliberately not associated with parts here. The supplied
 * connection data carries a free-text `location` and no part id, so any
 * mapping between the two would be one this integration invented rather than
 * one the template stated. `location` is kept verbatim instead.
 */
export const SEED_DRYER_COOLER_PART_LABELS: readonly { id: SeedDryerCoolerPartIdentifier; label: string }[] = [
  { id: 'air-ducts', label: 'Drying, cooling and exhaust ductwork' },
  { id: 'support-legs', label: 'Two tower support legs' },
  { id: 'tower', label: 'Rectangular dryer-cooler column' },
  { id: 'drying-zone', label: 'Drying-zone air channels' },
  { id: 'cooling-zone', label: 'Cooling-zone air channels' },
  { id: 'zone-divider', label: 'Drying/cooling zone boundary flange' },
  { id: 'tower-fasteners', label: 'Column perimeter fasteners' },
  { id: 'discharge-cone', label: 'Seed discharge cone' },
  { id: 'outlet-drive', label: 'Seed metering outlet and drive' },
  { id: 'exhaust-cyclone', label: 'Exhaust cyclone' },
  { id: 'exhaust-fan', label: 'Exhaust fan and drive' },
  { id: 'hot-air-heater', label: 'Steam air heater' },
  { id: 'steam-inlet', label: 'Steam inlet and isolation valve' },
  { id: 'condensate-outlet', label: 'Condensate outlet and trap' },
  { id: 'hot-air-fan', label: 'Hot-air fan and motor' },
  { id: 'cooling-fan', label: 'Cooling fan and motor' },
  { id: 'duct-flanges', label: 'Bolted duct flanges' },
];

export function seedDryerCoolerPointsForComponent(component: SeedDryerCoolerComponent): SeedDryerCoolerPointDefinition[] {
  return SEED_DRYER_COOLER_POINT_REGISTRY.filter((point) => point.component === component);
}
