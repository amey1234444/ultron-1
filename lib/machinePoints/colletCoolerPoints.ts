import type { MeasurementPointKind } from '../machines';

/** Canonical commissioning registry for the 1200 x 1000 Collet Cooler artwork. */

/**
 * The drawing plane the artwork is built on.
 *
 * 1200 x 1000, the same tall frame as the conditioner and the DTDC — a domed
 * vessel standing on legs, with its cyclone carried up beside it.
 */
export const COLLET_COOLER_ARTWORK_WIDTH = 1200;
export const COLLET_COOLER_ARTWORK_HEIGHT = 1000;

/** Named assemblies in the drawing. Mirrors the scene's own part list. */
export type ColletCoolerPartIdentifier =
  | 'air-ducts'
  | 'support-legs'
  | 'vessel'
  | 'feed-inlet'
  | 'bed-window'
  | 'window-fasteners'
  | 'lower-air-plenum'
  | 'cooling-fan'
  | 'exhaust-cyclone'
  | 'exhaust-fan'
  | 'duct-flanges'
  | 'discharge-valve';

/** The machine tree this template builds, in canvas order. */
export const COLLET_COOLER_COMPONENT_ORDER = ['Cooling', 'Exhaust', 'Discharge'] as const;
export type ColletCoolerComponent = (typeof COLLET_COOLER_COMPONENT_ORDER)[number];

export type ColletCoolerPointDefinition = {
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
  component: ColletCoolerComponent;
};

/**
 * Every instrument pad on the drawing.
 *
 * **Supplied with the template, not measured here.** Unlike the flaking mill,
 * cracking mill and conditioner — whose positions had to be written during
 * integration because those templates ship no sensor registry — this one
 * arrives with `data/connections.json`, and these rows are that file. Ids,
 * labels, locations and coordinates are the vendor's, unchanged, so the pads
 * the canvas snaps to are the pads the machine was drawn with.
 *
 * Five points, all process side. A cooler has little to instrument: the two
 * fans that move the air, and the discharge, where the collets leave at a
 * temperature and a moisture that say whether the cooling worked.
 */
export const COLLET_COOLER_POINT_REGISTRY: readonly ColletCoolerPointDefinition[] = [
  { code: 'CC-FAN-COOL-VIB', label: 'Cooling fan vibration', kind: 'Vibration', x: 244, y: 675, side: 'left', utility: false, location: 'Cooling fan bearing', measurements: ['Cooling fan vibration'], component: 'Cooling' },
  { code: 'CC-FAN-EXH-VIB', label: 'Exhaust fan vibration', kind: 'Vibration', x: 1043, y: 224, side: 'right', utility: false, location: 'Exhaust fan bearing', measurements: ['Exhaust fan vibration'], component: 'Exhaust' },
  { code: 'CC-DISCH-ZS', label: 'Discharge zero-speed', kind: 'Speed', x: 548, y: 864, side: 'left', utility: false, location: 'Discharge valve / grate', measurements: ['Discharge zero-speed'], component: 'Discharge' },
  { code: 'CC-OUT-T', label: 'Collet outlet temperature', kind: 'Temperature', x: 614, y: 864, side: 'right', utility: false, location: 'Discharge valve outlet', measurements: ['Collet outlet temperature'], component: 'Discharge' },
  { code: 'CC-OUT-M', label: 'Collet outlet moisture', kind: 'Moisture', x: 582, y: 909, side: 'left', utility: false, location: 'Product discharge chute', measurements: ['Collet outlet moisture'], component: 'Discharge' },
];

/**
 * The assemblies the drawing names, for the component-details flow.
 *
 * Points are deliberately not associated with parts here. The supplied
 * connection data carries a free-text `location` and no part id, so any
 * mapping between the two would be one this integration invented rather than
 * one the template stated. `location` is kept verbatim instead.
 */
export const COLLET_COOLER_PART_LABELS: readonly { id: ColletCoolerPartIdentifier; label: string }[] = [
  { id: 'air-ducts', label: 'Cooling and exhaust ducts' },
  { id: 'support-legs', label: 'Two support legs and feet' },
  { id: 'vessel', label: 'Domed cooling vessel' },
  { id: 'feed-inlet', label: 'Hot-collet inlet' },
  { id: 'bed-window', label: 'Visible collet bed and bolted inspection frame' },
  { id: 'window-fasteners', label: 'Inspection-frame side fasteners' },
  { id: 'lower-air-plenum', label: 'Lower cooling plenum' },
  { id: 'cooling-fan', label: 'Cooling fan, motor and base' },
  { id: 'exhaust-cyclone', label: 'Exhaust cyclone and dust outlet' },
  { id: 'exhaust-fan', label: 'Exhaust fan and drive' },
  { id: 'duct-flanges', label: 'Duct coupling flanges' },
  { id: 'discharge-valve', label: 'Discharge valve and driven shaft' },
];

export function colletCoolerPointsForComponent(component: ColletCoolerComponent): ColletCoolerPointDefinition[] {
  return COLLET_COOLER_POINT_REGISTRY.filter((point) => point.component === component);
}
