import { liveMeasurementKeyOf } from './liveMeasurementBus';
import type { LiveMeasurement } from './liveTelemetry';

export type StoredChannelSample = { t: number; v: number };

type EncodedChunk = {
  version: 1;
  t0: number;
  td: string;
  values: string;
};

type ChannelHistoryChunk = {
  id: string;
  channelKey: string;
  firstTimestampMs: number;
  lastTimestampMs: number;
  count: number;
  payload: EncodedChunk;
  createdAtMs: number;
};

const DB_NAME = 'ultron-channel-history';
const DB_VERSION = 1;
const STORE = 'chunks';
const CHANNEL_TIME_INDEX = 'byChannelTime';
const FLUSH_DELAY_MS = 250;
const MAX_QUEUE_PER_CHANNEL = 600;

let dbPromise: Promise<IDBDatabase | null> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const pending = new Map<string, StoredChannelSample[]>();
const lastQueuedTimestamp = new Map<string, number>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openHistoryDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE) ? request.transaction?.objectStore(STORE) : db.createObjectStore(STORE, { keyPath: 'id' });
      if (store && !store.indexNames.contains(CHANNEL_TIME_INDEX)) {
        store.createIndex(CHANNEL_TIME_INDEX, ['channelKey', 'lastTimestampMs']);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeVarints(values: number[]): string {
  const bytes: number[] = [];
  for (const raw of values) {
    let value = Math.max(0, Math.round(raw));
    while (value >= 0x80) {
      bytes.push((value & 0x7f) | 0x80);
      value = Math.floor(value / 0x80);
    }
    bytes.push(value);
  }
  return bytesToBase64(Uint8Array.from(bytes));
}

function decodeVarints(text: string): number[] {
  const bytes = base64ToBytes(text);
  const values: number[] = [];
  let value = 0;
  let shift = 0;
  for (const byte of bytes) {
    value += (byte & 0x7f) * 2 ** shift;
    if (byte & 0x80) {
      shift += 7;
      continue;
    }
    values.push(value);
    value = 0;
    shift = 0;
  }
  return values;
}

function encodeFloat64(values: number[]): string {
  const bytes = new Uint8Array(values.length * 8);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return bytesToBase64(bytes);
}

function decodeFloat64(text: string): number[] {
  const bytes = base64ToBytes(text);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values: number[] = [];
  for (let offset = 0; offset + 8 <= bytes.byteLength; offset += 8) values.push(view.getFloat64(offset, true));
  return values;
}

function encodeSamples(samples: StoredChannelSample[]): EncodedChunk {
  const ordered = [...samples].sort((a, b) => a.t - b.t);
  const t0 = ordered[0]?.t ?? Date.now();
  let previous = t0;
  const deltas = ordered.map((sample, index) => {
    if (index === 0) return 0;
    const delta = sample.t - previous;
    previous = sample.t;
    return delta;
  });
  return { version: 1, t0, td: encodeVarints(deltas), values: encodeFloat64(ordered.map((sample) => sample.v)) };
}

function decodeSamples(payload: EncodedChunk): StoredChannelSample[] {
  const deltas = decodeVarints(payload.td);
  const values = decodeFloat64(payload.values);
  let t = payload.t0;
  return values.map((v, index) => {
    if (index > 0) t += deltas[index] ?? 0;
    return { t, v };
  });
}

async function writeChunk(channelKey: string, samples: StoredChannelSample[]) {
  if (samples.length === 0) return;
  const db = await openHistoryDb();
  if (!db) return;
  const ordered = [...samples].sort((a, b) => a.t - b.t);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const chunk: ChannelHistoryChunk = {
    id: `${channelKey}|${first.t}|${last.t}|${ordered.length}`,
    channelKey,
    firstTimestampMs: first.t,
    lastTimestampMs: last.t,
    count: ordered.length,
    payload: encodeSamples(ordered),
    createdAtMs: Date.now(),
  };
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(chunk);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

async function flushChannelHistory() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const batches = [...pending.entries()];
  pending.clear();
  for (const [channelKey, samples] of batches) await writeChunk(channelKey, samples);
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flushChannelHistory();
  }, FLUSH_DELAY_MS);
}

export function recordChannelHistorySamples(measurements: LiveMeasurement[] | undefined) {
  if (!measurements?.length || !hasIndexedDb()) return;
  for (const measurement of measurements) {
    if (typeof measurement.value !== 'number' || !Number.isFinite(measurement.value)) continue;
    const timestamp = Date.parse(measurement.updatedAt);
    if (!Number.isFinite(timestamp)) continue;
    const channelKey = liveMeasurementKeyOf(measurement);
    if ((lastQueuedTimestamp.get(channelKey) ?? -Infinity) >= timestamp) continue;
    lastQueuedTimestamp.set(channelKey, timestamp);
    const bucket = pending.get(channelKey) ?? [];
    bucket.push({ t: timestamp, v: measurement.value });
    pending.set(channelKey, bucket);
    if (bucket.length >= MAX_QUEUE_PER_CHANNEL) void flushChannelHistory();
  }
  scheduleFlush();
}

function keyParts(channelKey: string): { gatewayId: string; rackId: string; slotId: number; channelId: number } | null {
  const [gatewayId, rackId, slotId, channelId] = channelKey.split('|');
  const slot = Number(slotId);
  const channel = Number(channelId);
  if (!gatewayId || !rackId || !Number.isInteger(slot) || !Number.isInteger(channel)) return null;
  return { gatewayId, rackId, slotId: slot, channelId: channel };
}

