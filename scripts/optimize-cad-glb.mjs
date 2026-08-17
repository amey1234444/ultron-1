#!/usr/bin/env node
/**
 * Offline CAD -> web GLB optimiser.
 *
 * Onshape exports a *drawing*, not a game asset: one mesh per B-rep face, every
 * construction curve kept, UVs written even when there are no textures, and a
 * JSON chunk with one accessor per attribute per face. The Preheater export is
 * 254 MiB of which 63 MiB is JSON, split across 57k primitives — 57k draw calls
 * a frame, which no browser will orbit.
 *
 * Nothing here is a modelling decision, so nothing here needs Blender. It runs
 * on plain Node with no dependencies, it is deterministic, and it is committed
 * so the asset can be rebuilt from the Onshape source at any time:
 *
 *   node scripts/optimize-cad-glb.mjs --in "<source>.glb" --out public/models/plant/x.glb
 *
 * What it does, in order:
 *   1. drops non-triangle primitives (POINTS/LINES/LINE_STRIP construction
 *      curves — 9.5k primitives carrying zero triangles)
 *   2. drops TEXCOORD_0 (the file has zero textures and zero images)
 *   3. collapses vertices onto a uniform grid, averaging position and normal,
 *      which is what actually removes CAD fillet tessellation
 *   4. merges everything sharing a material into one primitive, taking the
 *      draw call count from 57k to one per material
 *
 * Vertex coordinates are left in the source frame. Orientation (Onshape is
 * Z-up) and origin correction belong to the scene config, not to the geometry,
 * so that a coarser re-export from Onshape drops in without re-tuning placement.
 */
import { open, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

// --- CLI ------------------------------------------------------------------

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') ? 'true' : process.argv[++i]);
}
const IN = args.get('in');
const OUT = args.get('out');
/** Grid cell in source units (metres). 0 disables clustering and only welds exact duplicates. */
const CELL = Number(args.get('cell') ?? 0.14);
const KEEP_CURVES = args.get('keep-curves') === 'true';
/** Name of the single wrapper node, matching the plant map's `*_ROOT` convention. */
const ROOT_NAME = args.get('root') ?? 'MODEL_ROOT';
/** Which source axis points up. CAD exports (Onshape included) are Z-up. */
const UP_AXIS = { x: 0, y: 1, z: 2 }[(args.get('up') ?? 'z').toLowerCase()];
if (UP_AXIS === undefined) throw new Error('--up must be x, y or z');

const GLOBAL_MIN = [Infinity, Infinity, Infinity];
const GLOBAL_MAX = [-Infinity, -Infinity, -Infinity];

if (!IN || !OUT) {
  console.error('usage: node scripts/optimize-cad-glb.mjs --in <src.glb> --out <dst.glb> [--cell 0.14] [--keep-curves]');
  process.exit(1);
}

const COMPONENT = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
};
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

// --- read source ----------------------------------------------------------

console.log(`reading ${IN}`);
const srcSize = (await stat(IN)).size;
const fh = await open(IN, 'r');

