import { createHash } from 'node:crypto';

import { query } from './db.js';

const textOrNull = (value) => (typeof value === 'string' && value.length > 0 ? value : null);
const bool = (value) => value === true;
const intOrNull = (value) => (Number.isInteger(value) ? value : null);
const decimalStringOrNull = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  return null;
};

function stableId(prefix, ...parts) {
  return `${prefix}-${createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16)}`;
}

function studioCardType(slot) {
  const normalized = [slot?.card_type, slot?.sensor, slot?.unit, slot?.value_with_unit]
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

function studioCardConfig(type, slot) {
  const unit = textOrNull(slot.unit) ?? '';
  const sensor = textOrNull(slot.sensor) ?? '';
  const label = sensor || textOrNull(slot.card_type) || `Slot ${slot.slot_number}`;
  if (type === 'Vibration Card') {
    return {
      channelNames: [label, ''],
      sensorType: sensor,
      sensitivity: '',
      engineeringUnit: unit || 'mm/s',
      measurementRangeMin: '',
      measurementRangeMax: '',
      samplingRate: '',
      alarmWarning: textOrNull(slot.alert_value_formatted) ?? '',
      alarmCritical: textOrNull(slot.danger_value_formatted) ?? '',
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
      alarmWarning: textOrNull(slot.alert_value_formatted) ?? '',
      alarmCritical: textOrNull(slot.danger_value_formatted) ?? '',
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
    alarmWarning: textOrNull(slot.alert_value_formatted) ?? '',
    alarmCritical: textOrNull(slot.danger_value_formatted) ?? '',
  };
}

const CONTROLLER_SLOT = 13;
const CONTROLLER_SLOT_PAYLOAD = {
  slot_number: CONTROLLER_SLOT,
  card_type: 'Communication Controller',
  sensor: 'Rack Communication',
  unit: '',
};

function createdAtUs(msg) {
  return /^\d+$/.test(String(msg.created_at_us ?? '')) ? msg.created_at_us : '0';
}

function sourceDate(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function json(value) {
  return JSON.stringify(value ?? {});
}

export async function bumpMetric(metricName, by = 1) {
  await query(
    `INSERT INTO mqtt_ingest_metrics (metric_name, metric_value)
     VALUES ($1,$2)
     ON CONFLICT (metric_name) DO UPDATE SET
       metric_value = mqtt_ingest_metrics.metric_value + EXCLUDED.metric_value,
       updated_at = now()`,
    [metricName, by],
  );
}

export async function setMetric(metricName, value) {
  await query(
    `INSERT INTO mqtt_ingest_metrics (metric_name, metric_value)
     VALUES ($1,$2)
     ON CONFLICT (metric_name) DO UPDATE SET
       metric_value = EXCLUDED.metric_value,
       updated_at = now()`,
    [metricName, value],
  );
}

export async function claimMessage(msg, topic) {
  const hash = createHash('sha256').update(JSON.stringify(msg.payload ?? {})).digest('hex');
  const res = await query(
    `INSERT INTO mqtt_messages (message_id, topic, schema, schema_version, gateway_id, gateway_ip, rack_id, payload_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (message_id) DO NOTHING`,
    [msg.message_id, topic, msg.schema, msg.schema_version, msg.gateway_id, msg.gateway_ip, msg.rack_id ?? null, hash],
  );
  if (res.rowCount === 0) await bumpMetric('qos_duplicates');
  return res.rowCount === 1;
}

export async function quarantine(topic, reason, msg) {
  await bumpMetric('quarantine_messages');
  await query(
    `INSERT INTO mqtt_quarantine (topic, reason, gateway_id, gateway_ip, rack_id, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [topic, reason, msg?.gateway_id ?? null, msg?.gateway_ip ?? null, typeof msg?.rack_id === 'string' ? msg.rack_id : null, msg ? JSON.stringify(msg) : null],
  );
}

export async function bind(msg) {
  await query(
    `INSERT INTO gateways (gateway_id, current_ip, gateway_boot_id, mqtt_client_id, status, mqtt_state, last_seen_at)
     VALUES ($1,$2,$3,$4,'UNKNOWN','UNKNOWN', now())
     ON CONFLICT (gateway_id) DO UPDATE SET
       current_ip = EXCLUDED.current_ip,
       gateway_boot_id = EXCLUDED.gateway_boot_id,
       last_seen_at = now(),
       updated_at = now()`,
    [msg.gateway_id, msg.gateway_ip, msg.gateway_boot_id, process.env.MQTT_BACKEND_CLIENT_ID ?? 'ultron-backend'],
  );

  await query(
    `INSERT INTO gateway_ip_history (gateway_id, ip_address, approved)
     VALUES ($1,$2,true)
     ON CONFLICT (gateway_id, ip_address) DO UPDATE SET last_seen_at = now(), approved = true`,
    [msg.gateway_id, msg.gateway_ip],
  );

  if (typeof msg.rack_id === 'string') {
    await ensureRack(msg);
  }

  return { status: 'ONLINE', event: 'BOUND' };
}

async function ensureRack(msg) {
  if (typeof msg.rack_id !== 'string') return;
  await query(
    `INSERT INTO racks (
       gateway_id, rack_id, last_gateway_boot_id, last_gateway_sequence,
       last_source_created_at, last_source_created_at_us, active, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,true,now())
     ON CONFLICT (gateway_id, rack_id) DO UPDATE SET
       active = true,
       updated_at = now()`,
    [msg.gateway_id, msg.rack_id, msg.gateway_boot_id, msg.gateway_sequence, sourceDate(msg.created_at), createdAtUs(msg)],
  );
}

async function ensureStudioRackAndSlots(msg, slots = []) {
  if (typeof msg.rack_id !== 'string') return;
  const gateway = await query(
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

  const connection = msg.payload?.connection && typeof msg.payload.connection === 'object' ? msg.payload.connection : {};
  const currentIp = textOrNull(connection.current_ip ?? msg.payload?.current_ip) ?? '';
  const rack = await query(
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
      [msg.gateway_id, msg.rack_id, gatewayDevice.id, gatewayDevice.project_id ?? null, currentIp, deviceId],
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
        gatewayDevice.project_id ?? null,
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
  if (!studioSlots.some((slot) => Number(slot?.slot_number) === CONTROLLER_SLOT)) {
    studioSlots.push(CONTROLLER_SLOT_PAYLOAD);
  }
  for (const slot of studioSlots) {
    if (!Number.isInteger(slot?.slot_number) || slot.slot_number < 1) continue;
    const type = studioCardType(slot);
    const cardId = stableId('auto-card', msg.gateway_id, msg.rack_id, String(slot.slot_number));
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
      [cardId, deviceId, slot.slot_number, type, JSON.stringify(studioCardConfig(type, slot))],
    );
    cardsChanged += card.rowCount ?? 0;
  }

  if (rackChanged > 0 || cardsChanged > 0) {
    await query(`UPDATE studio_meta SET hier_revision = hier_revision + 1, updated_at = now() WHERE id = 1`);
  }
}

async function upsertControllerSlot(msg, online) {
  if (typeof msg.rack_id !== 'string') return;
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

async function refreshGatewayRackState(gatewayId) {
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

async function currentGatewayAllows(msg, force = false) {
  if (force) return true;
  const res = await query(
    `SELECT gateway_boot_id, last_gateway_sequence, last_source_created_at_us
     FROM gateways WHERE gateway_id = $1`,
    [msg.gateway_id],
  );
  const row = res.rows[0];
  if (!row) return true;
  if (row.gateway_boot_id && row.gateway_boot_id !== msg.gateway_boot_id) return true;
  const incomingUs = BigInt(createdAtUs(msg));
  const storedUs = BigInt(String(row.last_source_created_at_us ?? -1));
  if (incomingUs > storedUs) return true;
  if (incomingUs < storedUs) return false;
  return Number(msg.gateway_sequence) >= Number(row.last_gateway_sequence ?? -1);
}

async function currentRackAllows(msg) {
  const res = await query(
    `SELECT last_gateway_boot_id, last_gateway_sequence, last_source_created_at_us
     FROM racks WHERE gateway_id = $1 AND rack_id = $2`,
    [msg.gateway_id, msg.rack_id],
  );
  const row = res.rows[0];
  if (!row) return true;
  if (row.last_gateway_boot_id && row.last_gateway_boot_id !== msg.gateway_boot_id) return true;
  const incomingUs = BigInt(createdAtUs(msg));
  const storedUs = BigInt(String(row.last_source_created_at_us ?? -1));
  if (incomingUs > storedUs) return true;
  if (incomingUs < storedUs) return false;
  return Number(msg.gateway_sequence) >= Number(row.last_gateway_sequence ?? -1);
}

async function upsertRack(msg, patch = {}) {
  const payload = msg.payload ?? {};
  const connection = payload.connection && typeof payload.connection === 'object' ? payload.connection : {};
  const telemetry = payload.telemetry && typeof payload.telemetry === 'object' ? payload.telemetry : {};
  const status = patch.status ?? payload.status ?? connection.status ?? 'unknown';
  const dataCurrent = patch.dataCurrent ?? payload.data_current ?? telemetry.data_current ?? false;
  const lastSeenAt = sourceDate(connection.last_seen_at ?? payload.last_seen_at ?? telemetry.last_received_at ?? payload.received_at);
  const lastMessageAt = sourceDate(connection.last_message_at ?? telemetry.last_received_at ?? payload.received_at);

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
      status,
      bool(dataCurrent),
      textOrNull(connection.current_ip ?? payload.current_ip),
      textOrNull(connection.last_known_ip ?? payload.last_known_ip),
      textOrNull(connection.status_reason ?? payload.cc_gateway_status_reason ?? payload.status_reason),
      json(connection),
      json(telemetry),
      json(payload),
      lastSeenAt,
      lastMessageAt,
      msg.gateway_sequence,
      msg.gateway_boot_id,
      sourceDate(msg.created_at),
      createdAtUs(msg),
    ],
  );
}

export async function handleStatus(msg) {
  const forceLastWillOffline = msg.payload.state === 'OFFLINE';
  if (!(await currentGatewayAllows(msg, forceLastWillOffline))) {
    await bumpMetric('older_messages_ignored');
    return;
  }
  const summary = msg.payload.rack_summary && typeof msg.payload.rack_summary === 'object' ? msg.payload.rack_summary : {};
  await query(
    `UPDATE gateways SET
       status = $2,
       mqtt_state = $3,
       last_seen_at = now(),
       last_gateway_sequence = $4,
       last_source_created_at = $5,
       last_source_created_at_us = $6,
       status_payload = $7,
       known_racks = COALESCE($8, known_racks),
       connected_racks = COALESCE($9, connected_racks),
       stale_racks = COALESCE($10, stale_racks),
       disconnected_racks = COALESCE($11, disconnected_racks),
       blocked_racks = COALESCE($12, blocked_racks),
       unidentified_connections = COALESCE($13, unidentified_connections),
       active_tcp_connections = COALESCE($14, active_tcp_connections),
       updated_at = now()
     WHERE gateway_id = $1`,
    [
      msg.gateway_id,
      msg.payload.state,
      msg.payload.mqtt_state ?? (msg.payload.state === 'ONLINE' ? 'CONNECTED' : 'DISCONNECTED'),
      msg.gateway_sequence,
      sourceDate(msg.created_at),
      createdAtUs(msg),
      json(msg.payload),
      intOrNull(summary.known_racks),
      intOrNull(summary.connected_racks),
      intOrNull(summary.stale_racks),
      intOrNull(summary.disconnected_racks),
      intOrNull(summary.blocked_racks),
      intOrNull(summary.unidentified_connections),
      intOrNull(summary.active_tcp_connections),
    ],
  );
}

export async function handleTopology(msg) {
  if (!(await currentGatewayAllows(msg))) {
    await bumpMetric('older_messages_ignored');
    return;
  }
  const racks = Array.isArray(msg.payload.racks) ? msg.payload.racks : [];
  await query(
    `UPDATE gateways SET
       topology_payload = $2,
       known_racks = COALESCE($3, known_racks),
       connected_racks = COALESCE($4, connected_racks),
       stale_racks = COALESCE($5, stale_racks),
       disconnected_racks = COALESCE($6, disconnected_racks),
       blocked_racks = COALESCE($7, blocked_racks),
       unidentified_connections = COALESCE($8, unidentified_connections),
       active_tcp_connections = COALESCE($9, active_tcp_connections),
       last_gateway_sequence = $10,
       last_source_created_at = $11,
       last_source_created_at_us = $12,
       updated_at = now()
     WHERE gateway_id = $1`,
    [
      msg.gateway_id,
      json(msg.payload),
      intOrNull(msg.payload.known_racks),
      intOrNull(msg.payload.connected_racks),
      intOrNull(msg.payload.stale_racks),
      intOrNull(msg.payload.disconnected_racks),
      intOrNull(msg.payload.blocked_racks),
      intOrNull(msg.payload.unidentified_connections),
      intOrNull(msg.payload.active_tcp_connections),
      msg.gateway_sequence,
      sourceDate(msg.created_at),
      createdAtUs(msg),
    ],
  );

  const activeRackIds = [];
  for (const rack of racks) {
    const rackMsg = { ...msg, rack_id: rack.rack_id, payload: rack };
    await upsertRack(rackMsg, { status: rack.status ?? 'unknown', dataCurrent: rack.data_current === true });
    await ensureStudioRackAndSlots(rackMsg);
    await upsertControllerSlot(rackMsg, rack.status === 'connected' && rack.data_current === true);
    activeRackIds.push(rack.rack_id);
  }

  await query(
    `UPDATE racks SET active = false, updated_at = now()
     WHERE gateway_id = $1 AND NOT (rack_id = ANY($2::text[]))`,
    [msg.gateway_id, activeRackIds],
  );
  await query(
    `UPDATE rack_inventory_slots SET presence = 'ABSENT', online_state = 'OFFLINE', updated_at = now()
     WHERE gateway_id = $1 AND slot_number = $2 AND NOT (rack_id = ANY($3::text[]))`,
    [msg.gateway_id, CONTROLLER_SLOT, activeRackIds],
  );
  await refreshGatewayRackState(msg.gateway_id);
}

export async function handleRackHealth(msg) {
  if (!(await currentRackAllows(msg))) {
    await bumpMetric('older_messages_ignored');
    return;
  }
  await upsertRack(msg);
  await ensureStudioRackAndSlots(msg);
  await upsertControllerSlot(msg, msg.payload.data_current === true);
  if (msg.payload.data_current !== true) {
    await query(
      `UPDATE rack_slot_latest SET live = false, measurement_valid = false, updated_at = now()
       WHERE gateway_id = $1 AND rack_id = $2`,
      [msg.gateway_id, msg.rack_id],
    );
  }
  await refreshGatewayRackState(msg.gateway_id);
}

export async function handleInventory(msg) {
  await ensureRack(msg);
  const revision = msg.payload.snapshot_revision;
  await ensureStudioRackAndSlots(msg, Array.isArray(msg.payload.slots) ? msg.payload.slots : []);
  for (const slot of msg.payload.slots ?? []) {
    await query(
      `INSERT INTO rack_inventory_slots (
         gateway_id, rack_id, slot_number, presence, online_state, card_type,
         snapshot_revision, card_type_code, sensor_code, sensor, unit_code, unit,
         decimal_places, slot_payload, updated_at
       )
       VALUES ($1,$2,$3,'PRESENT','UNKNOWN',$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
       ON CONFLICT (gateway_id, rack_id, slot_number) DO UPDATE SET
         presence = EXCLUDED.presence,
         online_state = EXCLUDED.online_state,
         card_type = EXCLUDED.card_type,
         snapshot_revision = EXCLUDED.snapshot_revision,
         card_type_code = EXCLUDED.card_type_code,
         sensor_code = EXCLUDED.sensor_code,
         sensor = EXCLUDED.sensor,
         unit_code = EXCLUDED.unit_code,
         unit = EXCLUDED.unit,
         decimal_places = EXCLUDED.decimal_places,
         slot_payload = EXCLUDED.slot_payload,
         updated_at = now()
       WHERE rack_inventory_slots.snapshot_revision <= EXCLUDED.snapshot_revision`,
      [
        msg.gateway_id,
        msg.rack_id,
        slot.slot_number,
        textOrNull(slot.card_type),
        revision,
        intOrNull(slot.card_type_code),
        intOrNull(slot.sensor_code),
        textOrNull(slot.sensor),
        intOrNull(slot.unit_code),
        textOrNull(slot.unit),
        intOrNull(slot.decimal_places),
        json(slot),
      ],
    );
  }
  await query(
    `DELETE FROM rack_inventory_slots
     WHERE gateway_id = $1 AND rack_id = $2 AND snapshot_revision < $3`,
    [msg.gateway_id, msg.rack_id, revision],
  );
}

function slotParams(msg, slot) {
  const measurementValid = slot.measurement_valid === true
    && String(slot.channel_status ?? 'ok').toLowerCase() === 'ok'
    && !['', 'invalid', 'nan', 'null', 'none'].includes(String(slot.value_display ?? slot.value_formatted ?? '').trim().toLowerCase());
  return [
    msg.gateway_id,
    msg.rack_id,
    slot.slot_number,
    textOrNull(slot.data_status),
    intOrNull(slot.channel_status_code),
    textOrNull(slot.channel_status),
    intOrNull(slot.card_type_code),
    textOrNull(slot.card_type),
    intOrNull(slot.sensor_code),
    textOrNull(slot.sensor),
    intOrNull(slot.unit_code),
    textOrNull(slot.unit),
    intOrNull(slot.decimal_places),
    decimalStringOrNull(slot.value_raw),
    decimalStringOrNull(slot.value_formatted),
    textOrNull(slot.value_with_unit),
    measurementValid,
    textOrNull(slot.value_display),
    decimalStringOrNull(slot.alert_value_raw),
    decimalStringOrNull(slot.alert_value_formatted),
    textOrNull(slot.alert_with_unit),
    decimalStringOrNull(slot.danger_value_raw),
    decimalStringOrNull(slot.danger_value_formatted),
    textOrNull(slot.danger_with_unit),
    intOrNull(slot.alert_status_code),
    textOrNull(slot.alert_status),
    intOrNull(slot.danger_status_code),
    textOrNull(slot.danger_status),
    createdAtUs(msg),
    msg.gateway_sequence,
    msg.gateway_boot_id,
    json(slot),
    msg.payload.telemetry?.data_current === true && measurementValid,
  ];
}

export async function handleTelemetry(msg) {
  if (!(await currentRackAllows(msg))) {
    await bumpMetric('older_messages_ignored');
    return 0;
  }
  await upsertRack(msg, { status: 'connected', dataCurrent: msg.payload.telemetry?.data_current === true });
  const slots = Array.isArray(msg.payload.slots) ? msg.payload.slots : [];
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
        textOrNull(slot.card_type),
        msg.gateway_sequence,
        intOrNull(slot.card_type_code),
        intOrNull(slot.sensor_code),
        textOrNull(slot.sensor),
        intOrNull(slot.unit_code),
        textOrNull(slot.unit),
        intOrNull(slot.decimal_places),
        json(slot),
      ],
    );
    await query(
      `INSERT INTO rack_slot_latest (
         gateway_id, rack_id, slot_number, data_status, channel_status_code, channel_status,
         card_type_code, card_type, sensor_code, sensor, unit_code, unit, decimal_places,
         value_raw, value_formatted, value_with_unit, measurement_valid, value_display,
         alert_value_raw, alert_value_formatted, alert_with_unit,
         danger_value_raw, danger_value_formatted, danger_with_unit,
         alert_status_code, alert_status, danger_status_code, danger_status,
         source_timestamp_us, gateway_sequence, gateway_boot_id, payload, live, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,now())
       ON CONFLICT (gateway_id, rack_id, slot_number) DO UPDATE SET
         data_status = EXCLUDED.data_status,
         channel_status_code = EXCLUDED.channel_status_code,
         channel_status = EXCLUDED.channel_status,
         card_type_code = EXCLUDED.card_type_code,
         card_type = EXCLUDED.card_type,
         sensor_code = EXCLUDED.sensor_code,
         sensor = EXCLUDED.sensor,
         unit_code = EXCLUDED.unit_code,
         unit = EXCLUDED.unit,
         decimal_places = EXCLUDED.decimal_places,
         value_raw = EXCLUDED.value_raw,
         value_formatted = EXCLUDED.value_formatted,
         value_with_unit = EXCLUDED.value_with_unit,
         measurement_valid = EXCLUDED.measurement_valid,
         value_display = EXCLUDED.value_display,
         alert_value_raw = EXCLUDED.alert_value_raw,
         alert_value_formatted = EXCLUDED.alert_value_formatted,
         alert_with_unit = EXCLUDED.alert_with_unit,
         danger_value_raw = EXCLUDED.danger_value_raw,
         danger_value_formatted = EXCLUDED.danger_value_formatted,
         danger_with_unit = EXCLUDED.danger_with_unit,
         alert_status_code = EXCLUDED.alert_status_code,
         alert_status = EXCLUDED.alert_status,
         danger_status_code = EXCLUDED.danger_status_code,
         danger_status = EXCLUDED.danger_status,
         source_timestamp_us = EXCLUDED.source_timestamp_us,
         gateway_sequence = EXCLUDED.gateway_sequence,
         gateway_boot_id = EXCLUDED.gateway_boot_id,
         payload = EXCLUDED.payload,
         live = EXCLUDED.live,
         updated_at = now()
       WHERE rack_slot_latest.gateway_boot_id <> EXCLUDED.gateway_boot_id
          OR rack_slot_latest.source_timestamp_us <= EXCLUDED.source_timestamp_us`,
      slotParams(msg, slot),
    );
  }
  await upsertControllerSlot(msg, msg.payload.telemetry?.data_current === true);
  await refreshGatewayRackState(msg.gateway_id);
  return slots.length;
}

export async function handleEvent(msg, kind) {
  await query(
    `INSERT INTO gateway_events (message_id, gateway_id, rack_id, event_kind, payload)
     VALUES ($1,$2,$3,$4,$5)`,
    [msg.message_id, msg.gateway_id, msg.rack_id ?? null, kind, JSON.stringify(msg.payload)],
  );
}

export async function handleTombstone(topic, parsed) {
  await bumpMetric('retained_tombstones');
  if (parsed.kind === 'inventory') {
    await query(`DELETE FROM rack_inventory_slots WHERE gateway_id = $1 AND rack_id = $2`, [parsed.gatewayId, parsed.rackId]);
  }
  if (parsed.kind === 'rack_health') {
    await query(
      `UPDATE racks SET health_payload = '{}'::jsonb, status = 'unknown', data_current = false, updated_at = now()
       WHERE gateway_id = $1 AND rack_id = $2`,
      [parsed.gatewayId, parsed.rackId],
    );
    await query(
      `UPDATE rack_inventory_slots SET presence = 'ABSENT', online_state = 'OFFLINE', updated_at = now()
       WHERE gateway_id = $1 AND rack_id = $2 AND slot_number = $3`,
      [parsed.gatewayId, parsed.rackId, CONTROLLER_SLOT],
    );
    await query(`UPDATE rack_slot_latest SET live = false, measurement_valid = false WHERE gateway_id = $1 AND rack_id = $2`, [parsed.gatewayId, parsed.rackId]);
    await refreshGatewayRackState(parsed.gatewayId);
  }
}

export async function markStaleGateways(staleAfterS) {
  await query(
    `UPDATE gateways SET status = 'OFFLINE', mqtt_state = 'DISCONNECTED', updated_at = now()
     WHERE status = 'ONLINE' AND last_seen_at < now() - make_interval(secs => $1)`,
    [staleAfterS],
  );
  await query(
    `UPDATE racks SET status = 'unknown', data_current = false, updated_at = now()
     WHERE gateway_id IN (
       SELECT gateway_id FROM gateways
       WHERE status = 'OFFLINE'
     )
       AND (status <> 'unknown' OR data_current = true)`,
  );
  await query(
    `UPDATE rack_inventory_slots SET presence = 'ABSENT', online_state = 'OFFLINE', updated_at = now()
     WHERE slot_number = $1
       AND gateway_id IN (SELECT gateway_id FROM gateways WHERE status = 'OFFLINE')`,
    [CONTROLLER_SLOT],
  );
}
