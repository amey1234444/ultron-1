export const DEVICE_TYPES = ['Gateway', 'Rack'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const PROTOCOLS = ['Modbus TCP', 'Modbus RTU', 'OPC UA', 'EtherNet/IP'] as const;
export type Protocol = (typeof PROTOCOLS)[number];

export type ConnectionStatus = 'Online' | 'Not Connected';

export type DeviceNode = {
  id: string;
  name: string;
  type: DeviceType;
  model: string;
  ip: string;
  port: string;
  protocol: Protocol;
  description: string;
  status: ConnectionStatus;
  projectId: string | null;
  archived: boolean;
};

export function defaultModelFor(type: DeviceType): string {
  return type === 'Gateway' ? 'GW-100' : 'RACK-12-R';
}

// Rack channel capacity is fixed by spec §6.1 (12 acquisition slots + 2 controller
// slots); Gateways don't expose channels of their own.
export function totalChannelsFor(type: DeviceType): number {
  return type === 'Rack' ? 24 : 0;
}

// No channel mapping exists yet (spec §9, a later step) — always 0 for now.
export function mappedChannelsFor(_device: DeviceNode): number {
  return 0;
}

export function lastCommunicationLabel(device: DeviceNode): string {
  return device.status === 'Online' ? 'Just now' : '—';
}

// Ribbon/edge-indicator semantics: healthy stays neutral (no color to celebrate,
// matching the app-wide "color = status only" rule); disconnected reads as red,
// same as critical, since a device that can't be reached needs attention.
export type DeviceHealth = 'normal' | 'warning' | 'critical' | 'disconnected';

export function healthFor(device: DeviceNode): DeviceHealth {
  return device.status === 'Online' ? 'normal' : 'disconnected';
}

export function isValidIp(ip: string): boolean {
  const octets = ip.trim().split('.');
  if (octets.length !== 4) return false;
  return octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) >= 0 && Number(o) <= 255);
}

export function isValidPort(port: string): boolean {
  if (!/^\d+$/.test(port.trim())) return false;
  const n = Number(port);
  return n >= 1 && n <= 65535;
}
