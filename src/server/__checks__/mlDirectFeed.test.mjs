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

/**
 * Logging.
 *
 * Silence cost several rounds of this work: a feeder that posted nothing, a
 * service that received nothing and a panel that said nothing look identical
 * from outside, and none of the three said which it was. These assert that
 * the lines exist and that both halves of the path write the same shape, so
 * one grep spans a Node process and a Python one.
 */
import { readFileSync as read } from 'node:fs';

test('the web side logs what it sent and what came back', () => {
  const direct = read('src/server/mlDirectFeed.ts', 'utf8');
  assert.match(direct, /log\.info\(\{\s*machine/, 'the outcome of a post is logged');
  assert.match(direct, /log\.debug\(\{ machine: machine\.name, mapped/, 'and what was built before it');
  assert.ok(direct.includes("log.warn("), 'a machine that reports nothing is named, not counted');
  const client = read('src/server/mlClient.ts', 'utf8');
  assert.ok(client.includes("log.warn({ method, path, status"), 'a non-200 from the service is logged');
  assert.ok(client.includes("'retrying once'"), 'and so is the retry, or one slow call looks like two');
});

test('both halves write the same field names', () => {
  // `grep machine=TSE-01` has to span the Node log and the Python one, which
  // it only does if the two agree on what the field is called.
  const web = read('src/server/mlLog.ts', 'utf8');
  const python = read('services/ml/app/core/logging.py', 'utf8');
  assert.ok(web.includes('key=value') && python.includes('key=value'), 'the same format is stated in both');
  for (const field of ['machine', 'latency_ms', 'reporting', 'surfaced']) {
    assert.ok(
      read('src/server/mlDirectFeed.ts', 'utf8').includes(field),
      `the web side logs ${field}`,
    );
    assert.ok(read('services/ml/app/api/handlers.py', 'utf8').includes(field), `the service logs ${field}`);
  }
});

test('the level is one variable for both', () => {
  assert.ok(read('src/server/mlLog.ts', 'utf8').includes('ML_LOG_LEVEL'));
  assert.ok(read('services/ml/app/core/logging.py', 'utf8').includes('ML_LOG_LEVEL'));
});

test('the service names its champion at boot', () => {
  // The two things most likely to be wrong at boot, and the two that used to
  // fail in silence: no champion loaded, and a knowledge snapshot that does
  // not match.
  const app = read('services/ml/app/api/app.py', 'utf8');
  assert.ok(app.includes('configure()'), 'logging is set up before the service is built');
  assert.ok(app.includes('champion=champion.get("model_id")'), 'the champion is named');
  assert.ok(app.includes('knowledge=health.get("knowledge", {}).get("digest")'), 'and the knowledge digest');
  assert.ok(app.includes('boot.warning'), 'an unavailable champion is a warning, not a silence');
});
