// Live gateway/rack state from the MQTT ingestion pipeline (/api/live/state).
// A studio device is "live" when its permanent Script ID maps to a bound
// gateway. The displayed IP follows the gateway's current_ip so an accepted
// gateway IP change is visible immediately. A gateway that reports an IP that
// is already configured on another gateway/rack is an invalid request: the
// ingest layer quarantines it and raises an IP_CONFLICT alert, and neither the
// offending gateway nor the device that owns the IP ever reads as connected.

import { ipPrefixFor, totalChannelsFor, type DeviceNode } from './devices';
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

export const EMPTY_LIVE_STATE: LiveState = { gateways: [], racks: [], slots: [], measurements: [], alerts: [] };

export type ChannelLiveStatus = 'active' | 'stale' | 'idle';

const ACTIVE_MEASUREMENT_MAX_AGE_MS = 15_000;
type LiveIndex = {
  gatewayById: Map<string, LiveGateway>;
  gatewayByIp: Map<string, LiveGateway>;
  gatewayByPrefix: Map<string, LiveGateway>;
  rackByGatewayRack: Map<string, LiveRack>;
  rackIdsByGateway: Map<string, number[]>;
  measurementRackIdsByGateway: Map<string, number[]>;
  slotByGatewaySlot: Map<string, LiveSlot>;
  measurementsByGateway: Map<string, LiveMeasurement[]>;
  measurementsByGatewayRack: Map<string, LiveMeasurement[]>;
  latestMeasurementByPoint: Map<string, LiveMeasurement>;
};

const liveIndexCache = new WeakMap<LiveState, LiveIndex>();

function pairKey(a: string, b: number): string {
  return `${a}|${b}`;
}

function pointKey(gatewayId: string, rackId: number, slotId: number, channelId: number): string {
  return `${gatewayId}|${rackId}|${slotId}|${channelId}`;
}

function pushMap<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const current = map.get(key);
  if (current) current.push(value);
  else map.set(key, [value]);
}

function firstSet<K, V>(map: Map<K, V>, key: K, value: V) {
  if (!map.has(key)) map.set(key, value);
}

function liveIndex(live: LiveState): LiveIndex {
  const cached = liveIndexCache.get(live);
  if (cached) return cached;

  const index: LiveIndex = {
    gatewayById: new Map(),
    gatewayByIp: new Map(),
    gatewayByPrefix: new Map(),
    rackByGatewayRack: new Map(),
    rackIdsByGateway: new Map(),
    measurementRackIdsByGateway: new Map(),
    slotByGatewaySlot: new Map(),
    measurementsByGateway: new Map(),
    measurementsByGatewayRack: new Map(),
    latestMeasurementByPoint: new Map(),
  };

  for (const gateway of live.gateways) {
    index.gatewayById.set(gateway.gatewayId, gateway);
    const ip = gateway.currentIp.trim();
    if (ip) {
      firstSet(index.gatewayByIp, ip, gateway);
      const prefix = ipPrefixFor(ip);
      if (prefix) firstSet(index.gatewayByPrefix, prefix, gateway);
    }
  }

  for (const rack of live.racks) {
    index.rackByGatewayRack.set(pairKey(rack.gatewayId, rack.rackId), rack);
    pushMap(index.rackIdsByGateway, rack.gatewayId, rack.rackId);
  }

  for (const slot of live.slots) {
    index.slotByGatewaySlot.set(`${slot.gatewayId}|${slot.slotId}`, slot);
  }

  for (const measurement of live.measurements) {
    pushMap(index.measurementsByGateway, measurement.gatewayId, measurement);
    pushMap(index.measurementsByGatewayRack, pairKey(measurement.gatewayId, measurement.rackId), measurement);
    pushMap(index.measurementRackIdsByGateway, measurement.gatewayId, measurement.rackId);
    const key = pointKey(measurement.gatewayId, measurement.rackId, measurement.slotId, measurement.channelId);
    const current = index.latestMeasurementByPoint.get(key);
    if (!current || Date.parse(measurement.updatedAt) > Date.parse(current.updatedAt)) {
      index.latestMeasurementByPoint.set(key, measurement);
    }
  }

  for (const [gatewayId, ids] of index.rackIdsByGateway) {
    index.rackIdsByGateway.set(gatewayId, Array.from(new Set(ids)));
  }
  for (const [gatewayId, ids] of index.measurementRackIdsByGateway) {
    index.measurementRackIdsByGateway.set(gatewayId, Array.from(new Set(ids)));
  }

  liveIndexCache.set(live, index);
  return index;
}

