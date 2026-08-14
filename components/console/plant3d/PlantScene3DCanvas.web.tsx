/**
 * The 3D plant map (web).
 *
 * Renders the Blender-authored component GLBs on a ground plane, applies the
 * super admin's per-part overrides (hide / recolour / resize), and draws the
 * dotted light-blue service connections between component ports.
 *
 * This file is web-only (`.web.tsx`) and is loaded lazily after mount, so it
 * never runs during SSR and never reaches the native bundle.
 */
import { Grid, Html, Line, OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import {
  CONNECTION_COLOR,
  PLANT_MODELS,
  type PlantComponent3D,
  type PlantPartOverride,
  type PlantScene3DConfig,
} from '../../../lib/plantScene3d';

export type PlantScene3DCanvasProps = {
  scene: PlantScene3DConfig;
  /** Resolved status colour per component id (live telemetry for `auto`). */
  statusColors: Record<string, string>;
  dark: boolean;
  /** Editor mode: parts become clickable and the selection is outlined. */
  editable?: boolean;
  selectedComponentId?: string | null;
  selectedPart?: string | null;
  onSelectPart?: (componentId: string, partName: string) => void;
  onPartsDiscovered?: (componentId: string, parts: PartNode[]) => void;
};

/** A node of the model tree, flattened for the editor's part list. */
export type PartNode = { name: string; depth: number; kind: 'mesh' | 'group' | 'port' | 'anchor' };

const ROUTE_Y = 0.28;
const PORT_STUB = 1.1;

// ---------------------------------------------------------------------------
// Model instance
// ---------------------------------------------------------------------------

type BaseState = {
  visible: boolean;
  position: THREE.Vector3;
  scale: THREE.Vector3;
  /** Geometry bounding-box centre in the node's own local space. */
  center: THREE.Vector3;
  material: THREE.Material | THREE.Material[] | null;
};

function isMesh(o: THREE.Object3D): o is THREE.Mesh {
  return (o as THREE.Mesh).isMesh === true;
}

function classify(name: string): PartNode['kind'] {
  if (name.startsWith('PORT_')) return 'port';
  if (name.startsWith('ANCHOR_')) return 'anchor';
  return 'mesh';
}

const SELECT = '#3FBF6A';   // the console's single rationed accent: live / active

/** Soft radial falloff used for the ground glow under an active component. */
function useGlowTexture() {
  return useMemo(() => {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

/**
 * The plinth every component stands on, plus its boundary.
 *
 * The boundary is the selection affordance: a hairline at rest, and the accent
 * green when the component is hovered or selected — which is what "the one I am
 * in" means here, so the colour carries state rather than decoration.
 */
function ComponentPad({
  box, active, dark, glow,
}: { box: THREE.Box3; active: boolean; dark: boolean; glow: THREE.Texture | null }) {
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const m = 1.1;                                   // margin around the footprint
  const w = size.x + m;
  const d = size.z + m;
  const cx = centre.x;
  const cz = centre.z;
  const TOP = 0.02;                                // plinth top sits just proud of
  const H = 0.30;                                  // y=0 so the base embeds into it
  const rail = 0.075;
  const edgeColor = active ? SELECT : dark ? '#2C3239' : '#B9BEC6';

  return (
    <group>
      <mesh position={[cx, TOP - H / 2, cz]} receiveShadow>
        <boxGeometry args={[w, H, d]} />
        <meshStandardMaterial color={dark ? '#0D1015' : '#D8DBE0'} roughness={0.62} metalness={0.15} />
      </mesh>
      {/* inset deck, so the plinth reads as a machined pad not a slab */}
      <mesh position={[cx, TOP + 0.002, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w - 0.26, d - 0.26]} />
        <meshStandardMaterial color={dark ? '#121620' : '#E6E8EC'} roughness={0.5} metalness={0.2} />
      </mesh>
      {/* boundary rail: four bars, so the highlight traces the actual edge */}
      {([[0, (d - rail) / 2], [0, -(d - rail) / 2]] as const).map(([ox, oz], i) => (
        <mesh key={`z${i}`} position={[cx + ox, TOP + 0.028, cz + oz]}>
          <boxGeometry args={[w, 0.055, rail]} />
          <meshBasicMaterial color={edgeColor} toneMapped={false} />
        </mesh>
      ))}
      {([[(w - rail) / 2, 0], [-(w - rail) / 2, 0]] as const).map(([ox, oz], i) => (
        <mesh key={`x${i}`} position={[cx + ox, TOP + 0.028, cz + oz]}>
          <boxGeometry args={[rail, 0.055, d - rail * 2]} />
          <meshBasicMaterial color={edgeColor} toneMapped={false} />
        </mesh>
      ))}
      {active && glow ? (
        <mesh position={[cx, 0.012, cz]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w * 2.0, d * 2.0]} />
          <meshBasicMaterial
            map={glow} color={SELECT} transparent opacity={dark ? 0.5 : 0.3}
            blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}

/**
 * Clones the loaded GLB once per placed component and keeps a pristine copy of
 * every node's transform + material, so overrides can be re-applied from the
 * original state instead of accumulating.
 */
function useModelInstance(url: string) {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    // clone(true) shares geometries and materials with the cached original, so
    // an instance only pays for its own transforms until a part is recoloured.
    const root = scene.clone(true);
    const base = new Map<string, BaseState>();
    root.traverse((node) => {
      if (!node.name) return;
      let center = new THREE.Vector3();
      let material: THREE.Material | THREE.Material[] | null = null;
      if (isMesh(node)) {
        material = node.material;
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        node.geometry.boundingBox?.getCenter(center);
      }
      base.set(node.name, {
        visible: node.visible,
        position: node.position.clone(),
        scale: node.scale.clone(),
        center,
        material,
      });
    });
    return { root, base };
  }, [scene]);
}

function PlacedComponent({
  component,
  statusColor,
  modelScale,
  editable,
  isSelectedComponent,
  selectedPart,
  onSelectPart,
  onPartsDiscovered,
  onPortsReady,
  showLabel,
  dark,
}: {
  component: PlantComponent3D;
  statusColor: string;
  modelScale: number;
  editable: boolean;
  isSelectedComponent: boolean;
  selectedPart: string | null;
  onSelectPart?: (componentId: string, partName: string) => void;
  onPartsDiscovered?: (componentId: string, parts: PartNode[]) => void;
  onPortsReady: (componentId: string, ports: Map<string, { pos: THREE.Vector3; dir: THREE.Vector3 }>) => void;
  showLabel: boolean;
  dark: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const model = useModelInstance(PLANT_MODELS[component.model].url);
  const overrideMaterials = useRef(new Map<string, THREE.MeshStandardMaterial>());
  const [labelPos, setLabelPos] = useState<[number, number, number]>([0, 5.6, 0]);
  const [hovered, setHovered] = useState(false);
  const glow = useGlowTexture();
  // Footprint measured from the model itself, so the plinth fits a utility
  // building and a power house (whose transformer bay extends well past the
  // building) without either being hand-tuned.
  const footprint = useMemo(() => {
    const box = new THREE.Box3();
    model.root.traverse((n) => {
      if (isMesh(n) && n.visible) box.expandByObject(n);
    });
    return box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-4, 0, -3), new THREE.Vector3(4, 4, 3)) : box;
  }, [model]);
  // These effects mutate the scene graph directly; on a `demand` frameloop that
  // has to be paired with an explicit redraw request or the edit is invisible
  // until the next orbit.
  const invalidate = useThree((state) => state.invalidate);

  const scale = (component.scale / 100) * (modelScale / 100);

  // --- report the model's node tree to the editor once per model
  useEffect(() => {
    if (!onPartsDiscovered) return;
    const list: PartNode[] = [];
    const walk = (node: THREE.Object3D, depth: number) => {
      for (const child of node.children) {
        if (child.name) list.push({ name: child.name, depth, kind: classify(child.name) });
        walk(child, depth + 1);
      }
    };
    walk(model.root, 0);
    onPartsDiscovered(component.id, list);
  }, [model, component.id, onPartsDiscovered]);

  // --- apply the super admin's per-part overrides
  useLayoutEffect(() => {
    const parts = component.parts;
    model.root.traverse((node) => {
      const base = model.base.get(node.name);
      if (!base) return;
      const ov: PlantPartOverride | undefined = parts[node.name];

      // "Delete" is a stored flag, never destructive — three hides descendants
      // with the parent, which is what removing an assembly should do.
      node.visible = base.visible && !ov?.hidden;

      // Resize about the part's own bounding-box centre, so a resized part stays
      // where it was instead of sliding toward its parent's origin.
      const s = ov?.scale ?? 1;
      node.scale.copy(base.scale).multiplyScalar(s);
      node.position.set(
        base.position.x + base.scale.x * base.center.x * (1 - s),
        base.position.y + base.scale.y * base.center.y * (1 - s),
        base.position.z + base.scale.z * base.center.z * (1 - s),
      );

      if (!isMesh(node) || !base.material) return;

      // The beacon lens is the model's status indicator: it takes the live
      // status colour unless the admin has explicitly recoloured it.
      const isBeacon = node.name === 'STATUS_BEACON_LENS';
      const tint = ov?.color ?? (isBeacon ? statusColor : null);
      if (!tint) {
        node.material = base.material;
        return;
      }
      let mat = overrideMaterials.current.get(node.name);
      if (!mat) {
        const source = Array.isArray(base.material) ? base.material[0] : base.material;
        mat = (source as THREE.MeshStandardMaterial).clone();
        overrideMaterials.current.set(node.name, mat);
      }
      mat.color.set(tint);
      if (isBeacon && !ov?.color) {
        mat.emissive.set(tint);
        mat.emissiveIntensity = 0.9;
      } else {
        mat.emissive.set('#000000');
        mat.emissiveIntensity = 0;
      }
      node.material = mat;
    });
    invalidate();
  }, [model, component.parts, statusColor, invalidate]);

  // --- publish port world positions for the connection routing
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.updateWorldMatrix(true, true);
    const ports = new Map<string, { pos: THREE.Vector3; dir: THREE.Vector3 }>();
    model.root.traverse((node) => {
      if (!node.name.startsWith('PORT_')) return;
      const pos = new THREE.Vector3();
      node.getWorldPosition(pos);
      // glTF forward is local -Z; getWorldDirection returns +Z.
      const dir = new THREE.Vector3();
      node.getWorldDirection(dir);
      dir.negate().setY(0);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      ports.set(node.name, { pos, dir });
    });
    onPortsReady(component.id, ports);

    const anchor = model.root.getObjectByName('ANCHOR_LABEL');
    if (anchor) setLabelPos([anchor.position.x, anchor.position.y, anchor.position.z]);
    invalidate();
  }, [model, component.x, component.z, component.rotation, scale, onPortsReady, component.id, invalidate]);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!editable || !onSelectPart) return;
      event.stopPropagation();
      const name = event.object.name;
      if (name) onSelectPart(component.id, name);
    },
    [editable, onSelectPart, component.id],
  );

  const outline = useMemo(() => {
    if (!editable || !isSelectedComponent || !selectedPart) return null;
    const node = model.root.getObjectByName(selectedPart);
    if (!node || !node.visible) return null;
    const box = new THREE.Box3().setFromObject(node);
    if (box.isEmpty()) return null;
    return new THREE.Box3Helper(box, new THREE.Color('#3FBF6A'));
  }, [editable, isSelectedComponent, selectedPart, model, component.parts, scale]);

  return (
    <>
      <group
        ref={groupRef}
        position={[component.x, 0, component.z]}
        rotation={[0, THREE.MathUtils.degToRad(component.rotation), 0]}
        scale={scale}
        onPointerDown={editable ? handleClick : undefined}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true); invalidate(); }}
        onPointerOut={() => { setHovered(false); invalidate(); }}
      >
        <ComponentPad box={footprint} active={hovered || isSelectedComponent} dark={dark} glow={glow} />
        <primitive object={model.root} />
        {showLabel ? (
          <Html position={labelPos} center distanceFactor={38} zIndexRange={[20, 0]} pointerEvents="none">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
                padding: '4px 9px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.2,
                color: dark ? '#F5F5F5' : '#111827',
                background: dark ? 'rgba(18,20,24,0.86)' : 'rgba(255,255,255,0.94)',
                border: `1px solid ${isSelectedComponent ? '#3FBF6A' : dark ? 'rgba(255,255,255,0.16)' : '#dbe3ec'}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.22)',
                transform: 'translateY(-6px)',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 999, background: statusColor }} />
              {component.name}
            </div>
          </Html>
        ) : null}
      </group>
      {/* Outline lives outside the group: the box is already in world space. */}
      {outline ? <primitive object={outline} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

type PortMap = Map<string, Map<string, { pos: THREE.Vector3; dir: THREE.Vector3 }>>;

/** Orthogonal route: out along each port normal, down to a common run height. */
function routePoints(
  a: { pos: THREE.Vector3; dir: THREE.Vector3 },
  b: { pos: THREE.Vector3; dir: THREE.Vector3 },
): THREE.Vector3[] {
  const a1 = a.pos.clone().addScaledVector(a.dir, PORT_STUB);
  const b1 = b.pos.clone().addScaledVector(b.dir, PORT_STUB);
  const a2 = new THREE.Vector3(a1.x, ROUTE_Y, a1.z);
  const b2 = new THREE.Vector3(b1.x, ROUTE_Y, b1.z);
  const midZ = (a2.z + b2.z) / 2;
  return [
    a.pos.clone(),
    a1,
    a2,
    new THREE.Vector3(a2.x, ROUTE_Y, midZ),
    new THREE.Vector3(b2.x, ROUTE_Y, midZ),
    b2,
    b1,
    b.pos.clone(),
  ];
}

function Connections({ scene, ports, version }: { scene: PlantScene3DConfig; ports: PortMap; version: number }) {
  const routes = useMemo(() => {
    void version; // recomputed whenever a component republishes its ports
    const out: { id: string; points: THREE.Vector3[]; ends: THREE.Vector3[] }[] = [];
    for (const connection of scene.connections) {
      const from = ports.get(connection.fromId)?.get(connection.fromPort);
      const to = ports.get(connection.toId)?.get(connection.toPort);
      if (!from || !to) continue;
      out.push({ id: connection.id, points: routePoints(from, to), ends: [from.pos, to.pos] });
    }
    return out;
  }, [scene.connections, ports, version]);

  return (
    <group>
      {routes.map((route) => (
        <group key={route.id}>
          <Line
            points={route.points}
            color={CONNECTION_COLOR}
            lineWidth={1.6}
            dashed
            dashSize={0.42}
            gapSize={0.3}
            transparent
            opacity={0.95}
          />
          {route.ends.map((end, i) => (
            <mesh key={i} position={end}>
              <sphereGeometry args={[0.13, 10, 8]} />
              <meshBasicMaterial color={CONNECTION_COLOR} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

/** Frames the camera on the placed components whenever their extent changes. */
function CameraRig({ scene }: { scene: PlantScene3DConfig }) {
  const { camera } = useThree();
  const controls = useRef<any>(null);

  const focus = useMemo(() => {
    if (scene.components.length === 0) return { center: new THREE.Vector3(), radius: 14 };
    const box = new THREE.Box3();
    for (const c of scene.components) {
      const [fx, fz] = PLANT_MODELS[c.model].footprint;
      const s = (c.scale / 100) * (scene.modelScale / 100);
      const half = (Math.max(fx, fz) / 2) * s * 1.25;
      box.expandByPoint(new THREE.Vector3(c.x - half, 0, c.z - half));
      box.expandByPoint(new THREE.Vector3(c.x + half, PLANT_MODELS[c.model].height * s, c.z + half));
    }
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(10, box.getSize(new THREE.Vector3()).length() * 0.62);
    return { center, radius };
  }, [scene.components, scene.modelScale]);

  useEffect(() => {
    // Front-right-high three-quarter view: the angle that reads a plant best.
    camera.position.set(focus.center.x + focus.radius * 0.85, focus.radius * 0.72, focus.center.z + focus.radius * 1.15);
    camera.lookAt(focus.center);
    camera.updateProjectionMatrix();
    if (controls.current) {
      controls.current.target.copy(focus.center);
      controls.current.update();
    }
  }, [camera, focus]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan
      enableDamping
      dampingFactor={0.08}
      minDistance={4}
      maxDistance={focus.radius * 5}
      // Stop the camera dropping under the ground plane.
      maxPolarAngle={Math.PI * 0.49}
    />
  );
}

function SceneContents(props: PlantScene3DCanvasProps) {
  const { scene, statusColors, dark, editable = false, selectedComponentId, selectedPart } = props;
  const portsRef = useRef<PortMap>(new Map());
  const [portVersion, setPortVersion] = useState(0);

  const onPortsReady = useCallback(
    (componentId: string, ports: Map<string, { pos: THREE.Vector3; dir: THREE.Vector3 }>) => {
      portsRef.current.set(componentId, ports);
      setPortVersion((v) => v + 1);
    },
    [],
  );

  return (
    <>
      <hemisphereLight intensity={dark ? 0.55 : 0.75} groundColor={dark ? '#0b0d10' : '#c9ccd2'} />
      <directionalLight
        position={[18, 26, 14]}
        intensity={dark ? 1.5 : 2.0}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
      <directionalLight position={[-14, 10, -18]} intensity={dark ? 0.4 : 0.55} />

      {/* Distance fog tinted to the page background: the floor dissolves into
          the panel instead of ending at a hard rim when the camera orbits low. */}
      <fog attach="fog" args={[dark ? '#08090C' : '#EEEFF1', 34, 165]} />

      {/* Solid floor beneath the grid so the ground reads as a surface rather
          than as lines hanging in space. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={dark ? '#0A0C10' : '#E4E6EA'} roughness={0.92} metalness={0.05} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <shadowMaterial opacity={dark ? 0.45 : 0.20} />
      </mesh>

      {scene.showGrid ? (
        <Grid
          position={[0, -0.02, 0]}
          args={[400, 400]}
          cellSize={2}
          cellThickness={0.5}
          cellColor={dark ? '#1B212A' : '#D2D6DC'}
          sectionSize={10}
          sectionThickness={1}
          sectionColor={dark ? '#28323E' : '#B6BCC5'}
          fadeDistance={135}
          fadeStrength={1.6}
          infiniteGrid
          followCamera={false}
        />
      ) : null}

      <Suspense fallback={null}>
        {scene.components.map((component) => (
          <PlacedComponent
            key={component.id}
            component={component}
            statusColor={statusColors[component.id] ?? '#3FBF6A'}
            modelScale={scene.modelScale}
            editable={editable}
            isSelectedComponent={selectedComponentId === component.id}
            selectedPart={selectedPart ?? null}
            onSelectPart={props.onSelectPart}
            onPartsDiscovered={props.onPartsDiscovered}
            onPortsReady={onPortsReady}
            showLabel={scene.showLabels}
            dark={dark}
          />
        ))}
        <Connections scene={scene} ports={portsRef.current} version={portVersion} />
      </Suspense>

      <CameraRig scene={scene} />
    </>
  );
}

export default function PlantScene3DCanvas(props: PlantScene3DCanvasProps) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        // The dashboard is a live instrument panel; only redraw the 3D view when
        // something actually changes, not 60x a second behind the telemetry.
        frameloop="demand"
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 42, near: 0.1, far: 900 }}
        style={{ width: '100%', height: '100%' }}
      >
        <SceneContents {...props} />
      </Canvas>
    </div>
  );
}

for (const model of Object.values(PLANT_MODELS)) useGLTF.preload(model.url);
