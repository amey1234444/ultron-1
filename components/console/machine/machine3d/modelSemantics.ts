import type { MeshStandardMaterial, Object3D } from 'three';

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
 * Material values authored in `polymer-plant-3d/twin-screw/lib_mat.py`.
 *
 * Blender's glTF export omitted `roughnessFactor` for several materials, which
 * makes GLTFLoader use its default of 1. Re-applying the complete named palette
 * also makes this contract explicit and keeps light and dark stages consistent.
 */
export const TWIN_SCREW_MATERIAL_SPECS = {
  MAT_stainless: { color: '#C1C5C7', metalness: 0.95, roughness: 0.24 },
  MAT_stainless_b: { color: '#C7CBCD', metalness: 0.95, roughness: 0.20 },
  MAT_screw_steel: { color: '#9EA3A6', metalness: 1.00, roughness: 0.26 },
  MAT_barrel_steel: { color: '#AEB3B5', metalness: 0.85, roughness: 0.31 },
  MAT_cast_gray: { color: '#B4B5B2', metalness: 0.60, roughness: 0.48 },
  MAT_cast_light: { color: '#BEBFBB', metalness: 0.58, roughness: 0.51 },
  MAT_motor_body: { color: '#3B515E', metalness: 0.65, roughness: 0.40 },
  MAT_motor_fin: { color: '#283A46', metalness: 0.65, roughness: 0.46 },
  MAT_dark: { color: '#2A3238', metalness: 0.10, roughness: 0.72 },
  MAT_cavity: { color: '#161B1F', metalness: 0.08, roughness: 0.80 },
  MAT_bore: { color: '#6A7176', metalness: 0.86, roughness: 0.40 },
  MAT_bronze: { color: '#816B3D', metalness: 0.72, roughness: 0.39 },
  MAT_brass: { color: '#B18B43', metalness: 0.82, roughness: 0.32 },
  MAT_bolt: { color: '#A8ACAE', metalness: 0.94, roughness: 0.30 },
  MAT_mesh: { color: '#7C8184', metalness: 0.90, roughness: 0.40 },
  MAT_pellet_cool: { color: '#D9DCD4', metalness: 0.00, roughness: 0.62 },
  MAT_pellet_melt: { color: '#C86A22', metalness: 0.00, roughness: 0.44 },
} as const;

export type TwinScrewMaterialName = keyof typeof TWIN_SCREW_MATERIAL_SPECS;

export function twinScrewMaterialSpec(name: string) {
  // Blender can suffix a duplicated material with `.001`; it is still the same
  // authored finish and should not fall back to loader defaults.
  const canonical = name.replace(/\.\d{3}$/, '') as TwinScrewMaterialName;
  return TWIN_SCREW_MATERIAL_SPECS[canonical];
}

/** Apply the authored PBR contract to one cloned glTF standard material. */
export function applyTwinScrewMaterialSpec(material: MeshStandardMaterial, dark: boolean): boolean {
  const spec = twinScrewMaterialSpec(material.name);
  if (!spec || !material.isMeshStandardMaterial) return false;
  material.color.set(spec.color);
  material.metalness = spec.metalness;
  material.roughness = spec.roughness;
  material.envMapIntensity = dark ? 1.05 : 0.82;
  material.needsUpdate = true;
  return true;
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
