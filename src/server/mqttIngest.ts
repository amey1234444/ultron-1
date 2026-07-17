import { createHash } from 'crypto';

import { ensureSchema, query } from './db';

type TopicKind =
  | 'status'
  | 'inventory'
  | 'telemetry'
  | 'alarm'
  | 'fault'
  | 'system'
  | 'command_response'
  | 'command_request'
  | 'rack_health'
  | 'diagnostics_response'
  | 'update_status'
  | `slot_${string}`;

type ParsedTopic = {
  gatewayId: string;
  rackId: number | null;
  kind: TopicKind;
  slotId?: number;
};

type MqttEnvelope = {
  schema: string;
  schema_version: string;
  message_id: string;
  gateway_id: string;
  gateway_boot_id: string;
  gateway_ip: string;
  rack_id: number;
  gateway_sequence: number;
  created_at: string;
  replayed: boolean;
  payload: Record<string, unknown>;
};

type IngestResult = {
  kind: TopicKind;
  fresh: boolean;
  stored?: number;
  bindingStatus?: string;
  bindingEvent?: string;
  quarantined?: boolean;
  reason?: string;
};

type NormalizedWebhookMessage = {
  topic: string | null;
  message: unknown;
  sourceEvent: Record<string, unknown> | null;
};

const RE_STATUS = /^ultron\/v1\/gateways\/([^/]+)\/status$/;
const RE_RACK = /^ultron\/v1\/gateways\/([^/]+)\/racks\/(\d+)\/(.+)$/;
const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SCHEMA_FOR_KIND: Partial<Record<TopicKind, string>> = {
  status: 'ultron.gateway.status',
  inventory: 'ultron.rack.inventory',
  telemetry: 'ultron.measurement.batch',
  alarm: 'ultron.event.alarm',
  fault: 'ultron.event.fault',
  system: 'ultron.event.system',
  command_response: 'ultron.command.response',
};

function parseTopic(topic: string): ParsedTopic | null {
  const status = RE_STATUS.exec(topic);
  if (status) return { gatewayId: status[1], rackId: null, kind: 'status' };

  const rack = RE_RACK.exec(topic);
  if (!rack) return null;
  const [, gatewayId, rackIdStr, rest] = rack;
  const rackId = Number(rackIdStr);

  if (rest === 'inventory') return { gatewayId, rackId, kind: 'inventory' };
  if (rest === 'health') return { gatewayId, rackId, kind: 'rack_health' };
  if (rest === 'telemetry') return { gatewayId, rackId, kind: 'telemetry' };
  if (rest === 'events/alarm') return { gatewayId, rackId, kind: 'alarm' };
  if (rest === 'events/fault') return { gatewayId, rackId, kind: 'fault' };
  if (rest === 'events/system') return { gatewayId, rackId, kind: 'system' };
  if (rest === 'commands/response') return { gatewayId, rackId, kind: 'command_response' };
  if (rest === 'commands/request') return { gatewayId, rackId, kind: 'command_request' };
  if (rest === 'diagnostics/response') return { gatewayId, rackId, kind: 'diagnostics_response' };
  if (rest === 'updates/status') return { gatewayId, rackId, kind: 'update_status' };

  const slot = /^slots\/(\d+)\/(identity|capabilities|configuration|health)$/.exec(rest);
  if (slot) return { gatewayId, rackId, kind: `slot_${slot[2]}`, slotId: Number(slot[1]) };

  return null;
}

