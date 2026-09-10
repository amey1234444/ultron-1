import type { MeshStandardMaterial, Object3D } from 'three';

import {
  MACHINE_FINISHES as MACHINE_FINISHES_INTERNAL,
  applyMachineFinish as applyFinish,
  resolveMachineFinishKey as resolveFinishKey,
} from './machineMaterialTheme';

/** GLB group removed for the normal inspection cutaway. */
export const TWIN_SCREW_CUTAWAY_GROUP = 'barrel_front';
export const TWIN_SCREW_CUTAWAY_PART_COUNT = 11;

/** Shared by production framing and the executable default-visibility audit. */
export const TWIN_SCREW_INSPECTION_VIEW = {
  direction: [0, 0.06, 1] as const,
  fov: 32,
  fillMargin: 1.12,
  occlusionClearance: 0.012,
} as const;

/**
 * Material handling now lives in `machineMaterialTheme`.
 *
 * The asset's authored Blender palette is a bright-studio palette; the console
 * is a near-black dashboard, and re-applying the authored values was what made
 * the machine read as a white CAD model dropped onto it. These wrappers keep
 * the material-name entry point that the checks and any name-only caller use,
 * and delegate the actual values to the console theme.
 */
export {
  MACHINE_ENV_INTENSITY as TWIN_SCREW_ENV_INTENSITY,
  MACHINE_FINISHES,
  applyMachineFinish,
  machineFinishColor,
  resolveMachineFinishKey,
  type MachineFinishKey,
} from './machineMaterialTheme';

/** The finish a material name resolves to when no part group is known. */
export function twinScrewMaterialSpec(name: string) {
  const key = resolveFinishKey(undefined, undefined, name);
  const finish = MACHINE_FINISHES_INTERNAL[key];
  return { color: finish.color, metalness: finish.metalness, roughness: finish.roughness };
}

/** The same finish, resolved for one theme. */
export function twinScrewGradedSpec(name: string, dark: boolean) {
  const key = resolveFinishKey(undefined, undefined, name);
  const finish = MACHINE_FINISHES_INTERNAL[key];
  return {
    color: dark ? finish.color : (finish.lightColor ?? finish.color),
    metalness: finish.metalness,
    roughness: finish.roughness,
  };
}

/**
 * Normalize one cloned material from its name alone.
 *
 * Meshes go through `resolveMachineFinishKey` with their part group, which is
 * what keeps the motor, the gearbox and the barrel on different values. This
 * name-only path is the fallback for a mesh with no authored group.
 */
export function applyTwinScrewMaterialSpec(material: MeshStandardMaterial, dark: boolean): boolean {
  if (!material.isMeshStandardMaterial) return false;
  return applyFinish(material, resolveFinishKey(undefined, undefined, material.name), dark);
}

/** Read Blender extras from the hit object or the first owning parent group. */
export function inheritedString(object: Object3D | null | undefined, key: string): string | undefined {
  let current = object ?? null;
  while (current) {
    const value = current.userData?.[key];
    if (typeof value === 'string' && value.length > 0) return value;
    current = current.parent;
  }
  return undefined;
}

/** Toggle all authored objects in a part group and report the matched count. */
export function setPartGroupVisibility(root: Object3D, partGroup: string, visible: boolean): number {
  let count = 0;
  root.traverse((object) => {
    if (object.userData?.partGroup !== partGroup) return;
    object.visible = visible;
    count += 1;
  });
  return count;
}

/** Renderer-equivalent visibility, including a hidden owning group. */
export function isEffectivelyVisible(object: Object3D | null | undefined): boolean {
  let current = object ?? null;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}
