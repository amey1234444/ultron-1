import type { MeasurementPointKind } from '../machines';

/** Canonical commissioning registry for the 2048 x 1100 SolventRecovery artwork. */

/**
 * The drawing plane the artwork is built on.
 *
 * 2048 x 1100 — wider and shallower than every template before it. This is a
 * process train drawn end to end rather than a single machine, and squeezing
 * it onto the 1200-wide frame the others use would compress the whole run.
 */
export const SOLVENT_RECOVERY_ARTWORK_WIDTH = 2048;
export const SOLVENT_RECOVERY_ARTWORK_HEIGHT = 1100;

/** Named assemblies in the drawing. Mirrors the scene's own part list. */
export type SolventRecoveryPartIdentifier =
  | 'foundation'
  | 'condenser-rack'
  | 'vapour-header'
  | 'cw-supply'
  | 'cw-return'
  | 'condensate-header'
  | 'condenser-1'
  | 'condenser-2'
  | 'condenser-3'
  | 'separator-support'
  | 'separator'
  | 'separator-water'
  | 'separator-hexane'
  | 'waste-water-boiler'
  | 'work-tank-support'
  | 'work-tank'
  | 'hexane-suction'
  | 'hexane-discharge'
  | 'hexane-heater'
  | 'hexane-return'
  | 'hexane-pump'
  | 'ejector-suction'
  | 'ejector'
  | 'motive-steam'
  | 'vent-condenser'
  | 'vent-gas'
  | 'absorber-base'
  | 'absorber'
  | 'vent-fan-inlet'
  | 'vent-fan'
  | 'lean-oil-line'
  | 'rich-oil-suction'
  | 'rich-oil-discharge'
  | 'mineral-heater'
  | 'mineral-stripper'
  | 'mineral-cooler-return'
  | 'mineral-cooler'
  | 'mineral-oil-pump';

/** The machine tree this template builds, in process order. */
export const SOLVENT_RECOVERY_COMPONENT_ORDER = ['Condensing', 'Separation', 'Hexane', 'Absorber'] as const;
export type SolventRecoveryComponent = (typeof SOLVENT_RECOVERY_COMPONENT_ORDER)[number];

export type SolventRecoveryPointDefinition = {
  code: string;
  label: string;
  kind: MeasurementPointKind;
  x: number;
  y: number;
  side: 'left' | 'right';
  /** True for steam and cooling-water pads, which the template draws blue. */
  utility: boolean;
  location: string;
  /** Every quantity this one pad carries. `kind` names the one to match on. */
  measurements: readonly string[];
  component: SolventRecoveryComponent;
};

/**
 * Every instrument pad on the drawing.
 *
 * **Supplied with the template** — `data/connections.json` unchanged, measured
 * by the archive from its source images with no scaling applied.
 *
 * Fourteen points, four of them utility: cooling water in and out with its
 * supply pressure, and the ejector's motive steam. Both cooling-water
 * temperatures are kept rather than one, because a condenser is judged on the
 * rise across it and a single reading cannot show a rise.
 *
 * `SR-VENT-LEL` is the one that is not a process measurement at all. It is a
 * lower-explosive-limit detector on the vent, and on a hexane plant it is the
 * instrument that decides whether anyone is still allowed to be standing
 * there. It is kept as `Gas` for that reason: nothing should ever be able to
 * satisfy it with a temperature channel.
 *
 * `SR-INTERFACE-L` measures where the hexane sits on top of the water in the
 * separator, which is a different quantity from `SR-WORK-L`'s tank level even
 * though both are levels — one is a boundary between two liquids, the other
 * is how full something is.
 */
export const SOLVENT_RECOVERY_POINT_REGISTRY: readonly SolventRecoveryPointDefinition[] = [
  { code: 'SR-CW-P', label: "Cooling-water supply pressure", kind: 'Pressure', x: 846.7, y: 128.6, side: 'left', utility: true, location: "Cooling-water supply pressure", measurements: ['pressure'], component: 'Condensing' },
  { code: 'SR-CW-IN-T', label: "Cooling-water supply temperature", kind: 'Temperature', x: 909.0, y: 128.6, side: 'left', utility: true, location: "Cooling-water supply temperature", measurements: ['temperature'], component: 'Condensing' },
  { code: 'SR-CW-OUT-T', label: "Cooling-water return temperature", kind: 'Temperature', x: 909.0, y: 365.9, side: 'left', utility: true, location: "Cooling-water return temperature", measurements: ['temperature'], component: 'Condensing' },
  { code: 'SR-EJECTOR-P', label: "Ejector motive steam pressure", kind: 'Pressure', x: 1012.7, y: 262.8, side: 'left', utility: true, location: "Ejector motive steam pressure", measurements: ['pressure'], component: 'Condensing' },
  { code: 'SR-INTERFACE-L', label: "Separator hexane-water interface level", kind: 'Level', x: 244.4, y: 611.6, side: 'left', utility: false, location: "Separator hexane-water interface level", measurements: ['interface_level'], component: 'Separation' },
  { code: 'SR-WORK-L', label: "Work tank level", kind: 'Level', x: 680.5, y: 706.6, side: 'left', utility: false, location: "Work tank level", measurements: ['level'], component: 'Separation' },
  { code: 'SR-WASTE-T', label: "Waste-water boiler temperature", kind: 'Temperature', x: 285.8, y: 850.9, side: 'left', utility: false, location: "Waste-water boiler temperature", measurements: ['temperature'], component: 'Separation' },
  { code: 'SR-HEXANE-VIB', label: "Hexane pump vibration", kind: 'Vibration', x: 767.7, y: 871.7, side: 'left', utility: false, location: "Hexane pump vibration", measurements: ['vibration'], component: 'Hexane' },
  { code: 'SR-HEXANE-LEAK', label: "Hexane pump seal leak", kind: 'Leak', x: 752.2, y: 896.4, side: 'left', utility: false, location: "Hexane pump seal leak", measurements: ['seal_leak'], component: 'Hexane' },
  { code: 'SR-HEXANE-T', label: "Hexane temperature after heater", kind: 'Temperature', x: 1293.4, y: 768.6, side: 'right', utility: false, location: "Hexane temperature after heater", measurements: ['temperature'], component: 'Hexane' },
  { code: 'SR-MINERAL-VIB', label: "Mineral-oil pump vibration", kind: 'Vibration', x: 1681.7, y: 871.7, side: 'right', utility: false, location: "Mineral-oil pump vibration", measurements: ['vibration'], component: 'Absorber' },
  { code: 'SR-LEAN-T', label: "Lean mineral-oil temperature", kind: 'Temperature', x: 1677.6, y: 304.0, side: 'right', utility: false, location: "Lean mineral-oil temperature", measurements: ['temperature'], component: 'Absorber' },
  { code: 'SR-VENT-VIB', label: "Vent fan vibration", kind: 'Vibration', x: 1656.8, y: 138.9, side: 'right', utility: false, location: "Vent fan vibration", measurements: ['vibration'], component: 'Absorber' },
  { code: 'SR-VENT-LEL', label: "Vent hexane LEL", kind: 'Gas', x: 1684.9, y: 41.0, side: 'right', utility: false, location: "Vent hexane LEL", measurements: ['LEL'], component: 'Absorber' },
];