const head = Buffer.alloc(20);
await fh.read(head, 0, 20, 0);
if (head.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB');
const jsonLen = head.readUInt32LE(12);
if (head.toString('ascii', 16, 20) !== 'JSON') throw new Error('first chunk is not JSON');

const jsonBuf = Buffer.alloc(jsonLen);
await fh.read(jsonBuf, 0, jsonLen, 20);
const gltf = JSON.parse(jsonBuf.toString('utf8'));

// BIN chunk follows the JSON chunk, both 4-byte aligned.
const binHeadOffset = 20 + jsonLen;
const binHead = Buffer.alloc(8);
await fh.read(binHead, 0, 8, binHeadOffset);
const binLen = binHead.readUInt32LE(0);
if (binHead.toString('ascii', 4, 8) !== 'BIN\0') throw new Error('second chunk is not BIN');
const bin = Buffer.alloc(binLen);
// Node caps a single read at 2 GiB; this file is under that but read in slices anyway.
for (let off = 0; off < binLen; ) {
  const { bytesRead } = await fh.read(bin, off, Math.min(64 * 1024 * 1024, binLen - off), binHeadOffset + 8 + off);
  if (bytesRead <= 0) break;
  off += bytesRead;
}
await fh.close();

console.log(
  `  json ${(jsonLen / 1048576).toFixed(1)} MiB  bin ${(binLen / 1048576).toFixed(1)} MiB  ` +
    `nodes ${gltf.nodes?.length ?? 0}  meshes ${gltf.meshes?.length ?? 0}  accessors ${gltf.accessors?.length ?? 0}`,
);

// Every node in this export is identity-transformed and un-nested, so mesh
// space is world space and merging is a plain concatenation. Verify rather than
// assume — a re-export with assembly transforms must not silently collapse.
const transformed = (gltf.nodes ?? []).filter((n) => n.matrix || n.translation || n.rotation || n.scale);
if (transformed.length > 0) {
  throw new Error(
    `${transformed.length} node(s) carry transforms; this script assumes a flat identity hierarchy. ` +
      `Bake transforms or extend the script before using this export.`,
  );
}

/** Reads an accessor into a typed array, honouring bufferView byteStride. */
function readAccessor(index) {
  const acc = gltf.accessors[index];
  if (acc.sparse) throw new Error(`accessor ${index} is sparse; unsupported`);
  const comp = COMPONENT[acc.componentType];
  const per = TYPE_COUNT[acc.type];
  const out = new comp.array(acc.count * per);
  if (acc.bufferView === undefined) return out; // spec: zero-filled
  const view = gltf.bufferViews[acc.bufferView];
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = view.byteStride ?? comp.size * per;
  const packed = stride === comp.size * per;
  if (packed) {
    // Fast path: one contiguous copy. Buffer may not be aligned to the element
    // size, so copy through a fresh ArrayBuffer rather than viewing in place.
    const bytes = acc.count * per * comp.size;
    const slice = new ArrayBuffer(bytes);
    Buffer.from(slice).set(bin.subarray(base, base + bytes));
    return new comp.array(slice);
  }
  for (let i = 0; i < acc.count; i += 1) {
    const at = base + i * stride;
    for (let c = 0; c < per; c += 1) {
      const o = at + c * comp.size;
      switch (acc.componentType) {
        case 5126: out[i * per + c] = bin.readFloatLE(o); break;
        case 5125: out[i * per + c] = bin.readUInt32LE(o); break;
        case 5123: out[i * per + c] = bin.readUInt16LE(o); break;
        case 5122: out[i * per + c] = bin.readInt16LE(o); break;
        case 5121: out[i * per + c] = bin.readUInt8(o); break;
        case 5120: out[i * per + c] = bin.readInt8(o); break;
        default: throw new Error(`componentType ${acc.componentType}`);
      }
    }
  }
  return out;
}

// --- collect triangle primitives per material ------------------------------

/** @type {Map<number, {prims: {p: any}[], tris: number, verts: number}>} */
const groups = new Map();
let droppedPrims = 0;
let droppedTris = 0;

for (const node of gltf.nodes ?? []) {
  const mesh = gltf.meshes?.[node.mesh];
  if (!mesh) continue;
  for (const p of mesh.primitives ?? []) {
    const mode = p.mode ?? 4;
    if (mode !== 4) {
      // POINTS / LINES / LINE_LOOP / LINE_STRIP: Onshape construction curves.
      if (!KEEP_CURVES) { droppedPrims += 1; continue; }
    }
    if (p.attributes?.POSITION === undefined) { droppedPrims += 1; continue; }
    const key = p.material ?? -1;
    let g = groups.get(key);
    if (!g) { g = { prims: [], tris: 0, verts: 0 }; groups.set(key, g); }
    g.prims.push(p);
    g.verts += gltf.accessors[p.attributes.POSITION].count;
    g.tris += (p.indices != null ? gltf.accessors[p.indices].count : gltf.accessors[p.attributes.POSITION].count) / 3;
  }
}
console.log(`  ${groups.size} material groups, ${droppedPrims} non-triangle primitives dropped`);

/** Triangle indices for a primitive, generating them when non-indexed. */
function indicesOf(p, vertexCount) {
  if (p.indices != null) return readAccessor(p.indices);
  const out = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) out[i] = i;
  return out;
}

