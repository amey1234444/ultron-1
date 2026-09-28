import {
  CONDITIONER_COMPONENT_ORDER,
  conditionerPointsForComponent,
  type ConditionerComponent,
} from './machinePoints/conditionerPoints';
import {
  AUTO_BAGGER_COMPONENT_ORDER,
  autoBaggerPointsForComponent,
  type AutoBaggerComponent,
} from './machinePoints/autoBaggerPoints';
import {
  COLLET_COOLER_COMPONENT_ORDER,
  colletCoolerPointsForComponent,
  type ColletCoolerComponent,
} from './machinePoints/colletCoolerPoints';
import {
  CRACKING_MILL_COMPONENT_ORDER,
  crackingMillPointsForComponent,
  type CrackingMillComponent,
} from './machinePoints/crackingMillPoints';
import {
  EXPANDER_COMPONENT_ORDER,
  expanderPointsForComponent,
  type ExpanderComponent,
} from './machinePoints/expanderPoints';
import {
  DTDC_COMPONENT_ORDER,
  dtdcPointsForComponent,
  type DtdcComponent,
} from './machinePoints/dtdcPoints';
import { EXTRUDER_POINT_REGISTRY } from './machinePoints/extruderPoints';
import {
  HAMMER_MILL_COMPONENT_ORDER,
  hammerMillPointsForComponent,
  type HammerMillComponent,
} from './machinePoints/hammerMillPoints';
import {
  MEAL_CONVEYING_STORAGE_COMPONENT_ORDER,
  mealConveyingStoragePointsForComponent,
  type MealConveyingStorageComponent,
} from './machinePoints/mealConveyingStoragePoints';
import {
  MEAL_SIFTER_COMPONENT_ORDER,
  mealSifterPointsForComponent,
  type MealSifterComponent,
} from './machinePoints/mealSifterPoints';
import {
  FLAKING_MILL_COMPONENT_ORDER,
  flakingMillPointsForComponent,
  type FlakingMillComponent,
} from './machinePoints/flakingMillPoints';
import {
  SEED_DRYER_COOLER_COMPONENT_ORDER,
  seedDryerCoolerPointsForComponent,
  type SeedDryerCoolerComponent,
} from './machinePoints/seedDryerCoolerPoints';
import {
  SOLVENT_EXTRACTOR_COMPONENT_ORDER,
  solventExtractorPointsForComponent,
  type SolventExtractorComponent,
} from './machinePoints/solventExtractorPoints';
import {
  TWIN_SCREW_COMPONENT_ORDER,
  twinScrewPointsForComponent,
  type TwinScrewComponent,
} from './machinePoints/twinScrewExtruderPoints';

export const MACHINE_TEMPLATES = [
  'Centrifugal Pump',
  'Motor',
  'Pump and Motor Train',
  'Gearbox',
  'Fan',
  'Compressor',
  'Turbine',
  'Rotary Airlock Valve',
  'Single Screw Extruder',
  'Twin Screw Extruder',
  'Expander X-101',
  'Flaking Mill M-102',
  'Cracking Mill M-101',
  'Conditioner E-102',
  // The oilseed set from the four-machine template archive. Named as the
  // archive names them: these arrived without the asset tags the four above
  // carry, and inventing an "M-103" would put a plant tag on a machine
  // nobody has tagged.
  'DTDC',
  'Solvent Extractor',
  'Collet Cooler',
  'Seed Dryer Cooler',
  // The meal-handling set, from the four-meal-machine archive. Downstream of
  // the extraction machines above: what happens to the meal once it leaves
  // the DTDC.
  'Hammer Mill',
  'Meal Sifter',
  'Meal Conveying & Storage',
  'Auto Bagger & Stitcher',
  'Custom Machine',
] as const;
export type MachineTemplate = (typeof MACHINE_TEMPLATES)[number];

