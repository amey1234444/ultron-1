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
import { clampMachineZoom, MAX_MACHINE_ZOOM, MIN_MACHINE_ZOOM } from '../../../../lib/machineZoom';
import { fitMachineCamera } from './cameraFit';

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
import { MachineGround } from './MachineGround';
import { SensorHardPoints, type HardPointFaces } from './SensorHardPoints';
import type { HardPointState } from './hardPointTypes';
import {
  clampProjectionFraction,
  projectionIsOnScreen,
  type MachineScene3DCanvasProps,
  type MachineCameraCommand,
  type ProjectedPoint,
} from './types';

export type { MachineScene3DCanvasProps, ProjectedPoint } from './types';

const OCCLUSION_EVERY = 6; // frames

/**
 * Smallest feature allowed to cast, in metres of world size.
 *
 * The shadow map is a second full geometry pass, and it is only worth its cost
 * for parts big enough to throw a shadow the map can actually resolve. At the
 * frustum fitted below one texel is a few millimetres on the machine, so an M8
 * bolt head or a single screw flight contributes noise and a draw. Anything
 * bigger than this casts; everything still *receives*, which is the half of
 * the effect that reads.
 *
 * Measured in world space, which on this asset is not optional. The GLB ships
 * `KHR_mesh_quantization`: positions are int16 on a 0.0977 mm grid and the
 * metre scale lives on a wrapper node, so a mesh's *geometry* bounding sphere
 * is in units of about a ten-thousandth of a metre. Comparing that radius
 * against 0.06 asks whether the part is bigger than six micrometres, which
 * every part is -- the test would pass universally and quietly buy nothing.
 */
const SHADOW_CASTER_MIN_SIZE = 0.06; // metres

/** Shadow map resolution. One pass, fitted tightly, at a size worth sampling. */
const SHADOW_MAP_SIZE = 1024;

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
      // Receiving is universal; casting is decided in world space once the
      // matrices are known, below.
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

    // Now that world matrices exist, decide which parts cast. One Box3 per
    // mesh at load, never per frame. See SHADOW_CASTER_MIN_SIZE for why this
    // cannot be read off the geometry.
    const bounds = new THREE.Box3();
    const size = new THREE.Vector3();
    for (const mesh of prepared.meshes) {
      bounds.setFromObject(mesh);
      bounds.getSize(size);
      mesh.castShadow = Math.max(size.x, size.y, size.z) >= SHADOW_CASTER_MIN_SIZE;
    }

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
  command,
  zoom,
  onZoomChange,
}: {
  loaded: Loaded | null;
  controls: React.RefObject<OrbitControlsImpl | null>;
  command: MachineCameraCommand | null;
  zoom: number;
  onZoomChange?: (zoom: number) => void;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const baseDistance = useRef<number | null>(null);
  const lastCommand = useRef<number | null>(null);
  const current = useRef({ zoom, onZoomChange });
  current.current = { zoom, onZoomChange };

  useEffect(() => {
    const c = controls.current;
    if (!loaded || loaded.box.isEmpty() || !c || size.width < 1 || size.height < 1) return;
    const first = baseDistance.current === null;
    const requested = command && command.id !== lastCommand.current ? command.kind : null;
    lastCommand.current = command?.id ?? null;
    const direction = requested === 'side'
      ? new THREE.Vector3(0, 0, 1)
      : first || requested === 'reset'
        ? VIEW_DIR.clone()
        : camera.position.clone().sub(c.target).normalize();
    const { centre, distance } = fitMachineCamera(
      loaded.box, direction, camera.fov, size.width / size.height,
      TWIN_SCREW_INSPECTION_VIEW.fillMargin,
    );
    // Resizing preserves the chosen angle and pan. Explicit view commands
    // recenter the entire machine; neither path scales the canvas element.
    const target = first || requested ? centre : c.target.clone();
    const magnification = requested ? 1 : (clampMachineZoom(current.current.zoom) ?? 1);
    baseDistance.current = distance;
    const extent = loaded.box.getSize(new THREE.Vector3());
    camera.aspect = size.width / size.height;
    camera.position.copy(target).addScaledVector(direction, distance / magnification);
    camera.near = Math.max(distance / 200, 0.01);
    camera.far = distance * 8 + extent.length();
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    c.target.copy(target);
    c.minDistance = distance / MAX_MACHINE_ZOOM;
    c.maxDistance = distance / MIN_MACHINE_ZOOM;
    c.update();
    camera.updateMatrixWorld();
    if (requested) current.current.onZoomChange?.(1);
  }, [loaded, camera, size.width, size.height, controls, command]);

  // Buttons and saved template sizes use the same dolly as wheel/pinch zoom.
  // Changing magnification does not reframe or discard an operator's orbit.
  useEffect(() => {
    const c = controls.current;
    if (!c || baseDistance.current === null) return;
    const direction = camera.position.clone().sub(c.target).normalize();
    camera.position.copy(c.target).addScaledVector(direction, baseDistance.current / (clampMachineZoom(zoom) ?? 1));
    c.update();
    camera.updateMatrixWorld();
  }, [camera, controls, zoom]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const publishZoom = () => {
      if (baseDistance.current === null) return;
      const next = clampMachineZoom(baseDistance.current / camera.position.distanceTo(c.target));
      if (next !== null && next !== current.current.zoom) current.current.onZoomChange?.(next);
    };
    c.addEventListener('end', publishZoom);
    return () => c.removeEventListener('end', publishZoom);
  }, [camera, controls, loaded]);

  return null;
}

