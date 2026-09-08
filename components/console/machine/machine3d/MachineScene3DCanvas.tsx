/**
 * Native stub for the 3D machine stage.
 *
 * The web console renders `MachineScene3DCanvas.web.tsx`; this file exists so
 * the Expo/Metro native bundle can resolve the same import without pulling
 * three.js and @react-three/* into a build that has no WebGL canvas to draw
 * into. `MachineStage3D` short-circuits on `Platform.OS` and never renders it.
 *
 * The props live in `./types`, which both builds import, so there is nothing
 * here that can fall out of step with the real implementation.
 *
 * Mirrors `plant3d/PlantScene3DCanvas.tsx`.
 */
import type { MachineScene3DCanvasProps } from './types';

export type {
  MachineCameraCommand,
  MachineCameraMode,
  MachineScene3DCanvasProps,
  ProjectedPoint,
} from './types';

export default function MachineScene3DCanvas(
  _props: MachineScene3DCanvasProps,
): React.ReactElement | null {
  return null;
}