export const COMPONENT_TYPES = ['Motor', 'Pump', 'Gearbox', 'Coupling', 'Bearing', 'Fan', 'Compressor', 'Custom Component'] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

// 'Flow' is the gravimetric-feeder quantity (kg/h): a twin screw meters its
// material by rate, so a feed-rate point is neither a level nor a speed and
// must not be locked to a channel reporting either.
//
// The last four arrived with the oilseed machines and are here for the same
// reason 'Flow' is: each is a quantity the existing kinds cannot stand in for
// without lying to the channel matcher about what the pad expects.
//
//   Moisture  product moisture, in per cent. Not 'Level' — a per-cent reading
//             of how wet meal is has nothing to do with how full a hopper is,
//             and a matcher that treats them alike would offer a hopper float
//             as a moisture probe.
//   Gas       gas concentration, in ppm. The seed dryer's CO detector is a
//             safety instrument; nothing else in the set reads ppm.
//   Leak      a discrete wet/dry or passing/holding state — the extractor's
//             pump seal leaks and the seed dryer's steam trap monitor. No
//             engineering unit, so it must never be matched on one.
//   Position  linear travel in mm, for the extractor's chain take-up. It is a
//             distance, not a level and not a speed.
//   Weight    mass on a load cell, in kg. The bagger weighs a hopper and then
//             weighs the finished bag; neither is a level, and a check-weigher
//             offered a hopper float would be a recall waiting to happen.
export type MeasurementPointKind =
  | 'Vibration' | 'Temperature' | 'Speed' | 'Pressure' | 'Current' | 'Power' | 'Level' | 'Flow'
  | 'Moisture' | 'Gas' | 'Leak' | 'Position' | 'Weight';

// Point lifecycle per spec Flow 5 — starts Not Configured, ends at a live-view
// state once mapped, commissioned, and streaming.
export const MEASUREMENT_POINT_STATUSES = ['Not Configured', 'Configured', 'Mapped', 'Connected', 'Disconnected', 'Warning', 'Alarm'] as const;
export type MeasurementPointStatus = (typeof MEASUREMENT_POINT_STATUSES)[number];

export type MeasurementPoint = {
  id: string;
  label: string;
  kind: MeasurementPointKind;
  status: MeasurementPointStatus;
};

export type MachineComponent = {
  id: string;
  type: ComponentType;
  label: string;
  points: MeasurementPoint[];
};

export type MachineNode = {
  id: string;
  projectId: string;
  folderId: string;
  name: string;
  template: MachineTemplate;
  components: MachineComponent[];
  /**
   * Which declared variant of the template this machine is.
   *
   * Optional and nullable, and the two states are the same answer: nobody has
   * declared it. That is different from "it is the reference variant", and the
   * difference matters for the same reason it does on a barrel zone — a
   * template offers a starting point, and only a person can say which build is
   * actually installed. Machines created before the field existed read as null
   * and are shown as undeclared rather than assumed.
   *
   * See `lib/machineVariants.ts` for the registry and the resolution rules.
   */
  variantId?: string | null;
};

type TemplateComponentDef = { type: ComponentType; label?: string };
type PointDef = { label: string; kind: MeasurementPointKind };