/* -------------------------------------------------------------------------- */
/* the projector                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Turns each instrument's *physical port* into a screen position every frame.
 *
 * The world position comes from the port's connection face -- the same piece of
 * geometry the operator can see bolted to the machine -- so the pad, the trail
 * endpoint and the snap target are all derived from one 3D object rather than
 * from a coordinate that merely resembles where it is. `anchors` remains the
 * authoritative list of point codes, and its coordinates are the fallback for
 * the handful of frames before the ports have mounted.
 */
function PointProjector({
  anchors,
  faces,
  root,
  meshes,
  onProjectPoints,
  onReady,
}: {
  anchors: Readonly<Record<string, readonly [number, number, number]>>;
  faces: React.RefObject<HardPointFaces | null>;
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

    const ports = faces.current;
    const out: ProjectedPoint[] = [];
    for (const [code, a] of entries) {
      if (!ports?.read(code, world)) {
        world.set(a[0], a[1], a[2]).applyMatrix4(root.matrixWorld);
      }
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
function Lights({ dark, box }: { dark: boolean; box: THREE.Box3 | null }) {
  const key = useRef<THREE.DirectionalLight>(null);

  /**
   * Aim the key at the machine and bracket it with the shadow camera.
   *
   * A directional light targets the world origin by default, and its shadow
   * camera is a fixed 10 m box around that origin. This machine's centre is
   * 1.6 m down the +X axis and it is 3.2 m long, so the default arrangement
   * spent a 512 px map on a volume mostly containing nothing and resolved the
   * machine itself at about two centimetres per texel -- coarser than the fins,
   * the flights, the barrel seams and every fastener it was supposed to be
   * shading. Fitted to the real box at 1024 px it lands near three millimetres,
   * which is the scale the geometry is actually built at.
   */
  useEffect(() => {
    const light = key.current;
    if (!light || !box || box.isEmpty()) return;
    const centre = box.getCenter(new THREE.Vector3());
    // Bounding-sphere radius, so the machine fits inside this half-extent no
    // matter which way the light looks at it. The margin is for the shadow
    // itself: the key is oblique, so what it throws onto the floor reaches
    // further than the machine does, and a frustum sized to the machine alone
    // would slice the far end of its own shadow off in a straight line.
    const radius = (box.getSize(new THREE.Vector3()).length() / 2) * 1.5;

    light.target.position.copy(centre);
    light.target.updateMatrixWorld();

    const camera = light.shadow.camera;
    camera.left = -radius;
    camera.right = radius;
    camera.top = radius;
    camera.bottom = -radius;
    camera.near = 0.05;
    camera.far = radius * 6;
    camera.updateProjectionMatrix();
    light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    // Normal bias rather than depth bias: it offsets along the surface normal,
    // so it removes acne on the fins and the flights without the peter-panning
    // that a flat depth bias large enough to do the same job would cause.
    light.shadow.normalBias = 0.012;
    light.shadow.bias = -0.0004;
    light.shadow.needsUpdate = true;
  }, [box]);

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
        ref={key}
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
  labels,
  connectorState,
  dark,
  closed = false,
  cameraMode = 'free',
  cameraCommand = null,
  zoom = 1,
  onZoomChange,
  onProjectPoints,
  onReady,
  onSelectPart,
  onSelectHardPoint,
  onContextLost,
  width,
  height,
}: MachineScene3DCanvasProps) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  // The ports publish themselves here rather than through state: the projector
  // reads them inside `useFrame`, so a re-render would buy nothing and cost a
  // reconciliation of the whole stage every time one mounts.
  const faces = useRef<HardPointFaces | null>(null);
  const handleFaces = useCallback((next: HardPointFaces) => {
    faces.current = next;
  }, []);
  const hardPointStates = useMemo(
    () => (connectorState ?? {}) as Readonly<Record<string, HardPointState>>,
    [connectorState],
  );
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

  return (
    <Canvas
      // Measure layout pixels, not getBoundingClientRect's transformed size.
      // The workspace is unscaled, and this also protects embedded previews.
      resize={{ offsetSize: true }}
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
      // Explicit pixels, not percentages. See `width`/`height` in
      // `MachineScene3DCanvasProps` for what a percentage chain does here.
      style={{ width, height, display: 'block' }}
    >
      <RendererSettings dark={dark} />
      <LocalEnvironment dark={dark} />
      <Lights dark={dark} box={loaded?.box ?? null} />

      <Suspense fallback={null}>
        <Machine
          modelUrl={modelUrl}
          closed={closed}
          dark={dark}
          onLoaded={handleLoaded}
          onSelectPart={onSelectPart}
        />
      </Suspense>

      {/* The floor, ported from the Blender studio the asset is authored in.
          Sized from the machine's own box, so it follows a re-export. */}
      {loaded ? <MachineGround box={loaded.box} dark={dark} /> : null}

      {/* Physical instrumentation ports, parented into the components they are
          bolted to. `loaded.meshes` was captured before these mounted, so a
          port is never raycast against itself when the projector tests
          occlusion -- but it is depth tested against the machine like any other
          piece of metal, which is what makes it disappear behind the barrel
          instead of floating in front of it. */}
      {loaded ? (
        <SensorHardPoints
          root={loaded.root}
          states={hardPointStates}
          labels={labels}
          dark={dark}
          onFaces={handleFaces}
          onSelect={onSelectHardPoint}
        />
      ) : null}

      {/* Only projects once the machine is actually there, so pads can never
          again be drawn over an empty stage. */}
      {loaded ? (
        <PointProjector
          anchors={anchors}
          faces={faces}
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
      <Framing loaded={loaded} controls={controls} command={cameraCommand} zoom={zoom} onZoomChange={onZoomChange} />
    </Canvas>
  );
}

useGLTF.preload('/models/machines/twin-screw-extruder.glb');
