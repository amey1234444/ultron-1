/**
 * Industrial finish theme for the twin-screw asset.
 *
 * The GLB is authored in Blender for a bright studio (`lib_mat.py`), where a
 * near-white cast body over a pale ground is correct. Dropped straight onto the
 * console it read as a white CAD model pasted over a black dashboard: the
 * housings clipped to paper-white, the bore crushed to black, and nothing in
 * between. This module re-grades the asset into the console's own palette --
 * graphite, gunmetal and aluminium over `surface.dark` -- without touching the
 * geometry or re-exporting anything.
 *
 * Why the classification is `partGroup` x material, not material alone
 * -------------------------------------------------------------------
 * `MAT_cast_gray` is used by the motor, the gearbox, the frame, the die, the
 * vent, the feeders and every barrel cap. Keying off the material name alone
 * would collapse all of them to one value and flatten the machine into a
 * single grey mass -- the thing that most makes it read as a toy. The Blender
 * extras carry a `partGroup` per authored object, so the material name decides
 * the *role* (is this a body, a fastener, a recess, an internal part) and the
 * part group decides the *tone step* that role sits at. Two small tables, and
 * every component keeps its own value.
 */
import type { MeshStandardMaterial } from 'three';

export type MachineFinish = {
  /** Base colour on the dark console. */
  color: string;
  /** Base colour on the light console, when the dark value would not carry. */
  lightColor?: string;
  metalness: number;
  roughness: number;
};

/**
 * The console's machine palette.
 *
 * The body steps form a deliberate ascending ladder -- motor < barrel < gearbox
 * < die/vent < hopper -- so the eye can tell the components apart by value
 * alone at dashboard size, without a second hue anywhere.
 *
 * Values step from the deepest recess to a single restrained highlight. No hue
 * beyond a trace of warmth in `heaterTrim` and `extrudate`, which are the only
 * two places the real machine is not steel. Nothing here is `#FFFFFF`: the
 * brightest finish on a large surface is `aluminium`, and `trim` is reserved
 * for bolts and small instrumentation.
 */
const FINISHES = {
  /** Bore and blind cavities -- the darkest thing on the machine. */
  recessDeep: { color: '#111417', lightColor: '#1B2024', metalness: 0.30, roughness: 0.82 },
  /** Gaskets, shadow gaps, cooling-box inserts. */
  recess: { color: '#1A1F23', lightColor: '#242A2F', metalness: 0.40, roughness: 0.74 },
  /** Mounting feet, pads, anchors. Lifted off the spec's #252A2F: the motor
   *  end sits at the edge of the frame with nothing behind it, and at the
   *  darker value its silhouette dissolved into the page. */
  structure: { color: '#333940', metalness: 0.55, roughness: 0.66 },
  /** Motor shell -- dark desaturated gunmetal. */
  gunmetal: { color: '#363D44', metalness: 0.62, roughness: 0.60 },
  /** Support frame and base castings. */
  graphite: { color: '#343A40', metalness: 0.60, roughness: 0.58 },
  /** Barrel modules. */
  bodyDark: { color: '#414850', metalness: 0.62, roughness: 0.55 },
  /** Alternate barrel zone cover, one step off `bodyDark`. */
  bodyDarkAlt: { color: '#474F57', metalness: 0.62, roughness: 0.54 },
  /** Gearbox and other main castings. */
  body: { color: '#4C545C', metalness: 0.64, roughness: 0.52 },
  /** Die, vent, melt adapter, couplings -- medium metallic. */
  bodyLight: { color: '#5A626B', metalness: 0.68, roughness: 0.48 },
  /** Hopper, feeders, polished shells -- lighter brushed aluminium. */
  aluminium: { color: '#747D86', lightColor: '#6B747D', metalness: 0.72, roughness: 0.44 },
  /** Screws and internal mechanical parts: kept readable inside a dark bore. */
  brightMetal: { color: '#929AA2', lightColor: '#828B94', metalness: 0.76, roughness: 0.38 },
  /** Bolts and small instrumentation only. The brightest value in the scene. */
  trim: { color: '#B9BEC3', lightColor: '#A2A9AF', metalness: 0.80, roughness: 0.34 },
  /** Screen-pack mesh. */
  meshScreen: { color: '#6B737A', metalness: 0.74, roughness: 0.46 },
  /** Heater bands. Muted almost to grey; a hint of warmth, never brass. */
  heaterTrim: { color: '#6A6152', metalness: 0.70, roughness: 0.45 },
  /** The melt leaving the die. The one place a warm tone is literal. */
  extrudate: { color: '#8A5A33', metalness: 0.15, roughness: 0.55 },
} satisfies Record<string, MachineFinish>;

