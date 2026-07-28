import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLiveFrame } from '../liveFrame.js';
import { enqueue, flushQueue, queueDepth } from '../persistQueue.js';

function telemetry(slots, dataCurrent = true) {
  return {
    schema: 'ultron.rack.telemetry',
    schema_version: '2.0',
    message_id: '7d9933be-744c-49f5-a017-20523b477e7c',
    gateway_id: 'Gateway-Alpha',
    gateway_boot_id: 'a0af6812-c88b-4b30-a236-e007ed24ddfb',
    gateway_ip: '192.168.1.8',
    gateway_sequence: 12,
    created_at: '2026-07-27T08:24:27.123456+00:00',
    created_at_us: '1785140667123456',
    replayed: false,
    rack_id: 'Rack-A7',
    payload: {
      rack_id: 'Rack-A7',
      slot_count: slots.length,
      telemetry: { data_current: dataCurrent, data_status: 'current' },
      slots,
    },
  };
}

test('telemetry frame carries the reading the canvas renders', () => {
  const frame = buildLiveFrame('telemetry', telemetry([
    { slot_number: 3, value_formatted: '72.57', value_display: '72.57', unit: 'mm/s', sensor: 'Vibration', card_type: 'Vibration Card', channel_status: 'ok', data_status: 'current', measurement_valid: true },
  ]), 1_800_000_000_000);

  assert.equal(frame.serverNowMs, 1_800_000_000_000);
  // created_at_us (µs) is carried as ms so latency is measurable end to end.
  assert.equal(frame.sourceCreatedAtMs, 1_785_140_667_123);
  assert.equal(frame.racks.length, 1);
  assert.equal(frame.racks[0].gatewayId, 'Gateway-Alpha');
  assert.equal(frame.racks[0].rackId, 'Rack-A7');
  assert.equal(frame.racks[0].status, 'ONLINE');
  assert.equal(frame.racks[0].lastSeenAt, new Date(1_800_000_000_000).toISOString());
  assert.equal(frame.measurements.length, 1);
  assert.equal(frame.measurements[0].value, 72.57);
  assert.equal(frame.measurements[0].slotId, 3);
  assert.equal(frame.measurements[0].unit, 'mm/s');
  assert.equal(frame.measurements[0].quality, 'GOOD');
  assert.equal(frame.measurements[0].freshness, 'FRESH');
  // Slot 13 always reports the rack link alongside the cards.
  assert.deepEqual(frame.slots.map((slot) => slot.slotId), [3, 13]);
});

test('invalid and stale slots are not pushed as readings', () => {
  const invalidChannel = buildLiveFrame('telemetry', telemetry([
    { slot_number: 1, value_formatted: 'NaN', value_display: 'NaN', measurement_valid: true, channel_status: 'ok' },
    { slot_number: 2, value_formatted: '10.0', measurement_valid: true, channel_status: 'open_circuit' },
    { slot_number: 4, value_formatted: '11.0', measurement_valid: false, channel_status: 'ok' },
  ]));
  assert.deepEqual(invalidChannel.measurements, []);

  const notCurrent = buildLiveFrame('telemetry', telemetry([
    { slot_number: 1, value_formatted: '10.0', measurement_valid: true, channel_status: 'ok', data_status: 'current' },
  ], false));
  assert.deepEqual(notCurrent.measurements, []);
  assert.equal(notCurrent.racks[0].status, 'CONNECTED');
  assert.equal(notCurrent.slots.at(-1).onlineState, 'OFFLINE');
});

test('command responses produce no frame', () => {
  assert.equal(buildLiveFrame('command_response', telemetry([])), null);
});

test('queued persistence coalesces superseded state for the same key', async () => {
  const ran = [];
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });

  enqueue('telemetry|G|R', async () => { ran.push('first'); await blocked; });
  enqueue('telemetry|G|R', async () => { ran.push('second'); });
  enqueue('telemetry|G|R', async () => { ran.push('third'); });
  enqueue('alarm|message-1', async () => { ran.push('alarm'); });

  assert.equal(queueDepth(), 2);
  release();
  await flushQueue();

  // The two stale telemetry frames collapse into the newest one; append-only
  // work keeps its own key and always runs.
  assert.deepEqual(ran, ['first', 'third', 'alarm']);
});

test('a failing job does not stall the queue', async () => {
  const ran = [];
  enqueue('a', async () => { throw new Error('boom'); });
  enqueue('b', async () => { ran.push('b'); });
  await flushQueue();
  assert.deepEqual(ran, ['b']);
});
