import type { MeasurementPointKind } from '../machines';

/** Canonical commissioning registry for the 1200 x 850 Solvent Extractor artwork. */

/**
 * The drawing plane the artwork is built on.
 *
 * 1200 x 850 — the one wide machine in this set. A chain extractor is long
 * and low, and squeezing it onto the 1000-high frame the other three use
 * would distort every proportion in it.
 */
export const SOLVENT_EXTRACTOR_ARTWORK_WIDTH = 1200;
export const SOLVENT_EXTRACTOR_ARTWORK_HEIGHT = 850;

/** Named assemblies in the drawing. Mirrors the scene's own part list. */
export type SolventExtractorPartIdentifier =
  | 'fresh-hexane-inlet'
  | 'vent'
  | 'tail-take-up'
  | 'tail-bearing'
  | 'main-shaft-coupling'
  | 'enclosed-housing'
  | 'inspection-cover-1'
  | 'inspection-cover-2'
  | 'inspection-cover-3'
  | 'inspection-cover-4'
  | 'inspection-cover-5'
  | 'feed-hopper'
  | 'main-drive-gearbox'
  | 'drive-guard'
  | 'main-drive-motor'
  | 'miscella-hopper-1'
  | 'pump-set-1'
  | 'miscella-hopper-2'
  | 'pump-set-2'
  | 'miscella-hopper-3'
  | 'pump-set-3'
  | 'miscella-hopper-4'
  | 'pump-set-4'
  | 'miscella-hopper-5'
  | 'pump-set-5'
  | 'marc-drop-chute'
  | 'marc-conveyor';

/** The machine tree this template builds, in canvas order. */
export const SOLVENT_EXTRACTOR_COMPONENT_ORDER = ['Drive', 'Chain', 'Hoppers', 'Pumps', 'Discharge'] as const;
export type SolventExtractorComponent = (typeof SOLVENT_EXTRACTOR_COMPONENT_ORDER)[number];

export type SolventExtractorPointDefinition = {
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
  component: SolventExtractorComponent;
};

/**
 * Every instrument pad on the drawing.
 *
 * **Supplied with the template.** These rows are `data/connections.json`
 * unchanged.
 *
 * Twenty points, and the five-and-five structure is the machine: five
 * miscella hoppers each with its own pump, so a high level and a seal leak
 * repeat per stage and the stage number is the whole diagnostic value.
 * Flattening them into one "pumps" point would lose which pump.
 *
 * `EX-DRV-01` is one pad carrying three measurements — vibration, torque and
 * current, all off the same drive. It stays one logical point rather than
 * three, because that is how the template defines it and because splitting it
 * to make the count match a scalar channel count would invent instruments
 * that do not exist. `measurements` records all three; `kind` names the one
 * the channel matcher should expect.
 */
/*
 * Eight pads, which is what the reference drawing marks.
 *
 * It used to be twenty: the drawing labels the hopper level "(each stage)"
 * and the two pump measurements "(each pump)", and those were expanded to
 * one pad per hopper and two per pump across five of each. That reads as
 * twenty instruments on a machine the drawing shows eight dots on, and it
 * put nine cards in a column that fits eight.
 *
 * The parenthetical is kept in the label instead. One pad stands for the
 * measurement as the drawing does, and a plant that wires all five hoppers
 * adds the other four itself — which is the right way round, because how
 * many stages a particular extractor has is not something this registry
 * knows.
 */
