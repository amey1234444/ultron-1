/**
 * The TSE asset hierarchy (DOC-01 §5).
 *
 * DOC-01 gives a three-level reference tree — Machine, then seven Systems, then
 * the Components and barrel-zone Locations under them. The console's own
 * machine tree (`lib/machines.ts`) is deliberately flatter: it lists the ten
 * components a user places instrument cards on, and a flat list is the right
 * shape for that job. This file is the engineering model behind it, and the two
 * are reconciled by `consoleComponent` rather than by making either pretend to
 * be the other.
 *
 * Three nodes here have no console counterpart, and that is the point of
 * writing the hierarchy out:
 *
 *   - `DRV.VFD` — DOC-01 §9.2 calls the drive "an important existing data
 *     source" and says ULTRON should prefer trustworthy VFD values over
 *     duplicate sensors. No VFD data is currently mapped on this machine.
 *   - `THERM` — heater and cooling output are observables DOC-01 §9.10/§9.11
 *     name, and no heater-duty channel exists, which is why the heater-response
 *     rule cannot run.
 *   - `CTRL` — the PLC/DCS layer that supplies setpoints, recipe and state.
 *
 * They are declared with `enabled: false` so the gap is visible in the model
 * instead of being an absence nobody notices.
 */

import type { AssetNode } from './types';

const machine = (
  assetId: string,
  name: string,
  primaryRole: string,
): AssetNode => ({
  assetId,
  parentId: null,
  type: 'Machine',
  name,
  primaryRole,
  knowledgeClass: 'TSE_SPECIFIC',
  enabled: true,
  criticality: null,
});

const node = (
  assetId: string,
  parentId: string,
  type: AssetNode['type'],
  name: string,
  primaryRole: string,
  knowledgeClass: AssetNode['knowledgeClass'],
  enabled = true,
): AssetNode => ({ assetId, parentId, type, name, primaryRole, knowledgeClass, enabled, criticality: null });

/**
 * The reference asset model, in DOC-01 §5 order.
 *
 * Barrel zones appear as `Location` nodes rather than `Component` nodes because
 * DOC-01 §5 types them that way, and the distinction earns its keep: a zone is
 * a place along the process where thermal and process conditions are measured,
 * not a serviceable item. Zone *function* is not stated here at all — see
 * `zones.ts` for why.
 */
export const TSE_ASSET_TREE: readonly AssetNode[] = [
  machine('TSE-01', 'Twin-Screw Extruder', 'Root asset'),

  node('DRV', 'TSE-01', 'System', 'Main Drive', 'Motor, VFD, coupling, gearbox', 'COMMON'),
  node('DRV.MOTOR', 'DRV', 'Component', 'Main Motor', 'Electrical-to-mechanical power conversion', 'COMMON'),
  node(
    'DRV.VFD',
    'DRV',
    'Component',
    'Variable Frequency Drive',
    'Speed and torque control, and drive diagnostics',
    'COMMON',
    false,
  ),
  node('DRV.COUPLING', 'DRV', 'Component', 'Coupling', 'Motor-to-gearbox torque transmission', 'COMMON'),
  node(
    'DRV.GEARBOX',
    'DRV',
    'Component',
    'Gearbox',
    'Speed reduction, torque transmission, twin-shaft drive',
    'TSE_SPECIFIC',
  ),

  node('FEED', 'TSE-01', 'System', 'Feeding System', 'Main feeder, hopper, side feeders, feed throat', 'TSE_SPECIFIC'),
  node('FEED.MAIN', 'FEED', 'Component', 'Main Feeder', 'Meters the primary material stream', 'TSE_SPECIFIC'),
  node(
    'FEED.SIDE',
    'FEED',
    'Component',
    'Side Feeder',
    'Introduces fillers, fibres or additives downstream',
    'TSE_SPECIFIC',
  ),
  node('FEED.THROAT', 'FEED', 'Component', 'Feed Throat', 'Solids transfer from feeder into the screw channels', 'TSE_SPECIFIC'),

  node('PROC', 'TSE-01', 'System', 'Processing Section', 'Screws, barrel, zones, ports', 'TSE_SPECIFIC'),
  node('PROC.SCREW_A', 'PROC', 'Component', 'Screw A', 'Conveying, melting, mixing, pressure generation', 'TSE_SPECIFIC'),
  node('PROC.SCREW_B', 'PROC', 'Component', 'Screw B', 'Conveying, melting, mixing, pressure generation', 'TSE_SPECIFIC'),
  node('PROC.BARREL', 'PROC', 'Component', 'Barrel', 'Contains the process and carries the thermal boundary', 'TSE_SPECIFIC'),

  node('THERM', 'TSE-01', 'System', 'Heating and Cooling', 'Zone heaters, cooling circuits, valves and fans', 'COMMON', false),
  node('THERM.HEAT', 'THERM', 'Component', 'Heating System', 'Adds thermal energy to barrel zones', 'COMMON', false),
  node('THERM.COOL', 'THERM', 'Component', 'Cooling System', 'Removes heat from barrel and process zones', 'COMMON', false),

  node('VENT', 'TSE-01', 'System', 'Venting and Vacuum', 'Atmospheric vent and vacuum system where installed', 'TSE_SPECIFIC'),
  node('VENT.VACUUM', 'VENT', 'Component', 'Vacuum System', 'Removes gas, moisture and volatiles from the melt', 'TSE_SPECIFIC'),

  node('DOWN', 'TSE-01', 'System', 'Downstream Melt Path', 'Adapter, screen, die, downstream line', 'TSE_SPECIFIC'),
  node('DOWN.SCREEN', 'DOWN', 'Component', 'Screen / Filter', 'Filters contaminants and creates a measurable pressure drop', 'TSE_SPECIFIC'),
  node('DOWN.DIE', 'DOWN', 'Component', 'Adapter / Die', 'Transfers and shapes the melt into the downstream geometry', 'TSE_SPECIFIC'),

  node(
    'CTRL',
    'TSE-01',
    'System',
    'Instrumentation and Control',
    'PLC / DCS / OEM controller, transmitters, interlocks, recipes',
    'MACHINE_SPECIFIC',
    false,
  ),
] as const;

