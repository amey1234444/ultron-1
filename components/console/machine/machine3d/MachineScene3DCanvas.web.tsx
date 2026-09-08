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
 * Occlusion is raycast on a throttle rather than every frame: it only changes
 * when the camera moves, and 36 rays against a 130k-triangle scene every frame
 * is not free.
 */
'use client';

import { Bounds, OrbitControls, useBounds, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import type { MachineScene3DCanvasProps, ProjectedPoint } from './types';

export type { MachineScene3DCanvasProps, ProjectedPoint } from './types';

const DRACO_PATH = '/draco/';
const OCCLUSION_EVERY = 6; // frames

/* -------------------------------------------------------------------------- */
/* the asset                                                                   */
/* -------------------------------------------------------------------------- */

function Machine({
  modelUrl,
  closed,
  onMeshes,
  onSelectPart,
}: {
  modelUrl: string;
  closed: boolean;
  onMeshes: (meshes: THREE.Mesh[]) => void;
  onSelectPart?: (partId: string) => void;
}) {
  const { scene } = useGLTF(modelUrl, DRACO_PATH);
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
    onMeshes(meshes);
  }, [model, closed, onMeshes]);

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

/** Frames the machine once the asset has loaded, so it fills the stage. */
function FitOnLoad({ deps }: { deps: unknown }) {
  const api = useBounds();
  useEffect(() => {
    const t = setTimeout(() => api.refresh().clip().fit(), 0);
    return () => clearTimeout(t);
  }, [api, deps]);
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
  const { camera, size } = useThree();
  const tick = useRef(0);
  const ready = useRef(false);
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
      const distance = camPos.distanceTo(world);

      if (doOcclusion && onScreen) {
        dir.copy(world).sub(camPos);
        const len = dir.length();
        dir.normalize();
        ray.set(camPos, dir);
        ray.far = Math.max(len - 0.02, 0.01);
        occluded.current[code] = ray
          .intersectObjects(meshes, false)
          .some((h) => h.object.visible);
      }

      out.push({
        code,
        rx: (ndc.x + 1) / 2,
        ry: (1 - ndc.y) / 2,
        distance,
        onScreen,
        occluded: occluded.current[code] ?? false,
      });
    }

    onProjectPoints(out);
    if (!ready.current) {
      ready.current = true;
      onReady?.();
    }
  });

  // republish immediately on resize so pads do not lag a layout change
  useEffect(() => {
    tick.current = 0;
  }, [size.width, size.height]);

  return null;
}

/* -------------------------------------------------------------------------- */
/* camera + lighting                                                           */
/* -------------------------------------------------------------------------- */

function CameraCommands({
  command,
  controls,
}: {
  command: MachineScene3DCanvasProps['cameraCommand'];
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const api = useBounds();
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!command || command.id === last.current) return;
    last.current = command.id;
    const c = controls.current;
    switch (command.kind) {
      case 'zoom-in':
        if (c) c.dollyIn?.(1.2), c.update();
        break;
      case 'zoom-out':
        if (c) c.dollyOut?.(1.2), c.update();
        break;
      case 'fit':
      case 'reset':
      case 'elevation':
        api.refresh().clip().fit();
        break;
    }
  }, [command, controls, api]);

  return null;
}

function Lights({ dark }: { dark: boolean }) {
  return (
    <>
      <hemisphereLight
        intensity={dark ? 0.55 : 0.8}
        color={dark ? '#b9cbd6' : '#ffffff'}
        groundColor={dark ? '#12181d' : '#c8cbc8'}
      />
      <directionalLight position={[-2.4, 4.6, 5.2]} intensity={dark ? 2.0 : 2.2} castShadow />
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
  const meshes = useRef<THREE.Mesh[]>([]);
  const setMeshes = useMemo(
    () => (next: THREE.Mesh[]) => {
      meshes.current = next;
    },
    [],
  );

  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      camera={{ fov: 32, near: 0.05, far: 60, position: [1.6, 1.5, 5.2] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <Lights dark={dark} />

      <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.15}>
          <Machine
            modelUrl={modelUrl}
            closed={closed}
            onMeshes={setMeshes}
            onSelectPart={onSelectPart}
          />
          <FitOnLoad deps={`${modelUrl}:${closed}`} />
        </Bounds>
        <CameraCommands command={cameraCommand} controls={controls} />
      </Suspense>

      <PointProjector
        anchors={anchors}
        meshes={meshes.current}
        onProjectPoints={onProjectPoints}
        onReady={onReady}
      />

      <OrbitControls
        ref={controls}
        makeDefault
        enabled={cameraMode === 'free'}
        enableDamping
        dampingFactor={0.09}
        minDistance={0.6}
        maxDistance={14}
        minPolarAngle={0.08}
        maxPolarAngle={Math.PI * 0.9}
        zoomSpeed={0.8}
        panSpeed={0.7}
      />
    </Canvas>
  );
}

useGLTF.preload('/models/machines/twin-screw-extruder.glb', DRACO_PATH);
