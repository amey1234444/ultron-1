/**
 * The twin-screw extruder, rendered from the real 3D asset.
 *
 * This replaces the hand-authored SVG elevation the template used to draw. The
 * machine is `public/models/machines/twin-screw-extruder.glb`, built by
 * `polymer-plant-3d/twin-screw/` — a modular barrel, a two-path feeding system
 * and two complete Erdmenger screw shafts that genuinely self-wipe.
 *
 * Why the camera is locked
 * ------------------------
 * Everything downstream of this drawing positions itself in the artwork's own
 * 1648 x 928 space: `MeasurementPad` places instruments from the registry,
 * `machineConnectors` turns those into `rx`/`ry` fractions, and `TrailBoard`
 * stores every saved trail endpoint against them. A camera the user could
 * orbit would move a pad away from the feature it measures on every frame and
 * invalidate every saved layout.
 *
 * So the camera is a fixed orthographic elevation, framed so the machine lands
 * on the sheet exactly where the registry expects it:
 *
 *     sheet_x = (world_x - X0) * SHEET_SCALE
 *     sheet_y = (Y1 - world_y) * SHEET_SCALE
 *
 * Those three constants are the whole contract between the asset and the
 * registry. `lib/twinScrewExtruderPoints.ts` carries the same numbers, and the
 * anchors in it were computed from this asset's own geometry rather than
 * measured by eye.
 *
 * The glTF arrives +Y up, so world x is machine length and world y is height.
 */
'use client';

import { useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';

import {
  TWIN_SCREW_SHEET_SCALE,
  TWIN_SCREW_SHEET_X0,
  TWIN_SCREW_SHEET_Y1,
  TWIN_SCREW_ARTWORK_WIDTH,
  TWIN_SCREW_ARTWORK_HEIGHT,
} from '../../../lib/twinScrewExtruderPoints';

const MODEL_URL = '/models/machines/twin-screw-extruder.glb';
const DRACO_PATH = '/draco/';

/** Ortho frustum that maps the sheet onto world space, from the constants above. */
const HALF_W = TWIN_SCREW_ARTWORK_WIDTH / TWIN_SCREW_SHEET_SCALE / 2;
const HALF_H = TWIN_SCREW_ARTWORK_HEIGHT / TWIN_SCREW_SHEET_SCALE / 2;
const CENTRE_X = TWIN_SCREW_SHEET_X0 + HALF_W;
const CENTRE_Y = TWIN_SCREW_SHEET_Y1 - HALF_H;

export type TwinScrewExtruder3DProps = {
  /** Draw the barrel closed instead of cut away. */
  closed?: boolean;
  /** Console theme, which decides the key/fill balance. */
  dark?: boolean;
};

function Machine({ closed }: { closed: boolean }) {
  const { scene } = useGLTF(MODEL_URL, DRACO_PATH);

  // One clone per mount so two canvases on a page cannot fight over visibility.
  const model = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      // The reference elevation is the cutaway: the removable front panels of
      // each barrel module come off so the screw pair is visible. They are
      // separate objects in the asset precisely so this is a visibility toggle
      // and never leaves a floating edge.
      const group = (mesh.userData?.partGroup as string) ?? '';
      if (group === 'barrel_front') mesh.visible = closed;
    });
  }, [model, closed]);

  return <primitive object={model} />;
}

/**
 * Studio rig matched to the validation renders in `docs/twin-screw-validation/`.
 *
 * Explicit lights rather than an HDRI: the console must render identically
 * offline and on a locked-down network, and a preset environment would fetch
 * from a CDN on first paint.
 */
function Lights({ dark }: { dark: boolean }) {
  return (
    <>
      <hemisphereLight
        intensity={dark ? 0.5 : 0.78}
        color={dark ? '#b9cbd6' : '#ffffff'}
        groundColor={dark ? '#12181d' : '#c8cbc8'}
      />
      <directionalLight position={[-2.4, 4.6, 5.2]} intensity={dark ? 1.85 : 2.25} />
      <directionalLight position={[5.6, 2.0, 3.2]} intensity={dark ? 0.55 : 0.7} />
      <directionalLight position={[1.6, 3.2, -4.4]} intensity={dark ? 0.85 : 0.95} />
      {/* narrow fill into the open barrel, so the screws read as machined steel
          instead of sitting in the shadow of their own bore */}
      <pointLight position={[2.0, 0.46, 1.15]} intensity={dark ? 2.4 : 2.6} distance={3.4} decay={2} />
    </>
  );
}

export default function TwinScrewExtruder3D({
  closed = false,
  dark = false,
}: TwinScrewExtruder3DProps) {
  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      camera={{
        left: -HALF_W,
        right: HALF_W,
        top: HALF_H,
        bottom: -HALF_H,
        near: 0.01,
        far: 40,
        position: [CENTRE_X, CENTRE_Y, 8],
      }}
      onCreated={({ gl, camera }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        camera.lookAt(CENTRE_X, CENTRE_Y, 0);
        camera.updateProjectionMatrix();
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <Lights dark={dark} />
      <Suspense fallback={null}>
        <Machine closed={closed} />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload(MODEL_URL, DRACO_PATH);