// --- rebuild ---------------------------------------------------------------

const invCell = CELL > 0 ? 1 / CELL : 0;
// Grid keys are packed into one double. 2^17 cells per axis at 0.14 m covers a
// 18 km model, and 2^17^3 = 2^51 stays inside the exact-integer range.
const AXIS = 131072;
const HALF = AXIS / 2;
const cellKey = (x, y, z) => {
  const ix = Math.floor(x * invCell) + HALF;
  const iy = Math.floor(y * invCell) + HALF;
  const iz = Math.floor(z * invCell) + HALF;
  return (ix * AXIS + iy) * AXIS + iz;
};

const outMeshes = [];
const outAccessors = [];
const outBufferViews = [];
/** @type {Buffer[]} */
const outChunks = [];
let outOffset = 0;

/** Appends a typed array as a bufferView, 4-byte aligned, returning its index. */
function addView(typed, target) {
  const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  const pad = (4 - (outOffset % 4)) % 4;
  if (pad) { outChunks.push(Buffer.alloc(pad)); outOffset += pad; }
  const view = { buffer: 0, byteOffset: outOffset, byteLength: buf.byteLength };
  if (target) view.target = target;
  outBufferViews.push(view);
  outChunks.push(buf);
  outOffset += buf.byteLength;
  return outBufferViews.length - 1;
}

let totalTrisIn = 0;
let totalTrisOut = 0;
let totalVertsIn = 0;
let totalVertsOut = 0;

