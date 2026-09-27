/** Canonical commissioning registry for the 1200 x 1000 Conditioner E-102 artwork. */

/**
 * The drawing plane the artwork is built on.
 *
 * 1200 x 1000. This is the tallest machine in the set — a vertical vessel with
 * six stacked decks, a steam header beside it and a vapour duct above — and the
 * template says not to stretch it onto the expander's wider stage.
 */
export const CONDITIONER_ARTWORK_WIDTH = 1200;
export const CONDITIONER_ARTWORK_HEIGHT = 1000;

/** Named assemblies in the drawing. Mirrors the scene's own part list. */
export type ConditionerPartIdentifier =
  | 'vessel' | 'agitator-drive' | 'agitator-shaft'
  | 'deck-1' | 'deck-2' | 'deck-3' | 'deck-4' | 'deck-5' | 'deck-6'
  | 'steam-header' | 'steam-control-valve' | 'steam-inline-device'
  | 'condensate-return' | 'top-injection' | 'vapour-duct' | 'exhaust-fan'
  | 'fan-drive' | 'discharge-cone' | 'discharge-device' | 'discharge-drive' | 'material-flow';

/**
 * The machine tree this template builds.
 *
 * The six decks are one component rather than six. They are one product path
 * through one vessel on one shaft, and a temperature on deck 4 is only
 * meaningful as part of the profile down the stack — unlike the cracking
 * mill's two stages, which are independently driven and can fail separately.
 */
export const CONDITIONER_COMPONENT_ORDER = ['Agitator', 'Decks', 'Steam', 'Vapour', 'Discharge'] as const;
export type ConditionerComponent = (typeof CONDITIONER_COMPONENT_ORDER)[number];

export type ConditionerPointKind = 'Vibration' | 'Temperature' | 'Speed' | 'Pressure' | 'Current' | 'Level';

export type ConditionerPointDefinition = {
  code: string;
  label: string;
  kind: ConditionerPointKind;
  x: number;
  y: number;
  side: 'left' | 'right';
  part: ConditionerPartIdentifier;
  component: ConditionerComponent;
};

/**
 * Every instrument pad on the drawing, at the spot where that instrument sits.
 *
 * **Written during integration, not supplied** — this template ships no sensor
 * registry either. Positions come from the drawn geometry, measured per
 * assembly, so each pad lands inside the part it names: the six decks at
 * y 307..393, 395..481, 483..569, 571..657, 659..745 and 747..811, the agitator
 * drive at (491..680, 165..234), the fan motor at (874..956, 77..130).
 *
 * The selection follows how a steam conditioner is actually run: one product
 * temperature per deck, because the profile down the stack *is* the process;
 * vibration, temperature and current on the agitator drive with a shaft speed;
 * header pressure and control-valve position on the steam side, with a
 * condensate return temperature that shows whether traps are passing; fan
 * speed, fan vibration and duct temperature on the vapour side; and speed plus
 * product temperature at the discharge.
 *
 * Two labels are hedged on purpose, because the source drawing does not
 * identify the equipment: the discharge device's type is unconfirmed, and the
 * condensate line is described by the template as a *likely* return. The pads
 * are named for what they measure rather than for an unverified part function.
 *
 * **Nobody has confirmed any of this against a real E-102.** No analyzer tags
 * are set; no model here is commissioned on this machine.
 */
