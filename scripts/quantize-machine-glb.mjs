#!/usr/bin/env node
/**
 * Shrink a machine GLB by quantizing its vertex attributes.
 *
 *   node scripts/quantize-machine-glb.mjs --in <src.glb> --out <dst.glb>
 *
 * Why not Draco or meshopt
 * ------------------------
 * Both decode in WebAssembly. The production CSP is `script-src 'self'`, which
 * does not permit WebAssembly at all, and this asset has already been through
 * one silent Draco failure -- a loader that never resolves is indistinguishable
 * from a stage that never mounted. `KHR_mesh_quantization` needs no decoder: it
 * is a storage format three.js reads natively, so the asset stays a plain GLB
 * that any glTF viewer opens.
 *
 * What it changes
 * ---------------
 *   POSITION  float32 VEC3 (12 B)  ->  int16 VEC3, 8 B with padding
 *   NORMAL    float32 VEC3 (12 B)  ->  int8  VEC3 normalized, 4 B with padding
 *
 * Positions are quantized against one grid for the whole machine, so a single
 * uniform scale dequantizes every mesh. That scale is carried by a wrapper node
 * inserted under each authored node rather than by the authored node itself:
 * the console addresses parts by name (`root.getObjectByName('MOTOR_body')`),
 * reads Blender extras off them, toggles their visibility, and parents sensor
 * hard points to them in *metres*. Scaling the authored node would silently
 * rescale all four of those. The wrapper is invisible to every one of them.
 *
 * What it does not change
 * -----------------------
 * Node names, hierarchy, extras (`partId`, `partGroup`, ...), materials, mesh
 * and primitive counts, triangle counts, and every vertex's world position to
 * within one quantization step (~0.09 mm on a 3 m machine).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') ? 'true' : process.argv[++i]);
}
const IN = args.get('in');
const OUT = args.get('out');
if (!IN || !OUT) {
  console.error('usage: node scripts/quantize-machine-glb.mjs --in <src.glb> --out <dst.glb>');
  process.exit(1);
}

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const FLOAT = 5126;
const SHORT = 5122;
const BYTE = 5120;
const ARRAY_BUFFER = 34962;
/** Signed 16-bit headroom. -32768 is left unused so the grid stays symmetric. */
const SHORT_MAX = 32767;
const BYTE_MAX = 127;

/* -------------------------------------------------------------------------- */
/* read                                                                        */
/* -------------------------------------------------------------------------- */

