import {
  CONDITIONER_COMPONENT_ORDER,
  conditionerPointsForComponent,
  type ConditionerComponent,
} from './machinePoints/conditionerPoints';
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
import { EXTRUDER_POINT_REGISTRY } from './machinePoints/extruderPoints';
import {
  FLAKING_MILL_COMPONENT_ORDER,
  flakingMillPointsForComponent,
  type FlakingMillComponent,
} from './machinePoints/flakingMillPoints';
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
  'Custom Machine',
] as const;
export type MachineTemplate = (typeof MACHINE_TEMPLATES)[number];

export const COMPONENT_TYPES = ['Motor', 'Pump', 'Gearbox', 'Coupling', 'Bearing', 'Fan', 'Compressor', 'Custom Component'] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

// 'Flow' is the gravimetric-feeder quantity (kg/h): a twin screw meters its
// material by rate, so a feed-rate point is neither a level nor a speed and
// must not be locked to a channel reporting either.
export type MeasurementPointKind = 'Vibration' | 'Temperature' | 'Speed' | 'Pressure' | 'Current' | 'Power' | 'Level' | 'Flow';

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
