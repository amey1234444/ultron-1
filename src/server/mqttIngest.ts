import { createHash } from 'crypto';

import { ensureSchema, query } from './db';

type TopicKind = 'status' | 'topology' | 'rack_health' | 'inventory' | 'telemetry' | 'alarm' | 'command_response' | 'command_request';
type ParsedTopic = { gatewayId: string; rackId: string | null; kind: TopicKind };
type MqttEnvelope = {
  schema: string;
  schema_version: string;
  message_id: string;
  gateway_id: string;
  gateway_boot_id: string;
  gateway_ip: string;
  rack_id?: string;
  gateway_sequence: number;
  created_at: string;
  created_at_us: string;
  replayed: false;
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

const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCHEMA_FOR_KIND: Partial<Record<TopicKind, string>> = {
  status: 'ultron.gateway.status',
  topology: 'ultron.gateway.topology',
  rack_health: 'ultron.rack.health',
  inventory: 'ultron.rack.inventory',
  telemetry: 'ultron.rack.telemetry',
  alarm: 'ultron.event.alarm',
  command_response: 'ultron.command.response',
};

function decodeSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function parseTopic(topic: string): ParsedTopic | null {
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

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16)}`;
}

function studioCardType(slot: Record<string, unknown>): 'Vibration Card' | 'Process Card' | 'Speed Card' | 'Communication Controller' {
  const normalized = [slot.card_type, slot.sensor, slot.unit, slot.value_with_unit]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
  if (normalized.includes('vibration')) return 'Vibration Card';
  if (normalized.includes('speed')) return 'Speed Card';
  if (normalized.includes('rpm')) return 'Speed Card';
  if (normalized.includes('communication')) return 'Communication Controller';
  if (normalized.includes('controller')) return 'Communication Controller';
  return 'Process Card';
}

function studioCardConfig(type: ReturnType<typeof studioCardType>, slot: Record<string, unknown>): Record<string, unknown> {
  const unit = stringValue(slot.unit) ?? '';
  const sensor = stringValue(slot.sensor) ?? '';
  const label = sensor || stringValue(slot.card_type) || `Slot ${slot.slot_number}`;
  const warning = stringValue(slot.alert_value_formatted) ?? '';
  const critical = stringValue(slot.danger_value_formatted) ?? '';
  if (type === 'Vibration Card') {
    return {
      channelNames: [label, ''],
      sensorType: sensor,
      sensitivity: '',
      engineeringUnit: unit || 'mm/s',
      measurementRangeMin: '',
      measurementRangeMax: '',
      samplingRate: '',
      alarmWarning: warning,
      alarmCritical: critical,
    };
  }
  if (type === 'Speed Card') {
    return {
      channelNames: [label, ''],
      inputType: 'RPM',
      pulsesPerRevolution: '',
      trigger: '',
      hysteresis: '',
      minSpeed: '',
      maxSpeed: '',
      alarmWarning: warning,
      alarmCritical: critical,
    };
  }
  if (type === 'Communication Controller') {
    return { controllerName: label, ip: '', port: '', firmware: '', role: 'Primary', partnerController: '' };
  }
  return {
    channelNames: [label, '', '', ''],
    inputType: sensor.toLowerCase().includes('rtd') ? 'RTD 3-wire' : sensor.toLowerCase().includes('thermocouple') ? 'Thermocouple' : '4-20 mA',
    engineeringMin: '',
    engineeringMax: '',
    unit,
    scaling: '',
    offset: '',
    filter: '',
    alarmWarning: warning,
    alarmCritical: critical,
  };
}

const CONTROLLER_SLOT = 13;
const CONTROLLER_SLOT_PAYLOAD: Record<string, unknown> = {
  slot_number: CONTROLLER_SLOT,
  card_type: 'Communication Controller',
  sensor: 'Rack Communication',
  unit: '',
};

function intValue(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

function createdAtUs(msg: MqttEnvelope): string {
  return /^\d+$/.test(msg.created_at_us) ? msg.created_at_us : '0';
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function json(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function validateEnvelope(msg: unknown): string[] {
  const errors: string[] = [];
  const m = objectValue(msg);
  if (!m) return ['message is not a JSON object'];
  if (typeof m.schema !== 'string' || !m.schema.startsWith('ultron.')) errors.push('schema missing/invalid');
  if (m.schema_version !== '2.0') errors.push('schema_version must be "2.0"');
  if (typeof m.message_id !== 'string' || !UUID_RE.test(m.message_id)) errors.push('message_id must be a UUID');
  if (typeof m.gateway_id !== 'string' || !m.gateway_id) errors.push('gateway_id missing');
  if (typeof m.gateway_boot_id !== 'string' || !m.gateway_boot_id) errors.push('gateway_boot_id missing');
  if (typeof m.gateway_ip !== 'string' || !IP_RE.test(m.gateway_ip)) errors.push('gateway_ip missing/invalid');
  if (m.rack_id !== undefined && (typeof m.rack_id !== 'string' || !m.rack_id)) errors.push('rack_id must be a non-empty string');
  if (!Number.isInteger(m.gateway_sequence)) errors.push('gateway_sequence must be an integer');
  if (typeof m.created_at !== 'string' || Number.isNaN(Date.parse(m.created_at))) errors.push('created_at invalid');
  if (typeof m.created_at_us !== 'string' || !/^\d+$/.test(m.created_at_us)) errors.push('created_at_us must be a decimal string');
  if (m.replayed !== false) errors.push('replayed must be false');
  if (!objectValue(m.payload)) errors.push('payload missing');
  return errors;
}

function validatePayload(schema: string, payload: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (schema === 'ultron.gateway.status' && !['ONLINE', 'OFFLINE'].includes(String(payload.state))) errors.push('status.state invalid');
  if (schema === 'ultron.gateway.topology') {
    const racks = Array.isArray(payload.racks) ? payload.racks : null;
    if (!racks) errors.push('topology.racks must be an array');
    else for (const rack of racks) if (!stringValue(objectValue(rack)?.rack_id)) errors.push('topology.rack_id invalid');
  }
  if (schema === 'ultron.rack.health') {
    if (!stringValue(payload.rack_id)) errors.push('health.rack_id invalid');
    if (!stringValue(payload.status)) errors.push('health.status invalid');
    if (typeof payload.data_current !== 'boolean') errors.push('health.data_current invalid');
  }
  if (schema === 'ultron.rack.inventory') {
    if (!Number.isInteger(payload.snapshot_revision)) errors.push('inventory.snapshot_revision invalid');
    if (!Number.isInteger(payload.slot_count)) errors.push('inventory.slot_count invalid');
    const slots = Array.isArray(payload.slots) ? payload.slots : null;
    if (!slots) errors.push('inventory.slots must be an array');
    else for (const slot of slots) if (!Number.isInteger(objectValue(slot)?.slot_number)) errors.push('inventory.slot_number invalid');
  }
  if (schema === 'ultron.rack.telemetry') {
    if (!stringValue(payload.rack_id)) errors.push('telemetry.rack_id invalid');
    if (!Number.isInteger(payload.slot_count)) errors.push('telemetry.slot_count invalid');
    const slots = Array.isArray(payload.slots) ? payload.slots : null;
    if (!slots) errors.push('telemetry.slots must be an array');
    else for (const slot of slots) if (!Number.isInteger(objectValue(slot)?.slot_number)) errors.push('telemetry.slot_number invalid');
  }
  if (schema === 'ultron.event.alarm') {
    if (!['WARNING', 'CRITICAL'].includes(String(payload.severity))) errors.push('alarm.severity invalid');
    if (!['ACTIVE', 'CLEARED'].includes(String(payload.state))) errors.push('alarm.state invalid');
  }
  return errors;
}

async function bumpMetric(metricName: string, by = 1): Promise<void> {
  await query(
    `INSERT INTO mqtt_ingest_metrics (metric_name, metric_value)
     VALUES ($1,$2)
     ON CONFLICT (metric_name) DO UPDATE SET
       metric_value = mqtt_ingest_metrics.metric_value + EXCLUDED.metric_value,
       updated_at = now()`,
    [metricName, by],
  );
}

async function quarantine(topic: string, reason: string, msg: Partial<MqttEnvelope> | null): Promise<void> {
  await bumpMetric('quarantine_messages');
  await query(
    `INSERT INTO mqtt_quarantine (topic, reason, gateway_id, gateway_ip, rack_id, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [topic, reason, msg?.gateway_id ?? null, msg?.gateway_ip ?? null, typeof msg?.rack_id === 'string' ? msg.rack_id : null, msg ? JSON.stringify(msg) : null],
  );
}

