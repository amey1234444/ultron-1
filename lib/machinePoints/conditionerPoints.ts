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
 * Every instrument pad on the drawing.
 *
 * Eight, down from eighteen. Two deck temperatures rather than six: the
 * profile down the stack is the process, and the top and the bottom of it
 * describe that profile — four more points between them measure the same
 * curve at finer resolution than a fault needs. The agitator reports
 * vibration and current, the steam side reports header pressure and
 * condensate temperature (a cold return is a trap that has failed open), the
 * exhaust fan reports vibration, and the discharge reports the temperature
 * the meal actually leaves at.
 *
 * These positions were not supplied with the template — no reference drawing
 * for this machine ships a sensor overlay — so the set is a proposal, chosen
 * the way the drawings that *do* ship one choose theirs: what has to be
 * watched for the machine to be diagnosable, and nothing that is merely
 * available. The reference drawings for the eleven machines that have them
 * mark between three and fourteen pads each and caption them "minimum
 * sensors"; this follows that, rather than instrumenting every part that
 * could carry a transducer.
 *
 * Where a bearing is watched it carries vibration *and* temperature on one
 * pad, as the hammer mill's rotor bearings and the flaking mill's rolls
 * already do here: the temperature says it is failing and the vibration says
 * how.
 *
 * Coordinates are unchanged from the fuller set — each was measured off the
 * drawn geometry, so every surviving pad still lands inside the part it names.
 *
 * **Nobody has confirmed this against a real machine.** Treat it as a
 * commissioning proposal.
 */
export const CONDITIONER_POINT_REGISTRY: readonly ConditionerPointDefinition[] = [
  { code: 'CD_AGITATOR_VIB', label: 'Agitator Drive Vibration', kind: 'Vibration', x: 586, y: 180, side: 'left', part: 'agitator-drive', component: 'Agitator' },
  { code: 'CD_AGITATOR_CURRENT', label: 'Agitator Drive Current', kind: 'Current', x: 650, y: 220, side: 'left', part: 'agitator-drive', component: 'Agitator' },
  { code: 'CD_DECK_2_TEMP', label: 'Upper Deck Product Temperature', kind: 'Temperature', x: 552, y: 438, side: 'right', part: 'deck-2', component: 'Decks' },
  { code: 'CD_DECK_5_TEMP', label: 'Lower Deck Product Temperature', kind: 'Temperature', x: 537, y: 702, side: 'left', part: 'deck-5', component: 'Decks' },
  { code: 'CD_STEAM_PRESSURE', label: 'Steam Header Pressure', kind: 'Pressure', x: 910, y: 400, side: 'right', part: 'steam-header', component: 'Steam' },
  { code: 'CD_CONDENSATE_TEMP', label: 'Condensate Return Temperature', kind: 'Temperature', x: 277, y: 618, side: 'left', part: 'condensate-return', component: 'Steam' },
  { code: 'CD_FAN_VIB', label: 'Exhaust Fan Vibration', kind: 'Vibration', x: 915, y: 104, side: 'right', part: 'fan-drive', component: 'Vapour' },
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