function validateEnvelope(msg: unknown): string[] {
  const errors: string[] = [];
  if (!msg || typeof msg !== 'object') return ['message is not a JSON object'];
  const m = msg as Partial<MqttEnvelope>;

  if (typeof m.schema !== 'string' || !m.schema.startsWith('ultron.')) errors.push('schema missing/invalid');
  if (m.schema_version !== '1.1') errors.push('schema_version must be "1.1"');
  if (typeof m.message_id !== 'string' || !UUID_RE.test(m.message_id)) errors.push('message_id must be a UUID');
  if (typeof m.gateway_id !== 'string' || !m.gateway_id) errors.push('gateway_id missing');
  if (typeof m.gateway_boot_id !== 'string' || !m.gateway_boot_id) errors.push('gateway_boot_id missing');
  if (typeof m.gateway_ip !== 'string' || !IP_RE.test(m.gateway_ip)) errors.push('gateway_ip missing/invalid');
  if (!Number.isInteger(m.rack_id)) errors.push('rack_id must be an integer');
  if (!Number.isInteger(m.gateway_sequence)) errors.push('gateway_sequence must be an integer');
  if (typeof m.created_at !== 'string' || Number.isNaN(Date.parse(m.created_at))) errors.push('created_at invalid');
  if (typeof m.replayed !== 'boolean') errors.push('replayed must be boolean');
  if (!m.payload || typeof m.payload !== 'object') errors.push('payload missing');
  return errors;
}

function validatePayload(schema: string, payload: Record<string, unknown>): string[] {
  const errors: string[] = [];
  switch (schema) {
    case 'ultron.gateway.status':
      if (!['ONLINE', 'OFFLINE', 'DEGRADED'].includes(String(payload.state))) errors.push('status.state invalid');
      break;
    case 'ultron.rack.inventory': {
      if (!Number.isInteger(payload.snapshot_revision)) errors.push('inventory.snapshot_revision invalid');
      if (!Array.isArray(payload.slots)) errors.push('inventory.slots must be an array');
      else {
        for (const s of payload.slots) {
          const slot = s as { slot_id?: unknown; presence?: unknown };
          if (!Number.isInteger(slot.slot_id) || Number(slot.slot_id) < 1 || Number(slot.slot_id) > 14) errors.push(`slot_id ${slot.slot_id} out of range`);
          if (!['PRESENT', 'EMPTY'].includes(String(slot.presence))) errors.push('slot presence invalid');
        }
      }
      break;
    }
    case 'ultron.measurement.batch': {
      if (!Number.isInteger(payload.batch_sequence)) errors.push('batch_sequence invalid');
      if (!Array.isArray(payload.records)) errors.push('records must be an array');
      else {
        if (Number.isInteger(payload.record_count) && payload.record_count !== payload.records.length) {
          errors.push('record_count does not match records length');
        }
        for (const r of payload.records) {
          const record = r as Record<string, unknown>;
          if (!Number.isInteger(record.slot_id)) errors.push('record.slot_id invalid');
          if (!Number.isInteger(record.channel_id)) errors.push('record.channel_id invalid');
          if (typeof record.measurement_type !== 'string' || !record.measurement_type) errors.push('record.measurement_type missing');
          if (typeof record.value !== 'number' || !Number.isFinite(record.value)) errors.push('record.value invalid');
          if (typeof record.source_timestamp_us !== 'string' || !/^\d+$/.test(record.source_timestamp_us)) errors.push('record.source_timestamp_us invalid');
          if (!Number.isInteger(record.source_sequence)) errors.push('record.source_sequence invalid');
        }
      }
      break;
    }
    case 'ultron.event.alarm':
      if (!['WARNING', 'CRITICAL'].includes(String(payload.severity))) errors.push('alarm.severity invalid');
      if (!['ACTIVE', 'CLEARED'].includes(String(payload.state))) errors.push('alarm.state invalid');
      break;
    case 'ultron.event.fault':
      if (!['ACTIVE', 'CLEARED'].includes(String(payload.state))) errors.push('fault.state invalid');
      break;
    case 'ultron.event.system':
      if (typeof payload.event_type !== 'string' || !payload.event_type) errors.push('system.event_type missing');
      break;
    case 'ultron.command.response':
      if (typeof payload.request_id !== 'string') errors.push('response.request_id missing');
      if (!['ACCEPTED', 'COMPLETED', 'FAILED', 'REJECTED'].includes(String(payload.status))) errors.push('response.status invalid');
      break;
    default:
      break;
  }
  return errors;
}

