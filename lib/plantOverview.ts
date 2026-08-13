// Shared model for the dashboard's Plant Overview map. Super admins position
// the tags and size the illustration; everyone else renders exactly what was
// saved. Coordinates live in the map's fixed 640x330 viewBox so the layout is
// resolution independent.
//
// The map itself now renders the 3D plant (see `scene3d` and lib/plantScene3d).
// The 2D `tags` below are kept because they are the source of the area names
// that live telemetry is matched against, and because previously saved layouts
// must survive a round trip through this normalizer.

import {
  DEFAULT_PLANT_SCENE_3D,
  normalizePlantScene3D,
  type PlantScene3DConfig,
} from './plantScene3d';

export const PLANT_MAP_WIDTH = 640;
export const PLANT_MAP_HEIGHT = 330;

export type PlantTagStatus = 'auto' | 'healthy' | 'warning' | 'critical' | 'offline';

export type PlantTag = {
  id: string;
  name: string;
  /** Pin position (what the tag points at). */
  x: number;
  y: number;
  /** Top-left corner of the callout label. */
  labelX: number;
  labelY: number;
  /** `auto` derives the dot colour from live telemetry for the matching area. */
  status: PlantTagStatus;
};

export type PlantOverviewConfig = {
  /** Illustration size as a percentage of the card, 40-130. */
  imageScale: number;
  tags: PlantTag[];
  /** The 3D plant map that replaced the illustration. */
  scene3d: PlantScene3DConfig;
};

export const DEFAULT_PLANT_OVERVIEW: PlantOverviewConfig = {
  imageScale: 100,
  scene3d: DEFAULT_PLANT_SCENE_3D,
  tags: [
    { id: 'compressor', name: 'Compressor Area', x: 250, y: 104, labelX: 78, labelY: 8, status: 'auto' },
    { id: 'boiler', name: 'Boiler Area', x: 478, y: 104, labelX: 350, labelY: 10, status: 'auto' },
    { id: 'turbine', name: 'Turbine Hall', x: 540, y: 152, labelX: 494, labelY: 70, status: 'auto' },
    { id: 'utility', name: 'Utility Area', x: 214, y: 226, labelX: 38, labelY: 186, status: 'auto' },
    { id: 'pump', name: 'Process Pump Line', x: 366, y: 240, labelX: 172, labelY: 250, status: 'auto' },
    { id: 'airlock', name: 'Rotary Airlock', x: 470, y: 234, labelX: 452, labelY: 254, status: 'auto' },
  ],
};

export function clampToMap(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.round(value)));
}

function isTagStatus(value: unknown): value is PlantTagStatus {
  return value === 'auto' || value === 'healthy' || value === 'warning' || value === 'critical' || value === 'offline';
}

// Accepts anything (API payload, stored JSON) and returns a safe config,
// dropping malformed tags rather than throwing.
export function normalizePlantOverview(input: unknown): PlantOverviewConfig {
  if (!input || typeof input !== 'object') return DEFAULT_PLANT_OVERVIEW;
  const raw = input as { imageScale?: unknown; tags?: unknown; scene3d?: unknown };
  const scale = typeof raw.imageScale === 'number' && Number.isFinite(raw.imageScale) ? raw.imageScale : 100;
  const tagsInput = Array.isArray(raw.tags) ? raw.tags : [];
  const tags: PlantTag[] = [];
  for (const entry of tagsInput) {
    if (!entry || typeof entry !== 'object') continue;
    const tag = entry as Record<string, unknown>;
    const id = typeof tag.id === 'string' && tag.id.trim() ? tag.id.trim() : '';
    const name = typeof tag.name === 'string' ? tag.name.trim().slice(0, 40) : '';
    if (!id || !name) continue;
    if (tags.some((existing) => existing.id === id)) continue;
    tags.push({
      id,
      name,
      x: clampToMap(Number(tag.x), PLANT_MAP_WIDTH),
      y: clampToMap(Number(tag.y), PLANT_MAP_HEIGHT),
      labelX: clampToMap(Number(tag.labelX), PLANT_MAP_WIDTH),
      labelY: clampToMap(Number(tag.labelY), PLANT_MAP_HEIGHT),
      status: isTagStatus(tag.status) ? tag.status : 'auto',
    });
    if (tags.length >= 24) break;
  }
  return {
    imageScale: Math.max(40, Math.min(130, Math.round(scale))),
    tags: tags.length > 0 ? tags : DEFAULT_PLANT_OVERVIEW.tags,
    scene3d: normalizePlantScene3D(raw.scene3d),
  };
}

export function newPlantTagId(): string {
  return `tag-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}
