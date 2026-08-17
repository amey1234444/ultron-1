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
import { Html, Line, OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import {
  CONNECTION_COLOR,
  PLANT_MODELS,
  type PlantComponent3D,
  type PlantPartOverride,
  type PlantScene3DConfig,
} from '../../../lib/plantScene3d';
import { GroundPlane } from './GroundPlane';
import { LabelProjector } from './LabelProjector';
import type {
  PartNode,
  PlantCalloutFacts,
  PlantCameraCommand,
  PlantCameraMode,
  PlantScene3DCanvasProps,
  PlantViewInsets,
} from './types';

export type {
  PartNode,
  PlantCalloutFacts,
  PlantCameraCommand,
  PlantCameraMode,
  PlantScene3DCanvasProps,
  PlantViewInsets,
} from './types';

/** The editor renders the canvas bare, so the whole of it is the map. */
const NO_INSETS: PlantViewInsets = { top: 0, right: 0, bottom: 0, left: 0 };

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

const LABEL_MONO = '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace';

/**
 * Extra height given to an in-scene (`html` mode) label above its anchor.
 *
 * Only the editor uses that mode, where one component is in focus at a time.
 * The dashboard uses `projected` labels, which solve their own placement.
 */
const LABEL_LIFT = 1.6;

/** kW under a megawatt, MW above it — nobody reads "1250 kW" as a plant figure. */
function formatPower(kw: number | undefined): string {
  if (kw === undefined) return '—';
  return kw >= 1000 ? `${(kw / 1000).toFixed(2)} MW` : `${Math.round(kw)} kW`;
}

/**
 * The floating asset callout.
 *
 * Flat and opaque rather than glass: it sits over moving geometry, and a
 * translucent panel there means the model shows through the numbers exactly
 * when the operator is trying to read them.
 *
 * At rest it states identity and the three facts that decide whether anyone
 * needs to look closer. Hovering promotes it — accent rim, and the electrical
 * detail unfolds underneath — which is the tooltip, rather than a second
 * floating element competing with the label for the same space.
 */
function AssetCallout({
  name, statusColor, callout, fallbackStatus, active, dark,
}: {
  name: string;
  statusColor: string;
  callout?: PlantCalloutFacts;
  fallbackStatus: string;
  active: boolean;
  dark: boolean;
}) {
  const surface = dark ? '#101318' : '#FFFFFF';
  const border = active ? 'rgba(63,191,106,0.62)' : dark ? 'rgba(255,255,255,0.11)' : 'rgba(10,11,13,0.13)';
  const ink = dark ? '#F7F6F2' : '#0A0B0D';
  const faint = dark ? '#747983' : '#6D737C';
  const hair = dark ? 'rgba(255,255,255,0.075)' : 'rgba(10,11,13,0.09)';

  const rows: [string, string, string?][] = [
    ['Machines', callout?.machines === undefined ? '—' : String(callout.machines).padStart(2, '0')],
    [
      'Alarms',
      callout?.alarms === undefined ? '—' : String(callout.alarms).padStart(2, '0'),
      callout?.alarms ? statusColor : undefined,
    ],
    ['Telemetry', callout?.telemetry ?? '—', callout?.telemetry === 'OFFLINE' ? faint : undefined],
  ];
  const detail: [string, string][] = [
    ['Power', formatPower(callout?.power)],
    ['Temp', callout?.temperature === undefined ? '—' : `${callout.temperature.toFixed(1)} °C`],
    ['Health', callout?.health === undefined ? '—' : `${callout.health}/100`],
  ];

  const Row = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
      <span style={{ fontFamily: LABEL_MONO, fontSize: 7, letterSpacing: '0.14em', textTransform: 'uppercase', color: faint }}>
        {label}
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ fontFamily: LABEL_MONO, fontSize: 8.5, color: tone ?? ink }}>{value}</span>
    </div>
  );

  return (
    <div
      style={{
        width: 162,
        fontFamily: 'Inter, system-ui, sans-serif',
        background: surface,
        border: `1px solid ${border}`,
        borderRadius: 5,
        boxShadow: dark ? '0 10px 26px rgba(0,0,0,0.45)' : '0 8px 20px rgba(15,20,30,0.14)',
        overflow: 'hidden',
        transition: 'border-color 160ms ease',
      }}
    >
      <div style={{ padding: '6px 9px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: statusColor, flexShrink: 0 }} />
          <span
            style={{
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontFamily: LABEL_MONO, fontSize: 8, letterSpacing: '0.11em', textTransform: 'uppercase', color: ink,
            }}
          >
            {name}
          </span>
        </div>
        <div
          style={{
            marginTop: 2, marginLeft: 10,
            fontFamily: LABEL_MONO, fontSize: 7, letterSpacing: '0.14em', textTransform: 'uppercase', color: statusColor,
          }}
        >
          {callout?.status ?? fallbackStatus}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${hair}`, padding: '5px 9px 6px', display: 'grid', gap: 2.5 }}>
        {rows.map(([label, value, tone]) => (
          <Row key={label} label={label} value={value} tone={tone} />
        ))}
      </div>

      {/* Hover detail. Height-animated so the label grows in place instead of a
          second card appearing somewhere else on screen. */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: active ? '1fr' : '0fr',
          transition: 'grid-template-rows 180ms cubic-bezier(0.22,1,0.36,1), opacity 140ms ease',
          opacity: active ? 1 : 0,
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ borderTop: `1px solid ${hair}`, padding: '5px 9px 6px', display: 'grid', gap: 2.5 }}>
            {detail.map(([label, value]) => (
              <Row key={label} label={label} value={value} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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
        <mesh key={i} position={wall.pos} rotation={wall.rot} raycast={() => undefined}>
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
      <mesh position={[cx, PLINTH_H / 2, cz]} castShadow receiveShadow raycast={() => undefined}>
        <boxGeometry args={[w, PLINTH_H, d]} />
        <meshStandardMaterial color={dark ? '#0E1218' : '#D5D9DF'} roughness={0.58} metalness={0.22} />
      </mesh>
      {/* top deck, inset so the slab reads as machined rather than extruded */}
      <mesh position={[cx, PLINTH_H + 0.004, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={() => undefined}>
        <planeGeometry args={[w - 0.30, d - 0.30]} />
        <meshStandardMaterial color={dark ? '#141A23' : '#E7E9ED'} roughness={0.46} metalness={0.28} />
      </mesh>
      {/* chamfer cap around the top edge */}
      <mesh position={[cx, PLINTH_H - 0.012, cz]} raycast={() => undefined}>
        <boxGeometry args={[w + 0.05, 0.03, d + 0.05]} />
        <meshStandardMaterial color={dark ? '#1A212B' : '#C7CCD3'} roughness={0.4} metalness={0.35} />
      </mesh>

      {/* lit boundary band wrapping all four vertical faces */}
      {([
        [0, (d + 0.03) / 2, w + 0.06, 0.035],
        [0, -(d + 0.03) / 2, w + 0.06, 0.035],
      ] as const).map(([ox, oz, bw, bd], i) => (
        <mesh key={`bz${i}`} position={[cx + ox, bandY, cz + oz]} raycast={() => undefined}>
          <boxGeometry args={[bw, bandH, bd]} />
          <meshBasicMaterial color={rim} toneMapped={false} transparent opacity={rimDim} />
        </mesh>
      ))}
      {([
        [(w + 0.03) / 2, 0],
        [-(w + 0.03) / 2, 0],
      ] as const).map(([ox, oz], i) => (
        <mesh key={`bx${i}`} position={[cx + ox, bandY, cz + oz]} raycast={() => undefined}>
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
          <mesh position={[cx, 0.015, cz]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => undefined}>
            <planeGeometry args={[w * 2.4, d * 2.4]} />
            <meshBasicMaterial
              map={glow} color={SELECT} transparent opacity={dark ? 0.55 : 0.30}
              blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
            />
          </mesh>
          {/* soft bloom hugging the band itself */}
          <mesh position={[cx, bandY, cz]} raycast={() => undefined}>
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
  onSelectComponent,
  interactionMode,
  onPartsDiscovered,
  onPortsReady,
  showLabel,
  callout,
  dark,
  interactive,
  onHover,
  onBoundsReady,
}: {
  component: PlantComponent3D;
  statusColor: string;
  modelScale: number;
  editable: boolean;
  isSelectedComponent: boolean;
  selectedPart: string | null;
  onSelectPart?: (componentId: string, partName: string) => void;
  onSelectComponent?: (componentId: string) => void;
  interactionMode: 'parts' | 'connections';
  onPartsDiscovered?: (componentId: string, parts: PartNode[]) => void;
  onPortsReady: (componentId: string, ports: Map<string, { pos: THREE.Vector3; dir: THREE.Vector3 }>) => void;
  showLabel: boolean;
  callout?: PlantCalloutFacts;
  dark: boolean;
  /** Twin mode: the whole component is a click target, parts are not. */
  interactive: boolean;
  onHover?: (componentId: string | null) => void;
  /** World-space bounds, for the screen-space label placement. */
  onBoundsReady: (componentId: string, box: THREE.Box3) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const definition = PLANT_MODELS[component.model];
  const model = useModelInstance(definition.url);
  const correction = definition.correction;
  /**
   * The correction as a matrix, for the things measured off the model rather
   * than rendered through the scene graph — the plinth footprint and the label
   * anchor are both read in model space and have to be moved with it.
   */
  const correctionMatrix = useMemo(() => {
    if (!correction) return null;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(...correction.offset),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...correction.rotation)),
      new THREE.Vector3(1, 1, 1),
    );
  }, [correction]);
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
    if (box.isEmpty()) return new THREE.Box3(new THREE.Vector3(-4, 0, -3), new THREE.Vector3(4, 4, 3));
    // Measured in model space, so it has to be corrected too or a CAD asset
    // would sit on a plinth cut for its authored frame rather than its placed one.
    return correctionMatrix ? box.applyMatrix4(correctionMatrix) : box;
  }, [model, correctionMatrix]);
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

    // World bounds of the built geometry, for the label overlay's safe zone.
    // Measured from the model rather than from the registry footprint, so a
    // rotated component and the power house transformer bay are both covered.
    const bounds = new THREE.Box3().setFromObject(model.root);
    if (!bounds.isEmpty()) onBoundsReady(component.id, bounds);

    const anchor = model.root.getObjectByName('ANCHOR_LABEL');
    if (anchor) {
      // The callout is a sibling of the correction group, so an anchor read in
      // model space has to be brought into the corrected frame by hand.
      const at = anchor.position.clone();
      if (correctionMatrix) at.applyMatrix4(correctionMatrix);
      setLabelPos([at.x, at.y, at.z]);
    }
    invalidate();
  }, [model, component.x, component.z, component.rotation, scale, onPortsReady, onBoundsReady, component.id, invalidate, correctionMatrix]);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      // Twin mode selects the whole asset. Drilling into a named part is an
      // authoring action, so it stays behind `editable`.
      if (!editable) {
        if (!interactive || !onSelectComponent) return;
        event.stopPropagation();
        onSelectComponent(component.id);
        return;
      }
      event.stopPropagation();
      if (interactionMode === 'connections' && onSelectComponent) {
        onSelectComponent(component.id);
        return;
      }
      const name = event.object.name;
      if (name && onSelectPart) onSelectPart(component.id, name);
    },
    [editable, interactive, interactionMode, onSelectComponent, onSelectPart, component.id],
  );

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setHovered(true);
      onHover?.(component.id);
      invalidate();
    },
    [component.id, invalidate, onHover],
  );

  const handlePointerOut = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const group = groupRef.current;
      if (group) {
        const stillInside = event.intersections.some((hit) => {
          let node: THREE.Object3D | null = hit.object;
          while (node) {
            if (node === group) return true;
            node = node.parent;
          }
          return false;
        });
        if (stillInside) return;
      }
      setHovered(false);
      onHover?.(null);
      invalidate();
    },
    [component.id, invalidate, onHover],
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
        onPointerDown={editable || interactive ? handleClick : undefined}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <ComponentPad box={footprint} active={active} dark={dark} glow={glow} wallTex={wallTex} />
        {/* the model stands ON the plinth */}
        <group position={[0, PLINTH_H, 0]}>
          {/* Model-space correction, kept strictly separate from the placement
              transform above: the outer group is where the map puts the
              component, this one is only ever about the asset's own frame. */}
          <group
            rotation={correction ? correction.rotation : [0, 0, 0]}
            position={correction ? correction.offset : [0, 0, 0]}
          >
            <primitive object={model.root} />
          </group>
          {showLabel ? (
            <>
              {/* Leader line from the roofline up to the callout. The extra
                  lift is what stops six labels in a six-building yard sitting
                  on the roofs and on each other. */}
              <Line
                points={[
                  [labelPos[0], labelPos[1] - 1.15, labelPos[2]],
                  [labelPos[0], labelPos[1] + LABEL_LIFT - 0.55, labelPos[2]],
                ]}
                color={active ? SELECT : dark ? '#4A525C' : '#9AA1AA'}
                lineWidth={1}
                transparent
                opacity={0.9}
                raycast={() => undefined}
              />
              <mesh position={[labelPos[0], labelPos[1] - 1.15, labelPos[2]]} raycast={() => undefined}>
                <sphereGeometry args={[0.075, 10, 8]} />
                <meshBasicMaterial color={active ? SELECT : statusColor} toneMapped={false} />
              </mesh>
              <Html
                position={[labelPos[0], labelPos[1] + LABEL_LIFT, labelPos[2]]}
                center
                // Smaller on screen than it was: at 40 the callouts were the
                // dominant object in the frame, which is backwards.
                distanceFactor={30}
                zIndexRange={[20, 0]}
                pointerEvents="none"
              >
                <AssetCallout
                  name={component.name}
                  statusColor={statusColor}
                  callout={callout}
                  fallbackStatus={component.status}
                  active={active}
                  dark={dark}
                />
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
            raycast={() => undefined}
          />
          {route.ends.map((end, i) => (
            <mesh key={i} position={end} raycast={() => undefined}>
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

/**
 * Camera framing, focus and transitions.
 *
 * There is one camera and one scene for the whole product. The dashboard and
 * the fullscreen twin differ only in where this rig is asked to put that camera,
 * which is the entire reason entering the plant reads as a move rather than a
 * navigation: nothing is unmounted, so nothing has to be rebuilt.
 *
 * Movement is a goal the rig eases toward, never a jump. Grabbing the mouse
 * cancels the goal outright — a camera that keeps flying while the operator is
 * dragging feels broken, and the operator's intent always wins.
 */
function CameraRig({
  scene,
  viewMode,
  focusId,
  command,
  insets,
}: {
  scene: PlantScene3DConfig;
  viewMode: PlantCameraMode;
  focusId: string | null;
  command?: PlantCameraCommand | null;
  insets: PlantViewInsets;
}) {
  const { camera, invalidate, size } = useThree();
  const controls = useRef<any>(null);
  const goal = useRef<{ pos: THREE.Vector3; tgt: THREE.Vector3 } | null>(null);
  const settled = useRef(false);
  /** Set the moment the operator grabs the camera; blocks automatic reframing. */
  const userMoved = useRef(false);

  /**
   * The visible map rectangle, and how far its centre is from the canvas centre.
   *
   * Each side is clamped to 40% so chrome wider than the canvas — a narrow
   * viewport with the inspector open — can never collapse the usable area to
   * nothing and send the framing distance to infinity.
   */
  const view = useMemo(() => {
    const w = Math.max(1, size.width);
    const h = Math.max(1, size.height);
    const left = Math.max(0, Math.min(insets.left, w * 0.4));
    const right = Math.max(0, Math.min(insets.right, w * 0.4));
    const top = Math.max(0, Math.min(insets.top, h * 0.4));
    const bottom = Math.max(0, Math.min(insets.bottom, h * 0.4));
    const usableW = w - left - right;
    const usableH = h - top - bottom;
    return {
      w,
      h,
      usableW,
      usableH,
      // Where the visible centre sits relative to the canvas centre, in px.
      dx: left + usableW / 2 - w / 2,
      dy: top + usableH / 2 - h / 2,
    };
  }, [insets, size.width, size.height]);

  /** Eased so opening the inspector slides the yard clear instead of snapping. */
  const viewGoal = useRef({ dx: 0, dy: 0 });
  const viewApplied = useRef({ dx: 0, dy: 0 });
  const viewSettled = useRef(false);
  const lastSize = useRef({ w: 0, h: 0 });

  /**
   * Slides the frustum so the camera's target lands on the visible centre.
   *
   * `setViewOffset` windows a sub-rectangle out of a larger virtual image;
   * asking for a window the same size as the canvas but shifted by `-d` moves
   * the rendered content by `+d` without touching the camera's position, its
   * target or the projection's scale. The projection matrix carries the shift,
   * so the label projector and raycasting follow it for free.
   */
  const applyViewOffset = useCallback(
    (dx: number, dy: number) => {
      const perspective = camera as THREE.PerspectiveCamera;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        if (perspective.view?.enabled) perspective.clearViewOffset();
        return;
      }
      // Both of these call updateProjectionMatrix themselves.
      perspective.setViewOffset(view.w, view.h, -dx, -dy, view.w, view.h);
    },
    [camera, view.w, view.h],
  );

  useEffect(() => {
    viewGoal.current = { dx: view.dx, dy: view.dy };
    // A resize is already an animation of the whole layer, and the offset is
    // measured in the size that just changed, so track it rather than chase it.
    const resized = lastSize.current.w !== view.w || lastSize.current.h !== view.h;
    lastSize.current = { w: view.w, h: view.h };
    if (!viewSettled.current || resized) {
      viewSettled.current = true;
      viewApplied.current = { dx: view.dx, dy: view.dy };
      applyViewOffset(view.dx, view.dy);
    }
    invalidate();
  }, [view, applyViewOffset, invalidate]);

  /** Extent of the whole yard. Drives the default framing and the zoom limits. */
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
    const radius = Math.max(8, box.getBoundingSphere(new THREE.Sphere()).radius);
    return { center, radius };
  }, [scene.components, scene.modelScale]);

  /**
   * Distance at which a sphere of `radius` fills `fill` of the frame.
   *
   * Derived from the live viewport rather than a tuned constant, because the
   * canvas here is anything from a 292px-wide column on a laptop to a 1920px
   * fullscreen stage. A fixed multiplier that framed one of those correctly
   * left the plant as a speck in the other — which is exactly what it did.
   * Whichever of the two field-of-view axes is tighter is the one that limits.
   */
  const frameDistance = useCallback(
    (radius: number, fill: number) => {
      const perspective = camera as THREE.PerspectiveCamera;
      const vertical = THREE.MathUtils.degToRad(perspective.fov || 42);
      const aspect = perspective.aspect || view.w / view.h;
      const tan = Math.tan(vertical / 2);
      // Against the *visible* rectangle, not the canvas. The floating panels
      // cover roughly a fifth of the frame; fitting the yard to the full canvas
      // is what let it spill under the analytics column and the chart strip.
      const visibleV = 2 * Math.atan(tan * (view.usableH / view.h));
      const visibleH = 2 * Math.atan(tan * aspect * (view.usableW / view.w));
      const limiting = Math.min(visibleV, visibleH);
      return (radius / Math.max(0.08, Math.sin(limiting / 2))) * fill;
    },
    [camera, view.h, view.w, view.usableH, view.usableW],
  );

  /** Where each component sits, and how close is close enough to inspect it. */
  const centres = useMemo(() => {
    const map = new Map<string, { center: THREE.Vector3; radius: number }>();
    for (const c of scene.components) {
      const model = PLANT_MODELS[c.model];
      const s = (c.scale / 100) * (scene.modelScale / 100);
      map.set(c.id, {
        center: new THREE.Vector3(c.x, model.height * s * 0.45, c.z),
        radius: Math.max(5, Math.max(model.footprint[0], model.footprint[1]) * s * 0.85),
      });
    }
    return map;
  }, [scene.components, scene.modelScale]);

  const goalFor = useCallback(
    (mode: PlantCameraMode, id: string | null) => {
      // Front-right, elevated: the three-quarter angle that reads a plant best.
      // Immersive drops the eye line — standing in the yard rather than looking
      // down at a model of it.
      const direction = new THREE.Vector3(0.62, mode === 'immersive' ? 0.38 : 0.54, 0.86).normalize();

      const placed = id ? centres.get(id) : undefined;
      if (placed) {
        // Close enough to read the building, far enough to keep its neighbours
        // in frame — an asset with no context around it stops being a plant.
        const distance = frameDistance(placed.radius, mode === 'immersive' ? 1.15 : 1.4);
        return {
          pos: placed.center.clone().add(direction.multiplyScalar(distance)),
          tgt: placed.center.clone(),
        };
      }

      // The plant should hold roughly two thirds of the frame. A bounding
      // *sphere* around a flat yard is generously oversized, so fitting it
      // exactly (1.0) leaves the plant looking like a model on a table.
      const distance = frameDistance(focus.radius, mode === 'immersive' ? 0.46 : 0.66);
      // Aim slightly above the ground plane so the yard sits in the lower two
      // thirds and the buildings have sky above them, rather than the plant
      // being pinned to the middle with dead grid all round.
      const target = focus.center.clone().setY(focus.center.y * 0.35);
      return { pos: target.clone().add(direction.multiplyScalar(distance)), tgt: target };
    },
    [centres, focus, frameDistance],
  );

  // Snap on first frame, ease afterwards: an opening animation from an
  // arbitrary start position is motion with nothing to say.
  //
  // Deliberately does NOT depend on `goalFor` (which changes with the viewport):
  // a deliberate move is a response to the mode or the selection changing, and
  // reframing is handled separately below.
  useEffect(() => {
    const next = goalFor(viewMode, focusId);
    userMoved.current = false;
    if (!settled.current) {
      settled.current = true;
      camera.position.copy(next.pos);
      camera.updateProjectionMatrix();
      if (controls.current) {
        controls.current.target.copy(next.tgt);
        controls.current.update();
      }
      invalidate();
      return;
    }
    goal.current = next;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, viewMode]);

  /**
   * Re-frame as the canvas resizes.
   *
   * This is what carries the fullscreen move: the layer's bounds animate from
   * the dashboard cell out to the viewport, and the camera re-fits continuously
   * against each new aspect, so the plant grows into the frame instead of
   * jumping once at the end. It stops the moment the operator takes the camera.
   */
  useEffect(() => {
    if (userMoved.current || !settled.current) return;
    goal.current = goalFor(viewMode, focusId);
    invalidate();
  }, [focusId, goalFor, invalidate, size.height, size.width, viewMode]);

  const lastCommand = useRef(0);
  useEffect(() => {
    if (!command || command.id === lastCommand.current) return;
    lastCommand.current = command.id;
    const orbit = controls.current;
    if (!orbit) return;

    if (command.kind === 'fit' || command.kind === 'reset') {
      // Fitting hands the camera back to the rig, so resizing tracks again.
      userMoved.current = false;
      goal.current = goalFor(viewMode, command.kind === 'fit' ? null : focusId);
      invalidate();
      return;
    }

    const tgt = orbit.target.clone();
    const offset = camera.position.clone().sub(tgt);
    const distance = offset.length();
    const next = command.kind === 'zoom-in' ? distance * 0.7 : distance * 1.42;
    offset.setLength(THREE.MathUtils.clamp(next, 4, focus.radius * 5));
    goal.current = { pos: tgt.clone().add(offset), tgt };
    invalidate();
  }, [camera, command, focus.radius, focusId, goalFor, invalidate, viewMode]);

  useFrame(() => {
    let moving = false;

    // --- ease the optical centre toward the visible middle
    const wanted = viewGoal.current;
    const applied = viewApplied.current;
    if (Math.abs(applied.dx - wanted.dx) > 0.25 || Math.abs(applied.dy - wanted.dy) > 0.25) {
      applied.dx += (wanted.dx - applied.dx) * 0.14;
      applied.dy += (wanted.dy - applied.dy) * 0.14;
      applyViewOffset(applied.dx, applied.dy);
      moving = true;
    } else if (applied.dx !== wanted.dx || applied.dy !== wanted.dy) {
      applied.dx = wanted.dx;
      applied.dy = wanted.dy;
      applyViewOffset(applied.dx, applied.dy);
    }

    // --- ease the camera toward its goal
    const target = goal.current;
    const orbit = controls.current;
    if (target && orbit) {
      moving = true;
      camera.position.lerp(target.pos, 0.085);
      orbit.target.lerp(target.tgt, 0.085);
      orbit.update();
      if (camera.position.distanceTo(target.pos) < 0.06 && orbit.target.distanceTo(target.tgt) < 0.04) {
        camera.position.copy(target.pos);
        orbit.target.copy(target.tgt);
        orbit.update();
        goal.current = null;
      }
    }

    // `frameloop="demand"` only renders when asked, so an in-flight move has to
    // request its own next frame. Dropping the goal stops the loop dead.
    if (moving) invalidate();
  });

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
      onStart={() => {
        goal.current = null;
        userMoved.current = true;
      }}
    />
  );
}

function SceneContents(props: PlantScene3DCanvasProps) {
  const {
    scene, statusColors, dark, editable = false, selectedComponentId, selectedPart,
    viewMode = 'overview', onHoverComponent, onBackgroundClick, cameraCommand, labelsVisible = true,
    labelMode = 'html', onProjectLabels, insets = NO_INSETS,
  } = props;
  const portsRef = useRef<PortMap>(new Map());
  const [portVersion, setPortVersion] = useState(0);
  const boundsRef = useRef<Map<string, THREE.Box3>>(new Map());
  const [boundsVersion, setBoundsVersion] = useState(0);

  const onBoundsReady = useCallback((componentId: string, box: THREE.Box3) => {
    boundsRef.current.set(componentId, box);
    setBoundsVersion((v) => v + 1);
  }, []);
  // Twin mode: whole assets are click targets. The editor keeps its own
  // part-level picking, so the two never both claim a pointer event.
  const interactive = !editable && Boolean(props.onSelectComponent);

  /** How far the plant reaches, for the ground's falloff distances. */
  const plantExtent = useMemo(() => {
    let reach = 24;
    for (const component of scene.components) {
      const [w, d] = PLANT_MODELS[component.model].footprint;
      const s = (component.scale / 100) * (scene.modelScale / 100);
      reach = Math.max(reach, Math.hypot(component.x, component.z) + Math.max(w, d) * s);
    }
    return reach;
  }, [scene.components, scene.modelScale]);

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
      {/* Tinted to the console canvas token, not an approximation of it — a few
          hex values off and the floor ends in a visible seam against the page
          instead of dissolving into it. */}
      <fog attach="fog" args={[dark ? '#08090C' : '#F6F6F4', 52, 190]} />

      {scene.showGrid ? <GroundPlane dark={dark} extent={plantExtent} /> : null}

      {/* Invisible pick plane. The floor itself is raycast-disabled (a shader
          slab the size of a county is a terrible hit target), so background
          clicks are caught here instead: clicking the yard rather than a
          building is what enters, and once inside, what deselects. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        visible={false}
        onPointerDown={onBackgroundClick ? () => onBackgroundClick() : undefined}
      >
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial />
      </mesh>

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
            onSelectComponent={props.onSelectComponent}
            interactionMode={props.interactionMode ?? 'parts'}
            onPartsDiscovered={props.onPartsDiscovered}
            onPortsReady={onPortsReady}
            // In `projected` mode the cards are drawn by the DOM overlay, so
            // the in-scene label is off entirely rather than drawn twice.
            showLabel={scene.showLabels && labelsVisible && labelMode === 'html'}
            callout={props.callouts?.[component.id]}
            dark={dark}
            interactive={interactive}
            onHover={onHoverComponent}
            onBoundsReady={onBoundsReady}
          />
        ))}
        <Connections scene={scene} ports={portsRef.current} version={portVersion} />
      </Suspense>

      {labelMode === 'projected' && onProjectLabels ? (
        <LabelProjector boxes={boundsRef.current} version={boundsVersion} onProject={onProjectLabels} />
      ) : null}

      <CameraRig
        scene={scene}
        viewMode={viewMode}
        focusId={editable ? null : selectedComponentId ?? null}
        command={cameraCommand}
        insets={insets}
      />
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

// Warm the loader cache for the light models. This module is itself lazily
// imported the first time the plant map mounts, so nothing here runs on the
// landing page — but a model big enough to opt out of the warm-up waits until a
// scene actually places one, and arrives through the Suspense boundary instead.
for (const model of Object.values(PLANT_MODELS)) {
  if (model.preload !== false) useGLTF.preload(model.url);
}