const source = readFileSync(IN);
if (source.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${IN} is not a GLB`);

let cursor = 12;
let json = null;
let bin = null;
while (cursor < source.length) {
  const length = source.readUInt32LE(cursor);
  const type = source.readUInt32LE(cursor + 4);
  const body = source.subarray(cursor + 8, cursor + 8 + length);
  if (type === JSON_CHUNK) json = JSON.parse(body.toString('utf8'));
  else if (type === BIN_CHUNK) bin = body;
  cursor += 8 + length + ((4 - (length % 4)) % 4);
}
if (!json || !bin) throw new Error('GLB is missing its JSON or BIN chunk');

const accessors = json.accessors ?? [];
const bufferViews = json.bufferViews ?? [];

/** Which accessors carry which attribute. Shared accessors are counted once. */
const positionAccessors = new Set();
const normalAccessors = new Set();
for (const mesh of json.meshes ?? []) {
  for (const primitive of mesh.primitives ?? []) {
    const { POSITION, NORMAL } = primitive.attributes ?? {};
    if (POSITION !== undefined) positionAccessors.add(POSITION);
    if (NORMAL !== undefined) normalAccessors.add(NORMAL);
  }
}
for (const index of positionAccessors) {
  if (normalAccessors.has(index)) throw new Error(`accessor ${index} is used as both POSITION and NORMAL`);
}

function readFloats(accessorIndex) {
  const accessor = accessors[accessorIndex];
  if (accessor.componentType !== FLOAT || accessor.type !== 'VEC3') {
    throw new Error(`accessor ${accessorIndex} is not a float VEC3`);
  }
  const view = bufferViews[accessor.bufferView];
  const stride = view.byteStride ?? 12;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const out = new Float32Array(accessor.count * 3);
  for (let i = 0; i < accessor.count; i += 1) {
    const at = base + i * stride;
    out[i * 3] = bin.readFloatLE(at);
    out[i * 3 + 1] = bin.readFloatLE(at + 4);
    out[i * 3 + 2] = bin.readFloatLE(at + 8);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the position grid                                                           */
/* -------------------------------------------------------------------------- */

const positionData = new Map();
let extreme = 0;
for (const index of positionAccessors) {
  const values = readFloats(index);
  positionData.set(index, values);
  for (const v of values) {
    const magnitude = Math.abs(v);
    if (magnitude > extreme) extreme = magnitude;
  }
}
if (extreme === 0) throw new Error('every position is zero; refusing to quantize');
/** One grid for the whole machine, so one uniform scale dequantizes all of it. */
const scale = extreme / SHORT_MAX;

/* -------------------------------------------------------------------------- */
/* rebuild the buffer                                                          */
/* -------------------------------------------------------------------------- */

const chunks = [];
let offset = 0;
const newViews = [];

function pushView(bytes, { target, byteStride }) {
  // Every bufferView starts 4-byte aligned, which is what both the accessor
  // alignment rule and the BIN chunk padding rule require.
  const pad = (4 - (offset % 4)) % 4;
  if (pad > 0) {
    chunks.push(Buffer.alloc(pad));
    offset += pad;
  }
  const view = { buffer: 0, byteOffset: offset, byteLength: bytes.length };
  if (target !== undefined) view.target = target;
  if (byteStride !== undefined) view.byteStride = byteStride;
  chunks.push(bytes);
  offset += bytes.length;
  newViews.push(view);
  return newViews.length - 1;
}

for (let i = 0; i < accessors.length; i += 1) {
  const accessor = accessors[i];

  if (positionAccessors.has(i)) {
    const values = positionData.get(i);
    // VEC3 of int16 is 6 bytes, and glTF requires each vertex attribute
    // element to start on a 4-byte boundary, so the stride is 8 with two
    // bytes of padding. 12 -> 8 rather than 12 -> 6, and worth it: no decoder.
    const bytes = Buffer.alloc(accessor.count * 8);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < accessor.count; v += 1) {
      for (let c = 0; c < 3; c += 1) {
        const q = Math.max(-SHORT_MAX, Math.min(SHORT_MAX, Math.round(values[v * 3 + c] / scale)));
        bytes.writeInt16LE(q, v * 8 + c * 2);
        if (q < min[c]) min[c] = q;
        if (q > max[c]) max[c] = q;
      }
    }
    accessor.bufferView = pushView(bytes, { target: ARRAY_BUFFER, byteStride: 8 });
    accessor.byteOffset = 0;
    accessor.componentType = SHORT;
    accessor.normalized = false;
    accessor.min = min;
    accessor.max = max;
    continue;
  }

  if (normalAccessors.has(i)) {
    const values = readFloats(i);
    const bytes = Buffer.alloc(accessor.count * 4);
    for (let v = 0; v < accessor.count; v += 1) {
      for (let c = 0; c < 3; c += 1) {
        const q = Math.max(-BYTE_MAX, Math.min(BYTE_MAX, Math.round(values[v * 3 + c] * BYTE_MAX)));
        bytes.writeInt8(q, v * 4 + c);
      }
    }
    accessor.bufferView = pushView(bytes, { target: ARRAY_BUFFER, byteStride: 4 });
    accessor.byteOffset = 0;
    accessor.componentType = BYTE;
    accessor.normalized = true;
    delete accessor.min;
    delete accessor.max;
    continue;
  }

  // Everything else -- indices above all -- is copied through byte for byte.
  const view = bufferViews[accessor.bufferView];
  const bytes = Buffer.from(
    bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength),
  );
  accessor.bufferView = pushView(bytes, { target: view.target, byteStride: view.byteStride });
}

json.bufferViews = newViews;

/* -------------------------------------------------------------------------- */
/* dequantization wrappers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Give every mesh a wrapper node that carries the scale.
 *
 * The authored node keeps its name, transform, extras and place in the
 * hierarchy and simply gains one child. Everything that addresses parts by name
 * or reads their metadata is untouched, and a sensor hard point parented to an
 * authored node still measures in metres.
 */
const nodes = json.nodes ?? [];
const originalNodeCount = nodes.length;
let wrapped = 0;
for (let i = 0; i < originalNodeCount; i += 1) {
  const node = nodes[i];
  if (node.mesh === undefined) continue;
  const wrapper = { name: `${node.name ?? `node_${i}`}__deq`, mesh: node.mesh, scale: [scale, scale, scale] };
  if (node.skin !== undefined) {
    wrapper.skin = node.skin;
    delete node.skin;
  }
  nodes.push(wrapper);
  delete node.mesh;
  node.children = [...(node.children ?? []), nodes.length - 1];
  wrapped += 1;
}

const used = new Set(json.extensionsUsed ?? []);
used.add('KHR_mesh_quantization');
json.extensionsUsed = [...used];
const required = new Set(json.extensionsRequired ?? []);
required.add('KHR_mesh_quantization');
json.extensionsRequired = [...required];

/* -------------------------------------------------------------------------- */
/* write                                                                       */
/* -------------------------------------------------------------------------- */

const binChunk = Buffer.concat(chunks);
const binPadded = Buffer.concat([binChunk, Buffer.alloc((4 - (binChunk.length % 4)) % 4)]);
json.buffers = [{ byteLength: binPadded.length }];

const jsonText = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPadded = Buffer.concat([
  jsonText,
  Buffer.alloc((4 - (jsonText.length % 4)) % 4, 0x20),
]);

const header = Buffer.alloc(12);
header.writeUInt32LE(GLB_MAGIC, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8);

const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonPadded.length, 0);
jsonHeader.writeUInt32LE(JSON_CHUNK, 4);

const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binPadded.length, 0);
binHeader.writeUInt32LE(BIN_CHUNK, 4);

const out = Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binPadded]);
writeFileSync(OUT, out);

const mb = (n) => (n / 1048576).toFixed(2);
console.log(
  `${IN} ${mb(source.length)} MB -> ${OUT} ${mb(out.length)} MB` +
    ` (-${(100 - (out.length / source.length) * 100).toFixed(0)}%)`,
);
console.log(
  `  ${positionAccessors.size} position accessors, ${normalAccessors.size} normal accessors,` +
    ` ${wrapped} meshes wrapped, grid ${(scale * 1000).toFixed(4)} mm`,
);
