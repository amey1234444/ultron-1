/**
 * A simulated gateway publishes what a real one publishes.
 *
 * The whole value of simulating server-side is that the reading travels the
 * path a real reading travels: validation, dedup, persistence, live bus. A
 * message the validator rejects travels none of it, and the symptom is
 * silence — a machine that looks alive in the console and has never been
 * seen by anything reading the database.
 *
 * So the envelope is checked against the same two validators the ingest path
 * runs, built from cards the wiring generator actually produces rather than
 * from a fixture written to pass.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { SCHEMA_FOR_KIND, validateEnvelope, validatePayload } from '../ingest/validate.mjs';
import { topicForMessage, parseTopic } from '../ingest/topics.mjs';

// The TypeScript under test, bundled by `check:simulated-gateway` before this
// runs. Imported rather than reimplemented so the message checked here is the
// message the server publishes.
const { telemetryEnvelope, SIMULATED_TEMPLATES, createSimulationRuntime, defaultSimulationForCard } =
  await import('../../../node_modules/.cache/simGateway.cjs');

const SOURCE = readFileSync('src/server/simulatedGateway.ts', 'utf8');

const GATEWAY = { realGatewayId: 'sim-gw-real-1', ip: '10.80.10.1' };

function cards() {
  return [
    { id: 'c1', deviceId: 'r1', slot: 1, type: 'Vibration Card', enabled: true, config: {}, simulation: defaultSimulationForCard('Vibration Card') },
    { id: 'c2', deviceId: 'r1', slot: 2, type: 'RTD Card', enabled: true, config: {}, simulation: defaultSimulationForCard('RTD Card') },
    { id: 'c3', deviceId: 'r1', slot: 3, type: 'Speed Card', enabled: true, config: {}, simulation: defaultSimulationForCard('Speed Card') },
  ];
}

test('the telemetry envelope satisfies the v2 envelope schema', () => {
  const envelope = telemetryEnvelope(GATEWAY, '1', cards(), createSimulationRuntime(), 1000, Date.now());
  assert.ok(envelope, 'a rack with enabled cards produces a message');
  assert.deepEqual(validateEnvelope(envelope), [], 'no envelope errors');
});

test('and the rack telemetry payload schema', () => {
  const envelope = telemetryEnvelope(GATEWAY, '1', cards(), createSimulationRuntime(), 1000, Date.now());
  assert.equal(envelope.schema, SCHEMA_FOR_KIND.telemetry);
  assert.deepEqual(validatePayload(envelope.schema, envelope.payload), [], 'no payload errors');
});

test('it routes to the topic a real gateway would publish on', () => {
  const envelope = telemetryEnvelope(GATEWAY, '1', cards(), createSimulationRuntime(), 1000, Date.now());
  const topic = topicForMessage(envelope);
  assert.ok(topic, 'a topic is derivable');
  const parsed = parseTopic(topic);
  assert.equal(parsed.gatewayId, GATEWAY.realGatewayId);
  assert.equal(parsed.rackId, '1');
});

test('every enabled channel reports a slot', () => {
  const envelope = telemetryEnvelope(GATEWAY, '1', cards(), createSimulationRuntime(), 1000, Date.now());
  const slots = envelope.payload.slots;
  assert.ok(Array.isArray(slots) && slots.length >= 3, `got ${slots?.length} slots`);
  for (const slot of slots) {
    assert.equal(typeof slot.value_formatted, 'number', 'the engineering value is a number');
    assert.equal(slot.measurement_valid, true);
    assert.equal(slot.data_status, 'current');
    assert.ok(typeof slot.unit === 'string');
  }
});

test('a rack whose cards are all disabled publishes nothing', () => {
  const off = cards().map((card) => ({ ...card, enabled: false }));
  assert.equal(telemetryEnvelope(GATEWAY, '1', off, createSimulationRuntime(), 1000, Date.now()), null,
    'silence is correct; an empty frame would make a gap look like a measurement');
});

test('the sequence advances, so dedup sees distinct messages', () => {
  const runtime = createSimulationRuntime();
  const first = telemetryEnvelope(GATEWAY, '1', cards(), runtime, 1000, Date.now());
  const second = telemetryEnvelope(GATEWAY, '1', cards(), runtime, 1000, Date.now() + 1000);
  assert.ok(second.gateway_sequence > first.gateway_sequence, 'gateway_sequence increases');
  assert.notEqual(second.message_id, first.message_id, 'each message is its own');
  assert.equal(second.gateway_boot_id, first.gateway_boot_id, 'one boot id per process');
});

test('only the twin screw is published for', () => {
  // Every simulated channel is a row in measurement_history on every tick.
  // The whole oilseed plant writes far more than the one machine anything
  // currently reads, and the twin screw is that machine: it is what the ML
  // service is trained against and the only template with a component
  // breakdown behind the health index.
  assert.deepEqual([...SIMULATED_TEMPLATES], ['Twin Screw Extruder']);
});

test('a gateway is matched to its machine by derived id, not by description', () => {
  // The description is a sentence written for a person to read. Matching on
  // it means a reworded string silently stops a machine being simulated.
  assert.ok(SOURCE.includes('generatedGatewayId({'), 'the id is derived from the machine');
  assert.ok(!/description === `Generated for/.test(SOURCE), 'and not recovered from prose');
});

test('nothing is published for a device that is not simulated', () => {
  assert.ok(
    SOURCE.includes('isSimulatedDevice(device)'),
    'a silent real gateway is telling the truth about a real machine',
  );
});