function configuredRackForDevice(device: DeviceNode, live: LiveState): LiveRack | undefined {
  const gateway = gatewayForDevice(device, live);
  if (!gatewayCanShowData(gateway)) return undefined;
  const rackId = device.realRackId;
  if (typeof rackId !== 'number' || !Number.isInteger(rackId)) return undefined;
  return liveIndex(live).rackByGatewayRack.get(pairKey(gateway.gatewayId, rackId));
}

function configuredRackIdForDevice(device: DeviceNode, live: LiveState): number | undefined {
  return configuredRackForDevice(device, live)?.rackId;
}

function reportedGatewayIpForDevice(device: DeviceNode, live: LiveState): string {
  if (device.type === 'Gateway' && device.realGatewayId) {
    return liveIndex(live).gatewayById.get(device.realGatewayId)?.currentIp.trim() || device.ip.trim();
  }
  return device.ip.trim();
}

function duplicateConfiguredIpDeviceIds(devices: DeviceNode[], live: LiveState): Set<string> {
  const byIp = new Map<string, string[]>();
  for (const device of devices) {
    if (device.archived || (device.type !== 'Gateway' && device.type !== 'Rack')) continue;
    const ip = reportedGatewayIpForDevice(device, live);
    if (!ip) continue;
    byIp.set(ip, [...(byIp.get(ip) ?? []), device.id]);
  }

  const duplicates = new Set<string>();
  for (const ids of byIp.values()) {
    if (ids.length < 2) continue;
    ids.forEach((id) => duplicates.add(id));
  }
  return duplicates;
}

function unconfiguredGatewayScope(devices: DeviceNode[]): { deviceIds: Set<string>; realGatewayIds: Set<string> } {
  const deviceIds = new Set<string>();
  const realGatewayIds = new Set<string>();
  for (const device of devices) {
    if (device.archived || device.type !== 'Gateway') continue;
    if (device.ip.trim()) continue;
    deviceIds.add(device.id);
    if (device.realGatewayId) realGatewayIds.add(device.realGatewayId);
  }
  return { deviceIds, realGatewayIds };
}

function isUnderUnconfiguredGateway(
  device: DeviceNode,
  scope: { deviceIds: Set<string>; realGatewayIds: Set<string> },
): boolean {
  if (device.type === 'Gateway') {
    return scope.deviceIds.has(device.id) || (!!device.realGatewayId && scope.realGatewayIds.has(device.realGatewayId));
  }
  if (device.type !== 'Rack') return false;
  if (device.gatewayId && scope.deviceIds.has(device.gatewayId)) return true;
  return !!device.realGatewayId && scope.realGatewayIds.has(device.realGatewayId);
}

export function gatewayForDevice(device: DeviceNode, live: LiveState): LiveGateway | undefined {
  const ip = device.ip.trim();
  if (!ip) return undefined;
  const index = liveIndex(live);
  if (device.realGatewayId) {
    const byId = index.gatewayById.get(device.realGatewayId);
    if (byId) return byId;
  }
  const prefix = ipPrefixFor(ip);
  if (device.type === 'Gateway' && prefix) {
    return index.gatewayByIp.get(ip) ?? index.gatewayByPrefix.get(prefix);
  }
  if (device.type === 'Rack' && prefix) {
    return index.gatewayByPrefix.get(prefix);
  }
  return index.gatewayByIp.get(ip);
}

