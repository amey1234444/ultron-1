import { EXTRUDER_POINT_REGISTRY } from './extruderPoints';
import { TWIN_SCREW_POINT_REGISTRY } from './twinScrewExtruderPoints';

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
    { type: 'Motor' },
    { type: 'Coupling' },
    { type: 'Gearbox' },
    { type: 'Custom Component', label: 'Twin Screws and Barrel' },
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

// Twin Screw Extruder — the full twin-screw sensor schedule, grouped the way the
// machine is built and in the same order the default layout drops its cards
// (drive train first, then feed, barrel and the die head).
//
// Unlike the single screw, no condition model consumes these yet; the registry
// carries that fact per point, so the canvas says so when a channel lands on one
// instead of implying a diagnosis that is not running.
const twinScrewPointDefs = (codes: string[]): PointDef[] =>
  TWIN_SCREW_POINT_REGISTRY.filter((point) => codes.includes(point.code)).map((point) => ({ label: point.label, kind: point.kind }));

const TWIN_SCREW_ANALYSIS_COMPONENTS: AnalysisComponentDef[] = [
  {
    type: 'Motor',
    label: 'Drive',
    points: twinScrewPointDefs(['MOTOR_NDE_VIB', 'MOTOR_TEMP', 'MOTOR_DE_VIB', 'MOTOR_POWER', 'MOTOR_RPM']),
  },
  {
    type: 'Gearbox',
    label: 'Gear Box',
    points: twinScrewPointDefs(['GEARBOX_IN_VIB', 'GEARBOX_OUT1_VIB', 'GEARBOX_OUT2_VIB', 'GEARBOX_TEMP', 'THRUST_BRG_TEMP']),
  },
  {
    type: 'Custom Component',
    label: 'Main Feeder',
    points: twinScrewPointDefs(['HOPPER_LEVEL', 'MAIN_FEED_RATE', 'MAIN_FEED_RPM', 'MAIN_FEED_CURR', 'FEED_THROAT_TEMP']),
  },
  {
    type: 'Custom Component',
    label: 'Side Feeder',
    points: twinScrewPointDefs(['SIDE_FEED_RATE', 'SIDE_FEED_RPM', 'SIDE_FEED_CURR']),
  },
  {
    type: 'Custom Component',
    label: 'Twin Screws and Barrel',
    points: twinScrewPointDefs([
      'SCREW1_RPM',
      'SCREW2_RPM',
      'TZ_01',
      'TZ_02',
      'TZ_03',
      'TZ_04',
      'TZ_05',
      'TZ_06',
      'TZ_07',
      'TZ_08',
      'P_INT_01',
      'P_INT_02',
    ]),
  },
  {
    type: 'Custom Component',
    label: 'Vent and Die Head',
    points: twinScrewPointDefs(['VENT_PRESSURE', 'VENT_TEMP', 'MELT_TEMP', 'P_SCR_IN', 'P_SCR_OUT']),
  },
];

// Templates whose canvas artwork ships a hand-tuned point set; everything else
// falls back to the generic per-component point labels below.
const ANALYSIS_COMPONENTS: Partial<Record<MachineTemplate, AnalysisComponentDef[]>> = {
  'Rotary Airlock Valve': RAV_ANALYSIS_COMPONENTS,
  'Single Screw Extruder': EXTRUDER_ANALYSIS_COMPONENTS,
  'Twin Screw Extruder': TWIN_SCREW_ANALYSIS_COMPONENTS,
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