const TEMPLATE_COMPONENTS: Record<MachineTemplate, TemplateComponentDef[]> = {
  'Centrifugal Pump': [{ type: 'Motor' }, { type: 'Coupling' }, { type: 'Pump' }],
  Motor: [{ type: 'Motor' }],
  'Pump and Motor Train': [{ type: 'Motor' }, { type: 'Coupling' }, { type: 'Pump' }],
  Gearbox: [{ type: 'Motor' }, { type: 'Coupling' }, { type: 'Gearbox' }, { type: 'Coupling' }, { type: 'Pump' }],
  Fan: [{ type: 'Motor' }, { type: 'Coupling' }, { type: 'Fan' }],
  Compressor: [{ type: 'Motor' }, { type: 'Coupling' }, { type: 'Compressor' }],
  Turbine: [{ type: 'Custom Component', label: 'Turbine' }, { type: 'Coupling' }, { type: 'Compressor' }],
  'Rotary Airlock Valve': [{ type: 'Motor' }, { type: 'Coupling' }, { type: 'Custom Component', label: 'Rotor' }],
  'Single Screw Extruder': [{ type: 'Motor' }, { type: 'Coupling' }, { type: 'Gearbox' }, { type: 'Custom Component', label: 'Screw and Barrel' }],
  'Twin Screw Extruder': [
    { type: 'Motor', label: 'Main Motor' },
    { type: 'Coupling' },
    { type: 'Gearbox' },
    { type: 'Custom Component', label: 'Main Feeder' },
    { type: 'Custom Component', label: 'Side Feeder' },
    { type: 'Custom Component', label: 'Screw A' },
    { type: 'Custom Component', label: 'Screw B' },
    { type: 'Custom Component', label: 'Barrel Zones' },
    { type: 'Custom Component', label: 'Vent Section' },
    { type: 'Custom Component', label: 'Die and Discharge' },
  ],
  'Expander X-101': [
    { type: 'Motor', label: 'Main Motor' },
    { type: 'Coupling' },
    { type: 'Gearbox' },
    { type: 'Custom Component', label: 'Feed' },
    { type: 'Custom Component', label: 'Barrel' },
    { type: 'Custom Component', label: 'Discharge' },
  ],
  'Flaking Mill M-102': [
    { type: 'Motor', label: 'Upper Roll Motor' },
    { type: 'Motor', label: 'Lower Roll Motor' },
    { type: 'Custom Component', label: 'Rolls' },
    { type: 'Custom Component', label: 'Feed' },
    { type: 'Custom Component', label: 'Hydraulics' },
  ],
  'Cracking Mill M-101': [
    { type: 'Motor', label: 'Top Stage Motor' },
    { type: 'Motor', label: 'Bottom Stage Motor' },
    { type: 'Custom Component', label: 'Top Rolls' },
    { type: 'Custom Component', label: 'Bottom Rolls' },
    { type: 'Custom Component', label: 'Feed' },
  ],
  'Conditioner E-102': [
    { type: 'Motor', label: 'Agitator Drive' },
    { type: 'Custom Component', label: 'Decks' },
    { type: 'Custom Component', label: 'Steam' },
    { type: 'Custom Component', label: 'Vapour' },
    { type: 'Custom Component', label: 'Discharge' },
  ],
  // Grouped by process stage rather than by hardware. Two fans on the DTDC
  // are the same kind of machine, but a hot-air fan failing and a cooling fan
  // failing say different things about the meal leaving the bottom, so they
  // are not one "Fans" component.
  DTDC: [
    { type: 'Motor', label: 'Drive' },
    { type: 'Custom Component', label: 'Trays' },
    { type: 'Custom Component', label: 'Steam' },
    { type: 'Fan', label: 'Drying' },
    { type: 'Fan', label: 'Cooling' },
    { type: 'Fan', label: 'Vapour' },
    { type: 'Custom Component', label: 'Discharge' },
  ],
  // Five hoppers and five pumps stay one component each. Which stage leaked
  // is the whole diagnostic value, and the point codes carry the stage.
  'Solvent Extractor': [
    { type: 'Motor', label: 'Drive' },
    { type: 'Custom Component', label: 'Chain' },
    { type: 'Custom Component', label: 'Hoppers' },
    { type: 'Pump', label: 'Pumps' },
    { type: 'Custom Component', label: 'Discharge' },
  ],
  'Collet Cooler': [
    { type: 'Fan', label: 'Cooling' },
    { type: 'Fan', label: 'Exhaust' },
    { type: 'Custom Component', label: 'Discharge' },
  ],
  'Seed Dryer Cooler': [
    { type: 'Fan', label: 'Heating' },
    { type: 'Fan', label: 'Cooling' },
    { type: 'Fan', label: 'Exhaust' },
    { type: 'Custom Component', label: 'Steam' },
    { type: 'Custom Component', label: 'Discharge' },
  ],
  'Hammer Mill': [
    { type: 'Custom Component', label: 'Rotor' },
    { type: 'Motor', label: 'Drive' },
  ],
  'Meal Sifter': [
    { type: 'Custom Component', label: 'Inlet' },
    { type: 'Motor', label: 'Drive' },
  ],
  'Meal Conveying & Storage': [
    { type: 'Custom Component', label: 'Screw' },
    { type: 'Custom Component', label: 'Elevator' },
    { type: 'Custom Component', label: 'Bin' },
  ],
  'Auto Bagger & Stitcher': [
    { type: 'Custom Component', label: 'Weighing' },
    { type: 'Custom Component', label: 'Bagging' },
    { type: 'Motor', label: 'Stitching' },
    { type: 'Custom Component', label: 'Checkweighing' },
  ],
  'Custom Machine': [],
};

