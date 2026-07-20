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

async function isCommissioned(gatewayId, gatewayIp) {
  const commissioned = await query(
    `SELECT 1
     FROM studio_devices
     WHERE type = 'Gateway'
       AND archived = false
       AND (
         real_gateway_id = $2
         OR ip = $1
         OR ip = regexp_replace($1, '\\.[^.]+$', '')
       )
     LIMIT 1`,
    [gatewayIp, gatewayId],
  );
  return commissioned.rowCount > 0;
}

// Gateway/Rack/IP binding (Phase E). Permanent identity = gateway_id + rack_id;
// gateway_ip is the mandatory verification field. A known gateway whose IP
// changed keeps its identity but the new IP is recorded unapproved; an unknown
// gateway_id is registered as QUARANTINED (never silently trusted just because
// the IP matches).
export async function bind(msg) {
  const { gateway_id, gateway_ip, gateway_boot_id, rack_id } = msg;

  const existing = await query(`SELECT gateway_id, current_ip, status FROM gateways WHERE gateway_id = $1`, [gateway_id]);

  let status = 'ONLINE';
  let event = 'BOUND';
  if (existing.rowCount === 0) {
    // Commissioning bootstrap: only auto-claim when a studio Gateway is already
    // configured with this script ID, exact IP, or IP prefix.
    if (!(await isCommissioned(gateway_id, gateway_ip))) {
      status = 'QUARANTINED';
      event = 'UNCLAIMED';
    }
    await query(
      `INSERT INTO gateways (gateway_id, current_ip, gateway_boot_id, mqtt_client_id, status, last_seen_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (gateway_id) DO UPDATE SET last_seen_at = now()`,
      [gateway_id, gateway_ip, gateway_boot_id, `ultron-gw-${gateway_id}`, status],
    );
  } else {
    const current = existing.rows[0];
    if (current.status === 'QUARANTINED') {
      if (await isCommissioned(gateway_id, gateway_ip)) {
        status = 'ONLINE';
        event = 'COMMISSIONED';
      } else {
        status = 'QUARANTINED';
        event = 'UNCLAIMED';
      }
    } else {
      status = 'ONLINE';
      event = current.current_ip && current.current_ip !== gateway_ip ? 'IP_CHANGED' : 'BOUND';
    }
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
    [gateway_id, gateway_ip, event === 'BOUND' || event === 'COMMISSIONED'],
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