const materialKeys = [...groups.keys()].sort((a, b) => a - b);
for (const matKey of materialKeys) {
  const group = groups.get(matKey);
  totalTrisIn += group.tris;
  totalVertsIn += group.verts;

  // --- pass A: build the cluster set (position + normal accumulators)
  /** key -> [index, sx, sy, sz, nx, ny, nz, count] */
  const clusters = new Map();
  let clusterCount = 0;
  for (const p of group.prims) {
    const pos = readAccessor(p.attributes.POSITION);
    const nrm = p.attributes.NORMAL != null ? readAccessor(p.attributes.NORMAL) : null;
    const n = pos.length / 3;
    for (let i = 0; i < n; i += 1) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const key = invCell ? cellKey(x, y, z) : `${x},${y},${z}`;
      let c = clusters.get(key);
      if (!c) { c = [clusterCount++, 0, 0, 0, 0, 0, 0, 0]; clusters.set(key, c); }
      c[1] += x; c[2] += y; c[3] += z;
      if (nrm) { c[4] += nrm[i * 3]; c[5] += nrm[i * 3 + 1]; c[6] += nrm[i * 3 + 2]; }
      c[7] += 1;
    }
  }

  const positions = new Float32Array(clusterCount * 3);
  const normals = new Float32Array(clusterCount * 3);
  for (const c of clusters.values()) {
    const i = c[0], k = 1 / c[7];
    positions[i * 3] = c[1] * k; positions[i * 3 + 1] = c[2] * k; positions[i * 3 + 2] = c[3] * k;
    let nx = c[4], ny = c[5], nz = c[6];
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-6) { nx /= len; ny /= len; nz /= len; } else { nx = 0; ny = 1; nz = 0; }
    normals[i * 3] = nx; normals[i * 3 + 1] = ny; normals[i * 3 + 2] = nz;
  }

  // --- pass B: remap triangles, dropping those that collapsed to a line/point
  const indices = [];
  // Coincident CAD faces produce the same triangle repeatedly once welded.
  // Keyed two levels deep so the packed key stays inside the exact-integer
  // range: a single lo*2^42+mid*2^21+hi would silently collide.
  const CAP = 2097152; // 2^21
  const seen = new Map();
  const dedupeUsable = clusterCount < CAP;
  for (const p of group.prims) {
    const pos = readAccessor(p.attributes.POSITION);
    const idx = indicesOf(p, pos.length / 3);
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const ka = invCell ? cellKey(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]) : `${pos[a * 3]},${pos[a * 3 + 1]},${pos[a * 3 + 2]}`;
      const kb = invCell ? cellKey(pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]) : `${pos[b * 3]},${pos[b * 3 + 1]},${pos[b * 3 + 2]}`;
      const kc = invCell ? cellKey(pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]) : `${pos[c * 3]},${pos[c * 3 + 1]},${pos[c * 3 + 2]}`;
      const ia = clusters.get(ka)[0], ib = clusters.get(kb)[0], ic = clusters.get(kc)[0];
      if (ia === ib || ib === ic || ia === ic) continue; // degenerate after collapse
      if (dedupeUsable) {
        const lo = Math.min(ia, ib, ic), hi = Math.max(ia, ib, ic);
        const mid = ia + ib + ic - lo - hi;
        let inner = seen.get(lo);
        if (!inner) { inner = new Set(); seen.set(lo, inner); }
        const packed = mid * CAP + hi; // < 2^42, exact as a double
        if (inner.has(packed)) continue;
        inner.add(packed);
      }
      indices.push(ia, ib, ic);
    }
  }

  if (indices.length === 0) { console.log(`  material ${matKey}: empty after simplification, skipped`); continue; }

  // Drop clusters no surviving triangle references, then compact.
  const used = new Int32Array(clusterCount).fill(-1);
  let kept = 0;
  for (const i of indices) if (used[i] === -1) used[i] = kept++;
  const cPos = new Float32Array(kept * 3);
  const cNrm = new Float32Array(kept * 3);
  for (let i = 0; i < clusterCount; i += 1) {
    const j = used[i];
    if (j === -1) continue;
    cPos[j * 3] = positions[i * 3]; cPos[j * 3 + 1] = positions[i * 3 + 1]; cPos[j * 3 + 2] = positions[i * 3 + 2];
    cNrm[j * 3] = normals[i * 3]; cNrm[j * 3 + 1] = normals[i * 3 + 1]; cNrm[j * 3 + 2] = normals[i * 3 + 2];
  }
  const idxArray = kept > 65535 ? new Uint32Array(indices.length) : new Uint16Array(indices.length);
  for (let i = 0; i < indices.length; i += 1) idxArray[i] = used[indices[i]];

  // glTF requires min/max on POSITION.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < kept; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      const v = cPos[i * 3 + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }

  for (let c = 0; c < 3; c += 1) {
    if (min[c] < GLOBAL_MIN[c]) GLOBAL_MIN[c] = min[c];
    if (max[c] > GLOBAL_MAX[c]) GLOBAL_MAX[c] = max[c];
  }

  const posAcc = outAccessors.push({
    bufferView: addView(cPos, 34962), componentType: 5126, count: kept, type: 'VEC3', min, max,
  }) - 1;
  const nrmAcc = outAccessors.push({
    bufferView: addView(cNrm, 34962), componentType: 5126, count: kept, type: 'VEC3',
  }) - 1;
  const idxAcc = outAccessors.push({
    bufferView: addView(idxArray, 34963), componentType: kept > 65535 ? 5125 : 5123, count: idxArray.length, type: 'SCALAR',
  }) - 1;

  const source = matKey >= 0 ? gltf.materials?.[matKey] : null;
  const hex = source?.pbrMetallicRoughness?.baseColorFactor
    ? source.pbrMetallicRoughness.baseColorFactor.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
    : 'default';
  outMeshes.push({
    // Onshape names every face "Part 1467"/"Curve 88", which carries no meaning
    // to map sensors onto. Name the merged shells by material instead, so the
    // editor's part list is readable and stable across re-exports.
    name: `SHELL_${String(outMeshes.length).padStart(2, '0')}_${hex.toUpperCase()}`,
    primitives: [{ attributes: { POSITION: posAcc, NORMAL: nrmAcc }, indices: idxAcc, material: matKey >= 0 ? matKey : undefined }],
  });

  totalTrisOut += idxArray.length / 3;
  totalVertsOut += kept;
  console.log(
    `  material ${String(matKey).padStart(2)}  ${String(group.prims.length).padStart(6)} prims -> 1  ` +
      `tris ${String(Math.round(group.tris)).padStart(8)} -> ${String(idxArray.length / 3).padStart(7)}  ` +
      `verts ${String(group.verts).padStart(8)} -> ${String(kept).padStart(7)}`,
  );
}

// --- assemble --------------------------------------------------------------