type AnalysisComponentDef = { type: ComponentType; label: string; points: PointDef[] };

const RAV_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = [
  {
    type: 'Motor',
    label: 'Drive',
    points: [
      { label: 'Motor Current', kind: 'Current' },
      { label: 'Rotor Speed', kind: 'Speed' },
    ],
  },
  {
    type: 'Bearing',
    label: 'Bearings',
    points: [
      { label: 'DE Bearing Temperature', kind: 'Temperature' },
      { label: 'NDE Bearing Temperature', kind: 'Temperature' },
      { label: 'DE Vibration Acceleration RMS', kind: 'Vibration' },
      { label: 'NDE Vibration Acceleration RMS', kind: 'Vibration' },
    ],
  },
  {
    type: 'Custom Component',
    label: 'Process',
    points: [
      { label: 'Inlet Pressure', kind: 'Pressure' },
      { label: 'Outlet Pressure', kind: 'Pressure' },
      { label: 'Material Temperature', kind: 'Temperature' },
    ],
  },
];

// Single Screw Extruder — the ULTRON pilot sensor package, in the same order the
// default layout drops its cards (drive side first, then feed and barrel).
//
// These labels are what the extruder analysis model resolves onto its canonical
// pilot tags (`lib/analysis/extruder/signalMap.ts`), so renaming a point here
// changes which diagnostic rules can run. E1 is the motor rear-shaft proximity
// switch, so the speed point is motor shaft speed; screw speed is derived from
// it through the controlled 20:1 gearbox ratio.
const extruderPointDefs = (codes: string[]): PointDef[] =>
  EXTRUDER_POINT_REGISTRY.filter((point) => codes.includes(point.code)).map((point) => ({ label: point.label, kind: point.kind }));

const EXTRUDER_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = [
  {
    type: 'Motor',
    label: 'Drive',
    points: extruderPointDefs(['MOTOR_NDE_VIB', 'MOTOR_TEMP', 'MOTOR_DE_VIB', 'MOTOR_POWER', 'MOTOR_RPM']),
  },
  {
    type: 'Gearbox',
    label: 'Gear Box',
    points: extruderPointDefs(['GEARBOX_VIB_IN', 'GEARBOX_VIB', 'GEARBOX_TEMP']),
  },
  {
    type: 'Custom Component',
    label: 'Feed',
    points: extruderPointDefs(['HOPPER_LEVEL']),
  },
  {
    type: 'Custom Component',
    label: 'Screw and Barrel',
    points: extruderPointDefs(['SCREW_RPM', 'BARREL_Z1_TEMP', 'BARREL_Z2_TEMP', 'BARREL_Z3_TEMP', 'BARREL_Z4_TEMP', 'BARREL_Z5_TEMP', 'MELT_PRESSURE', 'MELT_TEMP']),
  },
];

