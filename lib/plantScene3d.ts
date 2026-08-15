// Shared model for the dashboard's 3D Plant Overview.
//
// The plant map renders real geometry (a GLB exported from Blender) instead of
// an illustration. Super admins place components, size them, recolour or hide
// individual parts of a model, and draw the dotted service connections between
// components. Everyone else renders exactly what was saved.
//
// Coordinates are metres in the glTF/Three.js frame: X right, Y up, Z toward the
// camera. The Blender master is authored Z-up and converted on export, so the
// component origin is the centre of the building footprint at ground level and a
// component placed at (0, 0) sits flat on the ground plane.

export type PlantModelKey = 'utility-building' | 'power-house';

/**
 * Registry of every component model the plant editor can place.
 *
 * `footprint` / `height` are the model's *overall* extents (including anything
 * that sits outside the building itself, such as the power house transformer
 * bay), because the only thing they drive is camera framing.
 */
export const PLANT_MODELS: Record<
  PlantModelKey,
  { name: string; url: string; footprint: [number, number]; height: number }
> = {
  'utility-building': {
    name: 'Industrial Utility Building',
    url: '/models/plant/utility-building.glb',
    footprint: [8.8, 7.6],
    height: 5.03,
  },
  'power-house': {
    name: 'Electrical / Power House',
    url: '/models/plant/power-house.glb',
    footprint: [15.3, 9.3],
    height: 5.91,
  },
};

export const PLANT_MODEL_KEYS = Object.keys(PLANT_MODELS) as PlantModelKey[];

export const PLANT_PART_COLORS = [
  '#B7BCC3', '#6C7480', '#2B3038', '#4E5A66', '#8A9099',
  '#0E4F55', '#2FA3B5', '#7DD3FC', '#3FBF6A', '#D9962B',
  '#D64545', '#8B5CF6', '#E8E3D8', '#111418',
] as const;

/** Shared active hue for selections and inter-component service runs. */
export const CONNECTION_COLOR = '#3FBF6A';

export const CONNECTION_KINDS = ['electrical', 'network', 'utility', 'data', 'air'] as const;
export type PlantConnectionKind = (typeof CONNECTION_KINDS)[number];

export type PlantComponentStatus = 'auto' | 'healthy' | 'warning' | 'critical' | 'offline';

/**
 * A super admin's edit to one named node of a model.
 *
 * `hidden` is the "delete this part" flag — it is stored rather than destructive,
 * so "Restore all parts" is always available and nothing is ever lost.
 */
export type PlantPartOverride = {
  hidden?: boolean;
  /** Any CSS hex colour. `null`/absent keeps the material authored in Blender. */
  color?: string | null;
  /** Per-part size multiplier, applied about the part's own bounding-box centre. */
  scale?: number;
};

export type PlantComponent3D = {
  id: string;
  /** Display name, and the key used to match live telemetry for `auto` status. */
  name: string;
  model: PlantModelKey;
  /** Ground position in metres (X right, Z toward camera). */
  x: number;
  z: number;
  /** Yaw in degrees about the world up axis. */
  rotation: number;
  /** Size of this one component in the plant map, 25-300%. */
  scale: number;
  status: PlantComponentStatus;
  /** Per-part edits, keyed by the node name exported from Blender. */
  parts: Record<string, PlantPartOverride>;
};

export type PlantConnection3D = {
  id: string;
  fromId: string;
  fromPort: string;
  toId: string;
  toPort: string;
  kind: PlantConnectionKind;
};

export type PlantScene3DConfig = {
  /** Renders the 3D plant map. When false the panel shows the empty state. */
  enabled: boolean;
  /** Size of the whole model in the plant map, 25-300%. */
  modelScale: number;
  /** Ground grid under the components. */
  showGrid: boolean;
  showLabels: boolean;
  components: PlantComponent3D[];
  connections: PlantConnection3D[];
};

export const PART_SCALE_MIN = 0.1;
export const PART_SCALE_MAX = 4;
export const COMPONENT_SCALE_MIN = 25;
export const COMPONENT_SCALE_MAX = 300;

/**
 * The seeded plant yard.
 *
 * Six areas laid out as a real site reads: process and utility blocks to the
 * west, the manufacturing hall on the centre line, the electrical compound and
 * its substation to the east, and the gateway house pulled forward on its own so
 * the network runs fan out from a single visible point.
 *
 * Only two models exist, so the areas are differentiated the way a site plan
 * differentiates them — by footprint, orientation and scale — rather than by
 * inventing geometry. Spacing is checked against the *overall* extents above:
 * the power house origin is the centre of its building, and its transformer bay
 * runs a further ~9.8 m along +X, which is why the two power-house instances are
 * counter-rotated so their bays face away from each other.
 */
