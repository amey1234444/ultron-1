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
  applyMachineFinish,
  inheritedString,
  isEffectivelyVisible,
  setPartGroupVisibility,
  TWIN_SCREW_CUTAWAY_GROUP,
  TWIN_SCREW_CUTAWAY_PART_COUNT,
  TWIN_SCREW_ENV_INTENSITY as MACHINE_ENV_INTENSITY,
  TWIN_SCREW_INSPECTION_VIEW,
  resolveMachineFinishKey,
} from './modelSemantics';
import {
  clampProjectionFraction,
  projectionIsOnScreen,
  type MachineScene3DCanvasProps,
  type ProjectedPoint,
} from './types';

export type { MachineScene3DCanvasProps, ProjectedPoint } from './types';

const OCCLUSION_EVERY = 6; // frames

/**
 * Tone-map exposure per theme.
 *
 * ACES filmic rolls highlights off rather than clipping them, but it cannot
 * rescue an image that is over-lit going in. With the environment down and the
 * palette re-graded, this sits below 1: the point is controlled midtones, not
 * brightness.
 */
const MACHINE_EXPOSURE = { light: 0.92, dark: 0.86 } as const;

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

  // Normalization runs once per (asset, theme), never per frame. The clone
  // cache is keyed by source material *and* resolved finish: `MAT_cast_gray`
  // alone covers the motor, the gearbox, the frame, the die and every barrel
  // cap, so keying on the source material would collapse them onto one value
  // and flatten the machine into a single grey mass.
  const prepared = useMemo(() => {
    const root = scene.clone(true);
    const meshes: THREE.Mesh[] = [];
    const materialClones = new Map<string, THREE.Material>();

    const finishFor = (mesh: THREE.Mesh, source: THREE.Material) =>
      resolveMachineFinishKey(
        inheritedString(mesh, 'partGroup'),
        inheritedString(mesh, 'partId'),
        source.name,
      );

    const cloneMaterial = (mesh: THREE.Mesh, source: THREE.Material) => {
      const key = finishFor(mesh, source);
      const cacheKey = `${source.uuid}|${key}`;
      const cached = materialClones.get(cacheKey);
      if (cached) return cached;
      // Cloning keeps whatever the export carried -- maps, transparency,
      // normals -- and the finish only writes the four PBR values it owns.
      const clone = source.clone();
      applyMachineFinish(clone as THREE.MeshStandardMaterial, key, dark);
      materialClones.set(cacheKey, clone);
      return clone;
    };

    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((entry) => cloneMaterial(mesh, entry))
        : cloneMaterial(mesh, mesh.material);
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
    // Low, on purpose. Most of this palette is metallic, and a metal takes its
    // value from what it reflects: at the old 0.76/0.92 the housings were lit
    // almost entirely by the room and clipped to white whatever base colour
    // they were given. Here the base colour is what you see and the
    // environment only softens the terminator.
    scene.environmentIntensity = MACHINE_ENV_INTENSITY[dark ? 'dark' : 'light'];

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
    // three r180 enables ColorManagement and defaults the output space to sRGB,
    // and R3F v9 does not override either; both are asserted rather than set so
    // a future upgrade that changes the default fails loudly in the checks
    // instead of silently shifting every colour on the stage.
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = MACHINE_EXPOSURE[dark ? 'dark' : 'light'];
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  }, [dark, gl]);

  return null;
}

/**
 * Restrained neutral studio rig.
 *
 * Four lights and an ambient floor, all neutral: the previous rig ran a bright
 * hemisphere plus three strong directionals tinted `#dcecf5`/`#9fc4d8`, which
 * both over-lit the machine and pulled it blue against a neutral dashboard.
 * Key does the modelling, fill opens the shadow side just enough to keep the
 * casting readable, rim separates the silhouette from a near-black page, and
 * two short-throw fills reach into the open barrel so the screws are lit by
 * something other than bounce.
 */
function Lights({ dark }: { dark: boolean }) {
  return (
    <>
      {/* Very low, and neutral. This sets the floor of the image, not its level. */}
      <hemisphereLight
        intensity={dark ? 0.20 : 0.28}
        color="#EEF0F2"
        groundColor={dark ? '#0D1013' : '#9A9EA3'}
      />
      {/* Key: upper front-left, the only light that casts. */}
      <directionalLight
        position={[-2.4, 4.6, 5.2]}
        color="#FFFDF9"
        intensity={dark ? 1.55 : 1.75}
        castShadow
      />
      {/* Fill: opposite side, well under the key so the form still turns. */}
      <directionalLight position={[5.6, 2.0, 3.2]} color="#F2F4F5" intensity={dark ? 0.42 : 0.5} />
      {/* Rim: behind and above, enough to draw the top edge off the page. */}
      <directionalLight position={[1.6, 3.2, -4.4]} color="#E8EBED" intensity={dark ? 0.6 : 0.4} />
      {/* Lower back rim. On the dark console the machine's underside otherwise
          runs straight into the background with no silhouette at all. */}
      <directionalLight
        position={[-1.2, -2.6, -3.4]}
        color="#DDE2E5"
        intensity={dark ? 0.34 : 0.16}
      />
      {/* Two short-throw fills into the open barrel. One light with `decay={2}`
          cannot reach both ends of a 1.5 m barrel, so the feed end and the
          metering end get their own; without them the screws sit in the shadow
          of their own bore and crush to black. */}
      <pointLight
        position={[1.62, 0.48, 1.05]}
        color="#FBF9F4"
        intensity={dark ? 1.5 : 1.2}
        distance={2.4}
        decay={2}
      />
      <pointLight
        position={[2.42, 0.48, 1.05]}
        color="#FBF9F4"
        intensity={dark ? 1.5 : 1.2}
        distance={2.4}
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
  onContextLost,
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
      dpr={[1, 1.5]}
      shadows
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      camera={{ fov: TWIN_SCREW_INSPECTION_VIEW.fov, near: 0.05, far: 200, position: [2.4, 1.6, 4.6] }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = MACHINE_EXPOSURE[dark ? 'dark' : 'light'];
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        // A lost context is not a React error, so the boundary above never
        // sees it: the canvas simply goes blank and stays blank. Preventing
        // the default lets the browser hand back a restored context, and the
        // callback lets the stage tell the operator instead of showing a hole.
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          onContextLost?.();
        });
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