// Twin Screw Extruder — the machine tree, derived from the point registry.
//
// The hierarchy follows how the machine is actually built and runs: drive train,
// then the two feeding systems, then the processing section (the two screws and
// the barrel they turn in), then the vent and the discharge end. Screw A and
// Screw B are separate components on purpose — they are two shafts with two
// speed measurements, and a fault on one is not a fault on the other.
//
// Component membership is declared once, on the point itself, so a point cannot
// be listed under two components or omitted from all of them.
const TWIN_SCREW_COMPONENT_TYPES: Record<TwinScrewComponent, ComponentType> = {
  'Main Motor': 'Motor',
  Gearbox: 'Gearbox',
  'Main Feeder': 'Custom Component',
  'Side Feeder': 'Custom Component',
  'Screw A': 'Custom Component',
  'Screw B': 'Custom Component',
  'Barrel Zones': 'Custom Component',
  'Vent Section': 'Custom Component',
  'Die and Discharge': 'Custom Component',
};

const TWIN_SCREW_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = TWIN_SCREW_COMPONENT_ORDER.map((component) => ({
  type: TWIN_SCREW_COMPONENT_TYPES[component],
  label: component,
  points: twinScrewPointsForComponent(component).map((point) => ({ label: point.label, kind: point.kind })),
}));

// Expander X-101 — the machine tree, derived from its point registry.
//
// Same rule as the twin screw: membership is declared on the point, so this
// cannot list a point twice or lose one. The coupling carries no instrument and
// so has no component here, which is why this tree is shorter than the
// TEMPLATE_COMPONENTS list above.
//
// No analyzer tags are attached. The extruder and twin-screw models are
// commissioned on their own machines, and pointing one at expander readings
// would produce confident output from a model that has never seen this machine.
const EXPANDER_COMPONENT_TYPES: Record<ExpanderComponent, ComponentType> = {
  'Main Motor': 'Motor',
  Gearbox: 'Gearbox',
  Feed: 'Custom Component',
  Barrel: 'Custom Component',
  Discharge: 'Custom Component',
};

const EXPANDER_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = EXPANDER_COMPONENT_ORDER.map((component) => ({
  type: EXPANDER_COMPONENT_TYPES[component],
  label: component,
  points: expanderPointsForComponent(component).map((point) => ({ label: point.label, kind: point.kind })),
}));

// Flaking Mill M-102 — the machine tree, derived from its point registry.
//
// The two roll drives are separate components because they are two motors on
// two rolls, and the difference between their speeds is the flaking parameter.
// Folding them into one Drive would lose the measurement that matters most.
//
// As with the expander, no analyzer tags are attached: no model in this repo is
// commissioned on a flaking mill.
const FLAKING_MILL_COMPONENT_TYPES: Record<FlakingMillComponent, ComponentType> = {
  'Upper Drive': 'Motor',
  'Lower Drive': 'Motor',
  Rolls: 'Custom Component',
  Feed: 'Custom Component',
  Hydraulics: 'Custom Component',
};

const FLAKING_MILL_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = FLAKING_MILL_COMPONENT_ORDER.map((component) => ({
  type: FLAKING_MILL_COMPONENT_TYPES[component],
  label: component,
  points: flakingMillPointsForComponent(component).map((point) => ({ label: point.label, kind: point.kind })),
}));

// Cracking Mill M-101 — two independently driven stages, kept apart in the
// tree because a fault on one pair is not a fault on the other, and because
// each pair is set by the difference between its own two roll speeds.
const CRACKING_MILL_COMPONENT_TYPES: Record<CrackingMillComponent, ComponentType> = {
  'Top Drive': 'Motor',
  'Bottom Drive': 'Motor',
  'Top Rolls': 'Custom Component',
  'Bottom Rolls': 'Custom Component',
  Feed: 'Custom Component',
};

const CRACKING_MILL_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = CRACKING_MILL_COMPONENT_ORDER.map((component) => ({
  type: CRACKING_MILL_COMPONENT_TYPES[component],
  label: component,
  points: crackingMillPointsForComponent(component).map((point) => ({ label: point.label, kind: point.kind })),
}));