async function bind(msg: MqttEnvelope): Promise<{ status: string; event: string }> {
  await query(
    `INSERT INTO gateways (gateway_id, current_ip, gateway_boot_id, mqtt_client_id, status, mqtt_state, last_seen_at)
     VALUES ($1,$2,$3,$4,'UNKNOWN','UNKNOWN', now())
     ON CONFLICT (gateway_id) DO UPDATE SET
       current_ip = EXCLUDED.current_ip,
       gateway_boot_id = EXCLUDED.gateway_boot_id,
       last_seen_at = now(),
       updated_at = now()`,
    [msg.gateway_id, msg.gateway_ip, msg.gateway_boot_id, process.env.MQTT_BACKEND_CLIENT_ID ?? 'ultron-backend-webhook'],
  );
  if (msg.rack_id) await ensureRack(msg);
  return { status: 'ONLINE', event: 'BOUND' };
}

async function ensureRack(msg: MqttEnvelope): Promise<void> {
  if (!msg.rack_id) return;
  await query(
    `INSERT INTO racks (
       gateway_id, rack_id, last_gateway_boot_id, last_gateway_sequence,
       last_source_created_at, last_source_created_at_us, active, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,true,now())
     ON CONFLICT (gateway_id, rack_id) DO UPDATE SET
       active = true,
       updated_at = now()`,
    [msg.gateway_id, msg.rack_id, msg.gateway_boot_id, msg.gateway_sequence, dateValue(msg.created_at), createdAtUs(msg)],
  );
}

