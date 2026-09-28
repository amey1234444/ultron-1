/**
 * Does changing a channel's value change what the analysis says?
 *
 * The question this answers is the one that matters after wiring a rack
 * channel to a machine point: is the console actually reading that channel, or
 * is the verdict on screen independent of it? A page that renders a plausible
 * diagnosis from stale or ignored inputs is worse than one that renders
 * nothing, because nothing about it looks wrong.
 *
 * Two boundaries are exercised, both with real production code and no mocks:
 *
 *   analyseReadings      the deterministic DOC-02..DOC-07 chain the Diagnosis
 *                        tabs render
 *   buildTelemetryFrame  the payload the ML feeder posts to the model, which
 *                        is what the Prognosis tabs ultimately read back
 *
 * The model's own response is not exercised here: it is a Python service, and
 * whether it reacts to a changed input is its own test suite's business. What
 * is proved here is that a changed channel reaches its front door.
 */
import { EMPTY_LIVE_STATE, type LiveMeasurement, type LiveState } from '../../../liveTelemetry';
import { buildTelemetryFrame } from '../../ml/telemetryFrame';
import { analyseReadings, type TagReading } from '../pipeline';
import { twinScrewPointByTag, type TwinScrewTag } from '../../../machinePoints/twinScrewExtruderPoints';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

const NOW = Date.parse('2026-09-28T10:00:00.000Z');

/**
 * A reading in the shape the rack reader produces, at a chosen value.
 *
 * These are post-normalisation readings, which is the point: the unit domain is
 * policed upstream in signalMap, and by the time the chain sees a TagReading
 * the value is already in the tag's canonical unit. The chain reasons over
 * `value`, so the unit string is carried for display only and is left empty
 * here rather than asserting one this layer never reads.
 */
function reading(tag: TwinScrewTag, value: number): TagReading {
  const point = twinScrewPointByTag(tag);
  return {
    tag,
    label: point?.label ?? tag,
    value,
    unit: '',
    raw: value,
    quality: { tag, verdict: 'GOOD', findings: [], usable: true } as unknown as TagReading['quality'],
  };
}

// A running machine: screw speed, feed rate, power, and the barrel/melt
// signals the chain reasons over.
const BASE: Array<[TwinScrewTag, number]> = [
  ['TS-S1', 300],
  ['TS-F1', 250],
  ['TS-PM1', 55],
  ['TS-T1', 210],
  ['TS-P1', 80],
];

const baseline = BASE.map(([tag, value]) => reading(tag, value));
const chainInput = { machineId: 'm-1', variantId: null, configurationVersion: null } as const;

const before = analyseReadings(chainInput, baseline, NOW);

// --- 1. the deterministic chain ------------------------------------------------
// Drive one signal well outside its normal band and nothing else.
const changed = baseline.map((r) => (r.tag === 'TS-P1' ? reading('TS-P1', 240) : r));
const after = analyseReadings(chainInput, changed, NOW);

// A feature is identified by featureId, which commissioning sets to the tag,
// and an anomaly by signalId. Neither carries a `tag` field; looking for one
// returns undefined for every signal, which compares equal to itself and turns
// this whole file into a test that always passes.
const featureOf = (result: typeof before, tag: string) =>
  result.features.find((f) => f.featureId === tag) as Record<string, unknown> | undefined;

ok('the chain runs on both inputs', before.features.length > 0 && after.features.length > 0,
   `${before.features.length} / ${after.features.length} features`);

ok('the changed signal produces a different feature',
   JSON.stringify(featureOf(before, 'TS-P1')) !== JSON.stringify(featureOf(after, 'TS-P1')),
   'TS-P1 80 -> 240');

ok('an untouched signal produces an identical feature',
   JSON.stringify(featureOf(before, 'TS-T1')) === JSON.stringify(featureOf(after, 'TS-T1')),
   'TS-T1 held at 210');

const anomalyOf = (result: typeof before, tag: string) =>
  result.anomalies.find((a) => a.signalId === tag) as Record<string, unknown> | undefined;
ok('the signal is actually found, not silently absent',
   featureOf(before, 'TS-P1') !== undefined && anomalyOf(before, 'TS-P1') !== undefined);

