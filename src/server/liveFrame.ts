// Live frames: the low-latency half of ingestion.
//
//   ingest ──frame──> pg_notify('ultron_live') ──> /api/live/stream (SSE) ──> UI
//           └─persist─> PostgreSQL (behind the frame, not in front of it)
//
// A frame is a partial LiveState built straight from a validated MQTT envelope,
// so the browser can render a reading without waiting for the writes that frame
// triggers. NOTIFY is used purely as a broker: no rows, no transaction, one
// round trip, and every Next.js instance can LISTEN for it.
//
// Mirrored in services/mqtt-ingest/liveFrame.js for the standalone worker; keep
// both in sync.

import { Client } from 'pg';

import type { LiveGateway, LiveMeasurement, LiveRack, LiveSlot } from '../../lib/liveTelemetry';
import { query } from './db';
import { logServerError } from './errors';

export const LIVE_CHANNEL = 'ultron_live';
const MAX_NOTIFY_BYTES = 7000;
const CONTROLLER_SLOT = 13;
const INVALID_DISPLAY = ['', 'invalid', 'nan', 'null', 'none'];

export type LiveFrame = {
  serverNowMs: number;
  // When the gateway sampled the frame, so latency can be measured end to end
  // (gateway sample → pixel) instead of guessed.
  sourceCreatedAtMs?: number | null;
  // Set when the update did not fit in a NOTIFY payload: subscribers reconcile
  // with a snapshot instead of losing the update.
  invalidate?: boolean;
  gateways?: LiveGateway[];
  racks?: LiveRack[];
  slots?: LiveSlot[];
  measurements?: LiveMeasurement[];
};

type FrameEnvelope = {
  gateway_id: string;
  gateway_ip: string;
  rack_id?: string;
  created_at?: string;
  created_at_us?: string;
  payload: Record<string, unknown>;
};