export const SOLVENT_EXTRACTOR_POINT_REGISTRY: readonly SolventExtractorPointDefinition[] = [
  { code: 'EX-DRV-01', label: 'Drive vibration / torque / current', kind: 'Vibration', x: 1109, y: 232, side: 'right', utility: false, location: 'Main motor / VFD', measurements: ['Vibration', 'Torque', 'Current'], component: 'Drive' },
  { code: 'EX-GBX-01', label: 'Main gearbox vibration', kind: 'Vibration', x: 1005, y: 403, side: 'right', utility: false, location: 'Main gearbox housing', measurements: ['Vibration'], component: 'Drive' },
  { code: 'EX-TAKEUP-01', label: 'Chain take-up position', kind: 'Position', x: 107, y: 385, side: 'left', utility: false, location: 'Tail-end take-up adjuster', measurements: ['Position'], component: 'Chain' },
  { code: 'EX-TAIL-ZS-01', label: 'Tail sprocket zero-speed', kind: 'Speed', x: 159, y: 407, side: 'left', utility: false, location: 'Tail shaft / sprocket', measurements: ['Zero-speed'], component: 'Chain' },
  { code: 'EX-HOP-01-HL', label: 'Hopper high level (each stage)', kind: 'Level', x: 237, y: 523, side: 'left', utility: false, location: 'Miscella hopper', measurements: ['High level'], component: 'Hoppers' },
  { code: 'EX-PMP-01-VIB', label: 'Pump vibration (each pump)', kind: 'Vibration', x: 247, y: 628, side: 'left', utility: false, location: 'Pump bearing / housing', measurements: ['Vibration'], component: 'Pumps' },
  { code: 'EX-PMP-01-LEAK', label: 'Pump seal leak (each pump)', kind: 'Leak', x: 282, y: 644, side: 'left', utility: false, location: 'Pump mechanical seal', measurements: ['Seal leak'], component: 'Pumps' },
  { code: 'EX-MARC-ZS-01', label: 'Marc conveyor zero-speed', kind: 'Speed', x: 1132, y: 683, side: 'right', utility: false, location: 'Marc conveyor drive', measurements: ['Zero-speed'], component: 'Discharge' },
];

/**
 * The assemblies the drawing names, for the component-details flow.
 *
 * Points are deliberately not associated with parts here. The supplied
 * connection data carries a free-text `location` and no part id, so any
 * mapping between the two would be one this integration invented rather than
 * one the template stated. `location` is kept verbatim instead.
 */
export const SOLVENT_EXTRACTOR_PART_LABELS: readonly { id: SolventExtractorPartIdentifier; label: string }[] = [
  { id: 'fresh-hexane-inlet', label: 'Fresh hexane inlet' },
  { id: 'vent', label: 'Vent riser' },
  { id: 'tail-take-up', label: 'Chain take-up adjuster' },
  { id: 'tail-bearing', label: 'Tail sprocket bearing and housing' },
  { id: 'main-shaft-coupling', label: 'Main gearbox output coupling' },
  { id: 'enclosed-housing', label: 'Extraction housing' },
  { id: 'inspection-cover-1', label: 'Inspection cover 1' },
  { id: 'inspection-cover-2', label: 'Inspection cover 2' },
  { id: 'inspection-cover-3', label: 'Inspection cover 3' },
  { id: 'inspection-cover-4', label: 'Inspection cover 4' },
  { id: 'inspection-cover-5', label: 'Inspection cover 5' },
  { id: 'feed-hopper', label: 'Collet feed hopper' },
  { id: 'main-drive-gearbox', label: 'Main drive gearbox' },
  { id: 'drive-guard', label: 'Drive connection guard' },
  { id: 'main-drive-motor', label: 'Main drive motor' },
  { id: 'miscella-hopper-1', label: 'Miscella hopper 1' },
  { id: 'pump-set-1', label: 'Recirculation pump and motor 1' },
  { id: 'miscella-hopper-2', label: 'Miscella hopper 2' },
  { id: 'pump-set-2', label: 'Recirculation pump and motor 2' },
  { id: 'miscella-hopper-3', label: 'Miscella hopper 3' },
  { id: 'pump-set-3', label: 'Recirculation pump and motor 3' },
  { id: 'miscella-hopper-4', label: 'Miscella hopper 4' },
  { id: 'pump-set-4', label: 'Recirculation pump and motor 4' },
  { id: 'miscella-hopper-5', label: 'Miscella hopper 5' },
  { id: 'pump-set-5', label: 'Recirculation pump and motor 5' },
  { id: 'marc-drop-chute', label: 'Wet marc drop chute' },
  { id: 'marc-conveyor', label: 'Marc conveyor to DTDC' },
];

export function solventExtractorPointsForComponent(component: SolventExtractorComponent): SolventExtractorPointDefinition[] {
  return SOLVENT_EXTRACTOR_POINT_REGISTRY.filter((point) => point.component === component);
}