export function isDeviceLive(device: DeviceNode, live: LiveState): boolean {
  const gateway = gatewayForDevice(device, live);
  if (device.type === 'Rack') {
    const rack = configuredRackForDevice(device, live);
    if (!rack || rack.status !== 'ONLINE') return false;
  }
  return gateway?.status === 'ONLINE';
}

function conflictScope(live: LiveState): { ips: Set<string>; gatewayIds: Set<string> } {
  const ips = new Set<string>();
  const gatewayIds = new Set<string>();
  for (const alert of live.alerts) {
    if (alert.type !== 'IP_CONFLICT') continue;
    const ip = alert.gatewayIp.trim();
    if (ip) ips.add(ip);
    if (alert.gatewayId) gatewayIds.add(alert.gatewayId);
  }
  return { ips, gatewayIds };
}

// The offending gateway (matched by its script id) and every device that owns
// the contested IP are invalid while the conflict stands — force Not Connected.
function isConflicted(device: DeviceNode, scope: { ips: Set<string>; gatewayIds: Set<string> }): boolean {
  if (device.type === 'Gateway' && device.realGatewayId && scope.gatewayIds.has(device.realGatewayId)) return true;
  const ip = device.ip.trim();
  return !!ip && scope.ips.has(ip);
}

function gatewayCanShowData(gateway: LiveGateway | undefined): gateway is LiveGateway {
  return !!gateway && gateway.status === 'ONLINE' && !!gateway.currentIp.trim();
}

// Overlays real connectivity onto the stored devices: a device whose IP is
// bound to an ONLINE gateway reads Online; one bound to an OFFLINE gateway
// reads Not Connected; devices with no binding keep their stored status.
// Devices involved in an IP_CONFLICT are forced to Not Connected.
export function applyLiveStatus(devices: DeviceNode[], live: LiveState): DeviceNode[] {
  const scope = conflictScope(live);
  const hasConflicts = scope.ips.size > 0 || scope.gatewayIds.size > 0;
  const duplicateIpIds = duplicateConfiguredIpDeviceIds(devices, live);
  const unconfiguredScope = unconfiguredGatewayScope(devices);
  const hasUnconfiguredGateways = unconfiguredScope.deviceIds.size > 0 || unconfiguredScope.realGatewayIds.size > 0;
  if (live.gateways.length === 0 && !hasConflicts && duplicateIpIds.size === 0 && !hasUnconfiguredGateways) return devices;
  return devices.map((device) => {
    const gateway = gatewayForDevice(device, live);
    const liveIp = device.type === 'Gateway' && gateway?.currentIp && gateway.status !== 'QUARANTINED' ? gateway.currentIp : device.ip;
    if (isUnderUnconfiguredGateway(device, unconfiguredScope)) {
      const displayIp = device.type === 'Gateway' ? '' : device.ip;
      return device.status === 'Not Connected' && device.ip === displayIp ? device : { ...device, ip: displayIp, status: 'Not Connected' };
    }
    if (device.type === 'Gateway' && !device.ip.trim()) {
      return device.status === 'Not Connected' ? device : { ...device, status: 'Not Connected' };
    }
    if ((device.type === 'Gateway' || device.type === 'Rack') && isConflicted(device, scope)) {
      return device.status === 'Not Connected' ? device : { ...device, status: 'Not Connected' };
    }
    if (duplicateIpIds.has(device.id)) {
      const displayIp = device.type === 'Gateway' ? '' : device.ip;
      return device.status === 'Not Connected' && device.ip === displayIp ? device : { ...device, ip: displayIp, status: 'Not Connected' };
    }
    if (!gateway) return { ...device, status: 'Not Connected' };
    if (gateway.status !== 'ONLINE' || !gateway.currentIp.trim()) {
      return device.status === 'Not Connected' && device.ip === liveIp ? device : { ...device, ip: liveIp, status: 'Not Connected' };
    }
    const rack = device.type === 'Rack' ? configuredRackForDevice(device, live) : undefined;
    if (device.type === 'Rack' && (!rack || rack.status !== 'ONLINE')) {
      return device.status === 'Not Connected' && device.ip === liveIp ? device : { ...device, ip: liveIp, status: 'Not Connected' };
    }
    const status = gateway.status === 'ONLINE' ? 'Online' : 'Not Connected';
    return device.status === status && device.ip === liveIp ? device : { ...device, ip: liveIp, status };
  });
}

