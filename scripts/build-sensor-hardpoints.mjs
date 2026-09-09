#!/usr/bin/env node
/**
 * Derive the sensor hard-point registry from the shipped GLB.
 *
 * A hard point is a physical instrumentation port: a socket sunk into a real
 * machine surface, a short stem, and a connection head. To exist in model space
 * it needs three things the anchor table alone does not carry -- which authored
 * GLB node owns the surface, where on that node's *local* frame the socket
 * sits, and which way the surface faces.
 *
 * All three are measured here, once, from the asset itself:
 *
 *   1. for every anchor, find the nearest triangle across every mesh that is
 *      visible in the default cutaway,
 *   2. take that triangle's face normal, oriented outward using the anchor
 *      (the anchor table places each anchor a few millimetres proud of the
 *      surface it measures, so `anchor - contact` is the outward direction),
 *   3. resolve the owning authored node by walking up to the first `partId`,
 *      and express contact point and normal in that node's local frame.
 *
 * Output is a generated TypeScript module. Re-run it after any change to the
 * asset or to `TWIN_SCREW_ANCHORS_3D`:
 *
 *   node scripts/build-sensor-hardpoints.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Box3, Matrix3, Matrix4, Triangle, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ASSET = 'public/models/machines/twin-screw-extruder.glb';
const OUT = 'components/console/machine/machine3d/sensorHardPoints.generated.ts';
const CUTAWAY_GROUP = 'barrel_front';
/** Only meshes whose box comes within this of an anchor are searched. */
const SEARCH_RADIUS = 0.12;

if (typeof globalThis.ProgressEvent === 'undefined') {
  Object.defineProperty(globalThis, 'ProgressEvent', { configurable: true, value: class {} });
}

