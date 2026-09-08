/**
 * The twin-screw extruder, rendered from the real 3D asset.
 *
 * This replaces the hand-authored SVG elevation the template used to draw. The
 * machine is `public/models/machines/twin-screw-extruder.glb`, built by
 * `polymer-plant-3d/twin-screw/` — a modular barrel, a two-path feeding system
 * and two complete Erdmenger screw shafts that genuinely self-wipe.
 *
 * Why the camera is locked, and why it is `manual`
 * ------------------------------------------------
 * Everything downstream of this drawing positions itself in the artwork's own
 * 1648 x 928 space: `MeasurementPad` places instruments from the registry,
 * `machineConnectors` turns those into `rx`/`ry` fractions, and `TrailBoard`
 * stores every saved trail endpoint against them. A camera the user could orbit
 * would move a pad away from the feature it measures on every frame and
 * invalidate every saved layout. So the camera is a fixed orthographic
 * elevation, framed so the machine lands on the sheet where the registry
 * expects it:
 *
 *     sheet_x = (world_x - X0) * SHEET_SCALE
 *     sheet_y = (Y1 - world_y) * SHEET_SCALE
 *
 * It is also marked `manual`. Left to itself, react-three-fiber rewrites an
 * orthographic camera's frustum to the canvas's *pixel* dimensions on mount and
 * on every resize — half the canvas width in world units, not the metres this
 * frustum is expressed in. That silently replaced a +/-1.7 m frustum with a
 * +/-700 one and shrank the whole machine to well under a pixel, which reads
 * exactly like a canvas that never mounted. `manual: true` is what stops it,
 * and `SheetFrustum` below re-applies the frustum on resize instead.
 *
 * The glTF arrives +Y up, so world x is machine length and world y is height.
 */
'use client';

import { useGLTF } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';

import {
  TWIN_SCREW_ARTWORK_HEIGHT,
  TWIN_SCREW_ARTWORK_WIDTH,
  TWIN_SCREW_SHEET_SCALE,
  TWIN_SCREW_SHEET_X0,
  TWIN_SCREW_SHEET_Y1,
} from '../../../lib/twinScrewExtruderPoints';

const MODEL_URL = '/models/machines/twin-screw-extruder.glb';

/** Ortho frustum that maps the sheet onto world space, from the constants above. */
const HALF_W = TWIN_SCREW_ARTWORK_WIDTH / TWIN_SCREW_SHEET_SCALE / 2;
const HALF_H = TWIN_SCREW_ARTWORK_HEIGHT / TWIN_SCREW_SHEET_SCALE / 2;
const CENTRE_X = TWIN_SCREW_SHEET_X0 + HALF_W;
const CENTRE_Y = TWIN_SCREW_SHEET_Y1 - HALF_H;
const CAMERA_Z = 8;

export type TwinScrewExtruder3DProps = {
  /** Draw the barrel closed instead of cut away. */
  closed?: boolean;
  /** Console theme, which decides the key/fill balance. */
  dark?: boolean;
};

/**
 * Holds the frustum at the sheet's own scale.
 *
 * The host is laid out at the sheet's aspect ratio, so a fixed world-space
 * frustum is correct at every size and only has to be re-asserted after R3F
 * has measured the canvas.
 */
function SheetFrustum() {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const size = useThree((s) => s.size);

  useLayoutEffect(() => {
    if (!camera.isOrthographicCamera) return;
    camera.left = -HALF_W;
    camera.right = HALF_W;
    camera.top = HALF_H;
    camera.bottom = -HALF_H;
    camera.near = 0.01;
    camera.far = 40;
    camera.position.set(CENTRE_X, CENTRE_Y, CAMERA_Z);
    camera.up.set(0, 1, 0);
    camera.lookAt(CENTRE_X, CENTRE_Y, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  return null;
}

function Machine({ closed }: { closed: boolean }) {
  const { scene } = useGLTF(MODEL_URL);

  // One clone per mount so two canvases on a page cannot fight over visibility.
  const model = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // The reference elevation is the cutaway: the removable front panel of
      // each barrel module comes off so the screw pair is visible. They are
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
        intensity={dark ? 0.55 : 0.78}
        color={dark ? '#b9cbd6' : '#ffffff'}
        groundColor={dark ? '#12181d' : '#c8cbc8'}
      />
      <directionalLight position={[-2.4, 4.6, 5.2]} intensity={dark ? 2.0 : 2.25} />
      <directionalLight position={[5.6, 2.0, 3.2]} intensity={dark ? 0.6 : 0.7} />
      <directionalLight position={[1.6, 3.2, -4.4]} intensity={dark ? 0.9 : 0.95} />
      {/* narrow fill into the open barrel, so the screws read as machined steel
          instead of sitting in the shadow of their own bore */}
      <pointLight
        position={[2.0, 0.46, 1.15]}
        intensity={dark ? 2.6 : 2.6}
        distance={3.4}
        decay={2}
      />
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
      // `manual` stops R3F rewriting the frustum in pixels; SheetFrustum owns it.
      camera={{
        manual: true,
        left: -HALF_W,
        right: HALF_W,
        top: HALF_H,
        bottom: -HALF_H,
        near: 0.01,
        far: 40,
        position: [CENTRE_X, CENTRE_Y, CAMERA_Z],
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <SheetFrustum />
      <Lights dark={dark} />
      <Suspense fallback={null}>
        <Machine closed={closed} />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload(MODEL_URL);