// Conditioner E-102 — the six decks are one component, not six. They are one
// product path through one vessel on one shaft, and a deck temperature is only
// meaningful as part of the profile down the stack.
const CONDITIONER_COMPONENT_TYPES: Record<ConditionerComponent, ComponentType> = {
  Agitator: 'Motor',
  Decks: 'Custom Component',
  Steam: 'Custom Component',
  Vapour: 'Custom Component',
  Discharge: 'Custom Component',
};

const CONDITIONER_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = CONDITIONER_COMPONENT_ORDER.map((component) => ({
  type: CONDITIONER_COMPONENT_TYPES[component],
  label: component,
  points: conditionerPointsForComponent(component).map((point) => ({ label: point.label, kind: point.kind })),
}));

// The oilseed four. Unlike every registry above, these point sets were
// supplied with the templates rather than written during integration, so the
// labels below are the vendor's own and the component grouping is the only
// editorial decision in them.
const DTDC_COMPONENT_TYPES: Record<DtdcComponent, ComponentType> = {
  Drive: 'Motor',
  Trays: 'Custom Component',
  Steam: 'Custom Component',
  Drying: 'Fan',
  Cooling: 'Fan',
  Vapour: 'Fan',
  Discharge: 'Custom Component',
};
const DTDC_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = DTDC_COMPONENT_ORDER.map((component) => ({
  type: DTDC_COMPONENT_TYPES[component],
  label: component,
  points: dtdcPointsForComponent(component).map((point) => ({ label: point.label, kind: point.kind })),
}));

const SOLVENT_EXTRACTOR_COMPONENT_TYPES: Record<SolventExtractorComponent, ComponentType> = {
  Drive: 'Motor',
  Chain: 'Custom Component',
  Hoppers: 'Custom Component',
  Pumps: 'Pump',
  Discharge: 'Custom Component',
};
const SOLVENT_EXTRACTOR_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = SOLVENT_EXTRACTOR_COMPONENT_ORDER.map((component) => ({
  type: SOLVENT_EXTRACTOR_COMPONENT_TYPES[component],
  label: component,
  points: solventExtractorPointsForComponent(component).map((point) => ({ label: point.label, kind: point.kind })),
}));

const COLLET_COOLER_COMPONENT_TYPES: Record<ColletCoolerComponent, ComponentType> = {
  Cooling: 'Fan',
  Exhaust: 'Fan',
  Discharge: 'Custom Component',
};
const COLLET_COOLER_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = COLLET_COOLER_COMPONENT_ORDER.map((component) => ({
  type: COLLET_COOLER_COMPONENT_TYPES[component],
  label: component,
  points: colletCoolerPointsForComponent(component).map((point) => ({ label: point.label, kind: point.kind })),
}));

const SEED_DRYER_COOLER_COMPONENT_TYPES: Record<SeedDryerCoolerComponent, ComponentType> = {
  Heating: 'Fan',
  Cooling: 'Fan',
  Exhaust: 'Fan',
  Steam: 'Custom Component',
  Discharge: 'Custom Component',
};
const SEED_DRYER_COOLER_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = SEED_DRYER_COOLER_COMPONENT_ORDER.map((component) => ({
  type: SEED_DRYER_COOLER_COMPONENT_TYPES[component],
  label: component,
  points: seedDryerCoolerPointsForComponent(component).map((point) => ({ label: point.label, kind: point.kind })),
}));

// The meal-handling four. Supplied point sets, like the oilseed set above.
const HAMMER_MILL_COMPONENT_TYPES: Record<HammerMillComponent, ComponentType> = {
  Rotor: 'Custom Component',
  Drive: 'Motor',
};
const HAMMER_MILL_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = HAMMER_MILL_COMPONENT_ORDER.map((component) => ({
  type: HAMMER_MILL_COMPONENT_TYPES[component],
  label: component,
  points: hammerMillPointsForComponent(component).map((point) => ({ label: point.label, kind: point.kind })),
}));