async function ensureStudioRackAndSlots(msg: MqttEnvelope, slots: Record<string, unknown>[] = []): Promise<void> {
  if (!msg.rack_id) return;
  const gateway = await query<{ id: string; project_id: string | null }>(
    `SELECT id, project_id
     FROM studio_devices
     WHERE type = 'Gateway'
       AND archived = false
       AND real_gateway_id = $1
     ORDER BY sort_order, name
     LIMIT 1`,
    [msg.gateway_id],
  );
  const gatewayDevice = gateway.rows[0];
  if (!gatewayDevice) return;

  const connection = objectValue(msg.payload.connection) ?? {};
  const currentIp = stringValue(connection.current_ip ?? msg.payload.current_ip) ?? '';
  const rack = await query<{ id: string }>(
    `SELECT id
     FROM studio_devices
     WHERE type = 'Rack'
       AND archived = false
       AND gateway_id = $4
       AND (
         (real_gateway_id = $1 AND real_rack_id = $2)
         OR ($3 <> '' AND ip = $3)
       )
     ORDER BY
       CASE WHEN real_gateway_id = $1 AND real_rack_id = $2 THEN 0 ELSE 1 END,
       sort_order,
       name
     LIMIT 1`,
    [msg.gateway_id, msg.rack_id, currentIp, gatewayDevice.id],
  );
  let deviceId = rack.rows[0]?.id;
  let rackChanged = 0;
  if (deviceId) {
    const updated = await query(
      `UPDATE studio_devices
       SET real_gateway_id = $1,
           real_rack_id = $2,
           gateway_id = $3,
           project_id = COALESCE(project_id, $4),
           ip = CASE WHEN $5 <> '' THEN $5 ELSE ip END,
           updated_at = now()
       WHERE id = $6
         AND (
           real_gateway_id IS DISTINCT FROM $1
           OR real_rack_id IS DISTINCT FROM $2
           OR gateway_id IS DISTINCT FROM $3
           OR ($5 <> '' AND ip IS DISTINCT FROM $5)
         )`,
      [msg.gateway_id, msg.rack_id, gatewayDevice.id, gatewayDevice.project_id, currentIp, deviceId],
    );
    rackChanged = updated.rowCount ?? 0;
  } else {
    const rackDeviceId = stableId('auto-rack', msg.gateway_id, msg.rack_id);
    const inserted = await query(
      `INSERT INTO studio_devices (
         id, name, type, model, ip, port, protocol, description, status,
         project_id, gateway_id, real_gateway_id, real_rack_id, archived, sort_order
       )
       VALUES ($1,$2,'Rack','RACK-12-R',$3,'','Modbus TCP',$4,'Not Connected',
              $5,$6,$7,$8,false,
              COALESCE((SELECT max(sort_order) + 1 FROM studio_devices), 0))`,
      [
        rackDeviceId,
        msg.rack_id,
        currentIp,
        'Auto-discovered from Ultron MQTT live state',
        gatewayDevice.project_id,
        gatewayDevice.id,
        msg.gateway_id,
        msg.rack_id,
      ],
    );
    deviceId = rackDeviceId;
    rackChanged = inserted.rowCount ?? 0;
  }
  if (!deviceId) return;

  let cardsChanged = 0;
  const studioSlots = [...slots];
  if (!studioSlots.some((slot) => Number(slot.slot_number) === CONTROLLER_SLOT)) {
    studioSlots.push(CONTROLLER_SLOT_PAYLOAD);
  }
  for (const slot of studioSlots) {
    if (!Number.isInteger(slot.slot_number) || Number(slot.slot_number) < 1) continue;
    const type = studioCardType(slot);
    const card = await query(
      `INSERT INTO studio_cards (id, device_id, slot, type, enabled, config, sort_order)
       VALUES ($1,$2,$3,$4,true,$5::jsonb,
              COALESCE((SELECT max(sort_order) + 1 FROM studio_cards WHERE device_id = $2), 0))
       ON CONFLICT (device_id, slot) DO UPDATE SET
         type = EXCLUDED.type,
         enabled = true,
         config = EXCLUDED.config,
         updated_at = now()
       WHERE studio_cards.type IS DISTINCT FROM EXCLUDED.type
          OR studio_cards.enabled IS DISTINCT FROM true
          OR studio_cards.config IS DISTINCT FROM EXCLUDED.config`,
      [
        stableId('auto-card', msg.gateway_id, msg.rack_id, String(slot.slot_number)),
        deviceId,
        slot.slot_number,
        type,
        JSON.stringify(studioCardConfig(type, slot)),
      ],
    );
    cardsChanged += card.rowCount ?? 0;
  }

  if (rackChanged > 0 || cardsChanged > 0) {
    await query(`UPDATE studio_meta SET hier_revision = hier_revision + 1, updated_at = now() WHERE id = 1`);
  }
}