export type MachineFinishKey = keyof typeof FINISHES;

/**
 * Widened to `MachineFinish` on purpose: `satisfies` above keeps the key set
 * exact, while the annotation here stops every lookup from narrowing to one
 * literal object and losing the optional `lightColor`.
 */
export const MACHINE_FINISHES: Record<MachineFinishKey, MachineFinish> = FINISHES;

/**
 * What a Blender material *is*, independent of where it sits on the machine.
 *
 * Every material authored in `lib_mat.py` appears here; an unmapped name falls
 * back to `body` so a future export can never render as loader-default white.
 */
const MATERIAL_ROLE: Record<string, MachineFinishKey> = {
  MAT_bore: 'recessDeep',
  MAT_cavity: 'recessDeep',
  MAT_dark: 'recess',
  MAT_bolt: 'trim',
  MAT_screw_steel: 'brightMetal',
  MAT_mesh: 'meshScreen',
  MAT_bronze: 'heaterTrim',
  MAT_brass: 'heaterTrim',
  MAT_stainless: 'aluminium',
  MAT_stainless_b: 'aluminium',
  MAT_barrel_steel: 'bodyDark',
  MAT_cast_gray: 'body',
  MAT_cast_light: 'bodyLight',
  MAT_motor_body: 'gunmetal',
  MAT_motor_fin: 'structure',
  MAT_pellet_cool: 'bodyLight',
  MAT_pellet_melt: 'extrudate',
};

/**
 * Where a casting sits in the tonal order.
 *
 * Applied only to the shared body materials (`MAT_cast_gray`, `MAT_cast_light`,
 * `MAT_barrel_steel`), which is what stops the motor, the gearbox, the hopper
 * and the barrel from all landing on the same grey. Fasteners, recesses and
 * screws keep their role finish everywhere, because a bolt is a bolt.
 */
const GROUP_BODY_FINISH: Record<string, MachineFinishKey> = {
  motor: 'gunmetal',
  coupling: 'bodyLight',
  gearbox: 'body',
  frame: 'graphite',
  barrel: 'bodyDark',
  barrel_bot: 'graphite',
  barrel_port: 'bodyDark',
  main_feed: 'aluminium',
  main_feeder: 'brightMetal',
  side_feed: 'aluminium',
  side_feeder: 'brightMetal',
  vent: 'bodyLight',
  die: 'bodyLight',
  melt_adapter: 'bodyLight',
  screen_pack: 'bodyLight',
  screen_inlet: 'bodyLight',
  screen_outlet: 'bodyLight',
  sensor: 'bodyLight',
};

/** Materials whose finish is decided by the part group rather than the role. */
const BODY_MATERIALS = new Set(['MAT_cast_gray', 'MAT_cast_light', 'MAT_barrel_steel']);

/** Blender suffixes a duplicated material `.001`; it is the same finish. */
export function canonicalMaterialName(name: string): string {
  return name.replace(/\.\d{3}$/, '');
}

/**
 * Barrel zone covers alternate by one step.
 *
 * Eight identical caps in a row read as a single extruded rail. A barely
 * perceptible alternation gives the eye the module rhythm the real machine
 * has, without introducing a second colour.
 */
function barrelZoneAlternates(partId: string | undefined): boolean {
  const zone = partId?.match(/BARREL_TZ_(\d+)/);
  return zone ? Number(zone[1]) % 2 === 0 : false;
}

