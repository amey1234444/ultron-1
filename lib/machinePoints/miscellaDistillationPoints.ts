import type { MeasurementPointKind } from '../machines';

/** Canonical commissioning registry for the 2048 x 1100 MiscellaDistillation artwork. */

/**
 * The drawing plane the artwork is built on.
 *
 * 2048 x 1100 — wider and shallower than every template before it. This is a
 * process train drawn end to end rather than a single machine, and squeezing
 * it onto the 1200-wide frame the others use would compress the whole run.
 */
export const MISCELLA_DISTILLATION_ARTWORK_WIDTH = 2048;
export const MISCELLA_DISTILLATION_ARTWORK_HEIGHT = 1100;

/** Named assemblies in the drawing. Mirrors the scene's own part list. */
export type MiscellaDistillationPartIdentifier =
  | 'foundation'
  | 'vapour-header'
  | 'feed-line'
  | 'first-stage-feed'
  | 'first-heating'
  | 'stage-one-vapour-liquid'
  | 'interstage-liquid'
  | 'second-stage-feed'
  | 'second-heating'
  | 'stage-two-vapour-liquid'
  | 'stripper-feed'
  | 'evaporator-1'
  | 'evaporator-2'
  | 'flash-vessel-1'
  | 'flash-vessel-2'
  | 'stripper-base'
  | 'stripper'
  | 'stripping-steam'
  | 'stripper-oil-outlet'
  | 'oil-discharge'
  | 'oil-cooler'
  | 'crude-oil-outlet'
  | 'feed-pump'
  | 'transfer-pump'
  | 'oil-pump';

/** The machine tree this template builds, in process order. */
export const MISCELLA_DISTILLATION_COMPONENT_ORDER = ['Feed', 'Evaporation', 'Stripping', 'Oil'] as const;
export type MiscellaDistillationComponent = (typeof MISCELLA_DISTILLATION_COMPONENT_ORDER)[number];

export type MiscellaDistillationPointDefinition = {
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
  component: MiscellaDistillationComponent;
};

/**
 * Every instrument pad on the drawing.
 *
 * **Supplied with the template** — `data/connections.json` unchanged. The
 * archive measured each dot from its source images to a tenth of a pixel and
 * applied no scaling, so these are the drawing's own coordinates.
 *
 * Thirteen points, and the shape of them is the shape of the process: three
 * pumps each with a vibration and a seal leak, because hexane-bearing miscella
 * leaking at a seal is the hazard rather than the inconvenience; a temperature
 * after each evaporation stage, because the whole point of two stages is that
 * they concentrate in sequence and only the pair tells you whether they did;
 * and a vacuum on the common vapour header, which is what both stages are
 * pulling against.
 *
 * `MD-STEAM-P` and `MD-STRIP-STEAM-F` are the two utility pads — LP steam to
 * the evaporators and stripping steam to the column. The template colours
 * utility blue and process green; that is a category, not a health state.
 */
