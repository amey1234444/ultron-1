// Building a live frame out of a raw MQTT message.
//
// Deliberately free of server-only imports: the same code runs in the ingest
// path (Node) and in the browser, which subscribes to the broker directly over
// MQTT/WebSocket. Both therefore derive identical state from identical bytes.

import type { LiveFrame, LiveMeasurement, LiveRack, LiveSlot } from './liveTelemetry';

export type TopicKind =
  | 'status'
  | 'topology'
  | 'rack_health'
  | 'inventory'
  | 'telemetry'
  | 'alarm'
  | 'command_response'
  | 'command_request';

export type ParsedTopic = { gatewayId: string; rackId: string | null; kind: TopicKind };

export type FrameEnvelope = {
  gateway_id: string;
  gateway_ip: string;
  rack_id?: string;
  created_at?: string;
  created_at_us?: string;
  payload: Record<string, unknown>;
};

const CONTROLLER_SLOT = 13;
const INVALID_DISPLAY = ['', 'invalid', 'nan', 'null', 'none'];

function decodeSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export function parseLiveTopic(topic: string): ParsedTopic | null {
  const parts = topic.split('/');
  if (parts.length < 5 || parts[0] !== 'ultron' || parts[1] !== 'v1' || parts[2] !== 'gateways') return null;
  const gatewayId = decodeSegment(parts[3]);
  if (!gatewayId) return null;
  if (parts.length === 5 && parts[4] === 'status') return { gatewayId, rackId: null, kind: 'status' };
  if (parts.length === 5 && parts[4] === 'topology') return { gatewayId, rackId: null, kind: 'topology' };
  if (parts.length < 7 || parts[4] !== 'racks') return null;
  const rackId = decodeSegment(parts[5]);
  if (!rackId) return null;
  const rest = parts.slice(6).join('/');
  if (rest === 'health') return { gatewayId, rackId, kind: 'rack_health' };
  if (rest === 'inventory') return { gatewayId, rackId, kind: 'inventory' };
  if (rest === 'telemetry') return { gatewayId, rackId, kind: 'telemetry' };
  if (rest === 'events/alarm') return { gatewayId, rackId, kind: 'alarm' };
  if (rest === 'commands/response') return { gatewayId, rackId, kind: 'command_response' };
  if (rest === 'commands/request') return { gatewayId, rackId, kind: 'command_request' };
  return null;
}

export function sourceCreatedAtMs(msg: FrameEnvelope): number | null {
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
    channelId: 1,
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
