import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeSegment, parseTopic } from '../topics.js';
import { SCHEMA_FOR_KIND, validateEnvelope, validatePayload } from '../validate.js';

function envelope(schema, rackId, payload = {}) {
  return {
    schema,
    schema_version: '2.0',
    message_id: '7d9933be-744c-49f5-a017-20523b477e7c',
    gateway_id: 'Gateway-Alpha',
    gateway_boot_id: 'a0af6812-c88b-4b30-a236-e007ed24ddfb',
    gateway_ip: '192.168.1.8',
    gateway_sequence: 123,
    created_at: '2026-07-27T08:24:27.123456+00:00',
    created_at_us: '1785140667123456',
    replayed: false,
    ...(rackId === null ? {} : { rack_id: rackId }),
    payload,
  };
}

test('topic parser preserves arbitrary string gateway and rack IDs', () => {
  const rackId = 'rack/A+#% বাংলা';
  const topic = `ultron/v1/gateways/${encodeSegment('Gateway Alpha')}/racks/${encodeSegment(rackId)}/telemetry`;
  assert.deepEqual(parseTopic(topic), {
    gatewayId: 'Gateway Alpha',
    rackId,
    kind: 'telemetry',
  });
});

test('numeric-looking rack IDs are not normalized', () => {
  assert.equal(parseTopic('ultron/v1/gateways/G/racks/001/health')?.rackId, '001');
  assert.equal(parseTopic('ultron/v1/gateways/G/racks/1/health')?.rackId, '1');
});

test('v2 envelope allows gateway status without rack_id', () => {
  const msg = envelope('ultron.gateway.status', null, { state: 'ONLINE' });
  assert.deepEqual(validateEnvelope(msg), []);
  assert.equal(SCHEMA_FOR_KIND.status, 'ultron.gateway.status');
});

test('v2 rack telemetry validates exact current-state slot payloads', () => {
  const payload = {
    rack_id: 'Rack-A7',
    slot_count: 1,
    telemetry: { data_current: true, data_status: 'current' },
    slots: [{ slot_number: 1, value_formatted: '72.57', measurement_valid: true }],
  };
  const msg = envelope('ultron.rack.telemetry', 'Rack-A7', payload);
  assert.deepEqual(validateEnvelope(msg), []);
  assert.deepEqual(validatePayload(msg.schema, payload), []);
});

test('old schema version and integer rack IDs are rejected', () => {
  const msg = envelope('ultron.rack.telemetry', '1', { rack_id: '1', slot_count: 0, slots: [] });
  msg.schema_version = '1.1';
  msg.rack_id = 1;
  assert.match(validateEnvelope(msg).join('; '), /schema_version/);
  assert.match(validateEnvelope(msg).join('; '), /rack_id/);
});