async function upsertControllerSlot(msg: MqttEnvelope, online: boolean): Promise<void> {
  if (!msg.rack_id) return;
  await query(
    `INSERT INTO rack_inventory_slots (
       gateway_id, rack_id, slot_number, presence, online_state, card_type,
       snapshot_revision, card_type_code, sensor_code, sensor, unit_code, unit,
       decimal_places, slot_payload, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,'Communication Controller',$6,NULL,NULL,'Rack Communication',NULL,'',NULL,$7,now())
     ON CONFLICT (gateway_id, rack_id, slot_number) DO UPDATE SET
       presence = EXCLUDED.presence,
       online_state = EXCLUDED.online_state,
       card_type = EXCLUDED.card_type,
       sensor = EXCLUDED.sensor,
       unit = EXCLUDED.unit,
       slot_payload = rack_inventory_slots.slot_payload || EXCLUDED.slot_payload,
       updated_at = now()`,
    [
      msg.gateway_id,
      msg.rack_id,
      CONTROLLER_SLOT,
      online ? 'PRESENT' : 'ABSENT',
      online ? 'ONLINE' : 'OFFLINE',
      msg.gateway_sequence,
      json({ ...CONTROLLER_SLOT_PAYLOAD, online }),
    ],
  );
}

async function refreshGatewayRackState(gatewayId: string): Promise<void> {
  await query(
    `UPDATE gateways g
     SET connected_racks = counts.connected_racks,
         stale_racks = counts.stale_racks,
         disconnected_racks = counts.disconnected_racks,
         status = CASE WHEN counts.connected_racks > 0 THEN 'ONLINE' ELSE 'OFFLINE' END,
         mqtt_state = CASE WHEN counts.connected_racks > 0 THEN 'CONNECTED' ELSE 'DISCONNECTED' END,
         updated_at = now()
     FROM (
       SELECT
         count(*) FILTER (WHERE active = true AND status = 'connected' AND data_current = true)::int AS connected_racks,
         count(*) FILTER (WHERE active = true AND status = 'connected' AND data_current = false)::int AS stale_racks,
         count(*) FILTER (WHERE active = false OR status <> 'connected')::int AS disconnected_racks
       FROM racks
       WHERE gateway_id = $1
     ) counts
     WHERE g.gateway_id = $1`,
    [gatewayId],
  );
}

async function claimMessage(msg: MqttEnvelope, topic: string, sourceEvent?: Record<string, unknown> | null): Promise<boolean> {
  const hash = createHash('sha256').update(JSON.stringify(msg.payload ?? {})).digest('hex');
  const res = await query(
    `INSERT INTO mqtt_messages (message_id, topic, schema, schema_version, gateway_id, gateway_ip, rack_id, payload_hash, source_event)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (message_id) DO NOTHING`,
    [msg.message_id, topic, msg.schema, msg.schema_version, msg.gateway_id, msg.gateway_ip, msg.rack_id ?? null, hash, sourceEvent ? JSON.stringify(sourceEvent) : null],
  );
  if ((res.rowCount ?? 0) === 0) await bumpMetric('qos_duplicates');
  return res.rowCount === 1;
}

async function gatewayAllows(msg: MqttEnvelope, force = false): Promise<boolean> {
  if (force) return true;
  const res = await query<{ gateway_boot_id: string; last_gateway_sequence: string; last_source_created_at_us: string | null }>(
    `SELECT gateway_boot_id, last_gateway_sequence, last_source_created_at_us FROM gateways WHERE gateway_id = $1`,
    [msg.gateway_id],
  );
  const row = res.rows[0];
  if (!row || (row.gateway_boot_id && row.gateway_boot_id !== msg.gateway_boot_id)) return true;
  const incoming = BigInt(createdAtUs(msg));
  const stored = BigInt(String(row.last_source_created_at_us ?? -1));
  return incoming > stored || (incoming === stored && msg.gateway_sequence >= Number(row.last_gateway_sequence ?? -1));
}

