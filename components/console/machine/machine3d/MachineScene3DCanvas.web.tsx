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
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import {
  applyTwinScrewMaterialSpec,
  inheritedString,
  isEffectivelyVisible,
  setPartGroupVisibility,
  TWIN_SCREW_CUTAWAY_GROUP,
  TWIN_SCREW_CUTAWAY_PART_COUNT,
  TWIN_SCREW_INSPECTION_VIEW,
} from './modelSemantics';
import {
  clampProjectionFraction,
  projectionIsOnScreen,
  type MachineScene3DCanvasProps,
  type ProjectedPoint,
} from './types';

export type { MachineScene3DCanvasProps, ProjectedPoint } from './types';

const OCCLUSION_EVERY = 6; // frames

/** A near-elevation inspection view: enough lift for top fittings, no 3/4 distortion. */
const VIEW_DIR = new THREE.Vector3(...TWIN_SCREW_INSPECTION_VIEW.direction).normalize();

type Loaded = { root: THREE.Object3D; box: THREE.Box3; meshes: THREE.Mesh[] };

/* -------------------------------------------------------------------------- */
/* the asset                                                                   */
/* -------------------------------------------------------------------------- */

function Machine({
  modelUrl,
  closed,
  dark,
  onLoaded,
  onSelectPart,
}: {
  modelUrl: string;
  closed: boolean;
  dark: boolean;
  onLoaded: (loaded: Loaded) => void;
  onSelectPart?: (partId: string) => void;
}) {
  const { scene } = useGLTF(modelUrl);
  const prepared = useMemo(() => {
    const root = scene.clone(true);
    const meshes: THREE.Mesh[] = [];
    const materialClones = new Map<THREE.Material, THREE.Material>();

    const cloneMaterial = (source: THREE.Material) => {
      const cached = materialClones.get(source);
      if (cached) return cached;
      const clone = source.clone();
      const standard = clone as THREE.MeshStandardMaterial;
      applyTwinScrewMaterialSpec(standard, dark);
      materialClones.set(source, clone);
      return clone;
    };

    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(cloneMaterial)
        : cloneMaterial(mesh.material);
      meshes.push(mesh);
    });

    return { root, meshes, materials: [...materialClones.values()] };
  }, [scene, dark]);

  useEffect(
    () => () => {
      // Geometries belong to drei's cached GLTF and stay shared. Only the
      // per-stage material clones are ours to release on theme/model changes.
      prepared.materials.forEach((material) => material.dispose());
    },
    [prepared],
  );

  useEffect(() => {
    // Blender attaches extras to a parent Group when one authored object has
    // multiple material primitives. Toggle every object, not only leaf meshes.
    const count = setPartGroupVisibility(prepared.root, TWIN_SCREW_CUTAWAY_GROUP, closed);
    if (count !== TWIN_SCREW_CUTAWAY_PART_COUNT) {
      console.warn(
        '[machine-3d] expected %d cutaway panels, found %d',
        TWIN_SCREW_CUTAWAY_PART_COUNT,
        count,
      );
    }

    prepared.root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(prepared.root);
    onLoaded({ root: prepared.root, box, meshes: prepared.meshes });
  }, [prepared, closed, onLoaded]);

  return (
    <primitive
      object={prepared.root}
      onPointerDown={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
        if (!onSelectPart) return;
        e.stopPropagation();
        const id = inheritedString(e.object, 'partId') ?? e.object.name;
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
    const distance = Math.max(fitHeight, fitWidth, 0.2) * TWIN_SCREW_INSPECTION_VIEW.fillMargin + extent.z / 2;

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
  root,
  meshes,
  onProjectPoints,
  onReady,
}: {
  anchors: Readonly<Record<string, readonly [number, number, number]>>;
  root: THREE.Object3D;
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
  const view = useMemo(() => new THREE.Vector3(), []);

  const entries = useMemo(() => Object.entries(anchors), [anchors]);

  useFrame(() => {
    if (!onProjectPoints || entries.length === 0) return;
    tick.current += 1;
    const doOcclusion = meshes.length > 0 && tick.current % OCCLUSION_EVERY === 0;
    camera.getWorldPosition(camPos);

    const out: ProjectedPoint[] = [];
    for (const [code, a] of entries) {
      world.set(a[0], a[1], a[2]).applyMatrix4(root.matrixWorld);
      ndc.copy(world).project(camera);

      view.copy(world).applyMatrix4(camera.matrixWorldInverse);
      const onScreen = projectionIsOnScreen(ndc, view.z);

      if (doOcclusion && onScreen) {
        dir.copy(world).sub(camPos);
        const len = dir.length();
        dir.normalize();
        ray.set(camPos, dir);
        ray.far = Math.max(len - TWIN_SCREW_INSPECTION_VIEW.occlusionClearance, 0.01);
        occluded.current[code] = ray
          .intersectObjects(meshes, false)
          .some((hit) => isEffectivelyVisible(hit.object));
      }

      out.push({
        code,
        rx: clampProjectionFraction((ndc.x + 1) / 2),
        ry: clampProjectionFraction((1 - ndc.y) / 2),
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

/** Procedural reflection source; fully local and disposed with the canvas. */
function LocalEnvironment({ dark }: { dark: boolean }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileCubemapShader();
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    room.dispose();
    scene.environment = target.texture;
    scene.environmentIntensity = dark ? 0.76 : 0.92;

    return () => {
      scene.environment = previous;
      scene.environmentIntensity = previousIntensity;
      target.dispose();
      pmrem.dispose();
    };
  }, [dark, gl, scene]);

  return null;
}

/** Theme changes do not recreate Canvas, so renderer exposure is reactive. */
function RendererSettings({ dark }: { dark: boolean }) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = dark ? 1.12 : 1.02;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  }, [dark, gl]);

  return null;
}

function Lights({ dark }: { dark: boolean }) {
  return (
    <>
      <hemisphereLight
        intensity={dark ? 0.72 : 0.82}
        color={dark ? '#d5e2e8' : '#ffffff'}
        groundColor={dark ? '#202a31' : '#b9bec1'}
      />
      <directionalLight
        position={[-2.4, 4.6, 5.2]}
        color={dark ? '#f4f0e8' : '#fffaf2'}
        intensity={dark ? 2.35 : 1.95}
        castShadow
      />
      <directionalLight position={[5.6, 2.0, 3.2]} color="#dcecf5" intensity={dark ? 0.92 : 0.68} />
      <directionalLight position={[1.6, 3.2, -4.4]} color="#eef4f6" intensity={dark ? 1.2 : 0.9} />
      {/* narrow fill into the open barrel so the screws read as machined steel
          rather than sitting in the shadow of their own bore */}
      <pointLight
        position={[2.05, 0.48, 1.18]}
        color="#f7f3e8"
        intensity={dark ? 3.15 : 2.45}
        distance={3.5}
        decay={2}
      />
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
  useEffect(() => setLoaded(null), [modelUrl]);

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
      shadows
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      camera={{ fov: TWIN_SCREW_INSPECTION_VIEW.fov, near: 0.05, far: 200, position: [2.4, 1.6, 4.6] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = dark ? 1.12 : 1.02;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <RendererSettings dark={dark} />
      <LocalEnvironment dark={dark} />
      <Lights dark={dark} />

      <Suspense fallback={null}>
        <Machine
          modelUrl={modelUrl}
          closed={closed}
          dark={dark}
          onLoaded={handleLoaded}
          onSelectPart={onSelectPart}
        />
      </Suspense>

      {/* Only projects once the machine is actually there, so pads can never
          again be drawn over an empty stage. */}
      {loaded ? (
        <PointProjector
          anchors={anchors}
          root={loaded.root}
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
      <Framing loaded={loaded} controls={controls} resetKey={resetKey} />
    </Canvas>
  );
}

useGLTF.preload('/models/machines/twin-screw-extruder.glb');