const MEAL_SIFTER_COMPONENT_TYPES: Record<MealSifterComponent, ComponentType> = {
  Inlet: 'Custom Component',
  Drive: 'Motor',
};
const MEAL_SIFTER_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = MEAL_SIFTER_COMPONENT_ORDER.map((component) => ({
  type: MEAL_SIFTER_COMPONENT_TYPES[component],
  label: component,
  points: mealSifterPointsForComponent(component).map((point) => ({ label: point.label, kind: point.kind })),
}));

const MEAL_CONVEYING_STORAGE_COMPONENT_TYPES: Record<MealConveyingStorageComponent, ComponentType> = {
  Screw: 'Custom Component',
  Elevator: 'Custom Component',
  Bin: 'Custom Component',
};
const MEAL_CONVEYING_STORAGE_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = MEAL_CONVEYING_STORAGE_COMPONENT_ORDER.map((component) => ({
  type: MEAL_CONVEYING_STORAGE_COMPONENT_TYPES[component],
  label: component,
  points: mealConveyingStoragePointsForComponent(component).map((point) => ({ label: point.label, kind: point.kind })),
}));

const AUTO_BAGGER_COMPONENT_TYPES: Record<AutoBaggerComponent, ComponentType> = {
  Weighing: 'Custom Component',
  Bagging: 'Custom Component',
  Stitching: 'Motor',
  Checkweighing: 'Custom Component',
};
const AUTO_BAGGER_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = AUTO_BAGGER_COMPONENT_ORDER.map((component) => ({
  type: AUTO_BAGGER_COMPONENT_TYPES[component],
  label: component,
  points: autoBaggerPointsForComponent(component).map((point) => ({ label: point.label, kind: point.kind })),
}));

// Templates whose canvas artwork ships a hand-tuned point set; everything else
// falls back to the generic per-component point labels below.
const ANALYSIS_COMPONENTS: Partial<Record<MachineTemplate, AnalysisComponentDef[]>> = {
  'Rotary Airlock Valve': RAV_ANALYSIS_COMPONENTS,
  'Single Screw Extruder': EXTRUDER_ANALYSIS_COMPONENTS,
  'Twin Screw Extruder': TWIN_SCREW_ANALYSIS_COMPONENTS,
  'Expander X-101': EXPANDER_ANALYSIS_COMPONENTS,
  'Flaking Mill M-102': FLAKING_MILL_ANALYSIS_COMPONENTS,
  'Cracking Mill M-101': CRACKING_MILL_ANALYSIS_COMPONENTS,
  'Conditioner E-102': CONDITIONER_ANALYSIS_COMPONENTS,
  DTDC: DTDC_ANALYSIS_COMPONENTS,
  'Solvent Extractor': SOLVENT_EXTRACTOR_ANALYSIS_COMPONENTS,
  'Collet Cooler': COLLET_COOLER_ANALYSIS_COMPONENTS,
  'Seed Dryer Cooler': SEED_DRYER_COOLER_ANALYSIS_COMPONENTS,
  'Hammer Mill': HAMMER_MILL_ANALYSIS_COMPONENTS,
  'Meal Sifter': MEAL_SIFTER_ANALYSIS_COMPONENTS,
  'Meal Conveying & Storage': MEAL_CONVEYING_STORAGE_ANALYSIS_COMPONENTS,
  'Auto Bagger & Stitcher': AUTO_BAGGER_ANALYSIS_COMPONENTS,
};

/**
 * The measurement-point labels this template expects, in canvas order.
 *
 * Used to associate rack channels with a machine before anyone has drawn a
 * canvas mapping, so the Rack/Overview/Analysis/Alarm/Trend tabs have something
 * to show on a freshly created machine. The match is by label only — never by
 * position — because guessing that "the third channel in the rack" is the melt
 * pressure would put a wrong number in front of an operator.
 */
