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

// --- Publish side ------------------------------------------------------------
// The filters this application subscribes to. `commands/response` is included so
// the downlink completes over the broker: a command published here comes back as
// a message on this subscription, never as an inbound HTTP call.
export const GATEWAY_SUBSCRIPTIONS = [
  'ultron/v1/gateways/+/status',
  'ultron/v1/gateways/+/topology',
  'ultron/v1/gateways/+/racks/+/health',
  'ultron/v1/gateways/+/racks/+/inventory',
  'ultron/v1/gateways/+/racks/+/telemetry',
  'ultron/v1/gateways/+/racks/+/events/alarm',
  'ultron/v1/gateways/+/racks/+/commands/response',
];

const PREFIX = 'ultron/v1/gateways';

export function commandRequestTopic(gatewayId, rackId) {
  return `${PREFIX}/${encodeSegment(gatewayId)}/racks/${encodeSegment(rackId)}/commands/request`;
}

// Mirrors the gateway's own topic builders, so a frame's origin topic can be
// reconstructed for logging and for the browser's per-topic subscriptions.
export function topicForMessage(message) {
  const gateway = typeof message?.gateway_id === 'string' ? encodeSegment(message.gateway_id) : null;
  if (!gateway) return null;
  const rack = typeof message.rack_id === 'string' ? encodeSegment(message.rack_id) : null;
  switch (message.schema) {
    case 'ultron.gateway.status':
      return `${PREFIX}/${gateway}/status`;
    case 'ultron.gateway.topology':
      return `${PREFIX}/${gateway}/topology`;
    case 'ultron.rack.health':
      return rack && `${PREFIX}/${gateway}/racks/${rack}/health`;
    case 'ultron.rack.inventory':
      return rack && `${PREFIX}/${gateway}/racks/${rack}/inventory`;
    case 'ultron.rack.telemetry':
      return rack && `${PREFIX}/${gateway}/racks/${rack}/telemetry`;
    case 'ultron.event.alarm':
      return rack && `${PREFIX}/${gateway}/racks/${rack}/events/alarm`;
    case 'ultron.command.response':
      return rack && `${PREFIX}/${gateway}/racks/${rack}/commands/response`;
    default:
      return null;
  }
}

// MQTT wildcard matching, so a browser can subscribe to the same filters the
// gateways publish to instead of receiving the whole tree.
export function topicMatchesFilter(topic, filter) {
  if (filter === '#') return true;
  const topicParts = topic.split('/');
  const filterParts = filter.split('/');
  for (let i = 0; i < filterParts.length; i += 1) {
    const part = filterParts[i];
    if (part === '#') return i === filterParts.length - 1;
    if (i >= topicParts.length) return false;
    if (part !== '+' && part !== topicParts[i]) return false;
  }
  return topicParts.length === filterParts.length;
}
