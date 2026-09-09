// Covers the two hops that stopped being HTTP: the browser's subscription to
// this application, and the command request/response correlation that closes
// the loop back through the broker.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';

import { attachIngestWebSockets, publishToSubscribers } from '../liveSocket.mjs';
import { awaitCommandResponse, resolveCommandResponse } from '../mqttClient.mjs';
import { commandRequestTopic, topicForMessage, topicMatchesFilter } from '../topics.mjs';

const TELEMETRY = 'ultron/v1/gateways/Gateway-Alpha/racks/Rack-A/telemetry';
const STATUS = 'ultron/v1/gateways/Gateway-Alpha/status';

test('topic filters match the same way the broker matches them', () => {
  assert.equal(topicMatchesFilter(TELEMETRY, 'ultron/v1/gateways/+/racks/+/telemetry'), true);
  assert.equal(topicMatchesFilter(STATUS, 'ultron/v1/gateways/+/racks/+/telemetry'), false);
  assert.equal(topicMatchesFilter(TELEMETRY, 'ultron/v1/gateways/Gateway-Alpha/#'), true);
  assert.equal(topicMatchesFilter(TELEMETRY, 'ultron/v1/gateways/Gateway-Beta/#'), false);
  // A single-level wildcard must not swallow the trailing segments.
  assert.equal(topicMatchesFilter(TELEMETRY, 'ultron/v1/gateways/+'), false);
});

test('command topics and reconstructed topics encode identity segments', () => {
  assert.equal(
    commandRequestTopic('Gateway/One', 'Rack A'),
    'ultron/v1/gateways/Gateway%2FOne/racks/Rack%20A/commands/request',
  );
  assert.equal(
    topicForMessage({ schema: 'ultron.rack.telemetry', gateway_id: 'Gateway-Alpha', rack_id: 'Rack-A' }),
    TELEMETRY,
  );
  assert.equal(topicForMessage({ schema: 'ultron.rack.telemetry', gateway_id: 'Gateway-Alpha' }), null);
});

test('a command response resolves the waiter that published the request', async () => {
  const pending = awaitCommandResponse('req-1', 1000);
  assert.equal(resolveCommandResponse({ payload: { request_id: 'other', status: 'COMPLETED' } }), false);
  assert.equal(resolveCommandResponse({ payload: { request_id: 'req-1', status: 'COMPLETED', result: { pong: true } } }), true);
  assert.deepEqual(await pending, { request_id: 'req-1', status: 'COMPLETED', result: { pong: true } });
});

test('a command with no answer times out instead of hanging the request', async () => {
  await assert.rejects(awaitCommandResponse('req-timeout', 25), /no gateway response/);
});

test('live subscribers receive only the topics they subscribed to', async () => {
  const server = createServer((req, res) => res.end('ok'));
  attachIngestWebSockets(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const url = `ws://127.0.0.1:${server.address().port}/ws/live`;

  const subscriber = new WebSocket(url); // telemetry only
  const firehose = new WebSocket(url); // no subscribe = everything
  const received = { subscriber: [], firehose: [] };

  const collect = (socket, bucket) =>
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString('utf8'));
      if (message.type === 'frame') bucket.push(message.topic);
    });
  collect(subscriber, received.subscriber);
  collect(firehose, received.firehose);

  await Promise.all([
    new Promise((resolve) => subscriber.once('open', resolve)),
    new Promise((resolve) => firehose.once('open', resolve)),
  ]);
  const subscribed = new Promise((resolve) =>
    subscriber.on('message', (raw) => {
      if (JSON.parse(raw.toString('utf8')).type === 'subscribed') resolve();
    }),
  );
  subscriber.send(JSON.stringify({ type: 'subscribe', topics: ['ultron/v1/gateways/+/racks/+/telemetry'] }));
  await subscribed;

  publishToSubscribers(TELEMETRY, { type: 'frame', topic: TELEMETRY });
  publishToSubscribers(STATUS, { type: 'frame', topic: STATUS });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.deepEqual(received.subscriber, [TELEMETRY]);
  assert.deepEqual(received.firehose, [TELEMETRY, STATUS]);

  subscriber.close();
  firehose.close();
  await new Promise((resolve) => server.close(resolve));
});

test('an unknown upgrade path is refused rather than upgraded', async () => {
  const server = createServer((req, res) => res.end('ok'));
  attachIngestWebSockets(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws/nope`);
  await assert.rejects(new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  }));
  await new Promise((resolve) => server.close(resolve));
});