async function rackAllows(msg: MqttEnvelope): Promise<boolean> {
  const res = await query<{ last_gateway_boot_id: string; last_gateway_sequence: string; last_source_created_at_us: string | null }>(
    `SELECT last_gateway_boot_id, last_gateway_sequence, last_source_created_at_us FROM racks WHERE gateway_id = $1 AND rack_id = $2`,
    [msg.gateway_id, msg.rack_id],
  );
  const row = res.rows[0];
  if (!row || (row.last_gateway_boot_id && row.last_gateway_boot_id !== msg.gateway_boot_id)) return true;
  const incoming = BigInt(createdAtUs(msg));
  const stored = BigInt(String(row.last_source_created_at_us ?? -1));
  return incoming > stored || (incoming === stored && msg.gateway_sequence >= Number(row.last_gateway_sequence ?? -1));
}

async function upsertRack(msg: MqttEnvelope, patch: { status?: string; dataCurrent?: boolean } = {}): Promise<void> {
  if (!msg.rack_id) return;
  const payload = msg.payload;
  const connection = objectValue(payload.connection) ?? {};
  const telemetry = objectValue(payload.telemetry) ?? {};
  await query(
    `INSERT INTO racks (
       gateway_id, rack_id, status, data_current, current_ip, last_known_ip,
       connection_reason, connection_payload, telemetry_payload, health_payload,
       last_seen_at, last_message_at, last_gateway_sequence, last_gateway_boot_id,
       last_source_created_at, last_source_created_at_us, active, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,now())
     ON CONFLICT (gateway_id, rack_id) DO UPDATE SET
       status = EXCLUDED.status,
       data_current = EXCLUDED.data_current,
       current_ip = EXCLUDED.current_ip,
       last_known_ip = EXCLUDED.last_known_ip,
       connection_reason = EXCLUDED.connection_reason,
       connection_payload = EXCLUDED.connection_payload,
       telemetry_payload = EXCLUDED.telemetry_payload,
       health_payload = EXCLUDED.health_payload,
       last_seen_at = EXCLUDED.last_seen_at,
       last_message_at = EXCLUDED.last_message_at,
       last_gateway_sequence = EXCLUDED.last_gateway_sequence,
       last_gateway_boot_id = EXCLUDED.last_gateway_boot_id,
       last_source_created_at = EXCLUDED.last_source_created_at,
       last_source_created_at_us = EXCLUDED.last_source_created_at_us,
       active = true,
       updated_at = now()`,
    [
      msg.gateway_id,
      msg.rack_id,
      patch.status ?? stringValue(payload.status) ?? stringValue(connection.status) ?? 'unknown',
      patch.dataCurrent ?? (payload.data_current === true || telemetry.data_current === true),
      stringValue(connection.current_ip ?? payload.current_ip),
      stringValue(connection.last_known_ip ?? payload.last_known_ip),
      stringValue(connection.status_reason ?? payload.status_reason),
      json(connection),
      json(telemetry),
      json(payload),
      dateValue(connection.last_seen_at ?? telemetry.last_received_at ?? payload.received_at),
      dateValue(connection.last_message_at ?? telemetry.last_received_at ?? payload.received_at),
      msg.gateway_sequence,
      msg.gateway_boot_id,
      dateValue(msg.created_at),
      createdAtUs(msg),
    ],
  );
}

async function handleStatus(msg: MqttEnvelope): Promise<void> {
  if (!(await gatewayAllows(msg, msg.payload.state === 'OFFLINE'))) return;
  const summary = objectValue(msg.payload.rack_summary) ?? {};
  await query(
    `UPDATE gateways SET status = $2, mqtt_state = $3, last_seen_at = now(),
       last_gateway_sequence = $4, last_source_created_at = $5, last_source_created_at_us = $6,
       status_payload = $7, known_racks = COALESCE($8, known_racks),
       connected_racks = COALESCE($9, connected_racks), stale_racks = COALESCE($10, stale_racks),
       disconnected_racks = COALESCE($11, disconnected_racks), blocked_racks = COALESCE($12, blocked_racks),
       unidentified_connections = COALESCE($13, unidentified_connections),
       active_tcp_connections = COALESCE($14, active_tcp_connections), updated_at = now()
     WHERE gateway_id = $1`,
    [
      msg.gateway_id,
      msg.payload.state,
      msg.payload.mqtt_state ?? (msg.payload.state === 'ONLINE' ? 'CONNECTED' : 'DISCONNECTED'),
      msg.gateway_sequence,
      dateValue(msg.created_at),
      createdAtUs(msg),
      json(msg.payload),
      intValue(summary.known_racks),
      intValue(summary.connected_racks),
      intValue(summary.stale_racks),
      intValue(summary.disconnected_racks),
      intValue(summary.blocked_racks),
      intValue(summary.unidentified_connections),
      intValue(summary.active_tcp_connections),
    ],
  );
}

