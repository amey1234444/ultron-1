// Builds the low-latency frame the UI consumes, straight from a validated MQTT
// envelope — no database round trip involved. A frame is a partial LiveState
// (the exact shape /api/live/state returns) that the browser merges into the
// snapshot it already holds, so a reading reaches the canvas as soon as the
// broker delivers it and long before the row lands in PostgreSQL.
//
// Mirrored in src/server/liveFrame.ts for the Vercel webhook ingest path; keep
// both in sync.

const CONTROLLER_SLOT = 13;
const INVALID_DISPLAY = ['', 'invalid', 'nan', 'null', 'none'];

function textOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

// When the gateway sampled the frame, carried through so latency can be measured
// end to end (gateway sample → pixel) instead of guessed.
function sourceCreatedAtMs(msg) {
  const micros = Number(msg.created_at_us);
  if (Number.isFinite(micros) && micros > 0) return Math.round(micros / 1000);
  const parsed = Date.parse(msg.created_at ?? '');
  return Number.isNaN(parsed) ? null : parsed;
}

function slotsOf(msg) {
  return Array.isArray(msg.payload?.slots) ? msg.payload.slots.filter((slot) => slot && typeof slot === 'object') : [];
}

function measurementIsValid(slot) {
  const display = String(slot.value_display ?? slot.value_formatted ?? '').trim().toLowerCase();
  return slot.measurement_valid === true
    && String(slot.channel_status ?? 'ok').toLowerCase() === 'ok'
    && !INVALID_DISPLAY.includes(display);
}

function measurementFor(msg, slot, updatedAt) {
  const valid = measurementIsValid(slot);
  return {
    gatewayId: msg.gateway_id,
    rackId: msg.rack_id,
    slotId: slot.slot_number,
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

function rackPatch(gatewayId, rackId, status, dataCurrent, updatedAt, reason = null) {
  return {
    gatewayId,
    rackId,
    status: status === 'connected' && dataCurrent ? 'ONLINE' : String(status ?? 'unknown').toUpperCase(),
    lastSeenAt: updatedAt,
    dataCurrent,
    connectionReason: reason,
  };
}

function controllerSlot(gatewayId, rackId, online) {
  return {
    gatewayId,
    rackId,
    slotId: CONTROLLER_SLOT,
    presence: online ? 'PRESENT' : 'ABSENT',
    onlineState: online ? 'ONLINE' : 'OFFLINE',
    cardType: 'Communication Controller',
  };
}

// `kind` is the parsed topic kind. Returns null when the message carries nothing
// the UI renders (command responses, events).
export function buildLiveFrame(kind, msg, nowMs = Date.now()) {
  const updatedAt = new Date(nowMs).toISOString();
  const frame = { serverNowMs: nowMs, sourceCreatedAtMs: sourceCreatedAtMs(msg), gateways: [], racks: [], slots: [], measurements: [] };

  if (kind === 'status') {
    const online = msg.payload?.state === 'ONLINE';
    frame.gateways.push({
      gatewayId: msg.gateway_id,
      currentIp: msg.gateway_ip,
      status: online ? 'ONLINE' : 'OFFLINE',
      lastSeenAt: updatedAt,
    });
    return frame;
  }

  if (kind === 'topology') {
    const racks = Array.isArray(msg.payload?.racks) ? msg.payload.racks : [];
    for (const rack of racks) {
      if (typeof rack?.rack_id !== 'string') continue;
      const dataCurrent = rack.data_current === true;
      frame.racks.push(rackPatch(msg.gateway_id, rack.rack_id, rack.status ?? 'unknown', dataCurrent, updatedAt));
      frame.slots.push(controllerSlot(msg.gateway_id, rack.rack_id, rack.status === 'connected' && dataCurrent));
    }
    frame.gateways.push({
      gatewayId: msg.gateway_id,
      currentIp: msg.gateway_ip,
      status: frame.racks.some((rack) => rack.status === 'ONLINE') ? 'ONLINE' : 'OFFLINE',
      lastSeenAt: updatedAt,
    });
    return frame;
  }

  if (kind === 'rack_health') {
    const dataCurrent = msg.payload?.data_current === true;
    frame.racks.push(
      rackPatch(
        msg.gateway_id,
        msg.rack_id,
        msg.payload?.status ?? 'unknown',
        dataCurrent,
        updatedAt,
        textOrNull(msg.payload?.connection?.status_reason ?? msg.payload?.status_reason),
      ),
    );
    frame.slots.push(controllerSlot(msg.gateway_id, msg.rack_id, msg.payload?.status === 'connected' && dataCurrent));
    if (!dataCurrent) frame.staleRacks = [{ gatewayId: msg.gateway_id, rackId: msg.rack_id }];
    return frame;
  }

  if (kind === 'inventory') {
    for (const slot of slotsOf(msg)) {
      if (!Number.isInteger(slot.slot_number)) continue;
      frame.slots.push({
        gatewayId: msg.gateway_id,
        rackId: msg.rack_id,
        slotId: slot.slot_number,
        presence: 'PRESENT',
        onlineState: 'UNKNOWN',
        cardType: textOrNull(slot.card_type),
      });
    }
    return frame;
  }

  if (kind === 'telemetry') {
    const dataCurrent = msg.payload?.telemetry?.data_current === true;
    frame.racks.push(rackPatch(msg.gateway_id, msg.rack_id, 'connected', dataCurrent, updatedAt));
    frame.gateways.push({
      gatewayId: msg.gateway_id,
      currentIp: msg.gateway_ip,
      status: dataCurrent ? 'ONLINE' : 'OFFLINE',
      lastSeenAt: updatedAt,
    });
    for (const slot of slotsOf(msg)) {
      if (!Number.isInteger(slot.slot_number)) continue;
      frame.slots.push({
        gatewayId: msg.gateway_id,
        rackId: msg.rack_id,
        slotId: slot.slot_number,
        presence: 'PRESENT',
        onlineState: 'ONLINE',
        cardType: textOrNull(slot.card_type),
      });
      // Only data the read model would expose as live reaches the canvas.
      if (dataCurrent && measurementIsValid(slot)) frame.measurements.push(measurementFor(msg, slot, updatedAt));
    }
    frame.slots.push(controllerSlot(msg.gateway_id, msg.rack_id, dataCurrent));
    return frame;
  }

  return null;
}

export { CONTROLLER_SLOT };
