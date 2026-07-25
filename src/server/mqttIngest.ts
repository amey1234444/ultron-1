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

type BindResult = {
  status: string;
  event: string;
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

const CC_V3_SCHEMA = 'ultron.gateway.normalized_telemetry';

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

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integerValue(value: unknown): number | null {
  return Number.isInteger(value) ? value as number : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseIsoUs(value: unknown): string {
  const text = stringValue(value);
  const ms = text ? Date.parse(text) : NaN;
  return String((Number.isNaN(ms) ? Date.now() : ms) * 1000);
}

function hashUuid(input: string): string {
  const hex = createHash('sha256').update(input).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function rackIdFromRackNumber(value: unknown, fallback: number): number {
  const rackNumber = stringValue(value);
  if (!rackNumber) return fallback;
  const match = /(\d+)(?!.*\d)/.exec(rackNumber);
  return match ? Number(match[1]) : fallback;
}

function channelValue(channel: Record<string, unknown>): number | null {
  const formatted = finiteNumber(channel.value_formatted);
  if (formatted !== null) return formatted;
  const raw = finiteNumber(channel.value_raw);
  if (raw === null) return null;
  const decimals = integerValue(channel.decimal_places);
  return decimals && decimals > 0 ? raw / 10 ** decimals : raw;
}

function thresholdValue(channel: Record<string, unknown>, prefix: string): number | null {
  const formatted = finiteNumber(channel[`${prefix}_value_formatted`]);
  if (formatted !== null) return formatted;
  const raw = finiteNumber(channel[`${prefix}_value_raw`]);
  if (raw === null) return null;
  const decimals = integerValue(channel.decimal_places);
  return decimals && decimals > 0 ? raw / 10 ** decimals : raw;
}

function canonicalCardType(cardType: string): string {
  const key = cardType.trim().toLowerCase();
  if (key === 'vibration') return 'VIBRATION';
  if (key === 'speed') return 'SPEED';
  if (key === 'communication_controller') return 'COMMUNICATION_CONTROLLER';
  return 'PROCESS';
}

function measurementTypeFor(cardType: string, sensor: string, unit: string): string {
  const key = cardType.trim().toLowerCase();
  const sensorKey = sensor.trim().toLowerCase();
  const known: Record<string, string> = {
    vibration: 'VELOCITY_RMS',
    speed: 'SPEED',
    rtd: 'TEMPERATURE',
    thermocouple: 'TEMPERATURE',
    temperature: 'TEMPERATURE',
    pressure: 'PRESSURE',
    current: 'CURRENT',
    voltage: 'VOLTAGE',
    proximity: 'PROXIMITY_STATE',
    digital_input: 'DIGITAL_STATE',
    analog_input: 'ANALOG_INPUT',
  };
  return known[key] ?? known[sensorKey] ?? (key ? key.toUpperCase() : (unit || 'VALUE').toUpperCase());
}

function parseChannelSlotMap(): Map<number, [number, number]> {
  const map = new Map<number, [number, number]>();
  for (const part of (process.env.CHANNEL_SLOT_MAP ?? '').split(',')) {
    const [channel, target] = part.split('=');
    const [slot, subChannel] = (target ?? '').split('.');
    const channelNo = Number(channel?.trim());
    const slotNo = Number(slot?.trim());
    const subChannelNo = Number(subChannel?.trim() || '1');
    if (Number.isInteger(channelNo) && Number.isInteger(slotNo) && Number.isInteger(subChannelNo)) {
      map.set(channelNo, [slotNo, subChannelNo]);
    }
  }
  return map;
}

function slotForChannel(channelNumber: number): [number, number] {
  return parseChannelSlotMap().get(channelNumber) ?? [channelNumber, 1];
}

function firstIp(...values: unknown[]): string | null {
  for (const value of values) {
    const text = stringValue(value);
    if (text && IP_RE.test(text)) return text;
  }
  return null;
}

function normalizeCcV3SnapshotMessage(
  rawMessage: unknown,
  parsed: ParsedTopic,
  sourceEvent?: Record<string, unknown> | null,
): MqttEnvelope | null {
  if (parsed.kind !== 'telemetry' || parsed.rackId === null) return null;
  const raw = objectValue(rawMessage);
  if (!raw) return null;
  const channels = Array.isArray(raw.channels) ? raw.channels : null;
  if (!channels || !(raw.schema === CC_V3_SCHEMA || raw.rack_number !== undefined)) return null;

  const link = objectValue(raw.cc_gateway_communication) ?? {};
  const source = objectValue(raw.source) ?? {};
  const gatewayIp = firstIp(
    sourceEvent?.peerhost,
    raw.gateway_ip,
    source.ip,
    link.connected_client_ip,
    link.expected_cc_card_ip,
  );
  if (!gatewayIp) return null;

  const rackId = parsed.rackId ?? rackIdFromRackNumber(raw.rack_number, 1);
  const receivedAt = stringValue(raw.received_at) ?? stringValue(raw.snapshot_updated_at) ?? stringValue(link.last_message_at) ?? new Date().toISOString();
  const sourceTimestampUs = parseIsoUs(receivedAt);
  const daqSequence = integerValue(raw.daq_sequence);
  const messageSequence = integerValue(raw.message_sequence);
  const sourceSequence = daqSequence ?? messageSequence ?? 0;
  const daqValid = raw.daq_valid === 1 && String(raw.daq_state ?? 'valid') === 'valid';
  const age = finiteNumber(link.telemetry_age_seconds);
  const staleAfter = finiteNumber(link.stale_after_seconds) ?? 5;
  const telemetryFresh = raw.telemetry_available !== false && (age === null || age <= staleAfter);
  const snapshotHash = createHash('sha256').update(JSON.stringify(raw)).digest('hex');
  const deliveryId = stringValue(sourceEvent?.id) ?? stringValue(sourceEvent?.publish_received_at) ?? stringValue(sourceEvent?.timestamp) ?? String(Date.now());

  const records = channels.flatMap((item) => {
    const channel = objectValue(item);
    if (!channel) return [];
    const channelNumber = integerValue(channel.channel);
    if (!channelNumber) return [];
    const value = channelValue(channel);
    if (value === null) return [];

    const [slotId, channelId] = slotForChannel(channelNumber);
    const rawCardType = stringValue(channel.card_type) ?? '';
    const sensor = stringValue(channel.sensor) ?? '';
    const unit = stringValue(channel.unit) ?? '';
    const channelStatus = (stringValue(channel.channel_status) ?? 'ok').toLowerCase();
    const alertActive = channel.alert_status_code === 1 || String(channel.alert_status ?? '').toLowerCase() === 'active';
    const dangerActive = channel.danger_status_code === 1 || String(channel.danger_status ?? '').toLowerCase() === 'active';

    return [{
      slot_id: slotId,
      channel_id: channelId,
      point_id: slotId * 100_000 + channelId * 100 + 1,
      card_type: canonicalCardType(rawCardType),
      measurement_type: measurementTypeFor(rawCardType, sensor, unit),
      value,
      unit,
      quality: channelStatus && channelStatus !== 'ok' ? 'BAD' : daqValid ? 'GOOD' : 'UNCERTAIN',
      freshness: telemetryFresh ? 'FRESH' : 'STALE',
      source_timestamp_us: sourceTimestampUs,
      source_sequence: sourceSequence,
      sensor: sensor || undefined,
      channel_status: channelStatus || undefined,
      alert_threshold: thresholdValue(channel, 'alert') ?? undefined,
      danger_threshold: thresholdValue(channel, 'danger') ?? undefined,
      alert_state: alertActive ? 'ACTIVE' : 'INACTIVE',
      danger_state: dangerActive ? 'ACTIVE' : 'INACTIVE',
    }];
  });

  return {
    schema: 'ultron.measurement.batch',
    schema_version: '1.1',
    message_id: hashUuid(`cc-v3|${parsed.gatewayId}|${rackId}|${sourceSequence}|${sourceTimestampUs}|${snapshotHash}|${deliveryId}`),
    gateway_id: parsed.gatewayId,
    gateway_boot_id: hashUuid(`cc-v3-boot|${parsed.gatewayId}|${stringValue(objectValue(raw.connection)?.connected_at) ?? ''}`),
    gateway_ip: gatewayIp,
    rack_id: rackId,
    gateway_sequence: messageSequence ?? sourceSequence,
    created_at: new Date(Number(sourceTimestampUs) / 1000).toISOString(),
    replayed: raw.replayed === true,
    payload: {
      batch_sequence: messageSequence ?? sourceSequence,
      record_count: records.length,
      records,
      source_format: CC_V3_SCHEMA,
    },
  };
}

// Optional per-channel detail (sensor, thresholds, alarm state) reported by
// real controllers; absent from simulator batches.
function validateChannelDetail(record: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const key of ['alert_threshold', 'danger_threshold'] as const) {
    const value = record[key];
    if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
      errors.push(`record.${key} invalid`);
    }
  }
  for (const key of ['alert_state', 'danger_state'] as const) {
    const value = record[key];
    if (value !== undefined && value !== 'ACTIVE' && value !== 'INACTIVE') errors.push(`record.${key} invalid`);
  }
  if (record.freshness !== undefined && record.freshness !== 'FRESH' && record.freshness !== 'STALE') {
    errors.push('record.freshness invalid');
  }
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
          errors.push(...validateChannelDetail(record));
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

async function findStudioGateway(gatewayId: string): Promise<{ id: string; ip: string } | null> {
  const gateway = await query<{ id: string; ip: string }>(
    `SELECT id, ip
     FROM studio_devices
     WHERE type = 'Gateway'
       AND archived = false
       AND real_gateway_id = $1
     LIMIT 1`,
    [gatewayId],
  );
  return gateway.rows[0] ?? null;
}

async function findConfiguredIpConflict(
  gatewayDeviceId: string,
  gatewayIp: string,
): Promise<{ id: string; name: string; type: string; real_gateway_id: string | null; real_rack_id: number | null } | null> {
  const device = await query<{ id: string; name: string; type: string; real_gateway_id: string | null; real_rack_id: number | null }>(
    `SELECT id, name, type, real_gateway_id, real_rack_id
     FROM studio_devices
     WHERE archived = false
       AND type IN ('Gateway', 'Rack')
       AND ip = $1
       AND id <> $2
     ORDER BY CASE type WHEN 'Gateway' THEN 0 ELSE 1 END, name
     LIMIT 1`,
    [gatewayIp, gatewayDeviceId],
  );
  return device.rows[0] ?? null;
}

async function rejectConfiguredIpConflict(gatewayId: string, gatewayIp: string, gatewayDeviceId: string): Promise<BindResult> {
  await query(
    `INSERT INTO gateway_ip_history (gateway_id, ip_address, approved)
     VALUES ($1,$2,false)
     ON CONFLICT (gateway_id, ip_address) DO UPDATE SET last_seen_at = now()`,
    [gatewayId, gatewayIp],
  );
  await query(
    `UPDATE gateways
     SET status = 'QUARANTINED', updated_at = now()
     WHERE gateway_id = $1`,
    [gatewayId],
  );
  await query(`DELETE FROM measurement_latest WHERE gateway_id = $1`, [gatewayId]);
  await query(`DELETE FROM rack_inventory_slots WHERE gateway_id = $1`, [gatewayId]);
  await query(`DELETE FROM racks WHERE gateway_id = $1`, [gatewayId]);
  const cleared = await query(
    `UPDATE studio_devices
     SET ip = '', updated_at = now()
     WHERE id = $1
       AND ip = $2
       AND EXISTS (
         SELECT 1
         FROM studio_devices conflict
         WHERE conflict.archived = false
           AND conflict.type IN ('Gateway', 'Rack')
           AND conflict.ip = $2
           AND conflict.id <> $1
       )`,
    [gatewayDeviceId, gatewayIp],
  );
  if ((cleared.rowCount ?? 0) > 0) {
    await query(`UPDATE studio_meta SET hier_revision = hier_revision + 1, updated_at = now() WHERE id = 1`);
  }
  return {
    status: 'QUARANTINED',
    event: 'IP_CONFLICT',
    reason: 'gateway_ip already configured',
  };
}

async function rejectMissingConfiguredIp(gatewayId: string, gatewayIp: string): Promise<BindResult> {
  await query(
    `INSERT INTO gateway_ip_history (gateway_id, ip_address, approved)
     VALUES ($1,$2,false)
     ON CONFLICT (gateway_id, ip_address) DO UPDATE SET last_seen_at = now()`,
    [gatewayId, gatewayIp],
  );
  await query(
    `UPDATE gateways
     SET status = 'QUARANTINED', updated_at = now()
     WHERE gateway_id = $1`,
    [gatewayId],
  );
  await query(`DELETE FROM measurement_latest WHERE gateway_id = $1`, [gatewayId]);
  await query(`DELETE FROM rack_inventory_slots WHERE gateway_id = $1`, [gatewayId]);
  await query(`DELETE FROM racks WHERE gateway_id = $1`, [gatewayId]);
  return {
    status: 'QUARANTINED',
    event: 'IP_NOT_CONFIGURED',
    reason: 'gateway_ip not configured',
  };
}

async function updateStudioGatewayIp(deviceId: string, gatewayIp: string): Promise<void> {
  const updated = await query(
    `UPDATE studio_devices
     SET ip = $2, updated_at = now()
     WHERE id = $1 AND ip <> $2`,
    [deviceId, gatewayIp],
  );
  if ((updated.rowCount ?? 0) > 0) {
    await query(`UPDATE studio_meta SET hier_revision = hier_revision + 1, updated_at = now() WHERE id = 1`);
  }
}

async function bind(msg: MqttEnvelope): Promise<BindResult> {
  const existing = await query<{ gateway_id: string; current_ip: string; status: string }>(
    `SELECT gateway_id, current_ip, status FROM gateways WHERE gateway_id = $1`,
    [msg.gateway_id],
  );

  const studioGateway = await findStudioGateway(msg.gateway_id);
  let status = 'ONLINE';
  let event = 'BOUND';
  if (!studioGateway) {
    status = 'QUARANTINED';
    event = 'UNCLAIMED';
  }

  if (existing.rowCount === 0) {
    if (!studioGateway) {
      await query(
        `INSERT INTO gateway_ip_history (gateway_id, ip_address, approved)
         VALUES ($1,$2,false)
         ON CONFLICT (gateway_id, ip_address) DO UPDATE SET last_seen_at = now()`,
        [msg.gateway_id, msg.gateway_ip],
      );
      return { status, event };
    }

    if (!studioGateway.ip.trim()) return rejectMissingConfiguredIp(msg.gateway_id, msg.gateway_ip);

    const gatewayIpChanged = studioGateway.ip !== msg.gateway_ip;
    const ipConflict = await findConfiguredIpConflict(studioGateway.id, msg.gateway_ip);
    if (ipConflict) return rejectConfiguredIpConflict(msg.gateway_id, msg.gateway_ip, studioGateway.id);

    event = gatewayIpChanged ? 'IP_CHANGED' : 'BOUND';
    if (event === 'IP_CHANGED') await updateStudioGatewayIp(studioGateway.id, msg.gateway_ip);
    await query(
      `INSERT INTO gateways (gateway_id, current_ip, gateway_boot_id, mqtt_client_id, status, last_seen_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (gateway_id) DO UPDATE SET last_seen_at = now()`,
      [msg.gateway_id, msg.gateway_ip, msg.gateway_boot_id, `ultron-gw-${msg.gateway_id}`, status],
    );
  } else {
    const current = existing.rows[0];
    if (!studioGateway) {
      await query(
        `INSERT INTO gateway_ip_history (gateway_id, ip_address, approved)
         VALUES ($1,$2,false)
         ON CONFLICT (gateway_id, ip_address) DO UPDATE SET last_seen_at = now()`,
        [msg.gateway_id, msg.gateway_ip],
      );
      return { status, event };
    }

    if (!studioGateway.ip.trim()) return rejectMissingConfiguredIp(msg.gateway_id, msg.gateway_ip);

    const gatewayIpChanged = studioGateway.ip !== msg.gateway_ip;
    const ipConflict = await findConfiguredIpConflict(studioGateway.id, msg.gateway_ip);
    if (ipConflict) return rejectConfiguredIpConflict(msg.gateway_id, msg.gateway_ip, studioGateway.id);

    if (current.status === 'QUARANTINED') {
      status = 'ONLINE';
      event = gatewayIpChanged ? 'IP_CHANGED' : 'COMMISSIONED';
    } else {
      status = 'ONLINE';
      event = current.current_ip && current.current_ip !== msg.gateway_ip ? 'IP_CHANGED' : 'BOUND';
    }
    if (gatewayIpChanged) await updateStudioGatewayIp(studioGateway.id, msg.gateway_ip);
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
    [msg.gateway_id, msg.gateway_ip, true],
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

// Value columns shared by measurement_history and measurement_latest. The
// trailing fields are the per-channel detail a real controller reports next to
// the value (sensor, card type, thresholds, alarm state); the simulator omits
// them and they stay null.
const MEASUREMENT_COLUMNS =
  'gateway_id, rack_id, slot_id, channel_id, measurement_type, value, unit, quality, source_sequence, source_timestamp_us,' +
  ' card_type, sensor, freshness, channel_status, alert_threshold, danger_threshold, alert_state, danger_state';
const MEASUREMENT_COLUMN_COUNT = 18;

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function alarmState(value: unknown): string {
  return value === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
}

function measurementParams(msg: MqttEnvelope, r: Record<string, unknown>): unknown[] {
  return [
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
    text(r.card_type),
    text(r.sensor),
    r.freshness === 'STALE' ? 'STALE' : 'FRESH',
    text(r.channel_status),
    numeric(r.alert_threshold),
    numeric(r.danger_threshold),
    alarmState(r.alert_state),
    alarmState(r.danger_state),
  ];
}

async function handleTelemetry(msg: MqttEnvelope): Promise<number> {
  const records = Array.isArray(msg.payload.records) ? msg.payload.records : [];
  if (records.length === 0) return 0;

  const params: unknown[] = [];
  const values = records.map((item, index) => {
    params.push(...measurementParams(msg, item as Record<string, unknown>));
    const start = index * MEASUREMENT_COLUMN_COUNT;
    const placeholders = Array.from({ length: MEASUREMENT_COLUMN_COUNT }, (_, offset) => `$${start + offset + 1}`);
    return `(${placeholders.join(',')})`;
  });

  const hist = await query(
    `INSERT INTO measurement_history
       (${MEASUREMENT_COLUMNS})
     VALUES ${values.join(',')}
     ON CONFLICT (gateway_id, rack_id, slot_id, channel_id, measurement_type, source_sequence, source_timestamp_us) DO NOTHING`,
    params,
  );

  await query(
    `INSERT INTO measurement_latest
       (${MEASUREMENT_COLUMNS}, updated_at)
     VALUES ${values.map((value) => `${value.slice(0, -1)}, now())`).join(',')}
     ON CONFLICT (gateway_id, rack_id, slot_id, channel_id, measurement_type) DO UPDATE SET
       value = EXCLUDED.value,
       unit = EXCLUDED.unit,
       quality = EXCLUDED.quality,
       source_sequence = EXCLUDED.source_sequence,
       source_timestamp_us = EXCLUDED.source_timestamp_us,
       card_type = EXCLUDED.card_type,
       sensor = EXCLUDED.sensor,
       freshness = EXCLUDED.freshness,
       channel_status = EXCLUDED.channel_status,
       alert_threshold = EXCLUDED.alert_threshold,
       danger_threshold = EXCLUDED.danger_threshold,
       alert_state = EXCLUDED.alert_state,
       danger_state = EXCLUDED.danger_state,
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

  const normalizedRawMessage = normalizeCcV3SnapshotMessage(rawMessage, parsed, sourceEvent);
  const messageForIngest = normalizedRawMessage ?? rawMessage;
  const sourceForClaim = normalizedRawMessage
    ? { ...(sourceEvent ?? {}), raw_payload_format: CC_V3_SCHEMA, raw_payload: rawMessage }
    : sourceEvent;

  const envelopeErrors = validateEnvelope(messageForIngest);
  if (envelopeErrors.length > 0) {
    const reason = `envelope: ${envelopeErrors.join('; ')}`;
    await quarantine(topic, reason, messageForIngest as Partial<MqttEnvelope>);
    return { kind: parsed.kind, fresh: false, quarantined: true, reason };
  }

  const msg = messageForIngest as MqttEnvelope;
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
  const fresh = await claimMessage(msg, topic, sourceForClaim);
  if (!fresh || binding.status === 'QUARANTINED') {
    if (fresh && binding.status === 'QUARANTINED') {
      await quarantine(topic, binding.reason ?? 'gateway not commissioned', msg);
    }
    return { kind: parsed.kind, fresh, bindingStatus: binding.status, bindingEvent: binding.event, reason: binding.reason };
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
