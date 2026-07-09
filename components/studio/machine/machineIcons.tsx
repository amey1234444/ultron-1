import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { ComponentType } from '../../../lib/machines';
import type { MachineTemplate } from '../../../lib/machines';

export const MACHINE_TEMPLATE_ICON: Record<MachineTemplate, keyof typeof MaterialCommunityIcons.glyphMap> = {
  'Centrifugal Pump': 'pump',
  Motor: 'engine-outline',
  'Pump and Motor Train': 'cog-transfer-outline',
  Gearbox: 'cog-outline',
  Fan: 'fan',
  Compressor: 'gauge',
  Turbine: 'turbine',
  'Rotary Airlock Valve': 'valve',
  'Custom Machine': 'shape-outline',
};

export const COMPONENT_TYPE_ICON: Record<ComponentType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Motor: 'engine-outline',
  Pump: 'pump',
  Gearbox: 'cog-outline',
  Coupling: 'link-variant',
  Bearing: 'circle-slice-8',
  Fan: 'fan',
  Compressor: 'gauge',
  'Custom Component': 'cube-outline',
};

export function MachineTemplateIcon({ template, color, size = 18 }: { template: MachineTemplate; color: string; size?: number }) {
  return <MaterialCommunityIcons name={MACHINE_TEMPLATE_ICON[template]} size={size} color={color} />;
}

export function ComponentTypeIcon({ type, color, size = 18 }: { type: ComponentType; color: string; size?: number }) {
  return <MaterialCommunityIcons name={COMPONENT_TYPE_ICON[type]} size={size} color={color} />;
}