async function handleTopology(msg: MqttEnvelope): Promise<void> {
  if (!(await gatewayAllows(msg))) return;
  const racks = Array.isArray(msg.payload.racks) ? msg.payload.racks.map(objectValue).filter(Boolean) as Record<string, unknown>[] : [];
  await query(
    `UPDATE gateways SET topology_payload = $2, known_racks = COALESCE($3, known_racks),
       connected_racks = COALESCE($4, connected_racks), stale_racks = COALESCE($5, stale_racks),
       disconnected_racks = COALESCE($6, disconnected_racks), blocked_racks = COALESCE($7, blocked_racks),
       unidentified_connections = COALESCE($8, unidentified_connections),
       active_tcp_connections = COALESCE($9, active_tcp_connections),
       last_gateway_sequence = $10, last_source_created_at = $11, last_source_created_at_us = $12, updated_at = now()
     WHERE gateway_id = $1`,
    [
      msg.gateway_id,
      json(msg.payload),
      intValue(msg.payload.known_racks),
      intValue(msg.payload.connected_racks),
      intValue(msg.payload.stale_racks),
      intValue(msg.payload.disconnected_racks),
      intValue(msg.payload.blocked_racks),
      intValue(msg.payload.unidentified_connections),
      intValue(msg.payload.active_tcp_connections),
      msg.gateway_sequence,
      dateValue(msg.created_at),
      createdAtUs(msg),
    ],
  );
  const activeRackIds: string[] = [];
  for (const rack of racks) {
    const rackId = stringValue(rack.rack_id);
    if (!rackId) continue;
    const rackMsg = { ...msg, rack_id: rackId, payload: rack };
    await upsertRack(rackMsg, { status: stringValue(rack.status) ?? 'unknown', dataCurrent: rack.data_current === true });
    await ensureStudioRackAndSlots(rackMsg);
    await upsertControllerSlot(rackMsg, rack.status === 'connected' && rack.data_current === true);
    activeRackIds.push(rackId);
  }
  await query(`UPDATE racks SET active = false, updated_at = now() WHERE gateway_id = $1 AND NOT (rack_id = ANY($2::text[]))`, [msg.gateway_id, activeRackIds]);
  await query(
    `UPDATE rack_inventory_slots SET presence = 'ABSENT', online_state = 'OFFLINE', updated_at = now()
     WHERE gateway_id = $1 AND slot_number = $2 AND NOT (rack_id = ANY($3::text[]))`,
    [msg.gateway_id, CONTROLLER_SLOT, activeRackIds],
  );
  await refreshGatewayRackState(msg.gateway_id);
}

async function handleRackHealth(msg: MqttEnvelope): Promise<void> {
  if (!(await rackAllows(msg))) return;
  await upsertRack(msg);
  await ensureStudioRackAndSlots(msg);
  await upsertControllerSlot(msg, msg.payload.data_current === true);
  if (msg.payload.data_current !== true) {
    await query(`UPDATE rack_slot_latest SET live = false, measurement_valid = false, updated_at = now() WHERE gateway_id = $1 AND rack_id = $2`, [msg.gateway_id, msg.rack_id]);
  }
  await refreshGatewayRackState(msg.gateway_id);
}

async function handleInventory(msg: MqttEnvelope): Promise<void> {
  await ensureRack(msg);
  const revision = Number(msg.payload.snapshot_revision);
  const slots = Array.isArray(msg.payload.slots) ? msg.payload.slots.map(objectValue).filter(Boolean) as Record<string, unknown>[] : [];
  await ensureStudioRackAndSlots(msg, slots);
  for (const slot of slots) {
    await query(
      `INSERT INTO rack_inventory_slots (
         gateway_id, rack_id, slot_number, presence, online_state, card_type,
         snapshot_revision, card_type_code, sensor_code, sensor, unit_code, unit,
         decimal_places, slot_payload, updated_at
       )
       VALUES ($1,$2,$3,'PRESENT','UNKNOWN',$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
       ON CONFLICT (gateway_id, rack_id, slot_number) DO UPDATE SET
         card_type = EXCLUDED.card_type, snapshot_revision = EXCLUDED.snapshot_revision,
         card_type_code = EXCLUDED.card_type_code, sensor_code = EXCLUDED.sensor_code,
         sensor = EXCLUDED.sensor, unit_code = EXCLUDED.unit_code, unit = EXCLUDED.unit,
         decimal_places = EXCLUDED.decimal_places, slot_payload = EXCLUDED.slot_payload, updated_at = now()
       WHERE rack_inventory_slots.snapshot_revision <= EXCLUDED.snapshot_revision`,
      [
        msg.gateway_id,
        msg.rack_id,
        slot.slot_number,
        stringValue(slot.card_type),
        revision,
        intValue(slot.card_type_code),
        intValue(slot.sensor_code),
        stringValue(slot.sensor),
        intValue(slot.unit_code),
        stringValue(slot.unit),
        intValue(slot.decimal_places),
        json(slot),
      ],
    );
  }
  await query(`DELETE FROM rack_inventory_slots WHERE gateway_id = $1 AND rack_id = $2 AND snapshot_revision < $3`, [msg.gateway_id, msg.rack_id, revision]);
}

