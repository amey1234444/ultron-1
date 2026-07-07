export const MACHINE_TEMPLATES = [
  'Centrifugal Pump',
  'Motor',
  'Pump and Motor Train',
  'Gearbox',
  'Fan',
  'Compressor',
  'Turbine',
  'Rotary Airlock Valve',
  'Custom Machine',
] as const;
export type MachineTemplate = (typeof MACHINE_TEMPLATES)[number];

export const COMPONENT_TYPES = ['Motor', 'Pump', 'Gearbox', 'Coupling', 'Bearing', 'Fan', 'Compressor', 'Custom Component'] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export type MeasurementPointKind = 'Vibration' | 'Temperature' | 'Speed' | 'Pressure' | 'Current';

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

const TEMPLATE_COMPONENTS: Record<MachineTemplate, TemplateComponentDef[]> = {
  'Centrifugal Pump': [{ type: 'Motor' }, { type: 'Coupling' }, { type: 'Pump' }],
  Motor: [{ type: 'Motor' }],
  'Pump and Motor Train': [{ type: 'Motor' }, { type: 'Coupling' }, { type: 'Pump' }],
  Gearbox: [{ type: 'Motor' }, { type: 'Coupling' }, { type: 'Gearbox' }, { type: 'Coupling' }, { type: 'Pump' }],
  Fan: [{ type: 'Motor' }, { type: 'Coupling' }, { type: 'Fan' }],
  Compressor: [{ type: 'Motor' }, { type: 'Coupling' }, { type: 'Compressor' }],
  Turbine: [{ type: 'Custom Component', label: 'Turbine' }, { type: 'Coupling' }, { type: 'Compressor' }],
  'Rotary Airlock Valve': [{ type: 'Motor' }, { type: 'Coupling' }, { type: 'Custom Component', label: 'Rotor' }],
  'Custom Machine': [],
};

function pointLabels(type: ComponentType): { label: string; kind: MeasurementPointKind }[] {
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