// The anchor table is TypeScript; read the literal rather than transpiling it.
const source = readFileSync('lib/twinScrewExtruderPoints.ts', 'utf8');
const block = source.slice(source.indexOf('TWIN_SCREW_ANCHORS_3D'));
const anchors = [];
for (const m of block.matchAll(/'([a-z0-9-]+)':\s*\[([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\]/g)) {
  anchors.push([m[1], [Number(m[2]), Number(m[3]), Number(m[4])]]);
}
if (anchors.length !== 36) throw new Error(`expected 36 anchors, parsed ${anchors.length}`);

const bytes = readFileSync(ASSET);
const gltf = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  '',
);
const root = gltf.scene;
root.updateWorldMatrix(true, true);

/** Default view is the cutaway, so the removable front panels are not surfaces. */
root.traverse((o) => {
  if (o.userData?.partGroup === CUTAWAY_GROUP) o.visible = false;
});
const effectivelyVisible = (o) => {
  for (let c = o; c; c = c.parent) if (!c.visible) return false;
  return true;
};

const meshes = [];
root.traverse((o) => {
  if (o.isMesh && effectivelyVisible(o)) meshes.push({ mesh: o, box: new Box3().setFromObject(o) });
});

const inherited = (o, key) => {
  for (let c = o; c; c = c.parent) {
    const v = c.userData?.[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
};
/** First ancestor that is an authored part, i.e. carries its own `partId`. */
const ownerOf = (o) => {
  for (let c = o; c; c = c.parent) if (typeof c.userData?.partId === 'string') return c;
  return o;
};

const tri = new Triangle();
const a = new Vector3();
const b = new Vector3();
const c = new Vector3();
const closest = new Vector3();
const faceNormal = new Vector3();
const oriented = new Vector3();

/** The reference elevation the console frames the machine from. */
const VIEW = new Vector3(0, 0.06, 1).normalize();
/** How square-on a face has to be before a port is allowed to sit on it. */
const FACING_MIN = 0.02;

/**
 * Outward normal for one candidate face.
 *
 * The anchor table places every anchor on or a few millimetres proud of the
 * surface it measures, so `anchor - contact` is the outward side whenever the
 * two differ. Flush anchors fall back to the authored face winding, which the
 * Blender export already orients outward.
 */
function outwardNormal(faceNormal, contact, anchor, target) {
  target.copy(faceNormal);
  const gapX = anchor.x - contact.x;
  const gapY = anchor.y - contact.y;
  const gapZ = anchor.z - contact.z;
  if (gapX * gapX + gapY * gapY + gapZ * gapZ > 1e-8) {
    if (target.x * gapX + target.y * gapY + target.z * gapZ < 0) target.negate();
  }
  return target.normalize();
}

function nearestSurface(point, facingOnly) {
  let best = null;
  for (const { mesh, box } of meshes) {
    if (box.distanceToPoint(point) > SEARCH_RADIUS) continue;
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const index = geometry.index;
    const count = index ? index.count : position.count;
    const world = mesh.matrixWorld;
    for (let i = 0; i < count; i += 3) {
      const i0 = index ? index.getX(i) : i;
      const i1 = index ? index.getX(i + 1) : i + 1;
      const i2 = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(position, i0).applyMatrix4(world);
      b.fromBufferAttribute(position, i1).applyMatrix4(world);
      c.fromBufferAttribute(position, i2).applyMatrix4(world);
      tri.set(a, b, c);
      tri.closestPointToPoint(point, closest);
      const distance = closest.distanceTo(point);
      // Zero-area triangles survive the boolean joins in the Blender build and
      // make `closestPointToPoint` return NaN. `NaN >= x` is false, so without
      // this guard the first degenerate face would replace the running minimum
      // and every later comparison against it would also succeed -- the search
      // would silently return whichever triangle happened to come last.
      if (!Number.isFinite(distance)) continue;
      if (best && distance >= best.distance) continue;
      tri.getNormal(faceNormal);
      if (faceNormal.lengthSq() < 1e-12) continue;
      outwardNormal(faceNormal, closest, point, oriented);
      // A port on a face turned away from the reference elevation would be
      // buried behind its own component at the default pose. Pass one takes
      // only faces the operator can actually see; pass two lifts the rule so a
      // port is always placed on *some* real surface.
      if (facingOnly && oriented.dot(VIEW) < FACING_MIN) continue;
      best = { distance, point: closest.clone(), normal: oriented.clone(), mesh };
    }
  }
  return best;
}

const rows = [];
const report = [];
for (const [code, anchor] of anchors) {
  const p = new Vector3(...anchor);
  const hit = nearestSurface(p, true) ?? nearestSurface(p, false);
  if (!hit) throw new Error(`no surface within ${SEARCH_RADIUS} m of ${code}`);
  const normal = hit.normal.clone().normalize();

  const owner = ownerOf(hit.mesh);
  const toLocal = new Matrix4().copy(owner.matrixWorld).invert();
  const localPoint = hit.point.clone().applyMatrix4(toLocal);
  const localNormal = normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(toLocal)).normalize();

  rows.push({
    code,
    parent: owner.name,
    partGroup: inherited(hit.mesh, 'partGroup') ?? '',
    position: localPoint.toArray(),
    normal: localNormal.toArray(),
  });
  report.push(
    `${code.padEnd(20)} ${owner.name.padEnd(28)} gap ${hit.distance.toFixed(4)}` +
      ` n [${normal.toArray().map((v) => v.toFixed(2)).join(', ')}]` +
      ` facing ${normal.dot(VIEW).toFixed(2)}`,
  );
}
console.log(report.join('\n'));

const fixed = (v) => Number(v.toFixed(6));
const body = rows
  .map(
    (r) =>
      `  {\n    code: '${r.code}',\n    parent: '${r.parent}',\n    partGroup: '${r.partGroup}',\n    position: [${r.position.map(fixed).join(', ')}],\n    normal: [${r.normal.map(fixed).join(', ')}],\n  },`,
  )
  .join('\n');

writeFileSync(
  OUT,
  `/**
 * GENERATED by \`node scripts/build-sensor-hardpoints.mjs\` -- do not edit.
 *
 * One instrumentation port per registry point, measured off
 * \`public/models/machines/twin-screw-extruder.glb\`. \`parent\` is the authored
 * node the port is bolted to; \`position\` and \`normal\` are in that node's own
 * local frame, so a port follows its component through every transform the
 * asset or the camera applies.
 */
import type { SensorHardPointSpec } from './hardPointTypes';

export const SENSOR_HARD_POINTS: readonly SensorHardPointSpec[] = [
${body}
];
`,
  'utf8',
);
console.log(`\nwrote ${OUT} (${rows.length} hard points)`);
