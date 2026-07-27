// Parses the ultron/v1 v2 topic tree. Gateway and rack path segments are
// UTF-8 percent encoded MQTT identity values and must be decoded exactly once.

export function parseTopic(topic) {
  const parts = topic.split('/');
  if (parts.length < 5 || parts[0] !== 'ultron' || parts[1] !== 'v1' || parts[2] !== 'gateways') return null;

  const gatewayId = decodeSegment(parts[3]);
  if (!gatewayId) return null;

  if (parts.length === 5 && parts[4] === 'status') return { gatewayId, rackId: null, kind: 'status' };
  if (parts.length === 5 && parts[4] === 'topology') return { gatewayId, rackId: null, kind: 'topology' };
  if (parts.length < 7 || parts[4] !== 'racks') return null;

  const rackId = decodeSegment(parts[5]);
  if (!rackId) return null;
  const rest = parts.slice(6).join('/');

  if (rest === 'inventory') return { gatewayId, rackId, kind: 'inventory' };
  if (rest === 'health') return { gatewayId, rackId, kind: 'rack_health' };
  if (rest === 'telemetry') return { gatewayId, rackId, kind: 'telemetry' };
  if (rest === 'events/alarm') return { gatewayId, rackId, kind: 'alarm' };
  if (rest === 'commands/response') return { gatewayId, rackId, kind: 'command_response' };

  return null;
}

export function decodeSegment(segment) {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export function encodeSegment(segment) {
  return encodeURIComponent(segment);
}
