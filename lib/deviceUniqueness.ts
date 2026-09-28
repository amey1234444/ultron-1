import type { DeviceNode } from './devices';

type UniqueDeviceType = Extract<DeviceNode['type'], 'Gateway' | 'Rack'>;

export type DeviceNameConflict = {
  name: string;
  type: UniqueDeviceType;
  device: DeviceNode;
};

export type DeviceIpConflict = {
  ip: string;
  device: DeviceNode;
};

function isUniqueNameDevice(device: DeviceNode): device is DeviceNode & { type: UniqueDeviceType } {
  return !device.archived && (device.type === 'Gateway' || device.type === 'Rack');
}

/**
 * Tolerant of a missing name on purpose.
 *
 * Every caller here runs over devices read back from storage, including rows
 * written by a build that predates a field. A device short of one is a device
 * with nothing to compare, not a reason to throw — and throwing happens
 * during load, which takes the whole asset hierarchy down with it.
 */
export function normalizeDeviceNameForUniqueness(name: string): string {
  if (typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** See `normalizeDeviceNameForUniqueness` — same reasoning. */
function configuredIp(device: Pick<DeviceNode, 'ip'>): string {
  return typeof device.ip === 'string' ? device.ip.trim() : '';
}

export function findDuplicateConfiguredDeviceName(devices: DeviceNode[]): DeviceNameConflict | null {
  const byName = new Map<string, DeviceNode>();
  for (const device of devices) {
    if (!isUniqueNameDevice(device)) continue;
    const normalizedName = normalizeDeviceNameForUniqueness(device.name);
    if (!normalizedName) continue;
    const key = `${device.type}:${normalizedName}`;
    const existing = byName.get(key);
    if (existing && existing.id !== device.id) {
      return {
        name: device.name.trim(),
        type: device.type,
        device: existing,
      };
    }
    byName.set(key, device);
  }
  return null;
}

export function findDuplicateNameForDevice(devices: DeviceNode[], device: Pick<DeviceNode, 'id' | 'name' | 'type' | 'archived'>): DeviceNameConflict | null {
  if (device.archived || (device.type !== 'Gateway' && device.type !== 'Rack')) return null;
  const normalizedName = normalizeDeviceNameForUniqueness(device.name);
  if (!normalizedName) return null;
  const match = devices.find(
    (candidate) =>
      isUniqueNameDevice(candidate) &&
      candidate.id !== device.id &&
      candidate.type === device.type &&
      normalizeDeviceNameForUniqueness(candidate.name) === normalizedName,
  );
  return match
    ? {
        name: device.name.trim(),
        type: device.type,
        device: match,
      }
    : null;
}

export function archiveDuplicateConfiguredDeviceNames(devices: DeviceNode[]): { devices: DeviceNode[]; changed: boolean; archivedIds: Set<string> } {
  return archiveDuplicateConfiguredDevicesBy(devices, (device) => {
    const normalizedName = normalizeDeviceNameForUniqueness(device.name);
    return normalizedName ? `${device.type}:${normalizedName}` : '';
  });
}

export function findDuplicateConfiguredDeviceIp(devices: DeviceNode[]): DeviceIpConflict | null {
  const byIp = new Map<string, DeviceNode>();
  for (const device of devices) {
    if (!isUniqueNameDevice(device)) continue;
    const ip = configuredIp(device);
    if (!ip) continue;
    const existing = byIp.get(ip);
    if (existing && existing.id !== device.id) return { ip, device: existing };
    byIp.set(ip, device);
  }
  return null;
}

export function archiveDuplicateConfiguredDeviceIps(devices: DeviceNode[]): { devices: DeviceNode[]; changed: boolean; archivedIds: Set<string> } {
  return archiveDuplicateConfiguredDevicesBy(devices, (device) => configuredIp(device));
}

function archiveDuplicateConfiguredDevicesBy(
  devices: DeviceNode[],
  keyFor: (device: DeviceNode & { type: UniqueDeviceType }) => string,
): { devices: DeviceNode[]; changed: boolean; archivedIds: Set<string> } {
  const indexById = new Map(devices.map((device, index) => [device.id, index]));
  const childCountByGateway = new Map<string, number>();
  for (const device of devices) {
    if (device.archived || device.type !== 'Rack' || !device.gatewayId) continue;
    childCountByGateway.set(device.gatewayId, (childCountByGateway.get(device.gatewayId) ?? 0) + 1);
  }

  const winnerByName = new Map<string, DeviceNode>();
  const archivedIds = new Set<string>();
  const score = (device: DeviceNode) => {
    const hasIp = configuredIp(device) ? 1000 : 0;
    const children = device.type === 'Gateway' ? (childCountByGateway.get(device.id) ?? 0) * 10 : 0;
    const online = device.status === 'Online' ? 1 : 0;
    const originalIndex = indexById.get(device.id) ?? 0;
    return hasIp + children + online - originalIndex / 100000;
  };

  for (const device of devices) {
    if (!isUniqueNameDevice(device)) continue;
    const key = keyFor(device);
    if (!key) continue;
    const winner = winnerByName.get(key);
    if (!winner) {
      winnerByName.set(key, device);
      continue;
    }
    if (score(device) > score(winner)) {
      archivedIds.add(winner.id);
      winnerByName.set(key, device);
    } else {
      archivedIds.add(device.id);
    }
  }

  if (archivedIds.size === 0) return { devices, changed: false, archivedIds };
  return {
    devices: devices.map((device) => (archivedIds.has(device.id) ? { ...device, archived: true } : device)),
    changed: true,
    archivedIds,
  };
}