/** Resolve the finish for one mesh from its authored metadata. */
export function resolveMachineFinishKey(
  partGroup: string | undefined,
  partId: string | undefined,
  materialName: string,
): MachineFinishKey {
  const material = canonicalMaterialName(materialName);
  const role = MATERIAL_ROLE[material] ?? 'body';

  if (!BODY_MATERIALS.has(material)) return role;

  if (partGroup === 'barrel_top') {
    return barrelZoneAlternates(partId) ? 'bodyDarkAlt' : 'bodyDark';
  }
  const grouped = partGroup ? GROUP_BODY_FINISH[partGroup] : undefined;
  return grouped ?? role;
}

/** The colour a finish resolves to on the active theme. */
export function machineFinishColor(key: MachineFinishKey, dark: boolean): string {
  const finish = MACHINE_FINISHES[key];
  return dark ? finish.color : (finish.lightColor ?? finish.color);
}

/**
 * Reflection strength.
 *
 * Deliberately low. The previous stage ran the environment at 0.76/0.92, and
 * because most of the palette was metallic the housings took their value almost
 * entirely from the reflection and clipped to white whatever their base colour
 * said. At these levels the base colour is what you see, and the environment
 * only softens the terminator.
 */
export const MACHINE_ENV_INTENSITY = { light: 0.34, dark: 0.30 } as const;

/**
 * Specular effects the asset ships that this console does not want.
 *
 * The export carries `KHR_materials_anisotropy`, and it carries it on exactly
 * the four materials that were blowing out: the hopper shells at 0.55 and 0.72,
 * the screws at 0.40 and the barrel at 0.25. three.js honours the extension by
 * upgrading those materials to `MeshPhysicalMaterial` and stretching their
 * specular lobe along one axis -- which on a brushed hopper in a studio is
 * exactly right, and on a near-black dashboard is a white streak that swallows
 * the geometry underneath it. Measured on the stage, the hopper's cylindrical
 * shell rendered at #B3BBC1 against a base colour of #747D86, and screw flights
 * at #BEC0C1 against #929AA2 with the valleys beside them at #121212: the
 * "white-and-black noise instead of a screw" in one number.
 *
 * Re-grading colour, metalness and roughness could never fix that, because the
 * value it was showing was not coming from any of the three. So the anisotropy
 * is cleared here, along with the other physical lobes an export could add,
 * and the finish below is what decides the highlight.
 */
function clearPhysicalSpecular(material: MeshStandardMaterial): void {
  const physical = material as MeshStandardMaterial & {
    anisotropy?: number;
    anisotropyRotation?: number;
    clearcoat?: number;
    iridescence?: number;
    sheen?: number;
    specularIntensity?: number;
  };
  if (physical.anisotropy !== undefined) {
    physical.anisotropy = 0;
    physical.anisotropyRotation = 0;
  }
  if (physical.clearcoat !== undefined) physical.clearcoat = 0;
  if (physical.iridescence !== undefined) physical.iridescence = 0;
  if (physical.sheen !== undefined) physical.sheen = 0;
}

/**
 * Write a finish onto a cloned standard material.
 *
 * Maps, transparency and normal data are left exactly as loaded: this asset
 * currently ships none, but a later export may, and a re-grade should never be
 * what silently drops them.
 */
export function applyMachineFinish(
  material: MeshStandardMaterial,
  key: MachineFinishKey,
  dark: boolean,
): boolean {
  if (!material.isMeshStandardMaterial) return false;
  const finish = MACHINE_FINISHES[key];
  material.color.set(dark ? finish.color : (finish.lightColor ?? finish.color));
  material.metalness = finish.metalness;
  material.roughness = finish.roughness;
  material.envMapIntensity = MACHINE_ENV_INTENSITY[dark ? 'dark' : 'light'];
  clearPhysicalSpecular(material);
  material.needsUpdate = true;
  return true;
}

/** True when a material still carries a specular lobe the finish does not own. */
export function machineFinishHasStraySpecular(material: MeshStandardMaterial): boolean {
  const physical = material as MeshStandardMaterial & {
    anisotropy?: number;
    clearcoat?: number;
    iridescence?: number;
    sheen?: number;
  };
  return Boolean(
    (physical.anisotropy ?? 0) > 0 ||
      (physical.clearcoat ?? 0) > 0 ||
      (physical.iridescence ?? 0) > 0 ||
      (physical.sheen ?? 0) > 0,
  );
}
