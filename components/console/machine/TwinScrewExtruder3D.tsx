/**
 * Native stub for the twin-screw 3D asset.
 *
 * The web console renders `TwinScrewExtruder3D.web.tsx`; this file exists so
 * the Expo/Metro native bundle can resolve the same import without pulling
 * three.js and @react-three/* into a build that has no WebGL canvas to draw
 * into. `TwinScrewExtruder` short-circuits on `Platform.OS` and never renders
 * this, so the instrument pads still draw on native — over an empty stage.
 *
 * Mirrors the pattern in `components/console/plant3d/PlantScene3DCanvas.tsx`.
 */

export type TwinScrewExtruder3DProps = {
  closed?: boolean;
  dark?: boolean;
};

export default function TwinScrewExtruder3D(
  _props: TwinScrewExtruder3DProps,
): React.ReactElement | null {
  return null;
}