export const MISCELLA_DISTILLATION_POINT_REGISTRY: readonly MiscellaDistillationPointDefinition[] = [
  { code: 'MD-FEED-VIB', label: "Feed pump vibration", kind: 'Vibration', x: 178.2, y: 939.0, side: 'left', utility: false, location: "Feed pump vibration", measurements: ['vibration'], component: 'Feed' },
  { code: 'MD-FEED-LEAK', label: "Feed pump seal leak", kind: 'Leak', x: 161.4, y: 965.6, side: 'left', utility: false, location: "Feed pump seal leak", measurements: ['seal_leak'], component: 'Feed' },
  { code: 'MD-EVAP-1-T', label: "Miscella temperature after first evaporator", kind: 'Temperature', x: 447.8, y: 283.1, side: 'left', utility: false, location: "Miscella temperature after first evaporator", measurements: ['temperature'], component: 'Evaporation' },
  { code: 'MD-TRANSFER-VIB', label: "Transfer pump vibration", kind: 'Vibration', x: 737.4, y: 939.1, side: 'left', utility: false, location: "Transfer pump vibration", measurements: ['vibration'], component: 'Evaporation' },
  { code: 'MD-TRANSFER-LEAK', label: "Transfer pump seal leak", kind: 'Leak', x: 720.6, y: 965.7, side: 'left', utility: false, location: "Transfer pump seal leak", measurements: ['seal_leak'], component: 'Evaporation' },
  { code: 'MD-EVAP-2-T', label: "Miscella temperature after second evaporator", kind: 'Temperature', x: 962.3, y: 283.2, side: 'left', utility: false, location: "Miscella temperature after second evaporator", measurements: ['temperature'], component: 'Evaporation' },
  { code: 'MD-STEAM-P', label: "Evaporator LP steam pressure", kind: 'Pressure', x: 800.2, y: 438.7, side: 'left', utility: true, location: "Evaporator LP steam pressure", measurements: ['pressure'], component: 'Evaporation' },
  { code: 'MD-VACUUM-P', label: "Common vapour header vacuum pressure", kind: 'Pressure', x: 1695.1, y: 149.8, side: 'right', utility: false, location: "Common vapour header vacuum pressure", measurements: ['pressure'], component: 'Evaporation' },
  { code: 'MD-STRIPPER-OIL-T', label: "Stripper oil outlet temperature", kind: 'Temperature', x: 1454.6, y: 939.1, side: 'right', utility: false, location: "Stripper oil outlet temperature", measurements: ['temperature'], component: 'Stripping' },
  { code: 'MD-OIL-VIB', label: "Oil pump vibration", kind: 'Vibration', x: 1587.6, y: 939.0, side: 'right', utility: false, location: "Oil pump vibration", measurements: ['vibration'], component: 'Oil' },
  { code: 'MD-OIL-LEAK', label: "Oil pump seal leak", kind: 'Leak', x: 1570.9, y: 965.6, side: 'right', utility: false, location: "Oil pump seal leak", measurements: ['seal_leak'], component: 'Oil' },
  { code: 'MD-STRIP-STEAM-F', label: "Stripping steam flow", kind: 'Flow', x: 1532.9, y: 794.3, side: 'right', utility: true, location: "Stripping steam flow", measurements: ['flow'], component: 'Stripping' },
  { code: 'MD-CRUDE-OIL-T', label: "Crude oil temperature after cooler", kind: 'Temperature', x: 2014.0, y: 872.3, side: 'right', utility: false, location: "Crude oil temperature after cooler", measurements: ['temperature'], component: 'Oil' },
];

/**
 * The assemblies the drawing names, for the component-details flow.
 *
 * Points are deliberately not associated with parts: the supplied data gives
 * no part id per point, so the mapping would be invented here rather than
 * stated by the template.
 */
export const MISCELLA_DISTILLATION_PART_LABELS: readonly { id: MiscellaDistillationPartIdentifier; label: string }[] = [
  { id: 'foundation', label: "Equipment floor datum" },
  { id: 'vapour-header', label: "Common hexane vapour header to solvent recovery" },
  { id: 'feed-line', label: "Miscella tank to feed pump" },
  { id: 'first-stage-feed', label: "Feed pump discharge into first evaporator" },
  { id: 'first-heating', label: "DTDC vapour heating inlet and condensate outlet" },
  { id: 'stage-one-vapour-liquid', label: "First evaporator outlet to flash vessel 1" },
  { id: 'interstage-liquid', label: "Flash vessel 1 liquid to transfer pump" },
  { id: 'second-stage-feed', label: "Transfer pump discharge into second evaporator" },
  { id: 'second-heating', label: "LP steam supply and condensate trap" },
  { id: 'stage-two-vapour-liquid', label: "Second evaporator outlet to flash vessel 2" },
  { id: 'stripper-feed', label: "Flash vessel 2 concentrated oil to stripper" },
  { id: 'evaporator-1', label: "Evaporator 1: shell, flanges and illustrative tube cutaway" },
  { id: 'evaporator-2', label: "Evaporator 2: shell, flanges and illustrative tube cutaway" },
  { id: 'flash-vessel-1', label: "Flash vessel 1 and demister cutaway" },
  { id: 'flash-vessel-2', label: "Flash vessel 2 and demister cutaway" },
  { id: 'stripper-base', label: "Oil stripper support skirt" },
  { id: 'stripper', label: "Oil stripper shell and tray cutaway" },
  { id: 'stripping-steam', label: "Stripping steam inlet" },
  { id: 'stripper-oil-outlet', label: "Stripper bottom oil outlet to oil pump" },
  { id: 'oil-discharge', label: "Oil pump discharge to cooler" },
  { id: 'oil-cooler', label: "Shell-and-tube crude oil cooler" },
  { id: 'crude-oil-outlet', label: "Cooled oil outlet to storage tanks" },
  { id: 'feed-pump', label: "Feed Pump with seal, coupling, motor and skid" },
  { id: 'transfer-pump', label: "Transfer Pump with seal, coupling, motor and skid" },
  { id: 'oil-pump', label: "Oil Pump with seal, coupling, motor and skid" },
];

export function miscellaDistillationPointsForComponent(component: MiscellaDistillationComponent): MiscellaDistillationPointDefinition[] {
  return MISCELLA_DISTILLATION_POINT_REGISTRY.filter((point) => point.component === component);
}
