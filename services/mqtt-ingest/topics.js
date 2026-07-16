// Parses the frozen ultron/v1 topic tree (contracts/mqtt/topics.yaml).
// Identity comes from path segments; the IP never appears in a topic.

const RE_STATUS = /^ultron\/v1\/gateways\/([^/]+)\/status$/;
const RE_RACK = /^ultron\/v1\/gateways\/([^/]+)\/racks\/(\d+)\/(.+)$/;

export function parseTopic(topic) {
  const status = RE_STATUS.exec(topic);
  if (status) return { gatewayId: status[1], rackId: null, kind: 'status' };

  const rack = RE_RACK.exec(topic);
  if (!rack) return null;
  const [, gatewayId, rackIdStr, rest] = rack;
  const rackId = Number(rackIdStr);

  if (rest === 'inventory') return { gatewayId, rackId, kind: 'inventory' };
  if (rest === 'health') return { gatewayId, rackId, kind: 'rack_health' };
  if (rest === 'telemetry') return { gatewayId, rackId, kind: 'telemetry' };
  if (rest === 'events/alarm') return { gatewayId, rackId, kind: 'alarm' };
  if (rest === 'events/fault') return { gatewayId, rackId, kind: 'fault' };
  if (rest === 'events/system') return { gatewayId, rackId, kind: 'system' };
  if (rest === 'commands/response') return { gatewayId, rackId, kind: 'command_response' };
  if (rest === 'commands/request') return { gatewayId, rackId, kind: 'command_request' };
  if (rest === 'diagnostics/response') return { gatewayId, rackId, kind: 'diagnostics_response' };
  if (rest === 'updates/status') return { gatewayId, rackId, kind: 'update_status' };

  const slot = /^slots\/(\d+)\/(identity|capabilities|configuration|health)$/.exec(rest);
  if (slot) return { gatewayId, rackId, kind: `slot_${slot[2]}`, slotId: Number(slot[1]) };

  return null;
}
