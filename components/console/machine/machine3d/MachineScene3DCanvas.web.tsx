/**
 * The machine, on an orbitable 3D stage.
 *
 * The same shape as `plant3d/PlantScene3DCanvas`, scaled down to one asset: a
 * perspective camera the operator can orbit, a studio rig, and an in-canvas
 * projector that turns each instrument's model-space anchor into a screen
 * position every frame.
 *
 * Why the projector exists
 * ------------------------
 * On the old flat drawing an instrument pad was a fixed point on a sheet. On a
 * model it is a point on a surface, and the moment the camera moves it has to
 * move with it. `PointProjector` publishes `rx`/`ry` as fractions of the canvas,
 * which is exactly the shape `MachineConnector` already uses, so the pads, the
 * trail endpoints and the snap targets all keep working through the existing
 * contract rather than a parallel one.
 *
 * Why the asset is not compressed
 * -------------------------------
 * It used to be Draco-compressed, which is why it never appeared: Draco
 * decodes in a WebAssembly worker, nothing else in this app has ever used
 * it -- every shipped GLB has an empty `extensionsUsed` and every working
 * `useGLTF` call passes no decoder path -- and the production CSP is
 * `script-src 'self'`, which does not permit WebAssembly at all. The loader
 * simply never resolved, and a suspended loader is silent. The asset is now
 * plain glTF and loads through exactly the path the plant models proved.
 *
 * Why the framing is done by hand
 * -------------------------------
 * This used drei's `<Bounds fit clip>`. `clip` sets the camera's near and far
 * planes to tightly bracket its children — and because the model loads inside a
 * Suspense boundary, the first fit ran against an *empty* box and bracketed
 * nothing. The camera's position and projection stayed perfectly sane, so the
 * pads went on projecting exactly where they belonged while every triangle of
 * the machine fell outside the clip range. Pads on an empty stage is a very
 * convincing impression of a canvas that never mounted.
 *
 * So framing is explicit here: the model's bounding box is measured once it has
 * actually loaded, and the camera, its clip planes and the orbit target are all
 * derived from that box. Nothing is framed before there is something to frame.
 */
'use client';

import { OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import type { MachineScene3DCanvasProps, ProjectedPoint } from './types';

export type { MachineScene3DCanvasProps, ProjectedPoint } from './types';

const OCCLUSION_EVERY = 6; // frames

/** Where the camera stands relative to the model, as a fraction of its size. */
const VIEW_DIR = new THREE.Vector3(0.35, 0.42, 1).normalize();
const FILL_MARGIN = 1.25;

type Loaded = { box: THREE.Box3; meshes: THREE.Mesh[] };

/* -------------------------------------------------------------------------- */
/* the asset                                                                   */
/* -------------------------------------------------------------------------- */

function Machine({
  modelUrl,
  closed,
  onLoaded,
  onSelectPart,
}: {
  modelUrl: string;
  closed: boolean;
  onLoaded: (loaded: Loaded) => void;
  onSelectPart?: (partId: string) => void;
}) {
  const { scene } = useGLTF(modelUrl);
  const model = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    const meshes: THREE.Mesh[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      meshes.push(mesh);
      // The reference view is the cutaway: the removable front panel of each
      // barrel module comes off so the screw pair is visible. They are separate
      // objects in the asset precisely so this is a visibility toggle.
      const group = (mesh.userData?.partGroup as string) ?? '';
      if (group === 'barrel_front') mesh.visible = closed;
    });

    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model);
    onLoaded({ box, meshes });
  }, [model, closed, onLoaded]);

  return (
    <primitive
      object={model}
      onPointerDown={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
        if (!onSelectPart) return;
        e.stopPropagation();
        const id = (e.object.userData?.partId as string) ?? e.object.name;
        onSelectPart(id);
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* framing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Frames the model once, from its real bounding box.
 *
 * Runs only after the asset has loaded, so the clip planes always bracket
 * something. Re-runs when the viewport aspect changes, because a machine this
 * long is width-limited on a wide stage and height-limited on a narrow one.
 */
function Framing({
  loaded,
  controls,
  resetKey,
}: {
  loaded: Loaded | null;
  controls: React.RefObject<OrbitControlsImpl | null>;
  resetKey: number;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);

  useEffect(() => {
    if (!loaded || loaded.box.isEmpty()) return;

    const centre = loaded.box.getCenter(new THREE.Vector3());
    const extent = loaded.box.getSize(new THREE.Vector3());
    const aspect = Math.max(size.width, 1) / Math.max(size.height, 1);

    // Distance that fits the box on whichever axis is the binding constraint.
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const fitHeight = extent.y / 2 / Math.tan(vFov / 2);
    const fitWidth = extent.x / 2 / Math.tan(vFov / 2) / aspect;
    const distance = Math.max(fitHeight, fitWidth, 0.2) * FILL_MARGIN + extent.z / 2;

    camera.position.copy(centre).addScaledVector(VIEW_DIR, distance);
    camera.near = Math.max(distance / 200, 0.01);
    camera.far = distance * 8 + extent.length();
    camera.updateProjectionMatrix();
    camera.lookAt(centre);

    const c = controls.current;
    if (c) {
      c.target.copy(centre);
      c.minDistance = distance * 0.2;
      c.maxDistance = distance * 4;
      c.update();
    }
  }, [loaded, camera, size.width, size.height, controls, resetKey]);

  return null;
}

/* -------------------------------------------------------------------------- */
/* the projector                                                               */
/* -------------------------------------------------------------------------- */

function PointProjector({
  anchors,
  meshes,
  onProjectPoints,
  onReady,
}: {
  anchors: Readonly<Record<string, readonly [number, number, number]>>;
  meshes: THREE.Mesh[];
  onProjectPoints?: (points: ProjectedPoint[]) => void;
  onReady?: () => void;
}) {
  const { camera } = useThree();
  const tick = useRef(0);
  const announced = useRef(false);
  const occluded = useRef<Record<string, boolean>>({});

  const ray = useMemo(() => new THREE.Raycaster(), []);
  const world = useMemo(() => new THREE.Vector3(), []);
  const ndc = useMemo(() => new THREE.Vector3(), []);
  const camPos = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);

  const entries = useMemo(() => Object.entries(anchors), [anchors]);

  useFrame(() => {
    if (!onProjectPoints || entries.length === 0) return;
    tick.current += 1;
    const doOcclusion = meshes.length > 0 && tick.current % OCCLUSION_EVERY === 0;
    camera.getWorldPosition(camPos);

    const out: ProjectedPoint[] = [];
    for (const [code, a] of entries) {
      world.set(a[0], a[1], a[2]);
      ndc.copy(world).project(camera);

      const onScreen = ndc.z < 1 && Math.abs(ndc.x) < 1.4 && Math.abs(ndc.y) < 1.4;

      if (doOcclusion && onScreen) {
        dir.copy(world).sub(camPos);
        const len = dir.length();
        dir.normalize();
        ray.set(camPos, dir);
        ray.far = Math.max(len - 0.02, 0.01);
        occluded.current[code] = ray.intersectObjects(meshes, false).some((h) => h.object.visible);
      }

      out.push({
        code,
        rx: (ndc.x + 1) / 2,
        ry: (1 - ndc.y) / 2,
        distance: camPos.distanceTo(world),
        onScreen,
        occluded: occluded.current[code] ?? false,
      });
    }

    onProjectPoints(out);
    if (!announced.current) {
      announced.current = true;
      onReady?.();
    }
  });

  return null;
}

/* -------------------------------------------------------------------------- */
/* lighting                                                                    */
/* -------------------------------------------------------------------------- */

function Lights({ dark }: { dark: boolean }) {
  return (
    <>
      <hemisphereLight
        intensity={dark ? 0.55 : 0.8}
        color={dark ? '#b9cbd6' : '#ffffff'}
        groundColor={dark ? '#12181d' : '#c8cbc8'}
      />
      <directionalLight position={[-2.4, 4.6, 5.2]} intensity={dark ? 2.0 : 2.2} />
      <directionalLight position={[5.6, 2.0, 3.2]} intensity={dark ? 0.6 : 0.7} />
      <directionalLight position={[1.6, 3.2, -4.4]} intensity={dark ? 0.9 : 0.95} />
      {/* narrow fill into the open barrel so the screws read as machined steel
          rather than sitting in the shadow of their own bore */}
      <pointLight position={[2.0, 0.46, 1.15]} intensity={2.6} distance={3.4} decay={2} />
    </>
  );
}

/* -------------------------------------------------------------------------- */

export default function MachineScene3DCanvas({
  modelUrl,
  anchors,
  dark,
  closed = false,
  cameraMode = 'free',
  cameraCommand = null,
  onProjectPoints,
  onReady,
  onSelectPart,
}: MachineScene3DCanvasProps) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  // State, not a ref: the projector needs to re-read the mesh list when it
  // arrives, and a ref mutation does not re-render.
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const handleLoaded = useCallback((next: Loaded) => {
    setLoaded(next);
    const size = next.box.getSize(new THREE.Vector3());
    // One line, once: the browser console says whether the asset actually
    // arrived and how big it is, which is the first question every time the
    // stage looks empty.
    console.info(
      '[machine-3d] loaded %d meshes, extent %sm x %sm x %sm',
      next.meshes.length,
      size.x.toFixed(2),
      size.y.toFixed(2),
      size.z.toFixed(2),
    );
  }, []);

  const resetKey = cameraCommand?.kind === 'reset' || cameraCommand?.kind === 'fit'
    ? (cameraCommand?.id ?? 0)
    : 0;

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      camera={{ fov: 32, near: 0.05, far: 200, position: [2.4, 1.6, 4.6] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <Lights dark={dark} />

      <Suspense fallback={null}>
        <Machine
          modelUrl={modelUrl}
          closed={closed}
          onLoaded={handleLoaded}
          onSelectPart={onSelectPart}
        />
      </Suspense>

      <Framing loaded={loaded} controls={controls} resetKey={resetKey} />

      {/* Only projects once the machine is actually there, so pads can never
          again be drawn over an empty stage. */}
      {loaded ? (
        <PointProjector
          anchors={anchors}
          meshes={loaded.meshes}
          onProjectPoints={onProjectPoints}
          onReady={onReady}
        />
      ) : null}

      <OrbitControls
        ref={controls}
        makeDefault
        enabled={cameraMode === 'free'}
        enableDamping
        dampingFactor={0.09}
        minPolarAngle={0.08}
        maxPolarAngle={Math.PI * 0.9}
        zoomSpeed={0.8}
        panSpeed={0.7}
      />
    </Canvas>
  );
}

useGLTF.preload('/models/machines/twin-screw-extruder.glb');
