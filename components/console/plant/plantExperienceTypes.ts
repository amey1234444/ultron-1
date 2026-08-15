/**
 * Contract for the plant experience, shared by the web implementation and the
 * native stub — the same split, and the same reason, as `plant3d/types.ts`.
 */
import type { ConsolePalette } from '../../../lib/consoleTheme';
import type { PlantAssetTelemetry } from '../../../lib/plantAnalytics';
import type { PlantScene3DConfig } from '../../../lib/plantScene3d';
import type { PlantViewMode } from '../../../lib/plantViewState';
import type { PlantCalloutFacts } from '../plant3d/types';

export type PlantExperienceProps = {
  mode: PlantViewMode;
  onEnter: () => void;
  onExit: () => void;

  scene: PlantScene3DConfig;
  statusColors: Record<string, string>;
  callouts: Record<string, PlantCalloutFacts>;
  palette: ConsolePalette;
  isDark: boolean;

  plantName: string;
  live: boolean;

  assets: PlantAssetTelemetry[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;

  canEdit?: boolean;
  onEdit?: () => void;
};
