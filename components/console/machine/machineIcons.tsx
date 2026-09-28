import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { ComponentType } from '../../../lib/machines';
import type { MachineTemplate } from '../../../lib/machines';
import {
  AutoBaggerIcon,
  ColletCoolerIcon,
  DTDCIcon,
  HammerMillIcon,
  MealConveyingStorageIcon,
  MealSifterIcon,
  SeedDryerCoolerIcon,
  SolventExtractorIcon,
  type TemplateIconProps,
} from './templateIcons';

/**
 * Templates that draw their own icon instead of borrowing a glyph.
 *
 * Checked before the glyph map, so adding one here is all it takes to give a
 * template its own mark. Everything absent from this map keeps the glyph it
 * has always had — see `templateIcons.tsx` for why these four have no glyph
 * worth borrowing.
 */
const TEMPLATE_DRAWN_ICON: Partial<Record<MachineTemplate, React.ComponentType<TemplateIconProps>>> = {
  DTDC: DTDCIcon,
  'Solvent Extractor': SolventExtractorIcon,
  'Collet Cooler': ColletCoolerIcon,
  'Seed Dryer Cooler': SeedDryerCoolerIcon,
  'Hammer Mill': HammerMillIcon,
  'Meal Sifter': MealSifterIcon,
  'Meal Conveying & Storage': MealConveyingStorageIcon,
  'Auto Bagger & Stitcher': AutoBaggerIcon,
};

export const MACHINE_TEMPLATE_ICON: Record<MachineTemplate, keyof typeof MaterialCommunityIcons.glyphMap> = {
  'Centrifugal Pump': 'pump',
  Motor: 'engine-outline',
  'Pump and Motor Train': 'cog-transfer-outline',
  Gearbox: 'cog-outline',
  Fan: 'fan',
  Compressor: 'gauge',
  Turbine: 'turbine',
  'Rotary Airlock Valve': 'valve',
  'Single Screw Extruder': 'screw-machine-flat-top',
  'Twin Screw Extruder': 'screw-machine-round-top',
  'Expander X-101': 'screw-machine-flat-top',
  'Flaking Mill M-102': 'rollerblade',
  'Cracking Mill M-101': 'circle-double',
  'Conditioner E-102': 'gas-cylinder',
  // The four below render a drawn icon; these glyphs are the fallback for any
  // caller that reads a glyph name rather than rendering the component, and
  // the reason the map stays exhaustive.
  DTDC: 'grain',
  'Solvent Extractor': 'tray-full',
  'Collet Cooler': 'snowflake',
  'Seed Dryer Cooler': 'grain',
  'Hammer Mill': 'hammer',
  'Meal Sifter': 'filter-outline',
  'Meal Conveying & Storage': 'silo',
  'Auto Bagger & Stitcher': 'package-variant-closed',
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
  const Drawn = TEMPLATE_DRAWN_ICON[template];
  // Same call signature either way, so every card keeps the size and the
  // inherited colour it already had.
  if (Drawn) return <Drawn size={size} color={color} />;
  return <MaterialCommunityIcons name={MACHINE_TEMPLATE_ICON[template]} size={size} color={color} />;
}

export function ComponentTypeIcon({ type, color, size = 18 }: { type: ComponentType; color: string; size?: number }) {
  return <MaterialCommunityIcons name={COMPONENT_TYPE_ICON[type]} size={size} color={color} />;
}
