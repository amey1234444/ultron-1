/**
 * Native stub for the 3D plant map.
 *
 * The web console renders `PlantScene3DCanvas.web.tsx`; this file exists so the
 * Expo/Metro native bundle can resolve the same import without pulling three.js
 * and @react-three/* into a build that has no WebGL canvas to draw into. The
 * shared wrapper never renders this — it short-circuits on `Platform.OS`.
 *
 * The props live in `./types`, which both builds import, so there is nothing
 * here that can fall out of step with the real implementation.
 */
import type { PlantScene3DCanvasProps } from './types';

export type {
  PartNode,
  PlantCalloutFacts,
  PlantCameraCommand,
  PlantCameraMode,
  PlantScene3DCanvasProps,
} from './types';

export default function PlantScene3DCanvas(_props: PlantScene3DCanvasProps): React.ReactElement | null {
  return null;
}
