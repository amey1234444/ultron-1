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

// Runs sit on the floor between the raised plinths, so cables read as dropping
// off a component and crossing the yard rather than floating through the slabs.
const ROUTE_Y = 0.16;
const PORT_STUB = 1.35;

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

/** Vertical falloff: opaque where the wall meets the plinth, gone at the top. */
function useWallGradient() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    // canvas y=0 is the TOP of the texture, which maps to the top of the wall
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.20)');
    g.addColorStop(0.86, 'rgba(255,255,255,0.62)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

/**
 * The selection volume: four translucent walls standing on the plinth edge that
 * fade out as they rise, so the component reads as sitting inside a lit cage
 * rather than being outlined. Additive and depth-write-free, so it glows over
 * the model instead of clipping it.
 */
function SelectionWall({
  cx, cz, w, d, height, tex, dark,
}: { cx: number; cz: number; w: number; d: number; height: number; tex: THREE.Texture | null; dark: boolean }) {
  if (!tex) return null;
  const walls: { pos: [number, number, number]; rot: [number, number, number]; len: number }[] = [
    { pos: [cx, height / 2, cz + d / 2], rot: [0, 0, 0], len: w },
    { pos: [cx, height / 2, cz - d / 2], rot: [0, Math.PI, 0], len: w },
    { pos: [cx + w / 2, height / 2, cz], rot: [0, Math.PI / 2, 0], len: d },
    { pos: [cx - w / 2, height / 2, cz], rot: [0, -Math.PI / 2, 0], len: d },
  ];
  return (
    <group>
      {walls.map((wall, i) => (
        <mesh key={i} position={wall.pos} rotation={wall.rot}>
          <planeGeometry args={[wall.len, height]} />
          <meshBasicMaterial
            map={tex}
            color={SELECT}
            transparent
            opacity={dark ? 0.62 : 0.42}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Height of the raised plinth each component stands on. */
export const PLINTH_H = 0.42;

/**
 * The raised plinth every component stands on, plus its boundary.
 *
 * It is a real slab sitting ON the floor (0 → PLINTH_H) with the model on top,
 * so the highlight has a lit vertical face to wrap around rather than reading as
 * a flat outline. The boundary is the selection affordance: a dim rim at rest,
 * the accent green when hovered or selected, so the colour carries state.
 */
function ComponentPad({
  box, active, dark, glow, wallTex,
}: { box: THREE.Box3; active: boolean; dark: boolean; glow: THREE.Texture | null; wallTex: THREE.Texture | null }) {
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const w = size.x + 1.5;
  const d = size.z + 1.5;
  const cx = centre.x;
  const cz = centre.z;
  // Cage rises to roughly the component's own height, so tall and short
  // components both read as enclosed rather than one being swamped.
  const wallH = Math.max(2.2, size.y * 0.95);

  const bandY = PLINTH_H - 0.10;      // lit band sits just under the top edge
  const bandH = 0.075;
  const rim = active ? SELECT : dark ? '#333B45' : '#AEB4BD';
  const rimDim = active ? 1 : 0.55;

  return (
    <group>
      {/* body */}
      <mesh position={[cx, PLINTH_H / 2, cz]} castShadow receiveShadow>
        <boxGeometry args={[w, PLINTH_H, d]} />
        <meshStandardMaterial color={dark ? '#0E1218' : '#D5D9DF'} roughness={0.58} metalness={0.22} />
      </mesh>
      {/* top deck, inset so the slab reads as machined rather than extruded */}
      <mesh position={[cx, PLINTH_H + 0.004, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w - 0.30, d - 0.30]} />
        <meshStandardMaterial color={dark ? '#141A23' : '#E7E9ED'} roughness={0.46} metalness={0.28} />
      </mesh>
      {/* chamfer cap around the top edge */}
      <mesh position={[cx, PLINTH_H - 0.012, cz]}>
        <boxGeometry args={[w + 0.05, 0.03, d + 0.05]} />
        <meshStandardMaterial color={dark ? '#1A212B' : '#C7CCD3'} roughness={0.4} metalness={0.35} />
      </mesh>

      {/* lit boundary band wrapping all four vertical faces */}
      {([
        [0, (d + 0.03) / 2, w + 0.06, 0.035],
        [0, -(d + 0.03) / 2, w + 0.06, 0.035],
      ] as const).map(([ox, oz, bw, bd], i) => (
        <mesh key={`bz${i}`} position={[cx + ox, bandY, cz + oz]}>
          <boxGeometry args={[bw, bandH, bd]} />
          <meshBasicMaterial color={rim} toneMapped={false} transparent opacity={rimDim} />
        </mesh>
      ))}
      {([
        [(w + 0.03) / 2, 0],
        [-(w + 0.03) / 2, 0],
      ] as const).map(([ox, oz], i) => (
        <mesh key={`bx${i}`} position={[cx + ox, bandY, cz + oz]}>
          <boxGeometry args={[0.035, bandH, d + 0.06]} />
          <meshBasicMaterial color={rim} toneMapped={false} transparent opacity={rimDim} />
        </mesh>
      ))}

      {active ? (
        <SelectionWall cx={cx} cz={cz} w={w} d={d} height={wallH} tex={wallTex} dark={dark} />
      ) : null}

      {active && glow ? (
        <>
          {/* light spilling onto the floor around the plinth */}
          <mesh position={[cx, 0.015, cz]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[w * 2.4, d * 2.4]} />
            <meshBasicMaterial
              map={glow} color={SELECT} transparent opacity={dark ? 0.55 : 0.30}
              blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
            />
          </mesh>
          {/* soft bloom hugging the band itself */}
          <mesh position={[cx, bandY, cz]}>
            <boxGeometry args={[w + 0.34, bandH * 4.5, d + 0.34]} />
            <meshBasicMaterial
              color={SELECT} transparent opacity={dark ? 0.14 : 0.10}
              blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} toneMapped={false}
            />
          </mesh>
        </>
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
  const active = hovered || isSelectedComponent;
  const glow = useGlowTexture();
  const wallTex = useWallGradient();
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
        <ComponentPad box={footprint} active={active} dark={dark} glow={glow} wallTex={wallTex} />
        {/* the model stands ON the plinth */}
        <group position={[0, PLINTH_H, 0]}>
          <primitive object={model.root} />
          {showLabel ? (
            <>
              {/* leader line from the roofline up to the callout */}
              <Line
                points={[[labelPos[0], labelPos[1] - 1.15, labelPos[2]], [labelPos[0], labelPos[1] - 0.16, labelPos[2]]]}
                color={active ? SELECT : dark ? '#4A525C' : '#9AA1AA'}
                lineWidth={1}
                transparent
                opacity={0.9}
              />
              <mesh position={[labelPos[0], labelPos[1] - 1.15, labelPos[2]]}>
                <sphereGeometry args={[0.075, 10, 8]} />
                <meshBasicMaterial color={active ? SELECT : statusColor} toneMapped={false} />
              </mesh>
              <Html position={labelPos} center distanceFactor={40} zIndexRange={[20, 0]} pointerEvents="none">
                <div
                  style={{
                    minWidth: 132,
                    padding: '7px 11px 8px',
                    borderRadius: 9,
                    whiteSpace: 'nowrap',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    color: dark ? '#F7F6F2' : '#0A0B0D',
                    background: dark
                      ? 'linear-gradient(157deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015)), rgba(13,15,19,0.72)'
                      : 'linear-gradient(157deg, rgba(255,255,255,0.9), rgba(255,255,255,0.55)), rgba(255,255,255,0.6)',
                    border: `1px solid ${active ? 'rgba(63,191,106,0.55)' : dark ? 'rgba(255,255,255,0.10)' : 'rgba(10,11,13,0.12)'}`,
                    boxShadow: `inset 0 1px 0 ${dark ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.85)'}, 0 10px 26px rgba(0,0,0,0.36)`,
                    backdropFilter: 'blur(14px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(14px) saturate(150%)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: statusColor }} />
                    <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '-0.01em' }}>{component.name}</span>
                  </div>
                  <div style={{
                    marginTop: 4, fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: dark ? '#62666E' : '#80858D',
                  }}>
                    {PLANT_MODELS[component.model].name}
                  </div>
                </div>
              </Html>
            </>
          ) : null}
        </group>
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
      <fog attach="fog" args={[dark ? '#08090C' : '#EEEFF1', 48, 175]} />

      {/* Solid floor. It receives shadows itself (no second shadow-catcher
          plane) and is pushed back with polygonOffset, because a plane sitting a
          few centimetres under the grid is the classic z-fighting pair — that is
          what made the grid lines shimmer while orbiting. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]} receiveShadow>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial
          color={dark ? '#0A0C10' : '#E4E6EA'}
          roughness={0.94}
          metalness={0.04}
          polygonOffset
          polygonOffsetFactor={4}
          polygonOffsetUnits={4}
        />
      </mesh>

      {/* Measurement grid. Two tiers so scale is readable: a fine 2 m cell for
          local judgement, a heavier 10 m section line for distance. */}
      {scene.showGrid ? (
        <Grid
          position={[0, 0, 0]}
          args={[900, 900]}
          cellSize={2}
          cellThickness={0.9}
          cellColor={dark ? '#2A343F' : '#C3C9D1'}
          sectionSize={10}
          sectionThickness={1.7}
          sectionColor={dark ? '#3E4C5B' : '#9BA3AE'}
          fadeDistance={125}
          fadeStrength={1.0}
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
        // A 0.1 : 900 frustum spends almost all depth precision in the first few
        // metres, which is the other half of the grid shimmer. 0.5 : 420 gives
        // roughly a 10x better distribution across the ground plane.
        camera={{ fov: 42, near: 0.5, far: 420 }}
        style={{ width: '100%', height: '100%' }}
      >
        <SceneContents {...props} />
      </Canvas>
    </div>
  );
}

for (const model of Object.values(PLANT_MODELS)) useGLTF.preload(model.url);