export function expectedPointLabelsForTemplate(template: MachineTemplate): string[] {
  const analysisComponents = ANALYSIS_COMPONENTS[template];
  if (analysisComponents) return analysisComponents.flatMap((component) => component.points.map((point) => point.label));
  return TEMPLATE_COMPONENTS[template].flatMap((component) => pointLabels(component.type).map((point) => point.label));
}

export function expectedPointsForTemplate(template: MachineTemplate): number {
  const analysisComponents = ANALYSIS_COMPONENTS[template];
  if (analysisComponents) return analysisComponents.reduce((sum, component) => sum + component.points.length, 0);
  return TEMPLATE_COMPONENTS[template].reduce((sum, component) => sum + pointLabels(component.type).length, 0);
}

function pointLabels(type: ComponentType): PointDef[] {
  switch (type) {
    case 'Motor':
      return [
        { label: 'DE Vibration H', kind: 'Vibration' },
        { label: 'DE Vibration V', kind: 'Vibration' },
        { label: 'NDE Vibration H', kind: 'Vibration' },
        { label: 'Winding Temperature', kind: 'Temperature' },
        { label: 'Speed', kind: 'Speed' },
        { label: 'Current', kind: 'Current' },
      ];
    case 'Pump':
      return [
        { label: 'DE Vibration H', kind: 'Vibration' },
        { label: 'DE Vibration V', kind: 'Vibration' },
        { label: 'NDE Vibration H', kind: 'Vibration' },
        { label: 'Bearing Temperature', kind: 'Temperature' },
        { label: 'Discharge Pressure', kind: 'Pressure' },
      ];
    case 'Gearbox':
      return [
        { label: 'Input Bearing Vibration', kind: 'Vibration' },
        { label: 'Output Bearing Vibration', kind: 'Vibration' },
        { label: 'Oil Temperature', kind: 'Temperature' },
      ];
    case 'Fan':
      return [
        { label: 'DE Vibration H', kind: 'Vibration' },
        { label: 'NDE Vibration H', kind: 'Vibration' },
        { label: 'Bearing Temperature', kind: 'Temperature' },
      ];
    case 'Compressor':
      return [
        { label: 'DE Vibration H', kind: 'Vibration' },
        { label: 'NDE Vibration H', kind: 'Vibration' },
        { label: 'Discharge Pressure', kind: 'Pressure' },
      ];
    case 'Bearing':
      return [
        { label: 'Vibration', kind: 'Vibration' },
        { label: 'Temperature', kind: 'Temperature' },
      ];
    case 'Coupling':
    case 'Custom Component':
      return [];
  }
}

export function componentsForTemplate(template: MachineTemplate, makeId: () => string): MachineComponent[] {
  const analysisComponents = ANALYSIS_COMPONENTS[template];
  if (analysisComponents) {
    return analysisComponents.map((component) => ({
      id: makeId(),
      type: component.type,
      label: component.label,
      points: component.points.map((point) => ({ id: makeId(), label: point.label, kind: point.kind, status: 'Not Configured' as const })),
    }));
  }

  const defs = TEMPLATE_COMPONENTS[template];

  return defs.map((def, index) => {
    const baseLabel = def.label ?? def.type;
    const occurrencesOfBase = defs.filter((d) => (d.label ?? d.type) === baseLabel).length;
    const occurrenceIndex = defs.slice(0, index + 1).filter((d) => (d.label ?? d.type) === baseLabel).length;
    const label = occurrencesOfBase > 1 ? `${baseLabel} ${occurrenceIndex}` : baseLabel;

    return {
      id: makeId(),
      type: def.type,
      label,
      points: pointLabels(def.type).map((p) => ({ id: makeId(), label: p.label, kind: p.kind, status: 'Not Configured' as const })),
    };
  });
}