export const CONDITIONER_POINT_REGISTRY: readonly ConditionerPointDefinition[] = [
  // Agitator drive and the shaft common to all six decks.
  { code: 'CD_AGITATOR_VIB', label: 'Agitator Drive Vibration', kind: 'Vibration', x: 586, y: 180, side: 'left', part: 'agitator-drive', component: 'Agitator' },
  { code: 'CD_AGITATOR_TEMP', label: 'Agitator Drive Temperature', kind: 'Temperature', x: 520, y: 220, side: 'left', part: 'agitator-drive', component: 'Agitator' },
  { code: 'CD_AGITATOR_CURRENT', label: 'Agitator Drive Current', kind: 'Current', x: 650, y: 220, side: 'left', part: 'agitator-drive', component: 'Agitator' },
  { code: 'CD_AGITATOR_SPEED', label: 'Agitator Shaft Speed', kind: 'Speed', x: 545, y: 400, side: 'left', part: 'agitator-shaft', component: 'Agitator' },
  // One product temperature per deck: the profile down the stack is the process.
  { code: 'CD_DECK_1_TEMP', label: 'Deck 1 Product Temperature', kind: 'Temperature', x: 537, y: 350, side: 'left', part: 'deck-1', component: 'Decks' },
  { code: 'CD_DECK_2_TEMP', label: 'Deck 2 Product Temperature', kind: 'Temperature', x: 552, y: 438, side: 'right', part: 'deck-2', component: 'Decks' },
  { code: 'CD_DECK_3_TEMP', label: 'Deck 3 Product Temperature', kind: 'Temperature', x: 537, y: 526, side: 'left', part: 'deck-3', component: 'Decks' },
  { code: 'CD_DECK_4_TEMP', label: 'Deck 4 Product Temperature', kind: 'Temperature', x: 552, y: 614, side: 'right', part: 'deck-4', component: 'Decks' },
  { code: 'CD_DECK_5_TEMP', label: 'Deck 5 Product Temperature', kind: 'Temperature', x: 537, y: 702, side: 'left', part: 'deck-5', component: 'Decks' },
  { code: 'CD_DECK_6_TEMP', label: 'Deck 6 Product Temperature', kind: 'Temperature', x: 552, y: 779, side: 'right', part: 'deck-6', component: 'Decks' },
  // Steam side.
  { code: 'CD_STEAM_PRESSURE', label: 'Steam Header Pressure', kind: 'Pressure', x: 910, y: 400, side: 'right', part: 'steam-header', component: 'Steam' },
  { code: 'CD_STEAM_VALVE_POS', label: 'Steam Control Valve Position', kind: 'Level', x: 887, y: 273, side: 'right', part: 'steam-control-valve', component: 'Steam' },
  { code: 'CD_CONDENSATE_TEMP', label: 'Condensate Return Temperature', kind: 'Temperature', x: 277, y: 618, side: 'left', part: 'condensate-return', component: 'Steam' },
  // Vapour extraction.
  { code: 'CD_FAN_VIB', label: 'Exhaust Fan Vibration', kind: 'Vibration', x: 915, y: 104, side: 'right', part: 'fan-drive', component: 'Vapour' },
  { code: 'CD_FAN_SPEED', label: 'Exhaust Fan Speed', kind: 'Speed', x: 839, y: 106, side: 'right', part: 'exhaust-fan', component: 'Vapour' },
  { code: 'CD_DUCT_TEMP', label: 'Vapour Duct Temperature', kind: 'Temperature', x: 762, y: 133, side: 'right', part: 'vapour-duct', component: 'Vapour' },
  // Discharge.
  { code: 'CD_DISCHARGE_SPEED', label: 'Discharge Drive Speed', kind: 'Speed', x: 453, y: 887, side: 'left', part: 'discharge-drive', component: 'Discharge' },
  { code: 'CD_DISCHARGE_TEMP', label: 'Discharge Product Temperature', kind: 'Temperature', x: 545, y: 889, side: 'left', part: 'discharge-device', component: 'Discharge' },
];

/** Human labels for the named assemblies, for part selection on the canvas. */
export const CONDITIONER_PART_LABELS: readonly { id: ConditionerPartIdentifier; label: string }[] = [
  { id: 'vessel', label: 'Vertical Vessel' },
  { id: 'agitator-drive', label: 'Agitator Drive' },
  { id: 'agitator-shaft', label: 'Agitator Shaft' },
  { id: 'deck-1', label: 'Deck 1' },
  { id: 'deck-2', label: 'Deck 2' },
  { id: 'deck-3', label: 'Deck 3' },
  { id: 'deck-4', label: 'Deck 4' },
  { id: 'deck-5', label: 'Deck 5' },
  { id: 'deck-6', label: 'Deck 6' },
  { id: 'steam-header', label: 'Steam Header' },
  { id: 'steam-control-valve', label: 'Steam Control Valve' },
  { id: 'steam-inline-device', label: 'Inline Steam Device' },
  { id: 'condensate-return', label: 'Condensate Return' },
  { id: 'top-injection', label: 'Top Injection' },
  { id: 'vapour-duct', label: 'Vapour Duct' },
  { id: 'exhaust-fan', label: 'Exhaust Fan' },
  { id: 'fan-drive', label: 'Fan Motor' },
  { id: 'discharge-cone', label: 'Discharge Cone' },
  { id: 'discharge-device', label: 'Discharge Device' },
  { id: 'discharge-drive', label: 'Discharge Motor' },
  { id: 'material-flow', label: 'Material Flow' },
];

/** The points that belong to one component of the machine tree, in registry order. */
export function conditionerPointsForComponent(component: ConditionerComponent): ConditionerPointDefinition[] {
  return CONDITIONER_POINT_REGISTRY.filter((point) => point.component === component);
}
