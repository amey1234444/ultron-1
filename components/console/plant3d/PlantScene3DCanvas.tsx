/**
 * Native stub for the 3D plant map.
 *
 * The web console renders `PlantScene3DCanvas.web.tsx`; this file exists so the
 * Expo/Metro native bundle can resolve the same import without pulling three.js
 * and @react-three/* into a build that has no WebGL canvas to draw into. The
 * shared wrapper never renders this — it short-circuits on `Platform.OS`.
 */
import type { PlantScene3DConfig } from '../../../lib/plantScene3d';

export type PartNode = { name: string; depth: number; kind: 'mesh' | 'group' | 'port' | 'anchor' };

export type PlantScene3DCanvasProps = {
  scene: PlantScene3DConfig;
  statusColors: Record<string, string>;
  dark: boolean;
  editable?: boolean;
  selectedComponentId?: string | null;
  selectedPart?: string | null;
  onSelectPart?: (componentId: string, partName: string) => void;
  onPartsDiscovered?: (componentId: string, parts: PartNode[]) => void;
};

export default function PlantScene3DCanvas(_props: PlantScene3DCanvasProps): React.ReactElement | null {
  return null;
}