// The plant map's own models are authored as a single named root holding the
// parts plus `ANCHOR_*` empties, and the scene reads `ANCHOR_LABEL` to hang the
// callout. Emitting the same shape means the optimised CAD asset needs no
// special-casing in the renderer.
const outNodes = outMeshes.map((m, i) => ({ name: m.name, mesh: i }));

const span = GLOBAL_MAX.map((v, i) => v - GLOBAL_MIN[i]);
const anchor = [0, 1, 2].map((i) =>
  i === UP_AXIS ? GLOBAL_MAX[i] + span[i] * 0.012 : (GLOBAL_MIN[i] + GLOBAL_MAX[i]) / 2,
);
outNodes.push({ name: 'ANCHOR_LABEL', translation: anchor });

const rootIndex = outNodes.push({ name: ROOT_NAME, children: outNodes.map((_, i) => i) }) - 1;

const out = {
  asset: {
    version: '2.0',
    generator: `optimize-cad-glb (cell=${CELL}) from ${gltf.asset?.generator ?? 'unknown'}`,
  },
  scene: 0,
  scenes: [{ name: 'Scene', nodes: [rootIndex] }],
  nodes: outNodes,
  meshes: outMeshes,
  // Materials are carried across untouched — these are the colours Onshape
  // assigned, and the plant map is meant to show them.
  materials: (gltf.materials ?? []).map((m) => {
    const copy = JSON.parse(JSON.stringify(m));
    delete copy.extensions; // PTC_onshape_metadata only
    // Onshape writes every material doubleSided. Backface culling halves the
    // fragment work and these are closed solids.
    copy.doubleSided = false;
    const pbr = (copy.pbrMetallicRoughness ??= {});
    // Flat 0 roughness with no map reads as plastic under the map's lighting.
    if (pbr.roughnessFactor === undefined) pbr.roughnessFactor = 0.65;
    if (pbr.metallicFactor === undefined) pbr.metallicFactor = 0;
    return copy;
  }),
  accessors: outAccessors,
  bufferViews: outBufferViews,
  buffers: [{ byteLength: outOffset }],
};

let outJson = Buffer.from(JSON.stringify(out), 'utf8');
if (outJson.length % 4) outJson = Buffer.concat([outJson, Buffer.alloc(4 - (outJson.length % 4), 0x20)]);
let outBin = Buffer.concat(outChunks);
if (outBin.length % 4) outBin = Buffer.concat([outBin, Buffer.alloc(4 - (outBin.length % 4))]);

const total = 12 + 8 + outJson.length + 8 + outBin.length;
const glb = Buffer.alloc(total);
glb.write('glTF', 0, 'ascii');
glb.writeUInt32LE(2, 4);
glb.writeUInt32LE(total, 8);
glb.writeUInt32LE(outJson.length, 12);
glb.write('JSON', 16, 'ascii');
outJson.copy(glb, 20);
glb.writeUInt32LE(outBin.length, 20 + outJson.length);
glb.write('BIN\0', 24 + outJson.length, 'ascii');
outBin.copy(glb, 28 + outJson.length);

await mkdir(dirname(OUT), { recursive: true });
const outFh = await open(OUT, 'w');
await outFh.write(glb);
await outFh.close();

const pct = (a, b) => `${((1 - a / b) * 100).toFixed(1)}% smaller`;
console.log(`
wrote ${OUT}
  file        ${(srcSize / 1048576).toFixed(1)} MiB -> ${(total / 1048576).toFixed(2)} MiB   (${pct(total, srcSize)})
  json chunk  ${(jsonLen / 1048576).toFixed(1)} MiB -> ${(outJson.length / 1024).toFixed(1)} KiB
  draw calls  ${[...groups.values()].reduce((s, g) => s + g.prims.length, 0)} -> ${outMeshes.length}
  triangles   ${Math.round(totalTrisIn).toLocaleString()} -> ${totalTrisOut.toLocaleString()}   (${pct(totalTrisOut, totalTrisIn)})
  vertices    ${totalVertsIn.toLocaleString()} -> ${totalVertsOut.toLocaleString()}
  grid cell   ${CELL > 0 ? `${CELL} m` : 'disabled (exact weld only)'}`);