function sourceCreatedAtMs(msg: FrameEnvelope): number | null {
  const micros = Number(msg.created_at_us);
  if (Number.isFinite(micros) && micros > 0) return Math.round(micros / 1000);
  const parsed = Date.parse(msg.created_at ?? '');
  return Number.isNaN(parsed) ? null : parsed;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

function slotsOf(msg: FrameEnvelope): Record<string, unknown>[] {
  const slots = msg.payload.slots;
  if (!Array.isArray(slots)) return [];
  return slots.map(record).filter((slot) => Number.isInteger(slot.slot_number));
}

function measurementIsValid(slot: Record<string, unknown>): boolean {
  const display = String(slot.value_display ?? slot.value_formatted ?? '').trim().toLowerCase();
  return slot.measurement_valid === true
    && String(slot.channel_status ?? 'ok').toLowerCase() === 'ok'
    && !INVALID_DISPLAY.includes(display);
}

function measurementFor(msg: FrameEnvelope, slot: Record<string, unknown>, updatedAt: string): LiveMeasurement {
  const valid = measurementIsValid(slot);
  return {
    gatewayId: msg.gateway_id,
    rackId: String(msg.rack_id),
    slotId: Number(slot.slot_number),
    channelId: Number.isInteger(slot.channel_id) ? Number(slot.channel_id) : 1,
    measurementType: textOrNull(slot.sensor) ?? textOrNull(slot.card_type) ?? 'VALUE',
    value: numeric(slot.value_formatted ?? slot.value_raw),
    valueDisplay: textOrNull(slot.value_display),
    valueWithUnit: textOrNull(slot.value_with_unit),
    measurementValid: valid,
    unit: textOrNull(slot.unit) ?? '',
    quality: valid ? 'GOOD' : 'BAD',
    updatedAt,
    cardType: textOrNull(slot.card_type),
    sensor: textOrNull(slot.sensor),
    freshness: String(slot.data_status ?? '').toLowerCase() === 'current' ? 'FRESH' : 'STALE',
    channelStatus: textOrNull(slot.channel_status),
    alertThreshold: numeric(slot.alert_value_formatted),
    dangerThreshold: numeric(slot.danger_value_formatted),
    alertState: textOrNull(slot.alert_status) ?? 'INACTIVE',
    dangerState: textOrNull(slot.danger_status) ?? 'INACTIVE',
  };
}

function rackPatch(gatewayId: string, rackId: string, status: unknown, dataCurrent: boolean, updatedAt: string): LiveRack {
  return {
    gatewayId,
    rackId,
    status: status === 'connected' && dataCurrent ? 'ONLINE' : String(status ?? 'unknown').toUpperCase(),
    lastSeenAt: updatedAt,
  };
}

function controllerSlot(gatewayId: string, rackId: string, online: boolean): LiveSlot {
  return {
    gatewayId,
    rackId,
    slotId: CONTROLLER_SLOT,
    presence: online ? 'PRESENT' : 'ABSENT',
    onlineState: online ? 'ONLINE' : 'OFFLINE',
    cardType: 'Communication Controller',
  };
}

// Returns null for messages the UI does not render (events, command responses).
export function buildLiveFrame(kind: string, message: unknown, nowMs = Date.now()): LiveFrame | null {
  const msg = message as FrameEnvelope;
  if (!msg || typeof msg !== 'object' || typeof msg.gateway_id !== 'string') return null;
  const updatedAt = new Date(nowMs).toISOString();
  const frame: LiveFrame = { serverNowMs: nowMs, sourceCreatedAtMs: sourceCreatedAtMs(msg), gateways: [], racks: [], slots: [], measurements: [] };

  if (kind === 'status') {
    const online = msg.payload.state === 'ONLINE';
    frame.gateways!.push({
      gatewayId: msg.gateway_id,
      currentIp: msg.gateway_ip,
      status: online ? 'ONLINE' : 'OFFLINE',
      lastSeenAt: updatedAt,
    });
    return frame;
  }

  if (kind === 'topology') {
    const racks = Array.isArray(msg.payload.racks) ? msg.payload.racks.map(record) : [];
    for (const rack of racks) {
      const rackId = textOrNull(rack.rack_id);
      if (!rackId) continue;
      const dataCurrent = rack.data_current === true;
      frame.racks!.push(rackPatch(msg.gateway_id, rackId, rack.status, dataCurrent, updatedAt));
      frame.slots!.push(controllerSlot(msg.gateway_id, rackId, rack.status === 'connected' && dataCurrent));
    }
    frame.gateways!.push({
      gatewayId: msg.gateway_id,
      currentIp: msg.gateway_ip,
      status: frame.racks!.some((rack) => rack.status === 'ONLINE') ? 'ONLINE' : 'OFFLINE',
      lastSeenAt: updatedAt,
    });
    return frame;
  }

  if (!msg.rack_id) return null;

  if (kind === 'rack_health') {
    const dataCurrent = msg.payload.data_current === true;
    frame.racks!.push(rackPatch(msg.gateway_id, msg.rack_id, msg.payload.status, dataCurrent, updatedAt));
    frame.slots!.push(controllerSlot(msg.gateway_id, msg.rack_id, msg.payload.status === 'connected' && dataCurrent));
    return frame;
  }

  if (kind === 'inventory') {
    for (const slot of slotsOf(msg)) {
      frame.slots!.push({
        gatewayId: msg.gateway_id,
        rackId: msg.rack_id,
        slotId: Number(slot.slot_number),
        presence: 'PRESENT',
        onlineState: 'UNKNOWN',
        cardType: textOrNull(slot.card_type),
      });
    }
    return frame;
  }

  if (kind === 'telemetry') {
    const dataCurrent = record(msg.payload.telemetry).data_current === true;
    frame.racks!.push(rackPatch(msg.gateway_id, msg.rack_id, 'connected', dataCurrent, updatedAt));
    frame.gateways!.push({
      gatewayId: msg.gateway_id,
      currentIp: msg.gateway_ip,
      status: dataCurrent ? 'ONLINE' : 'OFFLINE',
      lastSeenAt: updatedAt,
    });
    for (const slot of slotsOf(msg)) {
      frame.slots!.push({
        gatewayId: msg.gateway_id,
        rackId: msg.rack_id,
        slotId: Number(slot.slot_number),
        presence: 'PRESENT',
        onlineState: 'ONLINE',
        cardType: textOrNull(slot.card_type),
      });
      // Only readings the persisted read model would expose as live are pushed.
      if (dataCurrent && measurementIsValid(slot)) frame.measurements!.push(measurementFor(msg, slot, updatedAt));
    }
    frame.slots!.push(controllerSlot(msg.gateway_id, msg.rack_id, dataCurrent));
    return frame;
  }

  return null;
}

export async function publishLiveFrame(frame: LiveFrame): Promise<void> {
  let json = JSON.stringify(frame);
  if (Buffer.byteLength(json, 'utf8') > MAX_NOTIFY_BYTES) {
    json = JSON.stringify({ serverNowMs: frame.serverNowMs, invalidate: true });
  }
  try {
    await query('SELECT pg_notify($1, $2)', [LIVE_CHANNEL, json]);
  } catch (err) {
    // The realtime path must never fail an ingest request.
    logServerError('live frame notify failed', err);
  }
}

// --- Subscription -----------------------------------------------------------
// LISTEN needs a session-scoped connection, so it uses a dedicated client (kept
// per process and shared by all open streams) rather than the request pool.
// PgBouncer in transaction mode swallows LISTEN, hence LIVE_NOTIFY_DATABASE_URL
// for a direct (session-mode) URL; without it streams fall back to polling.

type Subscriber = (frame: LiveFrame) => void;

const globalRef = globalThis as unknown as {
  __ultronLiveSubscribers?: Set<Subscriber>;
  __ultronLiveListener?: Promise<boolean>;
};

function notifyUrl(): string | undefined {
  return process.env.LIVE_NOTIFY_DATABASE_URL ?? process.env.DATABASE_URL;
}

function stripSslParams(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    return url;
  }
}