function slotParams(msg: MqttEnvelope, slot: Record<string, unknown>): unknown[] {
  const display = String(slot.value_display ?? slot.value_formatted ?? '').trim().toLowerCase();
  const measurementValid = slot.measurement_valid === true && String(slot.channel_status ?? 'ok').toLowerCase() === 'ok' && !['', 'invalid', 'nan', 'null', 'none'].includes(display);
  const decimal = (value: unknown) => value === null || value === undefined ? null : String(value);
  return [
    msg.gateway_id, msg.rack_id, slot.slot_number, stringValue(slot.data_status), intValue(slot.channel_status_code), stringValue(slot.channel_status),
    intValue(slot.card_type_code), stringValue(slot.card_type), intValue(slot.sensor_code), stringValue(slot.sensor), intValue(slot.unit_code), stringValue(slot.unit),
    intValue(slot.decimal_places), decimal(slot.value_raw), decimal(slot.value_formatted), stringValue(slot.value_with_unit), measurementValid, stringValue(slot.value_display),
    decimal(slot.alert_value_raw), decimal(slot.alert_value_formatted), stringValue(slot.alert_with_unit), decimal(slot.danger_value_raw), decimal(slot.danger_value_formatted),
    stringValue(slot.danger_with_unit), intValue(slot.alert_status_code), stringValue(slot.alert_status), intValue(slot.danger_status_code), stringValue(slot.danger_status),
    createdAtUs(msg), msg.gateway_sequence, msg.gateway_boot_id, json(slot), objectValue(msg.payload.telemetry)?.data_current === true && measurementValid,
  ];
}

async function handleTelemetry(msg: MqttEnvelope): Promise<number> {
  if (!(await rackAllows(msg))) return 0;
  await upsertRack(msg, { status: 'connected', dataCurrent: objectValue(msg.payload.telemetry)?.data_current === true });
  const slots = Array.isArray(msg.payload.slots) ? msg.payload.slots.map(objectValue).filter(Boolean) as Record<string, unknown>[] : [];
  await ensureStudioRackAndSlots(msg, slots);
  for (const slot of slots) {
    await query(
      `INSERT INTO rack_inventory_slots (
         gateway_id, rack_id, slot_number, presence, online_state, card_type,
         snapshot_revision, card_type_code, sensor_code, sensor, unit_code, unit,
         decimal_places, slot_payload, updated_at
       )
       VALUES ($1,$2,$3,'PRESENT','ONLINE',$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
       ON CONFLICT (gateway_id, rack_id, slot_number) DO UPDATE SET
         presence = EXCLUDED.presence,
         online_state = EXCLUDED.online_state,
         card_type = COALESCE(EXCLUDED.card_type, rack_inventory_slots.card_type),
         card_type_code = COALESCE(EXCLUDED.card_type_code, rack_inventory_slots.card_type_code),
         sensor_code = COALESCE(EXCLUDED.sensor_code, rack_inventory_slots.sensor_code),
         sensor = COALESCE(EXCLUDED.sensor, rack_inventory_slots.sensor),
         unit_code = COALESCE(EXCLUDED.unit_code, rack_inventory_slots.unit_code),
         unit = COALESCE(EXCLUDED.unit, rack_inventory_slots.unit),
         decimal_places = COALESCE(EXCLUDED.decimal_places, rack_inventory_slots.decimal_places),
         slot_payload = rack_inventory_slots.slot_payload || EXCLUDED.slot_payload,
         updated_at = now()`,
      [
        msg.gateway_id,
        msg.rack_id,
        slot.slot_number,
        stringValue(slot.card_type),
        msg.gateway_sequence,
        intValue(slot.card_type_code),
        intValue(slot.sensor_code),
        stringValue(slot.sensor),
        intValue(slot.unit_code),
        stringValue(slot.unit),
        intValue(slot.decimal_places),
        json(slot),
      ],
    );
    await query(
      `INSERT INTO rack_slot_latest (
         gateway_id, rack_id, slot_number, data_status, channel_status_code, channel_status,
         card_type_code, card_type, sensor_code, sensor, unit_code, unit, decimal_places,
         value_raw, value_formatted, value_with_unit, measurement_valid, value_display,
         alert_value_raw, alert_value_formatted, alert_with_unit, danger_value_raw,
         danger_value_formatted, danger_with_unit, alert_status_code, alert_status,
         danger_status_code, danger_status, source_timestamp_us, gateway_sequence,
         gateway_boot_id, payload, live, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,now())
       ON CONFLICT (gateway_id, rack_id, slot_number) DO UPDATE SET
         data_status = EXCLUDED.data_status, channel_status_code = EXCLUDED.channel_status_code,
         channel_status = EXCLUDED.channel_status, card_type_code = EXCLUDED.card_type_code,
         card_type = EXCLUDED.card_type, sensor_code = EXCLUDED.sensor_code, sensor = EXCLUDED.sensor,
         unit_code = EXCLUDED.unit_code, unit = EXCLUDED.unit, decimal_places = EXCLUDED.decimal_places,
         value_raw = EXCLUDED.value_raw, value_formatted = EXCLUDED.value_formatted,
         value_with_unit = EXCLUDED.value_with_unit, measurement_valid = EXCLUDED.measurement_valid,
         value_display = EXCLUDED.value_display, alert_value_raw = EXCLUDED.alert_value_raw,
         alert_value_formatted = EXCLUDED.alert_value_formatted, alert_with_unit = EXCLUDED.alert_with_unit,
         danger_value_raw = EXCLUDED.danger_value_raw, danger_value_formatted = EXCLUDED.danger_value_formatted,
         danger_with_unit = EXCLUDED.danger_with_unit, alert_status_code = EXCLUDED.alert_status_code,
         alert_status = EXCLUDED.alert_status, danger_status_code = EXCLUDED.danger_status_code,
         danger_status = EXCLUDED.danger_status, source_timestamp_us = EXCLUDED.source_timestamp_us,
         gateway_sequence = EXCLUDED.gateway_sequence, gateway_boot_id = EXCLUDED.gateway_boot_id,
         payload = EXCLUDED.payload, live = EXCLUDED.live, updated_at = now()
       WHERE rack_slot_latest.gateway_boot_id <> EXCLUDED.gateway_boot_id
          OR rack_slot_latest.source_timestamp_us <= EXCLUDED.source_timestamp_us`,
      slotParams(msg, slot),
    );
  }
  await upsertControllerSlot(msg, objectValue(msg.payload.telemetry)?.data_current === true);
  await refreshGatewayRackState(msg.gateway_id);
  return slots.length;
}

