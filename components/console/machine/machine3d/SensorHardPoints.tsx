/**
 * The physical instrumentation ports, rendered into the machine itself.
 *
 * Each port is a small three.js assembly -- bedded socket, machined boss, stem,
 * connection face, green accent ring -- portalled into the authored GLB node it
 * is bolted to. Being a *child* of that node is the whole point: the port
 * inherits the component's world matrix, so it turns with the surface under
 * orbit, survives any future change to the asset's placement, and is depth
 * tested against the machine like any other piece of metal.
 *
 * Nothing here knows what an instrument measures. `code` arrives from the point
 * registry and leaves untouched; this module only decides where the hardware
 * for that code physically sits and how bright its ring is.
 *
 * The projector reads `faceOf(code)` for its world position, which makes the 3D
 * port the single source of truth for every downstream screen coordinate: the
 * pad overlay, the trail endpoints and the snap targets all derive from the
 * same object the operator can see bolted to the machine.
 */
'use client';

import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { Fragment, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import {
  HARD_POINT,
  HARD_POINT_FACE_HEIGHT,
  HARD_POINT_SCALE,
  hardPointDebugEnabled,
  type HardPointState,
  type SensorHardPointSpec,
} from './hardPointTypes';
import { SENSOR_HARD_POINTS } from './sensorHardPoints.generated';

export { SENSOR_HARD_POINTS } from './sensorHardPoints.generated';

/** Cylinders and tori are authored +Y up; ports are built along their normal. */
const UP = new THREE.Vector3(0, 1, 0);

/* -------------------------------------------------------------------------- */
/* shared geometry and materials                                               */
/* -------------------------------------------------------------------------- */

type PortAssets = {
  pad: THREE.CylinderGeometry;
  boss: THREE.CylinderGeometry;
  stem: THREE.CylinderGeometry;
  face: THREE.CylinderGeometry;
  ring: THREE.TorusGeometry;
  socketMaterial: THREE.MeshStandardMaterial;
  stemMaterial: THREE.MeshStandardMaterial;
  faceMaterial: THREE.MeshStandardMaterial;
  ringIdle: THREE.MeshStandardMaterial;
  ringActive: THREE.MeshStandardMaterial;
  dispose: () => void;
};

/**
 * Five geometries and five materials for all thirty-six ports.
 *
 * Every port is identical hardware, so sharing is not an optimisation so much
 * as the correct model of the thing: one part number, installed in thirty-six
 * places. It also keeps the added draw state trivial next to the 281k-triangle
 * machine they sit on.
 */
function createPortAssets(dark: boolean): PortAssets {
  const pad = new THREE.CylinderGeometry(
    HARD_POINT.padRadius,
    HARD_POINT.padBaseRadius,
    HARD_POINT.padHeight,
    16,
  );
  const boss = new THREE.CylinderGeometry(
    HARD_POINT.bossRadius,
    HARD_POINT.bossBaseRadius,
    HARD_POINT.bossHeight,
    16,
  );
  const stem = new THREE.CylinderGeometry(
    HARD_POINT.stemRadius,
    HARD_POINT.stemRadius,
    HARD_POINT.stemHeight,
    12,
  );
  const face = new THREE.CylinderGeometry(
    HARD_POINT.faceRadius,
    HARD_POINT.faceRadius,
    HARD_POINT.faceHeight,
    18,
  );
  const ring = new THREE.TorusGeometry(HARD_POINT.ringRadius, HARD_POINT.ringTube, 8, 22);
  // Tori are authored in the XY plane; rotate once here so a port is a plain
  // stack along +Y and no per-instance rotation is needed.
  ring.rotateX(Math.PI / 2);

  // Graphite mounting hardware, one step darker than anything it sits on so the
  // port always reads as an added fitting rather than as part of the casting.
  const socketMaterial = new THREE.MeshStandardMaterial({
    color: dark ? '#22262A' : '#2C3033',
    metalness: 0.58,
    roughness: 0.62,
  });
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: dark ? '#9AA1A6' : '#8B9297',
    metalness: 0.82,
    roughness: 0.34,
  });
  const faceMaterial = new THREE.MeshStandardMaterial({
    color: '#0E1113',
    metalness: 0.42,
    roughness: 0.70,
  });
  // The only saturated colour on the machine, and the only emissive surface.
  // Kept low on purpose: enough to identify a live connection point, nowhere
  // near enough to bloom or to compete with the screws for attention.
  const ringIdle = new THREE.MeshStandardMaterial({
    color: '#55D98B',
    emissive: '#55D98B',
    emissiveIntensity: 0.15,
    metalness: 0.28,
    roughness: 0.38,
  });
  const ringActive = new THREE.MeshStandardMaterial({
    color: '#55D98B',
    emissive: '#55D98B',
    emissiveIntensity: 0.34,
    metalness: 0.28,
    roughness: 0.34,
  });

  return {
    pad,
    boss,
    stem,
    face,
    ring,
    socketMaterial,
    stemMaterial,
    faceMaterial,
    ringIdle,
    ringActive,
    dispose() {
      [pad, boss, stem, face, ring].forEach((geometry) => geometry.dispose());
      [socketMaterial, stemMaterial, faceMaterial, ringIdle, ringActive].forEach((material) =>
        material.dispose(),
      );
    },
  };
}