export const DEFAULT_PLANT_SCENE_3D: PlantScene3DConfig = {
  enabled: true,
  modelScale: 100,
  showGrid: true,
  showLabels: true,
  components: [
    {
      id: 'utility',
      name: 'Utility Area',
      model: 'utility-building',
      x: -26,
      z: -3,
      rotation: 0,
      scale: 100,
      status: 'auto',
      parts: {},
    },
    {
      // The hall: the largest footprint on the site and the one the default
      // camera frames, so it carries the centre line.
      id: 'manufacturing',
      name: 'Manufacturing Unit',
      model: 'utility-building',
      x: -2,
      z: 7,
      rotation: 0,
      scale: 132,
      status: 'auto',
      parts: {},
    },
    {
      id: 'power-house',
      name: 'Electrical / Power House',
      model: 'power-house',
      x: 18,
      z: -7,
      rotation: 0,
      scale: 100,
      status: 'auto',
      parts: {},
    },
    {
      // Counter-rotated so its transformer bay runs west, back toward the yard,
      // instead of colliding with the power house bay.
      id: 'substation',
      name: 'Substation',
      model: 'power-house',
      x: 26,
      z: 15,
      rotation: 180,
      scale: 82,
      status: 'auto',
      parts: {},
    },
    {
      // Small, forward and alone: the network hub reads as infrastructure rather
      // than as another process block.
      id: 'gateway',
      name: 'Gateway House',
      model: 'utility-building',
      x: 4,
      z: -18,
      rotation: 0,
      scale: 62,
      status: 'auto',
      parts: {},
    },
    {
      id: 'cooling',
      name: 'Cooling System',
      model: 'utility-building',
      x: -25,
      z: 17,
      rotation: 90,
      scale: 78,
      status: 'auto',
      parts: {},
    },
  ],
  connections: [
    // HV in, LV out: the power house feeds the yard, the substation backs it up.
    { id: 'c-power-utility', fromId: 'power-house', fromPort: 'PORT_POWER_OUT', toId: 'utility', toPort: 'PORT_ELECTRICAL_IN', kind: 'electrical' },
    { id: 'c-power-manufacturing', fromId: 'power-house', fromPort: 'PORT_UTILITY', toId: 'manufacturing', toPort: 'PORT_ELECTRICAL_IN', kind: 'electrical' },
    { id: 'c-substation-power', fromId: 'substation', fromPort: 'PORT_POWER_OUT', toId: 'power-house', toPort: 'PORT_POWER_IN', kind: 'electrical' },
    { id: 'c-power-cooling', fromId: 'power-house', fromPort: 'PORT_GROUNDING', toId: 'cooling', toPort: 'PORT_ELECTRICAL_IN', kind: 'electrical' },
    // Every telemetry run terminates at the gateway house — that is the shape
    // the connection tree in the inspector is meant to show.
    { id: 'c-gateway-utility', fromId: 'gateway', fromPort: 'PORT_DATA', toId: 'utility', toPort: 'PORT_NETWORK', kind: 'network' },
    { id: 'c-gateway-manufacturing', fromId: 'gateway', fromPort: 'PORT_NETWORK', toId: 'manufacturing', toPort: 'PORT_NETWORK', kind: 'network' },
    { id: 'c-gateway-power', fromId: 'gateway', fromPort: 'PORT_UTILITY_OUT', toId: 'power-house', toPort: 'PORT_NETWORK', kind: 'data' },
    // Compressed air from the utility block to the hall.
    { id: 'c-utility-manufacturing', fromId: 'utility', fromPort: 'PORT_AIR', toId: 'manufacturing', toPort: 'PORT_AIR', kind: 'air' },
  ],
};

// ---------------------------------------------------------------------------
// Normalisation
//
// Everything below accepts arbitrary input (API payload, stored JSONB) and
// returns a safe config, dropping malformed entries rather than throwing. The
// save path runs through this too, so anything not understood here is silently
// discarded — keep it in sync when adding fields.
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isStatus(value: unknown): value is PlantComponentStatus {
  return value === 'auto' || value === 'healthy' || value === 'warning' || value === 'critical' || value === 'offline';
}

function isModelKey(value: unknown): value is PlantModelKey {
  return typeof value === 'string' && value in PLANT_MODELS;
}

/** Node names come from Blender, so they are ASCII, uppercase and underscored. */
function isPartName(value: string): boolean {
  return value.length > 0 && value.length <= 80 && /^[A-Za-z0-9_.-]+$/.test(value);
}