export function measurementsForDevice(device: DeviceNode, live: LiveState): LiveMeasurement[] {
  if (device.type === 'Rack' && device.status !== 'Online') return [];
  const gateway = gatewayForDevice(device, live);
  if (!gatewayCanShowData(gateway)) return [];
  return liveIndex(live).measurementsByGateway.get(gateway.gatewayId) ?? [];
}

export function activeChannelsForDevice(device: DeviceNode, live: LiveState): { active: number; total: number } {
  const total = totalChannelsFor(device.type);
  if (device.type !== 'Rack') return { active: 0, total };
  if (device.status !== 'Online') return { active: 0, total };
  const gateway = gatewayForDevice(device, live);
  if (!gatewayCanShowData(gateway)) return { active: 0, total };
  const rack = configuredRackForDevice(device, live);
  if (!gateway || !rack || rack.status !== 'ONLINE') return { active: 0, total };
  const now = Date.now();
  const activeKeys = new Set<string>();
  for (const measurement of liveIndex(live).measurementsByGatewayRack.get(pairKey(gateway.gatewayId, rack.rackId)) ?? []) {
    if (measurement.quality && measurement.quality !== 'GOOD') continue;
    if (now - Date.parse(measurement.updatedAt) > ACTIVE_MEASUREMENT_MAX_AGE_MS) continue;
    activeKeys.add(`${measurement.slotId}.${measurement.channelId}`);
  }
  return { active: Math.min(activeKeys.size, total), total };
}

export function rackIdsForDevice(device: DeviceNode, live: LiveState): number[] {
  const gateway = gatewayForDevice(device, live);
  if (!gatewayCanShowData(gateway)) return [];
  const configuredRackId = configuredRackIdForDevice(device, live);
  if (configuredRackId !== undefined) return [configuredRackId];
  const index = liveIndex(live);
  const ids = index.rackIdsByGateway.get(gateway.gatewayId) ?? [];
  if (ids.length > 0) return ids;
  return index.measurementRackIdsByGateway.get(gateway.gatewayId) ?? [];
}

export function latestMeasurementForChannel(device: DeviceNode, card: CardNode, channelId: number, live: LiveState): LiveMeasurement | undefined {
  if (device.status !== 'Online') return undefined;
  const gateway = gatewayForDevice(device, live);
  if (!gatewayCanShowData(gateway)) return undefined;
  const rackIds = rackIdsForDevice(device, live);
  const index = liveIndex(live);
  if (rackIds.length > 0) {
    let latest: LiveMeasurement | undefined;
    for (const rackId of rackIds) {
      const candidate = index.latestMeasurementByPoint.get(pointKey(gateway.gatewayId, rackId, card.slot, channelId));
      if (candidate && (!latest || Date.parse(candidate.updatedAt) > Date.parse(latest.updatedAt))) latest = candidate;
    }
    return latest;
  }
  let latest: LiveMeasurement | undefined;
  for (const measurement of index.measurementsByGateway.get(gateway.gatewayId) ?? []) {
    if (measurement.slotId !== card.slot || measurement.channelId !== channelId) continue;
    if (!latest || Date.parse(measurement.updatedAt) > Date.parse(latest.updatedAt)) latest = measurement;
  }
  return latest;
}

export function channelLiveStatus(device: DeviceNode, card: CardNode, channelId: number, live: LiveState): ChannelLiveStatus {
  if (!card.enabled) return 'idle';
  if (device.status !== 'Online') return 'stale';
  const gateway = gatewayForDevice(device, live);
  if (!gatewayCanShowData(gateway)) return 'stale';

  if ('controllerName' in card.config) {
    const slot = liveIndex(live).slotByGatewaySlot.get(`${gateway.gatewayId}|${card.slot}`);
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