/* -------------------------------------------------------------------------- */
/* one port                                                                    */
/* -------------------------------------------------------------------------- */

/** Y offsets of each element from the contact point, along the surface normal. */
const PAD_Y = -HARD_POINT.padSink + HARD_POINT.padHeight / 2;
const BOSS_Y = -HARD_POINT.padSink + HARD_POINT.padHeight + HARD_POINT.bossHeight / 2;
const STEM_Y =
  -HARD_POINT.padSink + HARD_POINT.padHeight + HARD_POINT.bossHeight + HARD_POINT.stemHeight / 2;
const FACE_Y = HARD_POINT_FACE_HEIGHT;

type PortHandle = {
  code: string;
  group: THREE.Group;
  face: THREE.Mesh;
  ring: THREE.Mesh;
  hovered: boolean;
  scale: number;
};

function SensorHardPoint({
  spec,
  assets,
  state,
  label,
  register,
  onSelect,
}: {
  spec: SensorHardPointSpec;
  assets: PortAssets;
  state: HardPointState;
  label?: string;
  register: (handle: PortHandle | null) => void;
  onSelect?: (code: string) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const faceMesh = useRef<THREE.Mesh>(null);
  const ringMesh = useRef<THREE.Mesh>(null);
  const handle = useRef<PortHandle | null>(null);

  /** Stand the port up along the measured surface normal, once. */
  const quaternion = useMemo(() => {
    const normal = new THREE.Vector3(...spec.normal);
    if (normal.lengthSq() < 1e-9) normal.set(0, 1, 0);
    return new THREE.Quaternion().setFromUnitVectors(UP, normal.normalize());
  }, [spec.normal]);

  useEffect(() => {
    if (!group.current || !faceMesh.current || !ringMesh.current) return undefined;
    const next: PortHandle = {
      code: spec.code,
      group: group.current,
      face: faceMesh.current,
      ring: ringMesh.current,
      hovered: false,
      scale: 1,
    };
    handle.current = next;
    register(next);
    return () => {
      handle.current = null;
      register(null);
    };
  }, [spec.code, register]);

  // Hover lives in the handle rather than in React state: the animation is a
  // per-frame lerp on a matrix, and re-rendering thirty-six components to move
  // one of them by 8% would be the only expensive thing on the stage.
  const enter = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    if (handle.current) handle.current.hovered = true;
    if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
  };
  const leave = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    if (handle.current) handle.current.hovered = false;
    if (typeof document !== 'undefined') document.body.style.cursor = '';
  };

  const active = state === 'live' || state === 'linked' || state === 'selected';

  return (
    <group
      ref={group}
      position={[spec.position[0], spec.position[1], spec.position[2]]}
      quaternion={quaternion}
      name={`HARDPOINT_${spec.code}`}
      userData={{ hardPointCode: spec.code }}
    >
      <mesh geometry={assets.pad} material={assets.socketMaterial} position={[0, PAD_Y, 0]} />
      <mesh geometry={assets.boss} material={assets.socketMaterial} position={[0, BOSS_Y, 0]} />
      <mesh geometry={assets.stem} material={assets.stemMaterial} position={[0, STEM_Y, 0]} />
      <mesh
        ref={faceMesh}
        geometry={assets.face}
        material={assets.faceMaterial}
        position={[0, FACE_Y, 0]}
        onPointerOver={enter}
        onPointerOut={leave}
        onPointerDown={(event: { stopPropagation: () => void }) => {
          if (!onSelect) return;
          event.stopPropagation();
          onSelect(spec.code);
        }}
        // The port is hardware, so it is described as the instrument it carries
        // rather than as a control. Names live in the console, never on the
        // machine: nothing here draws text into the scene.
        userData={{ hardPointCode: spec.code, hardPointLabel: label }}
      />
      <mesh
        ref={ringMesh}
        geometry={assets.ring}
        material={active ? assets.ringActive : assets.ringIdle}
        position={[0, FACE_Y, 0]}
      />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* the set                                                                     */
/* -------------------------------------------------------------------------- */

export type HardPointFaces = {
  /** World position of one port's connection face, or undefined if unmounted. */
  read: (code: string, target: THREE.Vector3) => boolean;
  /** Codes that resolved to a real node and are actually installed. */
  codes: () => string[];
};

/**
 * Resolve each spec against the loaded scene and portal a port into its owner.
 *
 * A spec whose node is missing is dropped with a warning rather than rendered
 * somewhere plausible: a port that is not attached to anything is exactly the
 * floating marker this replaces, and silently drawing one would hide a real
 * asset regression.
 */
export function SensorHardPoints({
  root,
  states,
  labels,
  dark,
  onFaces,
  onSelect,
}: {
  root: THREE.Object3D;
  states?: Readonly<Record<string, HardPointState>>;
  labels?: Readonly<Record<string, string>>;
  dark: boolean;
  onFaces: (faces: HardPointFaces) => void;
  onSelect?: (code: string) => void;
}) {
  const camera = useThree((s) => s.camera);
  const assets = useMemo(() => createPortAssets(dark), [dark]);
  useEffect(() => () => assets.dispose(), [assets]);

  const installed = useMemo(() => {
    const rows: { spec: SensorHardPointSpec; owner: THREE.Object3D }[] = [];
    const missing: string[] = [];
    for (const spec of SENSOR_HARD_POINTS) {
      const owner = root.getObjectByName(spec.parent);
      if (!owner) {
        missing.push(`${spec.code} -> ${spec.parent}`);
        continue;
      }
      rows.push({ spec, owner });
    }
    if (missing.length > 0) {
      console.warn('[machine-3d] hard points with no owning node: %s', missing.join(', '));
    }
    return rows;
  }, [root]);

  const handles = useRef(new Map<string, PortHandle>());
  const register = useMemo(() => {
    const byCode = new Map<string, (handle: PortHandle | null) => void>();
    for (const { spec } of installed) {
      byCode.set(spec.code, (handle) => {
        if (handle) handles.current.set(spec.code, handle);
        else handles.current.delete(spec.code);
      });
    }
    return byCode;
  }, [installed]);

  useEffect(() => {
    const faces: HardPointFaces = {
      read(code, target) {
        const handle = handles.current.get(code);
        if (!handle) return false;
        handle.face.getWorldPosition(target);
        return true;
      },
      codes: () => [...handles.current.keys()],
    };
    onFaces(faces);
  }, [onFaces, installed]);

  // One frame loop for the whole set, reusing two vectors. Thirty-six separate
  // `useFrame` subscriptions each allocating a Vector3 is exactly the per-frame
  // churn that makes an orbit stutter.
  const cameraPosition = useRef(new THREE.Vector3());
  const facePosition = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    camera.getWorldPosition(cameraPosition.current);
    // Damping that is stable at any frame rate: the same 60 Hz feel on a 144 Hz
    // display, and no overshoot when a tab is throttled to 4 Hz.
    const blend = 1 - Math.exp(-delta * 14);

    for (const handle of handles.current.values()) {
      handle.face.getWorldPosition(facePosition.current);
      const distance = cameraPosition.current.distanceTo(facePosition.current);
      const ratio = distance / HARD_POINT_SCALE.reference;
      const followed = 1 + (ratio - 1) * HARD_POINT_SCALE.follow;
      const clamped = Math.min(HARD_POINT_SCALE.max, Math.max(HARD_POINT_SCALE.min, followed));
      const target = clamped * (handle.hovered ? 1.08 : 1);
      handle.scale += (target - handle.scale) * blend;
      handle.group.scale.setScalar(handle.scale);
    }
  });

  const debug = hardPointDebugEnabled();
  useEffect(() => {
    if (!debug) return;
    console.table(
      installed.map(({ spec, owner }) => ({
        code: spec.code,
        parent: spec.parent,
        group: spec.partGroup,
        node: owner.type,
        local: spec.position.map((v) => v.toFixed(4)).join(', '),
        normal: spec.normal.map((v) => v.toFixed(3)).join(', '),
      })),
    );
  }, [debug, installed]);

  return (
    <>
      {installed.map(({ spec, owner }) => (
        <Fragment key={spec.code}>
          {createPortal(
            <>
              <SensorHardPoint
                spec={spec}
                assets={assets}
                state={states?.[spec.code] ?? 'idle'}
                label={labels?.[spec.code]}
                register={register.get(spec.code) ?? (() => {})}
                onSelect={onSelect}
              />
              {debug ? (
                <arrowHelper
                  args={[
                    new THREE.Vector3(...spec.normal).normalize(),
                    new THREE.Vector3(...spec.position),
                    0.08,
                    0xff2fd0,
                    0.02,
                    0.012,
                  ]}
                />
              ) : null}
            </>,
            owner,
          )}
        </Fragment>
      ))}
    </>
  );
}
