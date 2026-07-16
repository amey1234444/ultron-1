// Read model for the MQTT ingestion tables (written by services/mqtt-ingest).
// Serves the /api/live endpoints the frontend polls for real-time state.

import { ensureSchema, query } from './db';

export type LiveGateway = {
  gatewayId: string;
  currentIp: string;
  status: string;
  lastSeenAt: string | null;
};

export type LiveRack = {
  gatewayId: string;
  rackId: number;
};

export type LiveSlot = {
  gatewayId: string;
  rackId: number;
  slotId: number;
  presence: string;
  onlineState: string;
  cardType: string | null;
};

export type LiveMeasurement = {
  gatewayId: string;
  rackId: number;
  slotId: number;
  channelId: number;
  measurementType: string;
  value: number;
  unit: string;
  quality: string;
  updatedAt: string;
};

export type LiveState = {
  gateways: LiveGateway[];
  racks: LiveRack[];
  slots: LiveSlot[];
  measurements: LiveMeasurement[];
};

// A gateway that hasn't reported for this long reads as offline even if the
// retained OFFLINE will was missed (matches the ingest service's backstop).
const STALE_AFTER_S = 15;

export async function getLiveState(): Promise<LiveState> {
  await ensureSchema();

  const [gateways, racks, slots, measurements] = await Promise.all([
    query<{ gateway_id: string; current_ip: string; status: string; last_seen_at: Date | null; stale: boolean }>(
      `SELECT gateway_id, current_ip, status, last_seen_at,
              (last_seen_at IS NULL OR last_seen_at < now() - make_interval(secs => $1)) AS stale
       FROM gateways ORDER BY gateway_id`,
      [STALE_AFTER_S],
    ),
    query<{ gateway_id: string; rack_id: number }>(`SELECT gateway_id, rack_id FROM racks ORDER BY gateway_id, rack_id`),
    query<{ gateway_id: string; rack_id: number; slot_id: number; presence: string; online_state: string; card_type: string | null }>(
      `SELECT gateway_id, rack_id, slot_id, presence, online_state, card_type
       FROM rack_inventory_slots ORDER BY gateway_id, rack_id, slot_id`,
    ),
    query<{
      gateway_id: string;
      rack_id: number;
      slot_id: number;
      channel_id: number;
      measurement_type: string;
      value: number;
      unit: string;
      quality: string;
      updated_at: Date;
    }>(
      `SELECT gateway_id, rack_id, slot_id, channel_id, measurement_type, value, unit, quality, updated_at
       FROM measurement_latest ORDER BY gateway_id, rack_id, slot_id, channel_id`,
    ),
  ]);

  return {
    gateways: gateways.rows.map((g) => ({
      gatewayId: g.gateway_id,
      currentIp: g.current_ip,
      status: g.status === 'ONLINE' && g.stale ? 'OFFLINE' : g.status,
      lastSeenAt: g.last_seen_at ? g.last_seen_at.toISOString() : null,
    })),
    racks: racks.rows.map((r) => ({ gatewayId: r.gateway_id, rackId: r.rack_id })),
    slots: slots.rows.map((s) => ({
      gatewayId: s.gateway_id,
      rackId: s.rack_id,
      slotId: s.slot_id,
      presence: s.presence,
      onlineState: s.online_state,
      cardType: s.card_type,
    })),
    measurements: measurements.rows.map((m) => ({
      gatewayId: m.gateway_id,
      rackId: m.rack_id,
      slotId: m.slot_id,
      channelId: m.channel_id,
      measurementType: m.measurement_type,
      value: m.value,
      unit: m.unit,
      quality: m.quality,
      updatedAt: m.updated_at.toISOString(),
    })),
  };
}

export type HistoryPoint = { value: number; sourceTimestampUs: string };

export async function getMeasurementHistory(
  gatewayId: string,
  rackId: number,
  slotId: number,
  channelId: number,
  limit: number,
): Promise<HistoryPoint[]> {
  await ensureSchema();
  const res = await query<{ value: number; source_timestamp_us: string }>(
    `SELECT value, source_timestamp_us FROM measurement_history
     WHERE gateway_id = $1 AND rack_id = $2 AND slot_id = $3 AND channel_id = $4
     ORDER BY source_timestamp_us DESC LIMIT $5`,
    [gatewayId, rackId, slotId, channelId, limit],
  );
  return res.rows.reverse().map((r) => ({ value: r.value, sourceTimestampUs: String(r.source_timestamp_us) }));
}
