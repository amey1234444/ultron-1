// Live gateway/rack state from the MQTT ingestion pipeline (/api/live/state).
// A studio device is "live" when its permanent Script ID maps to a bound
// gateway. The displayed IP follows the gateway's current_ip so an accepted
// gateway IP change is visible immediately.

import { ipPrefixFor, type DeviceNode } from './devices';
import type { CardNode } from './rack';

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

export type LiveRack = {
  gatewayId: string;
  rackId: number;
  status: string;
  lastSeenAt: string | null;
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

export const EMPTY_LIVE_STATE: LiveState = { gateways: [], racks: [], slots: [], measurements: [], alerts: [] };

export type ChannelLiveStatus = 'active' | 'stale' | 'idle';

const ACTIVE_MEASUREMENT_MAX_AGE_MS = 15_000;

function configuredRackForDevice(device: DeviceNode, live: LiveState): LiveRack | undefined {
  const gateway = gatewayForDevice(device, live);
  if (!gateway) return undefined;
  const rackId = device.realRackId;
  if (!Number.isInteger(rackId)) return undefined;
  return live.racks.find((r) => r.gatewayId === gateway.gatewayId && r.rackId === rackId);
}

function configuredRackIdForDevice(device: DeviceNode, live: LiveState): number | undefined {
  return configuredRackForDevice(device, live)?.rackId;
}

export function gatewayForDevice(device: DeviceNode, live: LiveState): LiveGateway | undefined {
  const ip = device.ip.trim();
  if (!ip) return undefined;
  if (device.realGatewayId) {
    const byId = live.gateways.find((g) => g.gatewayId === device.realGatewayId);
    if (byId) return byId;
  }
  const prefix = ipPrefixFor(ip);
  if (device.type === 'Gateway' && prefix) {
    return live.gateways.find((g) => g.currentIp === ip || ipPrefixFor(g.currentIp) === prefix);
  }
  if (device.type === 'Rack' && prefix) {
    return live.gateways.find((g) => ipPrefixFor(g.currentIp) === prefix);
  }
  return live.gateways.find((g) => g.currentIp === ip);
}

export function isDeviceLive(device: DeviceNode, live: LiveState): boolean {
  const gateway = gatewayForDevice(device, live);
  if (device.type === 'Rack') {
    const rack = configuredRackForDevice(device, live);
    if (!rack || rack.status !== 'ONLINE') return false;
  }
  return gateway?.status === 'ONLINE';
}

// Overlays real connectivity onto the stored devices: a device whose IP is
// bound to an ONLINE gateway reads Online; one bound to an OFFLINE gateway
// reads Not Connected; devices with no binding keep their stored status.
export function applyLiveStatus(devices: DeviceNode[], live: LiveState): DeviceNode[] {
  if (live.gateways.length === 0) return devices;
  return devices.map((device) => {
    const gateway = gatewayForDevice(device, live);
    const liveIp = device.type === 'Gateway' && gateway?.currentIp ? gateway.currentIp : device.ip;
    if (!gateway) return { ...device, status: 'Not Connected' };
    const rack = device.type === 'Rack' ? configuredRackForDevice(device, live) : undefined;
    if (device.type === 'Rack' && (!rack || rack.status !== 'ONLINE')) {
      return device.status === 'Not Connected' && device.ip === liveIp ? device : { ...device, ip: liveIp, status: 'Not Connected' };
    }
    const status = gateway.status === 'ONLINE' ? 'Online' : 'Not Connected';
    return device.status === status && device.ip === liveIp ? device : { ...device, ip: liveIp, status };
  });
}

export function measurementsForDevice(device: DeviceNode, live: LiveState): LiveMeasurement[] {
  const gateway = gatewayForDevice(device, live);
  if (!gateway) return [];
  return live.measurements.filter((m) => m.gatewayId === gateway.gatewayId);
}

export function rackIdsForDevice(device: DeviceNode, live: LiveState): number[] {
  const gateway = gatewayForDevice(device, live);
  if (!gateway) return [];
  const configuredRackId = configuredRackIdForDevice(device, live);
  if (configuredRackId !== undefined) return [configuredRackId];
  const ids = live.racks.filter((r) => r.gatewayId === gateway.gatewayId).map((r) => r.rackId);
  if (ids.length > 0) return ids;
  return Array.from(new Set(live.measurements.filter((m) => m.gatewayId === gateway.gatewayId).map((m) => m.rackId)));
}

export function latestMeasurementForChannel(device: DeviceNode, card: CardNode, channelId: number, live: LiveState): LiveMeasurement | undefined {
  const gateway = gatewayForDevice(device, live);
  if (!gateway) return undefined;
  const rackIds = rackIdsForDevice(device, live);
  const candidates = live.measurements.filter(
    (m) =>
      m.gatewayId === gateway.gatewayId &&
      m.slotId === card.slot &&
      m.channelId === channelId &&
      (rackIds.length === 0 || rackIds.includes(m.rackId)),
  );
  return candidates.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

export function channelLiveStatus(device: DeviceNode, card: CardNode, channelId: number, live: LiveState): ChannelLiveStatus {
  if (!card.enabled) return 'idle';
  const gateway = gatewayForDevice(device, live);
  if (!gateway) return 'idle';
  if (gateway.status !== 'ONLINE') return 'stale';

  if ('controllerName' in card.config) {
    const slot = live.slots.find((s) => s.gatewayId === gateway.gatewayId && s.slotId === card.slot);
    if (!slot) return 'idle';
    return slot.onlineState === 'ONLINE' || slot.presence === 'PRESENT' ? 'active' : 'stale';
  }

  const measurement = latestMeasurementForChannel(device, card, channelId, live);
  if (!measurement) return 'idle';
  const ageMs = Date.now() - Date.parse(measurement.updatedAt);
  if (measurement.quality && measurement.quality !== 'GOOD') return 'stale';
  return ageMs <= ACTIVE_MEASUREMENT_MAX_AGE_MS ? 'active' : 'stale';
}

export function lastSeenLabel(gateway: LiveGateway | undefined): string {
  if (!gateway?.lastSeenAt) return '—';
  const ageMs = Date.now() - Date.parse(gateway.lastSeenAt);
  if (ageMs < 5_000) return 'Just now';
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s ago`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m ago`;
  return new Date(gateway.lastSeenAt).toLocaleString();
}