// The anomaly verdict deliberately does NOT move with the value alone, and
// asserting that it would was wrong. DOC-04 stops at the context gate: with no
// established operating context there is no baseline to select, so no
// deviation is meaningful and nothing is called an anomaly at any value. That
// is the same discipline as the rest of the chain — a number is never judged
// without the thing it is judged against — and it is the caveat that matters
// when reading these tabs on a freshly wired machine.
const beforeAnomaly = anomalyOf(before, 'TS-P1') as { verdict?: string; blockedAtGate?: string } | undefined;
const afterAnomaly = anomalyOf(after, 'TS-P1') as { verdict?: string; blockedAtGate?: string } | undefined;
ok('without context the anomaly gate blocks at CONTEXT, at either value',
   beforeAnomaly?.blockedAtGate === 'CONTEXT' && afterAnomaly?.blockedAtGate === 'CONTEXT',
   `${beforeAnomaly?.verdict} / ${afterAnomaly?.verdict}`);
ok('so the verdict is identical, and that is the rule rather than a miss',
   JSON.stringify(beforeAnomaly) === JSON.stringify(afterAnomaly));

ok('the overall analysis differs', JSON.stringify(before) !== JSON.stringify(after));

// Re-running the same input must give the same answer, or "it changed" proves
// nothing — a chain with a clock or a random seed in it would also differ.
const repeat = analyseReadings(chainInput, baseline, NOW);
ok('the chain is deterministic for identical input', JSON.stringify(repeat) === JSON.stringify(before));

// --- 2. the payload the ML feeder sends ----------------------------------------
const POINT_CODE = twinScrewPointByTag('TS-P1')?.code ?? '';
const frameChannels = [
  { templatePointCode: POINT_CODE, channel: { rackId: 'R1', slot: 1, id: '1', unit: 'bar' }, label: 'Melt pressure' },
];

// A genuinely connected rack, because latestMeasurementForChannel refuses
// anything less: the device must read Online, its gateway must be present in
// the live state with status ONLINE and a bound IP, and each measurement needs
// an updatedAt to be comparable. A fixture missing any of these resolves to
// undefined and every channel reads as silent — which looks exactly like the
// console ignoring the rack, and is why this is spelled out rather than stubbed.
function liveAt(value: number): LiveState {
  const measurement: LiveMeasurement = {
    gatewayId: 'G1', rackId: 'R1', slotId: 1, channelId: 1,
    measurementType: 'pressure', value, unit: 'bar', measurementValid: true,
    updatedAt: new Date(NOW).toISOString(),
  } as LiveMeasurement;
  return {
    ...EMPTY_LIVE_STATE,
    gateways: [{ gatewayId: 'G1', currentIp: '10.0.0.5', status: 'ONLINE', lastSeenAt: new Date(NOW).toISOString() }],
    measurements: [measurement],
  };
}

const rack = {
  // The IP is not decoration: a device is bound to its gateway by matching it,
  // so a blank one leaves the rack unbound and every channel reads as silent.
  id: 'R1', name: 'Rack 1', type: 'Rack', model: '', ip: '10.0.0.5', port: '', protocol: 'MQTT',
  description: '', status: 'Online', projectId: null, realGatewayId: 'G1', realRackId: 'R1',
  archived: false, simulated: false,
} as unknown as import('../../../devices').DeviceNode;

const card = {
  id: 'C1', deviceId: 'R1', slot: 1, type: 'Process', enabled: true, config: {},
} as unknown as import('../../../rack').CardNode;

const buildAt = (value: number) =>
  buildTelemetryFrame({
    machineId: 'm-1', channels: frameChannels, devices: [rack], cards: [card], live: liveAt(value), nowMs: NOW,
  });

const frameLow = buildAt(80);
const frameHigh = buildAt(240);

ok('the point is recognised, not dropped as unknown',
   frameLow.diagnostics.unknownPoints.length === 0,
   frameLow.diagnostics.unknownPoints.join(', ') || 'none unknown');
ok('the frame carries the channel', frameLow.diagnostics.reportingCount === 1,
   `reportingCount ${frameLow.diagnostics.reportingCount}`);
ok('a changed channel changes the outgoing ML payload',
   JSON.stringify(frameLow.frame.channels) !== JSON.stringify(frameHigh.frame.channels),
   '80 bar -> 240 bar');
ok('the frame is deterministic for identical input',
   JSON.stringify(buildAt(80).frame.channels) === JSON.stringify(frameLow.frame.channels));

// An unmapped channel must not silently reach the model as a real reading.
const frameNoLive = buildTelemetryFrame({
  machineId: 'm-1', channels: frameChannels, devices: [rack], cards: [card], live: EMPTY_LIVE_STATE, nowMs: NOW,
});
ok('a channel with no live measurement is reported as silent, not invented',
   frameNoLive.diagnostics.reportingCount === 0 && frameNoLive.diagnostics.silentTags.length > 0,
   `silent: ${frameNoLive.diagnostics.silentTags.join(', ') || 'none'}`);

console.log(failures === 0 ? '\nchannel propagation: all checks passed' : `\nchannel propagation: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