export function normalizePartOverride(input: unknown): PlantPartOverride | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const out: PlantPartOverride = {};
  if (raw.hidden === true) out.hidden = true;
  if (typeof raw.color === 'string' && HEX.test(raw.color)) out.color = raw.color.toLowerCase();
  if (raw.scale !== undefined) {
    const scale = num(raw.scale, 1, PART_SCALE_MIN, PART_SCALE_MAX);
    // Only store a real deviation, so untouched parts stay out of the payload.
    if (Math.abs(scale - 1) > 1e-4) out.scale = Math.round(scale * 1000) / 1000;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function normalizeParts(input: unknown): Record<string, PlantPartOverride> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, PlantPartOverride> = {};
  let count = 0;
  for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isPartName(name)) continue;
    const override = normalizePartOverride(value);
    if (!override) continue;
    out[name] = override;
    // A model has a few hundred nodes; this bounds a hostile payload.
    if (++count >= 600) break;
  }
  return out;
}

function normalizeComponent(input: unknown, seen: Set<string>): PlantComponent3D | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim().slice(0, 48) : '';
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '';
  if (!id || !name || seen.has(id)) return null;
  seen.add(id);
  return {
    id,
    name,
    model: isModelKey(raw.model) ? raw.model : 'utility-building',
    x: Math.round(num(raw.x, 0, -400, 400) * 100) / 100,
    z: Math.round(num(raw.z, 0, -400, 400) * 100) / 100,
    rotation: Math.round(num(raw.rotation, 0, -360, 360) * 10) / 10,
    scale: Math.round(num(raw.scale, 100, COMPONENT_SCALE_MIN, COMPONENT_SCALE_MAX)),
    status: isStatus(raw.status) ? raw.status : 'auto',
    parts: normalizeParts(raw.parts),
  };
}

function normalizeConnection(input: unknown, ids: Set<string>, seen: Set<string>): PlantConnection3D | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim().slice(0, 48) : '';
  const fromId = typeof raw.fromId === 'string' ? raw.fromId.trim() : '';
  const toId = typeof raw.toId === 'string' ? raw.toId.trim() : '';
  // A connection to a component that no longer exists would render as a stray
  // line into the origin, so drop it rather than keeping a dangling reference.
  if (!id || seen.has(id) || !ids.has(fromId) || !ids.has(toId) || fromId === toId) return null;
  seen.add(id);
  const fromPort = typeof raw.fromPort === 'string' && isPartName(raw.fromPort) ? raw.fromPort : 'PORT_UTILITY_OUT';
  const toPort = typeof raw.toPort === 'string' && isPartName(raw.toPort) ? raw.toPort : 'PORT_ELECTRICAL_IN';
  const kind = CONNECTION_KINDS.includes(raw.kind as PlantConnectionKind) ? (raw.kind as PlantConnectionKind) : 'utility';
  return { id, fromId, fromPort, toId, toPort, kind };
}

export function normalizePlantScene3D(input: unknown): PlantScene3DConfig {
  if (!input || typeof input !== 'object') return DEFAULT_PLANT_SCENE_3D;
  const raw = input as Record<string, unknown>;

  const seenIds = new Set<string>();
  const components: PlantComponent3D[] = [];
  for (const entry of Array.isArray(raw.components) ? raw.components : []) {
    const component = normalizeComponent(entry, seenIds);
    if (component) components.push(component);
    if (components.length >= 60) break;
  }

  const seenConn = new Set<string>();
  const connections: PlantConnection3D[] = [];
  for (const entry of Array.isArray(raw.connections) ? raw.connections : []) {
    const connection = normalizeConnection(entry, seenIds, seenConn);
    if (connection) connections.push(connection);
    if (connections.length >= 120) break;
  }

  return {
    // An explicitly empty component list is a valid state (the admin cleared the
    // map); only a missing/!=array payload falls back to the seeded default.
    enabled: raw.enabled !== false,
    modelScale: Math.round(num(raw.modelScale, 100, COMPONENT_SCALE_MIN, COMPONENT_SCALE_MAX)),
    showGrid: raw.showGrid !== false,
    showLabels: raw.showLabels !== false,
    components: Array.isArray(raw.components) ? components : DEFAULT_PLANT_SCENE_3D.components,
    connections: Array.isArray(raw.connections) ? connections : DEFAULT_PLANT_SCENE_3D.connections,
  };
}

export function newComponentId(): string {
  return `cmp-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function newConnectionId(): string {
  return `con-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

/** Count of parts a super admin has hidden or restyled, for the editor summary. */
export function countPartEdits(parts: Record<string, PlantPartOverride>): {
  hidden: number;
  colored: number;
  resized: number;
} {
  let hidden = 0;
  let colored = 0;
  let resized = 0;
  for (const override of Object.values(parts)) {
    if (override.hidden) hidden += 1;
    if (override.color) colored += 1;
    if (override.scale !== undefined) resized += 1;
  }
  return { hidden, colored, resized };
}