/**
 * The assemblies the drawing names, for the component-details flow.
 *
 * Points are deliberately not associated with parts: the supplied data gives
 * no part id per point, so the mapping would be invented here rather than
 * stated by the template.
 */
export const SOLVENT_RECOVERY_PART_LABELS: readonly { id: SolventRecoveryPartIdentifier; label: string }[] = [
  { id: 'foundation', label: "Equipment floor datum" },
  { id: 'condenser-rack', label: "Condenser support rack" },
  { id: 'vapour-header', label: "Vapour inlet and parallel condenser branches" },
  { id: 'cw-supply', label: "Cooling-water supply header and branches" },
  { id: 'cw-return', label: "Cooling-water return branches and header" },
  { id: 'condensate-header', label: "Condensate from all three condensers into separator" },
  { id: 'condenser-1', label: "Condenser 1 shell, covers, flanges and saddles" },
  { id: 'condenser-2', label: "Condenser 2 shell, covers, flanges and saddles" },
  { id: 'condenser-3', label: "Condenser 3 shell, covers, flanges and saddles" },
  { id: 'separator-support', label: "Separator support frame" },
  { id: 'separator', label: "Water-solvent separator and schematic interface cutaway" },
  { id: 'separator-water', label: "Separator water drain into waste-water boiler" },
  { id: 'separator-hexane', label: "Separated solvent outlet into work tank" },
  { id: 'waste-water-boiler', label: "Waste-water boiler, steam inlet and water outlet" },
  { id: 'work-tank-support', label: "Work tank support legs" },
  { id: 'work-tank', label: "Solvent work tank" },
  { id: 'hexane-suction', label: "Work tank bottom outlet to hexane pump" },
  { id: 'hexane-discharge', label: "Hexane pump discharge into heater" },
  { id: 'hexane-heater', label: "Hexane heater, steam nozzle and support legs" },
  { id: 'hexane-return', label: "Heated hexane outlet to extractor" },
  { id: 'hexane-pump', label: "Hexane pump with motor and leakage drain" },
  { id: 'ejector-suction', label: "Vacuum take-off into steam ejector" },
  { id: 'ejector', label: "Steam ejector body, nozzle and diffuser" },
  { id: 'motive-steam', label: "Ejector motive steam supply" },
  { id: 'vent-condenser', label: "Vent condenser" },
  { id: 'vent-gas', label: "Vent condenser gas outlet into absorber" },
  { id: 'absorber-base', label: "Vent absorber support skirt" },
  { id: 'absorber', label: "Mineral-oil vent absorber and packed-bed cutaway" },
  { id: 'vent-fan-inlet', label: "Absorber overhead gas to vent fan inlet" },
  { id: 'vent-fan', label: "Vent fan, drive motor and exhaust stack" },
  { id: 'lean-oil-line', label: "Lean mineral oil cooler outlet to absorber" },
  { id: 'rich-oil-suction', label: "Absorber rich-oil bottom outlet to mineral-oil pump" },
  { id: 'rich-oil-discharge', label: "Mineral-oil pump discharge to heater and stripper" },
  { id: 'mineral-heater', label: "Mineral-oil heater" },
  { id: 'mineral-stripper', label: "Mineral-oil stripper and tray cutaway" },
  { id: 'mineral-cooler-return', label: "Stripper bottom outlet into mineral-oil cooler" },
  { id: 'mineral-cooler', label: "Mineral-oil cooler" },
  { id: 'mineral-oil-pump', label: "Mineral-oil circulation pump and drive" },
];

export function solventRecoveryPointsForComponent(component: SolventRecoveryComponent): SolventRecoveryPointDefinition[] {
  return SOLVENT_RECOVERY_POINT_REGISTRY.filter((point) => point.component === component);
}
