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
  status: string;
  lastSeenAt: string | null;
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

export type LiveAlert = {
  id: number;
  type: 'RACK_IP_CONFLICT';
  gatewayId: string;
  gatewayIp: string;
  gatewayName: string;
  rackDeviceId: string;
  rackName: string;
  rackId: number | null;
  createdAt: string;
  message: string;
};

export type LiveState = {
  gateways: LiveGateway[];
  racks: LiveRack[];
  slots: LiveSlot[];
  measurements: LiveMeasurement[];
  alerts: LiveAlert[];
};

// A gateway that hasn't reported for this long reads as offline even if the
// retained OFFLINE will was missed (matches the ingest service's backstop).
const STALE_AFTER_S = 15;

export async function getLiveState(): Promise<LiveState> {
  await ensureSchema();

  const [gateways, racks, slots, measurements, alerts] = await Promise.all([
    query<{ gateway_id: string; current_ip: string; status: string; last_seen_at: Date | null; stale: boolean }>(
      `SELECT gateway_id, current_ip, status, last_seen_at,
              (last_seen_at IS NULL OR last_seen_at < now() - make_interval(secs => $1)) AS stale
       FROM gateways ORDER BY gateway_id`,
      [STALE_AFTER_S],
    ),
    query<{ gateway_id: string; rack_id: number; last_seen_at: Date | null; stale: boolean }>(
      `SELECT r.gateway_id, r.rack_id, MAX(m.updated_at) AS last_seen_at,
              (MAX(m.updated_at) IS NULL OR MAX(m.updated_at) < now() - make_interval(secs => $1)) AS stale
       FROM racks r
       LEFT JOIN measurement_latest m
         ON m.gateway_id = r.gateway_id
        AND m.rack_id = r.rack_id
       GROUP BY r.gateway_id, r.rack_id
       ORDER BY r.gateway_id, r.rack_id`,
      [STALE_AFTER_S],
    ),
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
    query<{
      id: string;
      gateway_id: string;
      gateway_ip: string;
      received_at: Date;
      gateway_name: string;
      rack_device_id: string;
      rack_name: string;
      real_rack_id: number | null;
    }>(
      `SELECT q.id, q.gateway_id, q.gateway_ip, q.received_at,
              gateway.name AS gateway_name,
              rack.id AS rack_device_id,
              rack.name AS rack_name,
              rack.real_rack_id
       FROM mqtt_quarantine q
       JOIN studio_devices gateway
         ON gateway.type = 'Gateway'
        AND gateway.archived = false
        AND gateway.real_gateway_id = q.gateway_id
       JOIN studio_devices rack
         ON rack.type = 'Rack'
        AND rack.archived = false
        AND rack.gateway_id = gateway.id
        AND rack.ip = q.gateway_ip
       WHERE q.reason = 'gateway_ip matches configured rack ip'
         AND q.received_at > now() - make_interval(secs => $1)
       ORDER BY q.received_at DESC
       LIMIT 10`,
      [STALE_AFTER_S * 4],
    ),
  ]);

  return {
    gateways: gateways.rows.map((g) => ({
      gatewayId: g.gateway_id,
      currentIp: g.current_ip,
      status: g.status === 'ONLINE' && g.stale ? 'OFFLINE' : g.status,
      lastSeenAt: g.last_seen_at ? g.last_seen_at.toISOString() : null,
    })),
    racks: racks.rows.map((r) => ({
      gatewayId: r.gateway_id,
      rackId: r.rack_id,
      status: r.stale ? 'OFFLINE' : 'ONLINE',
      lastSeenAt: r.last_seen_at ? r.last_seen_at.toISOString() : null,
    })),
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
    alerts: alerts.rows.map((a) => ({
      id: Number(a.id),
      type: 'RACK_IP_CONFLICT',
      gatewayId: a.gateway_id,
      gatewayIp: a.gateway_ip,
      gatewayName: a.gateway_name,
      rackDeviceId: a.rack_device_id,
      rackName: a.rack_name,
      rackId: a.real_rack_id,
      createdAt: a.received_at.toISOString(),
      message: `Configured gateway IP ${a.gateway_ip} is assigned to rack ${a.rack_name}. Connect using the gateway IP instead.`,
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
