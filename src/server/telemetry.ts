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
  type: 'IP_CONFLICT';
  gatewayId: string;
  gatewayIp: string;
  gatewayName: string;
  conflictDeviceId?: string;
  conflictDeviceName?: string;
  conflictDeviceType?: string;
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

type GatewayRow = { gateway_id: string; current_ip: string; status: string; last_seen_at: Date | null; stale: boolean };
type RackRow = { gateway_id: string; rack_id: number; last_seen_at: Date | null; stale: boolean };
type SlotRow = { gateway_id: string; rack_id: number; slot_id: number; presence: string; online_state: string; card_type: string | null };
type MeasurementRow = {
  gateway_id: string;
  rack_id: number;
  slot_id: number;
  channel_id: number;
  measurement_type: string;
  value: number;
  unit: string;
  quality: string;
  updated_at: Date;
};
type AlertRow = {
  id: number;
  gateway_id: string;
  gateway_ip: string;
  received_at: Date;
  gateway_name: string;
  conflict_device_id: string;
  conflict_device_name: string;
  conflict_device_type: string;
};

// A gateway that hasn't reported for this long reads as offline even if the
// retained OFFLINE will was missed (matches the ingest service's backstop).
const STALE_AFTER_S = 15;

export async function getLiveState(options: { includeConflictDeviceDetails?: boolean } = {}): Promise<LiveState> {
  await ensureSchema();

  const [gateways, racks, slots, measurements, alerts] = await Promise.all([
    query<GatewayRow>(
      `SELECT gateway_id, current_ip, status, last_seen_at,
              (last_seen_at IS NULL OR last_seen_at < now() - make_interval(secs => $1)) AS stale
       FROM gateways ORDER BY gateway_id`,
      [STALE_AFTER_S],
    ),
    query<RackRow>(
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
    query<SlotRow>(
      `SELECT gateway_id, rack_id, slot_id, presence, online_state, card_type
       FROM rack_inventory_slots ORDER BY gateway_id, rack_id, slot_id`,
    ),
    query<MeasurementRow>(
      `SELECT gateway_id, rack_id, slot_id, channel_id, measurement_type, value, unit, quality, updated_at
       FROM measurement_latest ORDER BY gateway_id, rack_id, slot_id, channel_id`,
    ),
    query<AlertRow>(
      `SELECT q.id, q.gateway_id, q.gateway_ip, q.received_at,
              gateway.name AS gateway_name,
              conflict.id AS conflict_device_id,
              conflict.name AS conflict_device_name,
              conflict.type AS conflict_device_type
       FROM mqtt_quarantine q
       JOIN studio_devices gateway
         ON gateway.type = 'Gateway'
        AND gateway.archived = false
        AND gateway.real_gateway_id = q.gateway_id
       JOIN studio_devices conflict
         ON conflict.archived = false
        AND conflict.type IN ('Gateway', 'Rack')
        AND conflict.ip = q.gateway_ip
        AND conflict.id <> gateway.id
       WHERE q.reason IN ('gateway_ip already configured', 'gateway_ip matches configured rack ip')
         AND q.received_at > now() - make_interval(secs => $1)
       ORDER BY q.received_at DESC
       LIMIT 10`,
      [STALE_AFTER_S * 4],
    ),
  ]);

  return {
    gateways: gateways.rows.map((g: GatewayRow) => ({
      gatewayId: g.gateway_id,
      currentIp: g.current_ip,
      status: g.status === 'ONLINE' && g.stale ? 'OFFLINE' : g.status,
      lastSeenAt: g.last_seen_at ? g.last_seen_at.toISOString() : null,
    })),
    racks: racks.rows.map((r: RackRow) => ({
      gatewayId: r.gateway_id,
      rackId: r.rack_id,
      status: r.stale ? 'OFFLINE' : 'ONLINE',
      lastSeenAt: r.last_seen_at ? r.last_seen_at.toISOString() : null,
    })),
    slots: slots.rows.map((s: SlotRow) => ({
      gatewayId: s.gateway_id,
      rackId: s.rack_id,
      slotId: s.slot_id,
      presence: s.presence,
      onlineState: s.online_state,
      cardType: s.card_type,
    })),
    measurements: measurements.rows.map((m: MeasurementRow) => ({
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
    alerts: alerts.rows.map((a: AlertRow) => ({
      id: Number(a.id),
      type: 'IP_CONFLICT',
      gatewayId: a.gateway_id,
      gatewayIp: a.gateway_ip,
      gatewayName: a.gateway_name,
      ...(options.includeConflictDeviceDetails
        ? {
            conflictDeviceId: a.conflict_device_id,
            conflictDeviceName: a.conflict_device_name,
            conflictDeviceType: a.conflict_device_type,
          }
        : {}),
      createdAt: a.received_at.toISOString(),
      message: `IP ${a.gateway_ip} is already configured. Use a different gateway IP.`,
    })),
  };
}

export type HistoryPoint = { value: number; sourceTimestampUs: string };
type HistoryRow = { value: number; source_timestamp_us: string };

export async function getMeasurementHistory(
  gatewayId: string,
  rackId: number,
  slotId: number,
  channelId: number,
  limit: number,
): Promise<HistoryPoint[]> {
  await ensureSchema();
  const res = await query<HistoryRow>(
    `SELECT value, source_timestamp_us FROM measurement_history
     WHERE gateway_id = $1 AND rack_id = $2 AND slot_id = $3 AND channel_id = $4
     ORDER BY source_timestamp_us DESC LIMIT $5`,
    [gatewayId, rackId, slotId, channelId, limit],
  );
  return res.rows.reverse().map((r: HistoryRow) => ({ value: r.value, sourceTimestampUs: String(r.source_timestamp_us) }));
}