/** Barrel-zone location nodes, generated from the installed zone count. */
export function zoneAssetNodes(zoneCount: number): AssetNode[] {
  return Array.from({ length: zoneCount }, (_, index) =>
    node(
      `PROC.Z${index + 1}`,
      'PROC.BARREL',
      'Location',
      `Barrel Zone ${index + 1}`,
      'Thermal and process section; function is configured per machine',
      'MACHINE_SPECIFIC',
    ),
  );
}

const BY_ID = new Map(TSE_ASSET_TREE.map((asset) => [asset.assetId, asset]));

export function assetById(assetId: string): AssetNode | undefined {
  return BY_ID.get(assetId);
}

export function childrenOf(assetId: string | null): AssetNode[] {
  return TSE_ASSET_TREE.filter((asset) => asset.parentId === assetId);
}

/** The chain from an asset up to the root, nearest parent first. */
export function ancestorsOf(assetId: string): AssetNode[] {
  const chain: AssetNode[] = [];
  let current = BY_ID.get(assetId);
  while (current?.parentId) {
    const parent = BY_ID.get(current.parentId);
    if (!parent) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

/**
 * Which console component an engineering asset shows up as, if any.
 *
 * The mapping is partial and says so by returning undefined. `DRV.VFD`,
 * `THERM.*` and `CTRL` have no console component because no channel on this
 * machine carries their data — mapping them onto a neighbouring component would
 * file a drive-fault or a heater-fault finding against the wrong part.
 *
 * `PROC.BARREL` maps to the console's "Barrel Zones" because that is the
 * component instrument cards for zone temperatures and intermediate melt
 * pressures are filed under.
 */
const CONSOLE_COMPONENT: Record<string, string> = {
  'DRV.MOTOR': 'Main Motor',
  'DRV.GEARBOX': 'Gearbox',
  'FEED.MAIN': 'Main Feeder',
  'FEED.THROAT': 'Main Feeder',
  'FEED.SIDE': 'Side Feeder',
  'PROC.SCREW_A': 'Screw A',
  'PROC.SCREW_B': 'Screw B',
  'PROC.BARREL': 'Barrel Zones',
  'VENT.VACUUM': 'Vent Section',
  'DOWN.SCREEN': 'Die and Discharge',
  'DOWN.DIE': 'Die and Discharge',
};

export function consoleComponent(assetId: string): string | undefined {
  return CONSOLE_COMPONENT[assetId];
}

/** Assets DOC-01 models that the console currently has no component for. */
export function assetsWithoutConsoleComponent(): AssetNode[] {
  return TSE_ASSET_TREE.filter(
    (asset) => (asset.type === 'Component' || asset.type === 'Location') && !CONSOLE_COMPONENT[asset.assetId],
  );
}