async function quarantine(topic: string, reason: string, msg: Partial<MqttEnvelope> | null): Promise<void> {
  await query(
    `INSERT INTO mqtt_quarantine (topic, reason, gateway_id, gateway_ip, rack_id, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [topic, reason, msg?.gateway_id ?? null, msg?.gateway_ip ?? null, Number.isInteger(msg?.rack_id) ? msg?.rack_id : null, msg ? JSON.stringify(msg) : null],
  );
}

async function bind(msg: MqttEnvelope): Promise<{ status: string; event: string }> {
  const existing = await query<{ gateway_id: string; current_ip: string; status: string }>(
    `SELECT gateway_id, current_ip, status FROM gateways WHERE gateway_id = $1`,
    [msg.gateway_id],
  );

  let status = 'ONLINE';
  let event = 'BOUND';
  if (existing.rowCount === 0) {
    const commissioned = await query(`SELECT 1 FROM studio_devices WHERE ip = $1 AND archived = false LIMIT 1`, [msg.gateway_ip]);
    if (commissioned.rowCount === 0) {
      status = 'QUARANTINED';
      event = 'UNCLAIMED';
    }
    await query(
      `INSERT INTO gateways (gateway_id, current_ip, gateway_boot_id, mqtt_client_id, status, last_seen_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (gateway_id) DO UPDATE SET last_seen_at = now()`,
      [msg.gateway_id, msg.gateway_ip, msg.gateway_boot_id, `ultron-gw-${msg.gateway_id}`, status],
    );
  } else {
    const current = existing.rows[0];
    status = current.status === 'QUARANTINED' ? 'QUARANTINED' : 'ONLINE';
    if (current.current_ip && current.current_ip !== msg.gateway_ip) event = 'IP_CHANGED';
    await query(
      `UPDATE gateways SET current_ip = $2, gateway_boot_id = $3, status = $4, last_seen_at = now(), updated_at = now()
       WHERE gateway_id = $1`,
      [msg.gateway_id, msg.gateway_ip, msg.gateway_boot_id, status],
    );
  }

  await query(
    `INSERT INTO gateway_ip_history (gateway_id, ip_address, approved)
     VALUES ($1,$2,$3)
     ON CONFLICT (gateway_id, ip_address) DO UPDATE SET last_seen_at = now()`,
    [msg.gateway_id, msg.gateway_ip, event === 'BOUND'],
  );

  await query(
    `INSERT INTO racks (gateway_id, rack_id)
     VALUES ($1,$2)
     ON CONFLICT (gateway_id, rack_id) DO UPDATE SET updated_at = now()`,
    [msg.gateway_id, msg.rack_id],
  );

  return { status, event };
}

async function claimMessage(msg: MqttEnvelope, topic: string, sourceEvent?: Record<string, unknown> | null): Promise<boolean> {
  const hash = createHash('sha256').update(JSON.stringify(msg.payload ?? {})).digest('hex');
  const res = await query(
    `INSERT INTO mqtt_messages (message_id, topic, schema, schema_version, gateway_id, gateway_ip, rack_id, payload_hash, source_event)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (message_id) DO NOTHING`,
    [msg.message_id, topic, msg.schema, msg.schema_version, msg.gateway_id, msg.gateway_ip, msg.rack_id, hash, sourceEvent ? JSON.stringify(sourceEvent) : null],
  );
  return res.rowCount === 1;
}

async function handleStatus(msg: MqttEnvelope): Promise<void> {
  const state = msg.payload.state === 'ONLINE' ? 'ONLINE' : msg.payload.state === 'DEGRADED' ? 'DEGRADED' : 'OFFLINE';
  await query(
    `UPDATE gateways SET status = CASE WHEN status = 'QUARANTINED' THEN status ELSE $2 END,
       last_seen_at = now(), updated_at = now()
     WHERE gateway_id = $1`,
    [msg.gateway_id, state],
  );
}

async function handleInventory(msg: MqttEnvelope): Promise<void> {
  const revision = Number(msg.payload.snapshot_revision);
  const slots = Array.isArray(msg.payload.slots) ? msg.payload.slots : [];
  for (const item of slots) {
    const slot = item as Record<string, unknown>;
    await query(
      `INSERT INTO rack_inventory_slots (gateway_id, rack_id, slot_id, presence, online_state, card_type, snapshot_revision)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (gateway_id, rack_id, slot_id) DO UPDATE SET
         presence = EXCLUDED.presence,
         online_state = EXCLUDED.online_state,
         card_type = EXCLUDED.card_type,
         snapshot_revision = EXCLUDED.snapshot_revision,
         updated_at = now()
       WHERE rack_inventory_slots.snapshot_revision <= EXCLUDED.snapshot_revision`,
      [msg.gateway_id, msg.rack_id, slot.slot_id, slot.presence, slot.online_state ?? 'UNKNOWN', slot.card_type ?? null, revision],
    );
  }
  await query(`DELETE FROM rack_inventory_slots WHERE gateway_id = $1 AND rack_id = $2 AND snapshot_revision < $3`, [msg.gateway_id, msg.rack_id, revision]);
}

async function handleTelemetry(msg: MqttEnvelope): Promise<number> {
  const records = Array.isArray(msg.payload.records) ? msg.payload.records : [];
  if (records.length === 0) return 0;

  const params: unknown[] = [];
  const values = records.map((item, index) => {
    const r = item as Record<string, unknown>;
    params.push(
      msg.gateway_id,
      msg.rack_id,
      r.slot_id,
      r.channel_id,
      r.measurement_type,
      r.value,
      r.unit ?? '',
      r.quality ?? 'GOOD',
      r.source_sequence,
      r.source_timestamp_us,
    );
    const start = index * 10;
    return `($${start + 1},$${start + 2},$${start + 3},$${start + 4},$${start + 5},$${start + 6},$${start + 7},$${start + 8},$${start + 9},$${start + 10})`;
  });

  const hist = await query(
    `INSERT INTO measurement_history
       (gateway_id, rack_id, slot_id, channel_id, measurement_type, value, unit, quality, source_sequence, source_timestamp_us)
     VALUES ${values.join(',')}
     ON CONFLICT (gateway_id, rack_id, slot_id, channel_id, measurement_type, source_sequence, source_timestamp_us) DO NOTHING`,
    params,
  );

  await query(
    `INSERT INTO measurement_latest
       (gateway_id, rack_id, slot_id, channel_id, measurement_type, value, unit, quality, source_sequence, source_timestamp_us, updated_at)
     VALUES ${values.map((value) => `${value.slice(0, -1)}, now())`).join(',')}
     ON CONFLICT (gateway_id, rack_id, slot_id, channel_id, measurement_type) DO UPDATE SET
       value = EXCLUDED.value,
       unit = EXCLUDED.unit,
       quality = EXCLUDED.quality,
       source_sequence = EXCLUDED.source_sequence,
       source_timestamp_us = EXCLUDED.source_timestamp_us,
       updated_at = now()
     WHERE measurement_latest.source_timestamp_us <= EXCLUDED.source_timestamp_us`,
    params,
  );

  return hist.rowCount ?? 0;
}

async function handleEvent(msg: MqttEnvelope, kind: TopicKind): Promise<void> {
  await query(
    `INSERT INTO gateway_events (message_id, gateway_id, rack_id, event_kind, payload)
     VALUES ($1,$2,$3,$4,$5)`,
    [msg.message_id, msg.gateway_id, msg.rack_id, kind, JSON.stringify(msg.payload)],
  );
}

export function normalizeWebhookMessage(body: unknown): NormalizedWebhookMessage {
  if (!body || typeof body !== 'object') return { topic: null, message: body, sourceEvent: null };
  const object = body as Record<string, unknown>;
  const topic = typeof object.topic === 'string' ? object.topic : null;
  const rawPayload = object.payload ?? object.message ?? object;
  if (typeof rawPayload === 'string') {
    try {
      return { topic, message: JSON.parse(rawPayload), sourceEvent: object };
    } catch {
      return { topic, message: rawPayload, sourceEvent: object };
    }
  }
  return { topic, message: rawPayload, sourceEvent: object };
}

export async function ingestMqttMessage(topic: string, rawMessage: unknown, sourceEvent?: Record<string, unknown> | null): Promise<IngestResult> {
  await ensureSchema();

  const parsed = parseTopic(topic);
  if (!parsed) {
    await quarantine(topic, 'unknown topic', null);
    return { kind: 'system', fresh: false, quarantined: true, reason: 'unknown topic' };
  }
  if (parsed.kind === 'command_request') return { kind: parsed.kind, fresh: false };

  const envelopeErrors = validateEnvelope(rawMessage);
  if (envelopeErrors.length > 0) {
    const reason = `envelope: ${envelopeErrors.join('; ')}`;
    await quarantine(topic, reason, rawMessage as Partial<MqttEnvelope>);
    return { kind: parsed.kind, fresh: false, quarantined: true, reason };
  }

  const msg = rawMessage as MqttEnvelope;
  const expectedSchema = SCHEMA_FOR_KIND[parsed.kind];
  if (expectedSchema && msg.schema !== expectedSchema) {
    const reason = `schema ${msg.schema} does not match topic kind ${parsed.kind}`;
    await quarantine(topic, reason, msg);
    return { kind: parsed.kind, fresh: false, quarantined: true, reason };
  }

  const payloadErrors = validatePayload(msg.schema, msg.payload);
  if (payloadErrors.length > 0) {
    const reason = `payload: ${payloadErrors.join('; ')}`;
    await quarantine(topic, reason, msg);
    return { kind: parsed.kind, fresh: false, quarantined: true, reason };
  }

  if (parsed.gatewayId !== msg.gateway_id) {
    const reason = 'topic/payload gateway_id mismatch';
    await quarantine(topic, reason, msg);
    return { kind: parsed.kind, fresh: false, quarantined: true, reason };
  }
  if (parsed.rackId !== null && parsed.rackId !== msg.rack_id) {
    const reason = 'topic/payload rack_id mismatch';
    await quarantine(topic, reason, msg);
    return { kind: parsed.kind, fresh: false, quarantined: true, reason };
  }

  const binding = await bind(msg);
  const fresh = await claimMessage(msg, topic, sourceEvent);
  if (!fresh || binding.status === 'QUARANTINED') {
    return { kind: parsed.kind, fresh, bindingStatus: binding.status, bindingEvent: binding.event };
  }

  switch (parsed.kind) {
    case 'status':
      await handleStatus(msg);
      return { kind: parsed.kind, fresh, bindingStatus: binding.status, bindingEvent: binding.event };
    case 'inventory':
      await handleInventory(msg);
      return { kind: parsed.kind, fresh, bindingStatus: binding.status, bindingEvent: binding.event };
    case 'telemetry': {
      const stored = await handleTelemetry(msg);
      return { kind: parsed.kind, fresh, stored, bindingStatus: binding.status, bindingEvent: binding.event };
    }
    case 'alarm':
    case 'fault':
    case 'system':
      await handleEvent(msg, parsed.kind);
      return { kind: parsed.kind, fresh, bindingStatus: binding.status, bindingEvent: binding.event };
    default:
      return { kind: parsed.kind, fresh, bindingStatus: binding.status, bindingEvent: binding.event };
  }
}

// Last-will backstop: gateways silent past the threshold flip to OFFLINE even
// if the retained OFFLINE will was lost. The live-state read path also computes
// staleness, but this keeps persisted status useful for admin/database views.
export async function markStaleGateways(staleAfterS: number): Promise<void> {
  await ensureSchema();
  await query(
    `UPDATE gateways SET status = 'OFFLINE', updated_at = now()
     WHERE status = 'ONLINE' AND last_seen_at < now() - make_interval(secs => $1)`,
    [staleAfterS],
  );
}
