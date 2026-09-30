/**
 * A simulated reading reaching the model without touching the database.
 *
 * The stored path exists and is right for real hardware. This one is the
 * short way round: the simulation already knows what a channel reads, so the
 * value goes straight into a canonical frame. What has to hold is that the
 * frame is as complete as the one the long way round produces — every
 * instrument point present, every unit one the analyzer tag accepts — because
 * a shortcut that quietly drops nine channels is the failure it was written
 * to remove.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';

const {
  readingsFor,
  feedMode,
  createSimulationRuntime,
  planMachineWiring,
  connectorsForTemplate,
  TWIN_SCREW_POINT_REGISTRY,
} = await import('../../../node_modules/.cache/directFeed.cjs');

const MACHINE = { id: 'm-tse-abcdef', name: 'TSE Healthy', template: 'Twin Screw Extruder', projectId: 'p' };

/** A wired twin screw, exactly as the generator produces one. */
function wired() {
  const plan = planMachineWiring([MACHINE], null, [], []);
  const boxes = plan.layouts[MACHINE.id].boxes;
  const built = plan.machines[0];
  const racks = new Map(built.racks.map((rack) => [rack.id, String(rack.realRackId ?? rack.id)]));
  return { boxes, cards: plan.cards, racks, gatewayRealId: built.gateway.realGatewayId };
}

test('every instrument point on the machine reports', () => {
  const { boxes, cards, racks, gatewayRealId } = wired();
  const readings = readingsFor(boxes, cards, gatewayRealId, racks, createSimulationRuntime(), 1000);
  const pads = connectorsForTemplate('Twin Screw Extruder').length;
  assert.equal(readings.length, pads, `${readings.length} of ${pads} pads produced a reading`);
  const reporting = readings.filter((r) => r.value !== null).length;
  assert.equal(reporting, pads, `${reporting} of ${pads} carry a value — none may be withheld`);
});

test('each one is addressed to a real analyzer tag', () => {
  const { boxes, cards, racks, gatewayRealId } = wired();
  const readings = readingsFor(boxes, cards, gatewayRealId, racks, createSimulationRuntime(), 1000);
  const known = new Set(TWIN_SCREW_POINT_REGISTRY.map((p) => p.analyzerTag));
  for (const reading of readings) assert.ok(known.has(reading.tag), `${reading.tag} is not a tag`);
  assert.equal(new Set(readings.map((r) => r.tag)).size, readings.length, 'no tag appears twice');
});

test('units are the canonical ones, converted where they differ', () => {
  const { boxes, cards, racks, gatewayRealId } = wired();
  const readings = readingsFor(boxes, cards, gatewayRealId, racks, createSimulationRuntime(), 1000);
  // The card is configured in C, bar and RPM; the tag wants degC, MPa, rpm.
  // Sending the number unconverted would be a silent order-of-magnitude bug.
  const byTag = new Map(readings.map((r) => [r.tag, r]));
  assert.equal(byTag.get('TS-TM').unit, 'degC');
  assert.equal(byTag.get('TS-P3').unit, 'MPa');
  assert.equal(byTag.get('TS-S1').unit, 'rpm');
  for (const reading of readings) assert.ok(reading.unit, `${reading.tag} has no unit`);
});

test('values move between ticks', () => {
  const { boxes, cards, racks, gatewayRealId } = wired();
  const runtime = createSimulationRuntime();
  const first = readingsFor(boxes, cards, gatewayRealId, racks, runtime, 1000);
  const second = readingsFor(boxes, cards, gatewayRealId, racks, runtime, 1000);
  const moved = first.filter((r, i) => r.value !== second[i].value).length;
  assert.ok(moved > 0, 'a frozen signal is what DQ-005 calls a dead channel');
});

test('a disabled card reports nothing rather than zero', () => {
  const { boxes, cards, racks, gatewayRealId } = wired();
  const off = cards.map((card) => ({ ...card, enabled: false }));
  const readings = readingsFor(boxes, off, gatewayRealId, racks, createSimulationRuntime(), 1000);
  assert.equal(readings.length, 0, 'absent is a different fact from zero');
});

test('direct is the default mode', () => {
  delete process.env.ML_FEED_MODE;
  assert.equal(feedMode(), 'direct');
  process.env.ML_FEED_MODE = 'database';
  assert.equal(feedMode(), 'database');
  process.env.ML_FEED_MODE = 'nonsense';
  assert.equal(feedMode(), 'direct', 'an unreadable value falls back rather than disabling the layer');
  delete process.env.ML_FEED_MODE;
});
