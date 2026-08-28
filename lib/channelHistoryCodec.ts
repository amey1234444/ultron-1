export type ChannelHistorySample = { t: number; v: number };

export type EncodedChannelHistoryChunk = {
  version: 1;
  t0: number;
  td: string;
  vx: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  const buffer = (globalThis as unknown as { Buffer?: { from: (bytes: Uint8Array) => { toString: (encoding: 'base64') => string } } }).Buffer;
  if (buffer) return buffer.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array {
  const buffer = (globalThis as unknown as { Buffer?: { from: (text: string, encoding: 'base64') => Uint8Array } }).Buffer;
  if (buffer) return new Uint8Array(buffer.from(text, 'base64'));
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeUnsignedVarints(values: bigint[]): string {
  const bytes: number[] = [];
  for (const raw of values) {
    let value = raw < 0n ? 0n : raw;
    while (value >= 0x80n) {
      bytes.push(Number((value & 0x7fn) | 0x80n));
      value >>= 7n;
    }
    bytes.push(Number(value));
  }
  return bytesToBase64(Uint8Array.from(bytes));
}

function decodeUnsignedVarints(text: string): bigint[] {
  const bytes = base64ToBytes(text);
  const values: bigint[] = [];
  let value = 0n;
  let shift = 0n;
  for (const byte of bytes) {
    value |= BigInt(byte & 0x7f) << shift;
    if (byte & 0x80) {
      shift += 7n;
      continue;
    }
    values.push(value);
    value = 0n;
    shift = 0n;
  }
  return values;
}

function floatToBits(value: number): bigint {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value, true);
  return view.getBigUint64(0, true);
}

function bitsToFloat(bits: bigint): number {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, bits, true);
  return view.getFloat64(0, true);
}

export function encodeChannelHistorySamples(samples: ChannelHistorySample[]): EncodedChannelHistoryChunk {
  const ordered = [...samples].filter((sample) => Number.isFinite(sample.t) && Number.isFinite(sample.v)).sort((a, b) => a.t - b.t);
  const t0 = Math.round(ordered[0]?.t ?? Date.now());
  let previousTimestamp = BigInt(t0);
  const timestampDeltas = ordered.map((sample, index) => {
    const timestamp = BigInt(Math.round(sample.t));
    if (index === 0) return 0n;
    const delta = timestamp - previousTimestamp;
    previousTimestamp = timestamp;
    return delta;
  });

  let previousBits = 0n;
  const valueXors = ordered.map((sample) => {
    const bits = floatToBits(sample.v);
    const xor = bits ^ previousBits;
    previousBits = bits;
    return xor;
  });

  return { version: 1, t0, td: encodeUnsignedVarints(timestampDeltas), vx: encodeUnsignedVarints(valueXors) };
}

export function decodeChannelHistorySamples(payload: EncodedChannelHistoryChunk): ChannelHistorySample[] {
  if (payload.version !== 1) return [];
  const timestampDeltas = decodeUnsignedVarints(payload.td);
  const valueXors = decodeUnsignedVarints(payload.vx);
  let timestamp = BigInt(Math.round(payload.t0));
  let previousBits = 0n;
  return valueXors.map((xor, index) => {
    if (index > 0) timestamp += timestampDeltas[index] ?? 0n;
    const bits = xor ^ previousBits;
    previousBits = bits;
    return { t: Number(timestamp), v: bitsToFloat(bits) };
  });
}
