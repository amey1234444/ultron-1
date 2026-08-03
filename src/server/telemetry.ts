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
  rackId: string;
  status: string;
  lastSeenAt: string | null;
  dataCurrent: boolean;
  connectionReason: string | null;
};

export type LiveSlot = {
  gatewayId: string;
  rackId: string;
  slotId: number;
  presence: string;
  onlineState: string;
  cardType: string | null;
};

export type LiveMeasurement = {
  gatewayId: string;
  rackId: string;
  slotId: number;
  channelId: number;
  measurementType: string;
  value: number | null;
  valueDisplay: string | null;
  valueWithUnit: string | null;
  measurementValid: boolean;
  unit: string;
  quality: string;
  updatedAt: string;
  cardType: string | null;
  sensor: string | null;
  freshness: string;
  channelStatus: string | null;
  alertThreshold: number | null;
  dangerThreshold: number | null;
  alertState: string;
  dangerState: string;
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

type GatewayRow = { gateway_id: string; current_ip: string; status: string; mqtt_state: string; last_seen_at: Date | null; known_racks: number; connected_racks: number; stale_racks: number; disconnected_racks: number };
type RackRow = { gateway_id: string; rack_id: string; status: string; data_current: boolean; connection_reason: string | null; last_seen_at: Date | null; active: boolean };
type SlotRow = { gateway_id: string; rack_id: string; slot_number: number; presence: string; online_state: string; card_type: string | null };
type MeasurementRow = {
  gateway_id: string;
  rack_id: string;
  slot_id: number;
  channel_id: number;
  measurement_type: string;
  value: number | null;
  value_display: string | null;
  value_with_unit: string | null;
  measurement_valid: boolean;
  unit: string | null;
  updated_at: Date;
  card_type: string | null;
  sensor: string | null;
  freshness: string | null;
  channel_status: string | null;
  alert_threshold: number | null;
  danger_threshold: number | null;
  alert_state: string | null;
  danger_state: string | null;
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
type BlockedBindingRow = Omit<AlertRow, 'id' | 'received_at'>;
type UnconfiguredGatewayRow = { gateway_id: string };

const GATEWAY_STATUS_STALE_AFTER_S = 15;

export async function getLiveState(options: { includeConflictDeviceDetails?: boolean } = {}): Promise<LiveState> {
  await ensureSchema();

  const [gateways, racks, slots, measurements, alerts, blockedBindings, unconfiguredGateways] = await Promise.all([
    query<GatewayRow>(
      `SELECT gateway_id, current_ip, status, mqtt_state, last_seen_at,
              known_racks, connected_racks, stale_racks, disconnected_racks
       FROM gateways ORDER BY gateway_id`,
    ),
    query<RackRow>(
      `SELECT gateway_id, rack_id, status, data_current, connection_reason, last_seen_at, active
       FROM racks
       WHERE active = true
       ORDER BY gateway_id, rack_id`,
    ),
    query<SlotRow>(
      `SELECT gateway_id, rack_id, slot_number, presence, online_state, card_type
       FROM rack_inventory_slots ORDER BY gateway_id, rack_id, slot_number`,
    ),
    query<MeasurementRow>(
      `SELECT gateway_id, rack_id, slot_id, channel_id, measurement_type,
              value, NULL::text AS value_display,
              CASE WHEN unit <> '' THEN concat(value::text, ' ', unit) ELSE value::text END AS value_with_unit,
              quality = 'GOOD' AS measurement_valid, unit, updated_at,
              card_type, sensor, freshness, channel_status, alert_threshold, danger_threshold,
              alert_state, danger_state
       FROM measurement_latest
       WHERE updated_at > now() - interval '20 seconds'
       ORDER BY gateway_id, rack_id, slot_id, channel_id`,
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
      [GATEWAY_STATUS_STALE_AFTER_S * 4],
    ),
    query<BlockedBindingRow>(
      `SELECT DISTINCT g.gateway_id,
              g.current_ip AS gateway_ip,
              gateway.name AS gateway_name,
              conflict.id AS conflict_device_id,
              conflict.name AS conflict_device_name,
              conflict.type AS conflict_device_type
       FROM gateways g
       JOIN studio_devices gateway
         ON gateway.type = 'Gateway'
        AND gateway.archived = false
        AND gateway.real_gateway_id = g.gateway_id
       JOIN studio_devices conflict
         ON conflict.archived = false
        AND conflict.type IN ('Gateway', 'Rack')
        AND conflict.ip = g.current_ip
        AND conflict.id <> gateway.id
       WHERE g.current_ip <> ''`,
    ),
    query<UnconfiguredGatewayRow>(
      `SELECT real_gateway_id AS gateway_id
       FROM studio_devices
       WHERE type = 'Gateway'
         AND archived = false
         AND real_gateway_id IS NOT NULL
         AND btrim(ip) = ''`,
    ),
  ]);

  const alertKey = (gatewayId: string, gatewayIp: string) => `${gatewayId}:${gatewayIp}`;
  const alertKeys = new Set(alerts.rows.map((a: AlertRow) => alertKey(a.gateway_id, a.gateway_ip)));
  const syntheticAlerts: AlertRow[] = blockedBindings.rows
    .filter((binding: BlockedBindingRow) => !alertKeys.has(alertKey(binding.gateway_id, binding.gateway_ip)))
    .map((binding: BlockedBindingRow, index: number) => ({
      id: -(index + 1),
      received_at: new Date(),
      ...binding,
    }));
  const allAlerts = [...alerts.rows, ...syntheticAlerts];
  const blockedGatewayIds = new Set<string>([
    ...gateways.rows.filter((g: GatewayRow) => g.status === 'QUARANTINED').map((g: GatewayRow) => g.gateway_id),
    ...unconfiguredGateways.rows.map((g: UnconfiguredGatewayRow) => g.gateway_id),
    ...allAlerts.map((a: AlertRow) => a.gateway_id),
  ]);
  const onlineRackGatewayIds = new Set(
    racks.rows
      .filter((r: RackRow) => r.active && r.status === 'connected' && r.data_current)
      .map((r: RackRow) => r.gateway_id),
  );
  return {
    gateways: gateways.rows.map((g: GatewayRow) => ({
      gatewayId: g.gateway_id,
      currentIp: g.current_ip,
      status:
        blockedGatewayIds.has(g.gateway_id)
          ? 'QUARANTINED'
          : g.status === 'OFFLINE'
            ? 'OFFLINE'
            : onlineRackGatewayIds.has(g.gateway_id)
              ? g.status
              : 'OFFLINE',
      lastSeenAt: g.last_seen_at ? g.last_seen_at.toISOString() : null,
    })),
    racks: racks.rows.filter((r: RackRow) => !blockedGatewayIds.has(r.gateway_id)).map((r: RackRow) => ({
      gatewayId: r.gateway_id,
      rackId: r.rack_id,
      status: r.status === 'connected' && r.data_current ? 'ONLINE' : r.status.toUpperCase(),
      lastSeenAt: r.last_seen_at ? r.last_seen_at.toISOString() : null,
      dataCurrent: r.data_current,
      connectionReason: r.connection_reason,
    })),
    slots: slots.rows.filter((s: SlotRow) => !blockedGatewayIds.has(s.gateway_id)).map((s: SlotRow) => ({
      gatewayId: s.gateway_id,
      rackId: s.rack_id,
      slotId: s.slot_number,
      presence: s.presence,
      onlineState: s.online_state,
      cardType: s.card_type,
    })),
    measurements: measurements.rows.filter((m: MeasurementRow) => !blockedGatewayIds.has(m.gateway_id)).map((m: MeasurementRow) => ({
      gatewayId: m.gateway_id,
      rackId: m.rack_id,
      slotId: m.slot_id,
      channelId: m.channel_id,
      measurementType: m.measurement_type,
      value: m.value,
      valueDisplay: m.value_display,
      valueWithUnit: m.value_with_unit,
      measurementValid: m.measurement_valid,
      unit: m.unit ?? '',
      quality: m.measurement_valid ? 'GOOD' : 'BAD',
      updatedAt: m.updated_at.toISOString(),
      cardType: m.card_type,
      sensor: m.sensor,
      freshness: m.freshness ?? 'FRESH',
      channelStatus: m.channel_status,
      alertThreshold: m.alert_threshold,
      dangerThreshold: m.danger_threshold,
      alertState: m.alert_state ?? 'INACTIVE',
      dangerState: m.danger_state ?? 'INACTIVE',
    })),
    alerts: allAlerts.map((a: AlertRow) => ({
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
  rackId: string | number,
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
