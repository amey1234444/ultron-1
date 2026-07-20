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
  gatewayId?: string | null;
  realGatewayId?: string | null;
  realRackId?: number | null;
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
  return device.status === 'Online' ? 'Just now' : '-';
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

export function isValidIpPrefix(prefix: string): boolean {
  const octets = prefix.trim().split('.');
  if (octets.length !== 3) return false;
  return octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) >= 0 && Number(o) <= 255);
}

export function isValidHostOctet(value: string): boolean {
  if (!/^\d{1,3}$/.test(value.trim())) return false;
  const n = Number(value);
  return n >= 1 && n <= 254;
}

export function ipPrefixFor(ip: string): string {
  const trimmed = ip.trim();
  if (isValidIpPrefix(trimmed)) return trimmed;
  const octets = trimmed.split('.');
  if (octets.length === 4 && isValidIp(trimmed)) return octets.slice(0, 3).join('.');
  return '';
}

export function hostOctetFor(ip: string): string {
  const trimmed = ip.trim();
  return isValidIp(trimmed) ? trimmed.split('.')[3] : '';
}

export function composeIp(prefix: string, hostOctet: string): string {
  return isValidIpPrefix(prefix) && isValidHostOctet(hostOctet) ? `${prefix.trim()}.${hostOctet.trim()}` : '';
}

export function defaultRealGatewayId(id: string): string {
  const cleaned = id.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `gw-${cleaned || Math.random().toString(36).slice(2, 8)}`;
}

export function nextRealRackId(gatewayId: string | null | undefined, devices: DeviceNode[]): number {
  const used = new Set(
    devices
      .filter((device) => device.type === 'Rack' && device.gatewayId === gatewayId && typeof device.realRackId === 'number')
      .map((device) => device.realRackId as number),
  );
  let id = 1;
  while (used.has(id)) id += 1;
  return id;
}

export function displayIpFor(device: DeviceNode): string {
  if (device.type === 'Gateway') {
    return ipPrefixFor(device.ip) || device.ip.trim();
  }
  return device.ip.trim();
}

export function racksForGateway(gateway: DeviceNode, devices: DeviceNode[]): DeviceNode[] {
  const prefix = ipPrefixFor(gateway.ip);
  return devices.filter((device) => {
    if (device.type !== 'Rack' || device.archived) return false;
    if (device.gatewayId && device.gatewayId === gateway.id) return true;
    return !!prefix && ipPrefixFor(device.ip) === prefix;
  });
}

export function gatewayForRack(rack: DeviceNode, devices: DeviceNode[]): DeviceNode | undefined {
  if (rack.type !== 'Rack') return undefined;
  if (rack.gatewayId) {
    const configured = devices.find((device) => device.id === rack.gatewayId && device.type === 'Gateway' && !device.archived);
    if (configured) return configured;
  }
  const prefix = ipPrefixFor(rack.ip);
  if (!prefix) return undefined;
  return devices.find((device) => device.type === 'Gateway' && !device.archived && ipPrefixFor(device.ip) === prefix);
}

export function isValidPort(port: string): boolean {
  if (!/^\d+$/.test(port.trim())) return false;
  const n = Number(port);
  return n >= 1 && n <= 65535;
}
