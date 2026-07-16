// Live gateway/rack state from the MQTT ingestion pipeline (/api/live/state).
// A studio device is "live" when its configured IP matches a bound gateway's
// current_ip and that gateway is ONLINE (permanent identity stays
// gateway_id + rack_id on the backend; the IP is the binding field here).

import type { DeviceNode } from './devices';

export type LiveGateway = {
  gatewayId: string;
  currentIp: string;
  status: string;
  lastSeenAt: string | null;
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

export type LiveSlot = {
  gatewayId: string;
  rackId: number;
  slotId: number;
  presence: string;
  onlineState: string;
  cardType: string | null;
};

export type LiveState = {
  gateways: LiveGateway[];
  racks: { gatewayId: string; rackId: number }[];
  slots: LiveSlot[];
  measurements: LiveMeasurement[];
};

export const EMPTY_LIVE_STATE: LiveState = { gateways: [], racks: [], slots: [], measurements: [] };

export function gatewayForDevice(device: DeviceNode, live: LiveState): LiveGateway | undefined {
  const ip = device.ip.trim();
  if (!ip) return undefined;
  return live.gateways.find((g) => g.currentIp === ip);
}

export function isDeviceLive(device: DeviceNode, live: LiveState): boolean {
  const gateway = gatewayForDevice(device, live);
  return gateway?.status === 'ONLINE';
}

// Overlays real connectivity onto the stored devices: a device whose IP is
// bound to an ONLINE gateway reads Online; one bound to an OFFLINE gateway
// reads Not Connected; devices with no binding keep their stored status.
export function applyLiveStatus(devices: DeviceNode[], live: LiveState): DeviceNode[] {
  if (live.gateways.length === 0) return devices;
  return devices.map((device) => {
    const gateway = gatewayForDevice(device, live);
    if (!gateway) return device;
    const status = gateway.status === 'ONLINE' ? 'Online' : 'Not Connected';
    return device.status === status ? device : { ...device, status };
  });
}

export function measurementsForDevice(device: DeviceNode, live: LiveState): LiveMeasurement[] {
  const gateway = gatewayForDevice(device, live);
  if (!gateway) return [];
  return live.measurements.filter((m) => m.gatewayId === gateway.gatewayId);
}

export function lastSeenLabel(gateway: LiveGateway | undefined): string {
  if (!gateway?.lastSeenAt) return '—';
  const ageMs = Date.now() - Date.parse(gateway.lastSeenAt);
  if (ageMs < 5_000) return 'Just now';
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s ago`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m ago`;
  return new Date(gateway.lastSeenAt).toLocaleString();
}
