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
    await upsertRack(msg, { status: 'unknown', dataCurrent: false });
  }

  return { status: 'ONLINE', event: 'BOUND' };
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
    activeRackIds.push(rack.rack_id);
  }

  await query(
    `UPDATE racks SET active = false, updated_at = now()
     WHERE gateway_id = $1 AND NOT (rack_id = ANY($2::text[]))`,
    [msg.gateway_id, activeRackIds],
  );
}

export async function handleRackHealth(msg) {
  if (!(await currentRackAllows(msg))) {
    await bumpMetric('older_messages_ignored');
    return;
  }
  await upsertRack(msg);
  if (msg.payload.data_current !== true) {
    await query(
      `UPDATE rack_slot_latest SET live = false, measurement_valid = false, updated_at = now()
       WHERE gateway_id = $1 AND rack_id = $2`,
      [msg.gateway_id, msg.rack_id],
    );
  }
}

export async function handleInventory(msg) {
  if (!(await currentRackAllows(msg))) {
    await bumpMetric('older_messages_ignored');
    return;
  }
  await upsertRack(msg, { dataCurrent: false });
  const revision = msg.payload.snapshot_revision;
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
  for (const slot of slots) {
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
    await query(`UPDATE rack_slot_latest SET live = false, measurement_valid = false WHERE gateway_id = $1 AND rack_id = $2`, [parsed.gatewayId, parsed.rackId]);
  }
}

export async function markStaleGateways(staleAfterS) {
  await query(
    `UPDATE gateways SET status = 'OFFLINE', mqtt_state = 'DISCONNECTED', updated_at = now()
     WHERE status = 'ONLINE' AND last_seen_at < now() - make_interval(secs => $1)`,
    [staleAfterS],
  );
}