function isCloudPoint(value: unknown): value is StoredChannelSample {
  const point = value as { t?: unknown; v?: unknown; value?: unknown; sourceTimestampUs?: unknown };
  if (typeof point?.t === 'number' && typeof point.v === 'number' && Number.isFinite(point.t) && Number.isFinite(point.v)) return true;
  if (typeof point?.value === 'number' && typeof point.sourceTimestampUs === 'string') return true;
  return false;
}

function normalizeCloudPoint(value: unknown): StoredChannelSample | null {
  const point = value as { t?: unknown; v?: unknown; value?: unknown; sourceTimestampUs?: unknown };
  if (typeof point.t === 'number' && typeof point.v === 'number' && Number.isFinite(point.t) && Number.isFinite(point.v)) {
    return { t: point.t, v: point.v };
  }
  if (typeof point.value === 'number' && typeof point.sourceTimestampUs === 'string') {
    const t = Math.round(Number(point.sourceTimestampUs) / 1000);
    return Number.isFinite(t) ? { t, v: point.value } : null;
  }
  return null;
}

async function readCloudChannelHistory(
  channelKey: string,
  limit: number,
  fromMs?: number,
  toMs?: number,
): Promise<StoredChannelSample[]> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return [];
  const parts = keyParts(channelKey);
  if (!parts) return [];
  const params = new URLSearchParams({
    gatewayId: parts.gatewayId,
    rackId: parts.rackId,
    slotId: String(parts.slotId),
    channelId: String(parts.channelId),
    limit: String(limit),
  });
  if (Number.isFinite(fromMs)) params.set('fromMs', String(Math.round(Number(fromMs))));
  if (Number.isFinite(toMs)) params.set('toMs', String(Math.round(Number(toMs))));
  try {
    const response = await fetch(`/api/live/history?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return [];
    const body = (await response.json()) as { persisted?: boolean; points?: unknown[] };
    if (!body.persisted || !Array.isArray(body.points)) return [];
    return body.points.filter(isCloudPoint).map(normalizeCloudPoint).filter((point): point is StoredChannelSample => point !== null);
  } catch {
    return [];
  }
}

export async function readChannelHistorySamples(channelKey: string, limit: number): Promise<StoredChannelSample[]> {
  const cloud = await readCloudChannelHistory(channelKey, limit);
  const db = await openHistoryDb();
  if (!db) return cloud;
  const local = await new Promise<StoredChannelSample[]>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index(CHANNEL_TIME_INDEX);
    const range = IDBKeyRange.bound([channelKey, 0], [channelKey, Number.MAX_SAFE_INTEGER]);
    const request = index.openCursor(range, 'prev');
    const byTimestamp = new Map<number, number>();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || byTimestamp.size >= limit) {
        resolve([...byTimestamp.entries()].map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t).slice(-limit));
        return;
      }
      const chunk = cursor.value as ChannelHistoryChunk;
      for (const sample of decodeSamples(chunk.payload).reverse()) {
        if (!byTimestamp.has(sample.t)) byTimestamp.set(sample.t, sample.v);
        if (byTimestamp.size >= limit) break;
      }
      cursor.continue();
    };
    request.onerror = () => resolve([]);
  });
  const byTimestamp = new Map<number, number>();
  cloud.forEach((sample) => byTimestamp.set(sample.t, sample.v));
  local.forEach((sample) => byTimestamp.set(sample.t, sample.v));
  return [...byTimestamp.entries()].map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t).slice(-limit);
}

export async function readChannelHistoryRange(
  channelKey: string,
  fromMs: number,
  toMs: number,
  limit: number,
): Promise<StoredChannelSample[]> {
  const cloud = await readCloudChannelHistory(channelKey, limit, fromMs, toMs);
  const db = await openHistoryDb();
  if (!db || !(toMs >= fromMs) || limit <= 0) return cloud;
  const local = await new Promise<StoredChannelSample[]>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index(CHANNEL_TIME_INDEX);
    const range = IDBKeyRange.bound([channelKey, fromMs], [channelKey, Number.MAX_SAFE_INTEGER]);
    const request = index.openCursor(range, 'prev');
    const byTimestamp = new Map<number, number>();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || byTimestamp.size >= limit) {
        resolve(
          [...byTimestamp.entries()]
            .map(([t, v]) => ({ t, v }))
            .filter((sample) => sample.t >= fromMs && sample.t <= toMs)
            .sort((a, b) => a.t - b.t)
            .slice(-limit),
        );
        return;
      }
      const chunk = cursor.value as ChannelHistoryChunk;
      if (chunk.firstTimestampMs > toMs) {
        cursor.continue();
        return;
      }
      for (const sample of decodeSamples(chunk.payload).reverse()) {
        if (sample.t < fromMs) break;
        if (sample.t <= toMs && !byTimestamp.has(sample.t)) byTimestamp.set(sample.t, sample.v);
        if (byTimestamp.size >= limit) break;
      }
      cursor.continue();
    };
    request.onerror = () => resolve([]);
  });
  const byTimestamp = new Map<number, number>();
  cloud.forEach((sample) => byTimestamp.set(sample.t, sample.v));
  local.forEach((sample) => {
    if (sample.t >= fromMs && sample.t <= toMs) byTimestamp.set(sample.t, sample.v);
  });
  return [...byTimestamp.entries()].map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t).slice(-limit);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flushChannelHistory();
  });
}
