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
 *
 * These are the *authored* values and must stay in step with `lib_mat.py`; the
 * per-theme grade below is applied on top of them and lives only here, because
 * it is a property of the console's two backgrounds rather than of the machine.
 */
export const TWIN_SCREW_MATERIAL_SPECS = {
  MAT_stainless: { color: '#C1C5C7', metalness: 0.95, roughness: 0.24 },
  MAT_stainless_b: { color: '#C7CBCD', metalness: 0.95, roughness: 0.20 },
  MAT_screw_steel: { color: '#5F686E', metalness: 0.62, roughness: 0.30 },
  MAT_barrel_steel: { color: '#B7BCBE', metalness: 0.85, roughness: 0.31 },
  MAT_cast_gray: { color: '#B4B5B2', metalness: 0.60, roughness: 0.48 },
  MAT_cast_light: { color: '#BEBFBB', metalness: 0.58, roughness: 0.51 },
  MAT_motor_body: { color: '#3B515E', metalness: 0.65, roughness: 0.40 },
  MAT_motor_fin: { color: '#283A46', metalness: 0.65, roughness: 0.46 },
  MAT_dark: { color: '#2A3238', metalness: 0.10, roughness: 0.72 },
  MAT_cavity: { color: '#161B1F', metalness: 0.08, roughness: 0.80 },
  MAT_bore: { color: '#23292E', metalness: 0.30, roughness: 0.66 },
  MAT_bronze: { color: '#816B3D', metalness: 0.72, roughness: 0.39 },
  MAT_brass: { color: '#B18B43', metalness: 0.82, roughness: 0.32 },
  MAT_bolt: { color: '#A8ACAE', metalness: 0.94, roughness: 0.30 },
  MAT_mesh: { color: '#7C8184', metalness: 0.90, roughness: 0.40 },
  MAT_pellet_cool: { color: '#D9DCD4', metalness: 0.00, roughness: 0.62 },
  MAT_pellet_melt: { color: '#C86A22', metalness: 0.00, roughness: 0.44 },
} as const;

export type TwinScrewMaterialName = keyof typeof TWIN_SCREW_MATERIAL_SPECS;

/**
 * Per-theme grade, applied over the authored palette.
 *
 * The two consoles are not the same picture at different brightnesses. On the
 * light sheet the machine is darker than its ground, so the risk is a pale
 * casting washing out and losing its edges; the darks are pushed down to hold
 * form. On the dark console the machine is lighter than its ground, and the
 * risk is the opposite — the shadowed materials slide into the background and
 * the barrel glares. So the darks are lifted and the bright housings pulled
 * back, which keeps the same tonal *order* on both grounds while stopping
 * either end from clipping into it.
 *
 * Only materials whose value actually decides legibility are listed. Anything
 * absent uses the authored value on both themes.
 */
export const TWIN_SCREW_THEME_GRADE: Record<
  'light' | 'dark',
  Partial<Record<TwinScrewMaterialName, { color?: string; metalness?: number; roughness?: number }>>
> = {
  light: {
    // Deep bore keeps the flights readable against the housing.
    MAT_bore: { color: '#20262B' },
    MAT_cavity: { color: '#141A1E' },
  },
  dark: {
    // Lift the shadowed materials clear of a near-black page, and pull the
    // bright housings back so the machine does not glare against it.
    MAT_bore: { color: '#333C43', metalness: 0.34, roughness: 0.62 },
    MAT_cavity: { color: '#242B31' },
    MAT_dark: { color: '#38424A' },
    MAT_screw_steel: { color: '#79828A' },
    MAT_barrel_steel: { color: '#A6ACAF' },
    MAT_cast_gray: { color: '#A3A5A2' },
    MAT_cast_light: { color: '#ACAEAA' },
    MAT_stainless: { color: '#B0B4B6' },
    MAT_stainless_b: { color: '#B6BABC' },
  },
};

/** Reflection strength per theme, paired with the stage's tone-map exposure. */
export const TWIN_SCREW_ENV_INTENSITY = { light: 0.82, dark: 1.05 } as const;

export function twinScrewMaterialSpec(name: string) {
  // Blender can suffix a duplicated material with `.001`; it is still the same
  // authored finish and should not fall back to loader defaults.
  const canonical = name.replace(/\.\d{3}$/, '') as TwinScrewMaterialName;
  return TWIN_SCREW_MATERIAL_SPECS[canonical];
}

/** The authored finish with the active theme's grade folded in. */
export function twinScrewGradedSpec(name: string, dark: boolean) {
  const spec = twinScrewMaterialSpec(name);
  if (!spec) return undefined;
  const canonical = name.replace(/\.\d{3}$/, '') as TwinScrewMaterialName;
  const grade = TWIN_SCREW_THEME_GRADE[dark ? 'dark' : 'light'][canonical];
  return { ...spec, ...grade };
}

/** Apply the authored PBR contract to one cloned glTF standard material. */
export function applyTwinScrewMaterialSpec(material: MeshStandardMaterial, dark: boolean): boolean {
  const spec = twinScrewGradedSpec(material.name, dark);
  if (!spec || !material.isMeshStandardMaterial) return false;
  material.color.set(spec.color);
  material.metalness = spec.metalness;
  material.roughness = spec.roughness;
  material.envMapIntensity = TWIN_SCREW_ENV_INTENSITY[dark ? 'dark' : 'light'];
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