async function handleEvent(msg: MqttEnvelope, kind: TopicKind): Promise<void> {
  await query(
    `INSERT INTO gateway_events (message_id, gateway_id, rack_id, event_kind, payload)
     VALUES ($1,$2,$3,$4,$5)`,
    [msg.message_id, msg.gateway_id, msg.rack_id ?? null, kind, JSON.stringify(msg.payload)],
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
    return { kind: 'status', fresh: false, quarantined: true, reason: 'unknown topic' };
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
  if (parsed.gatewayId !== msg.gateway_id || (parsed.rackId !== null && parsed.rackId !== msg.rack_id) || (parsed.rackId === null && msg.rack_id !== undefined)) {
    const reason = 'topic/payload identity mismatch';
    await quarantine(topic, reason, msg);
    return { kind: parsed.kind, fresh: false, quarantined: true, reason };
  }
  const binding = await bind(msg);
  const fresh = await claimMessage(msg, topic, sourceEvent);
  if (!fresh) return { kind: parsed.kind, fresh, bindingStatus: binding.status, bindingEvent: binding.event };
  if (parsed.kind === 'status') await handleStatus(msg);
  if (parsed.kind === 'topology') await handleTopology(msg);
  if (parsed.kind === 'rack_health') await handleRackHealth(msg);
  if (parsed.kind === 'inventory') await handleInventory(msg);
  if (parsed.kind === 'telemetry') return { kind: parsed.kind, fresh, stored: await handleTelemetry(msg), bindingStatus: binding.status, bindingEvent: binding.event };
  if (parsed.kind === 'alarm' || parsed.kind === 'command_response') await handleEvent(msg, parsed.kind);
  await bumpMetric(`messages_schema_${msg.schema.replaceAll('.', '_')}`);
  await bumpMetric('messages_total');
  return { kind: parsed.kind, fresh, bindingStatus: binding.status, bindingEvent: binding.event };
}

export async function markStaleGateways(staleAfterS: number): Promise<void> {
  await ensureSchema();
  await query(
    `UPDATE gateways SET status = 'OFFLINE', mqtt_state = 'DISCONNECTED', updated_at = now()
     WHERE status = 'ONLINE' AND last_seen_at < now() - make_interval(secs => $1)`,
    [staleAfterS],
  );
  await query(
    `UPDATE racks SET status = 'unknown', data_current = false, updated_at = now()
     WHERE gateway_id IN (SELECT gateway_id FROM gateways WHERE status = 'OFFLINE')
       AND (status <> 'unknown' OR data_current = true)`,
  );
  await query(
    `UPDATE rack_inventory_slots SET presence = 'ABSENT', online_state = 'OFFLINE', updated_at = now()
     WHERE slot_number = $1
       AND gateway_id IN (SELECT gateway_id FROM gateways WHERE status = 'OFFLINE')`,
    [CONTROLLER_SLOT],
  );
}