function subscribers(): Set<Subscriber> {
  if (!globalRef.__ultronLiveSubscribers) globalRef.__ultronLiveSubscribers = new Set();
  return globalRef.__ultronLiveSubscribers;
}

async function startListener(): Promise<boolean> {
  const url = notifyUrl();
  if (!url) return false;
  const client = new Client({
    connectionString: stripSslParams(url),
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  client.on('notification', (message) => {
    if (message.channel !== LIVE_CHANNEL || !message.payload) return;
    let frame: LiveFrame;
    try {
      frame = JSON.parse(message.payload) as LiveFrame;
    } catch {
      return;
    }
    for (const subscriber of subscribers()) subscriber(frame);
  });
  client.on('error', (err) => {
    logServerError('live frame listener error', err);
    globalRef.__ultronLiveListener = undefined;
    client.end().catch(() => {});
  });
  await client.connect();
  await client.query(`LISTEN ${LIVE_CHANNEL}`);
  return true;
}

// Resolves false when push is unavailable (no database URL, or a pooler that
// does not support LISTEN) so callers can fall back to polling.
export function subscribeLiveFrames(onFrame: Subscriber): () => void {
  subscribers().add(onFrame);
  if (!globalRef.__ultronLiveListener) {
    globalRef.__ultronLiveListener = startListener().catch((err) => {
      logServerError('live frame listener failed to start', err);
      globalRef.__ultronLiveListener = undefined;
      return false;
    });
  }
  return () => {
    subscribers().delete(onFrame);
  };
}

// A stream must not wait on a slow LISTEN connection to start serving, so an
// undecided listener counts as unavailable and the caller polls until it settles.
export async function liveFramesAvailable(timeoutMs = 1500): Promise<boolean> {
  const pending = globalRef.__ultronLiveListener;
  if (!pending) return false;
  return Promise.race([
    pending,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}
