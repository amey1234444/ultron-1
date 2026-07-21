import { createHash } from 'node:crypto';

import { query } from './db.js';

// Envelope-level QoS 1 dedup: returns false when message_id was already
// ingested (the insert is the atomic claim).
export async function claimMessage(msg, topic) {
  const hash = createHash('sha256').update(JSON.stringify(msg.payload ?? {})).digest('hex');
  const res = await query(
    `INSERT INTO mqtt_messages (message_id, topic, schema, schema_version, gateway_id, gateway_ip, rack_id, payload_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (message_id) DO NOTHING`,
    [msg.message_id, topic, msg.schema, msg.schema_version, msg.gateway_id, msg.gateway_ip, msg.rack_id, hash],
  );
  return res.rowCount === 1;
}

export async function quarantine(topic, reason, msg) {
  await query(
    `INSERT INTO mqtt_quarantine (topic, reason, gateway_id, gateway_ip, rack_id, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [topic, reason, msg?.gateway_id ?? null, msg?.gateway_ip ?? null, Number.isInteger(msg?.rack_id) ? msg.rack_id : null, msg ? JSON.stringify(msg) : null],
  );
}

async function findStudioGateway(gatewayId) {
  const gateway = await query(
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

async function findConfiguredIpConflict(gatewayDeviceId, gatewayIp) {
  const device = await query(
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

async function rejectConfiguredIpConflict(gatewayId, gatewayIp) {
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
  return {
    status: 'QUARANTINED',
    event: 'IP_CONFLICT',
    reason: 'gateway_ip already configured',
  };
}

async function updateStudioGatewayIp(deviceId, gatewayIp) {
  const updated = await query(
    `UPDATE studio_devices
     SET ip = $2, updated_at = now()
     WHERE id = $1 AND ip <> $2`,
    [deviceId, gatewayIp],
  );
  if (updated.rowCount > 0) {
    await query(`UPDATE studio_meta SET hier_revision = hier_revision + 1, updated_at = now() WHERE id = 1`);
  }
}

// Gateway/Rack/IP binding (Phase E). Permanent identity = gateway_id + rack_id.
// A known Studio gateway_id may move to a new IP; unknown gateway IDs are
// quarantined before live gateway, rack, inventory, telemetry, or event state.
export async function bind(msg) {
  const { gateway_id, gateway_ip, gateway_boot_id, rack_id } = msg;

  const existing = await query(`SELECT gateway_id, current_ip, status FROM gateways WHERE gateway_id = $1`, [gateway_id]);

  const studioGateway = await findStudioGateway(gateway_id);
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
        [gateway_id, gateway_ip],
      );
      return { status, event };
    }

    const gatewayIpChanged = studioGateway.ip !== gateway_ip;
    const ipConflict = await findConfiguredIpConflict(studioGateway.id, gateway_ip);
    if (ipConflict) return rejectConfiguredIpConflict(gateway_id, gateway_ip);

    event = gatewayIpChanged ? 'IP_CHANGED' : 'BOUND';
    if (event === 'IP_CHANGED') await updateStudioGatewayIp(studioGateway.id, gateway_ip);
    await query(
      `INSERT INTO gateways (gateway_id, current_ip, gateway_boot_id, mqtt_client_id, status, last_seen_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (gateway_id) DO UPDATE SET last_seen_at = now()`,
      [gateway_id, gateway_ip, gateway_boot_id, `ultron-gw-${gateway_id}`, status],
    );
  } else {
    const current = existing.rows[0];
    if (!studioGateway) {
      await query(
        `INSERT INTO gateway_ip_history (gateway_id, ip_address, approved)
         VALUES ($1,$2,false)
         ON CONFLICT (gateway_id, ip_address) DO UPDATE SET last_seen_at = now()`,
        [gateway_id, gateway_ip],
      );
      return { status, event };
    }

    const gatewayIpChanged = studioGateway.ip !== gateway_ip;
    const ipConflict = await findConfiguredIpConflict(studioGateway.id, gateway_ip);
    if (ipConflict) return rejectConfiguredIpConflict(gateway_id, gateway_ip);

    if (current.status === 'QUARANTINED') {
      status = 'ONLINE';
      event = gatewayIpChanged ? 'IP_CHANGED' : 'COMMISSIONED';
    } else {
      status = 'ONLINE';
      event = current.current_ip && current.current_ip !== gateway_ip ? 'IP_CHANGED' : 'BOUND';
    }
    if (gatewayIpChanged) await updateStudioGatewayIp(studioGateway.id, gateway_ip);
    await query(
      `UPDATE gateways SET current_ip = $2, gateway_boot_id = $3, status = $4, last_seen_at = now(), updated_at = now()
       WHERE gateway_id = $1`,
      [gateway_id, gateway_ip, gateway_boot_id, status],
    );
  }

  await query(
    `INSERT INTO gateway_ip_history (gateway_id, ip_address, approved)
     VALUES ($1,$2,$3)
     ON CONFLICT (gateway_id, ip_address) DO UPDATE SET last_seen_at = now()`,
    [gateway_id, gateway_ip, true],
  );

  if (Number.isInteger(rack_id)) {
    await query(
      `INSERT INTO racks (gateway_id, rack_id)
       VALUES ($1,$2)
       ON CONFLICT (gateway_id, rack_id) DO UPDATE SET updated_at = now()`,
      [gateway_id, rack_id],
    );
  }

  return { status, event };
}

export async function handleStatus(msg) {
  const state = msg.payload.state === 'ONLINE' ? 'ONLINE' : msg.payload.state === 'DEGRADED' ? 'DEGRADED' : 'OFFLINE';
  await query(
    `UPDATE gateways SET status = CASE WHEN status = 'QUARANTINED' THEN status ELSE $2 END,
       last_seen_at = now(), updated_at = now()
     WHERE gateway_id = $1`,
    [msg.gateway_id, state],
  );
}

export async function handleInventory(msg) {
  const revision = msg.payload.snapshot_revision;
  for (const slot of msg.payload.slots) {
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
  // Slots absent from the newest snapshot are no longer installed.
  await query(
    `DELETE FROM rack_inventory_slots WHERE gateway_id = $1 AND rack_id = $2 AND snapshot_revision < $3`,
    [msg.gateway_id, msg.rack_id, revision],
  );
}

export async function handleTelemetry(msg) {
  let stored = 0;
  for (const r of msg.payload.records) {
    // Record-level dedup by source identity + sequence + source timestamp;
    // history time is the gateway's source timestamp, not backend arrival.
    const hist = await query(
      `INSERT INTO measurement_history
         (gateway_id, rack_id, slot_id, channel_id, measurement_type, value, unit, quality, source_sequence, source_timestamp_us)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (gateway_id, rack_id, slot_id, channel_id, measurement_type, source_sequence, source_timestamp_us) DO NOTHING`,
      [msg.gateway_id, msg.rack_id, r.slot_id, r.channel_id, r.measurement_type, r.value, r.unit ?? '', r.quality ?? 'GOOD', r.source_sequence, r.source_timestamp_us],
    );
    if (hist.rowCount === 1) stored += 1;

    await query(
      `INSERT INTO measurement_latest
         (gateway_id, rack_id, slot_id, channel_id, measurement_type, value, unit, quality, source_sequence, source_timestamp_us, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (gateway_id, rack_id, slot_id, channel_id, measurement_type) DO UPDATE SET
         value = EXCLUDED.value,
         unit = EXCLUDED.unit,
         quality = EXCLUDED.quality,
         source_sequence = EXCLUDED.source_sequence,
         source_timestamp_us = EXCLUDED.source_timestamp_us,
         updated_at = now()
       WHERE measurement_latest.source_timestamp_us <= EXCLUDED.source_timestamp_us`,
      [msg.gateway_id, msg.rack_id, r.slot_id, r.channel_id, r.measurement_type, r.value, r.unit ?? '', r.quality ?? 'GOOD', r.source_sequence, r.source_timestamp_us],
    );
  }
  return stored;
}

export async function handleEvent(msg, kind) {
  await query(
    `INSERT INTO gateway_events (message_id, gateway_id, rack_id, event_kind, payload)
     VALUES ($1,$2,$3,$4,$5)`,
    [msg.message_id, msg.gateway_id, msg.rack_id, kind, JSON.stringify(msg.payload)],
  );
}

// Last-will backstop: gateways silent past the threshold flip to OFFLINE even
// if the retained OFFLINE will was lost.
export async function markStaleGateways(staleAfterS) {
  await query(
    `UPDATE gateways SET status = 'OFFLINE', updated_at = now()
     WHERE status = 'ONLINE' AND last_seen_at < now() - make_interval(secs => $1)`,
    [staleAfterS],
  );
}
