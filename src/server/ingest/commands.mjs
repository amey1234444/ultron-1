// Downlink: application → broker → gateway, and the response back the same way.
//
//   POST /api/live/command
//        └▶ publish ultron/v1/gateways/{gw}/racks/{rack}/commands/request  (QoS 1)
//             └▶ gateway CommandConsumer
//                  └▶ publish .../commands/response
//                       └▶ this application's own subscription
//                            └▶ resolveCommandResponse(request_id)
//
// The application never opens a connection to a gateway. A gateway on a plant
// network behind NAT is unreachable from Render, so a command has to travel as a
// publication on a topic the gateway is already subscribed to — the same reason
// telemetry travels up as a publication rather than as an HTTP post.

import { randomUUID } from 'node:crypto';

import { awaitCommandResponse, publishToBroker } from './mqttClient.mjs';
import { commandRequestTopic } from './topics.mjs';

// Envelope fields the contract requires of anything on the ultron/v1 tree. The
// gateway echoes request_id; identity here describes the publisher, which for a
// command request is the application itself.
function commandEnvelope(gatewayId, rackId, payload) {
  const now = new Date();
  return {
    schema: 'ultron.command.request',
    schema_version: '2.0',
    message_id: randomUUID(),
    gateway_id: gatewayId,
    rack_id: rackId,
    created_at: now.toISOString(),
    created_at_us: String(now.getTime() * 1000),
    replayed: false,
    payload,
  };
}

export async function sendCommand({ gatewayId, rackId, command, args = {}, timeoutMs }) {
  if (typeof gatewayId !== 'string' || gatewayId.length === 0) throw new Error('gatewayId is required');
  if (typeof rackId !== 'string' || rackId.length === 0) throw new Error('rackId is required');
  if (typeof command !== 'string' || command.length === 0) throw new Error('command is required');

  const requestId = randomUUID();
  const topic = commandRequestTopic(gatewayId, rackId);
  const message = commandEnvelope(gatewayId, rackId, { request_id: requestId, command, args });

  // Register the waiter before publishing: a fast gateway can answer before the
  // publish callback returns.
  const response = awaitCommandResponse(requestId, timeoutMs);
  try {
    await publishToBroker(topic, message, { qos: 1, retain: false });
  } catch (err) {
    throw new Error(`command publish failed: ${err.message}`);
  }
  return { requestId, topic, response: await response };
}
