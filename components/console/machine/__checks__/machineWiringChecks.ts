/**
 * Generating a machine's simulation hardware from its own instrument points.
 *
 * Wiring a demo plant by hand is a gateway, a rack sized to the point count,
 * a card configured per instrument, and a trail dragged from every pad to the
 * channel that matches it — for each of three variants of each machine. On
 * seven machines that is over two hundred deliberate acts, and not one of
 * them is a judgement call: the registry already says what every instrument
 * measures.
 *
 * What this checks is that the generated hardware is *usable*, which is a
 * stronger claim than that it exists. A gateway whose racks collide on an IP
 * gets archived by the duplicate rule. A channel whose unit the matcher does
 * not recognise is refused by the very pad it was generated for. A layout
 * bound by label rather than by point code breaks the moment two points on
 * one machine share a name.
 */
import { connectorFitForUnit, connectorsForTemplate } from '../machineConnectors';
import { planMachineWiring } from '../generateMachineWiring';
import { profileFromName, specForKind, SLOTS_PER_RACK } from '../../../../lib/machineSimulationProfile';
import { MACHINE_TEMPLATES, type MachineTemplate } from '../../../../lib/machines';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

const RECT = { x: 384, y: 186, width: 832, height: 527 };

console.log('--- which demo a machine is, from its name ---');
for (const [name, expected] of [
  ['Seed Dryer Healthy', 'healthy'],
  ['SSE Faulty R1', 'faulty'],
  ['Conditioner Predictive', 'prediction'],
  ['Expander Prediction', 'prediction'],
  ['Flaking Mill', 'healthy'],
] as const) {
  ok(`"${name}" reads as ${expected}`, profileFromName(name) === expected, profileFromName(name));
}
ok('a machine nobody has declared faulty is not faulty',
  profileFromName('Cracking Mill M-101') === 'healthy');

console.log('\n--- every instrumented template can be wired ---');
const instrumented = (MACHINE_TEMPLATES as readonly string[]).filter(
  (t) => connectorsForTemplate(t).length > 0,
) as MachineTemplate[];

const targets = instrumented.flatMap((template, index) =>
  ['Healthy', 'Faulty', 'Predictive'].map((variant, v) => ({
    id: `m-${index}-${v}-abcdef`,
    name: `${template} ${variant}`,
    template,
    projectId: 'p1',
  })),
);
const plan = planMachineWiring(targets, RECT);

ok('every instrumented machine produced hardware',
  plan.machines.length === targets.length, `${plan.machines.length}/${targets.length}`);
ok('and nothing was skipped', plan.skipped.length === 0,
  plan.skipped.map((s) => s.reason).join('; ') || 'none');
ok('one gateway per machine',
  plan.devices.filter((d) => d.type === 'Gateway').length === plan.machines.length);

// Two generated devices on one address would archive each other: the device
// list treats a duplicate configured IP as a conflict, which would silently
// delete half of what this just made.
const ips = plan.devices.map((d) => d.ip);
ok('no two generated devices share an IP', new Set(ips).size === ips.length,
  `${ips.length} devices`);
const deviceIds = plan.devices.map((d) => d.id);
ok('device ids are unique', new Set(deviceIds).size === deviceIds.length);
const cardIds = plan.cards.map((c) => c.id);
ok('card ids are unique', new Set(cardIds).size === cardIds.length, `${cardIds.length} cards`);

// A rack has twelve slots; a machine with more points needs more racks.
let overfilled = 0;
for (const machine of plan.machines) {
  const perRack = new Map<string, number>();
  for (const point of machine.points) perRack.set(point.rackId, (perRack.get(point.rackId) ?? 0) + 1);
  for (const count of perRack.values()) if (count > SLOTS_PER_RACK) overfilled++;
  const needed = Math.ceil(machine.points.length / SLOTS_PER_RACK);
  if (machine.racks.length !== needed) {
    ok(`${machine.machineName}: rack count matches point count`, false, `${machine.racks.length} racks for ${machine.points.length} points`);
  }
}
ok('no rack is given more than its twelve slots', overfilled === 0);
ok('every card sits on a rack that was generated with it',
  plan.cards.every((card) => plan.devices.some((d) => d.id === card.deviceId)));

console.log('\n--- the canvas is wired, not just the hardware ---');
let bound = 0;
let mismatched: string[] = [];
for (const machine of plan.machines) {
  const layout = plan.layouts[machine.machineId];
  const pads = connectorsForTemplate(machine.template);
  const boxes = layout?.boxes ?? [];
  if (boxes.filter((b) => b.channelId).length !== pads.length) {
    mismatched.push(`${machine.machineName} ${boxes.filter((b) => b.channelId).length}/${pads.length}`);
  }
  bound += boxes.filter((b) => b.channelId).length;
}
ok('every pad on every machine is bound to a channel', mismatched.length === 0,
  mismatched.join(', ') || `${bound} bound`);

// Bound by point code, not by label. Two points on one machine can share a
// label — the extractor has five "pump N vibration" — and an operator can
// rename a card at any time.
ok('cards carry the point code they were generated for',
  plan.machines.every((m) => {
    const layout = plan.layouts[m.machineId];
    return layout.boxes.every((box) => !box.channelId || Boolean(box.templatePointCode));
  }));
ok('each box is bound to the channel generated for its own point',
  plan.machines.every((m) => {
    const byCode = new Map(m.points.map((p) => [p.code, p.channelId]));
    return plan.layouts[m.machineId].boxes.every(
      (box) => !box.channelId || byCode.get(box.templatePointCode ?? '') === box.channelId,
    );
  }));

console.log('\n--- a generated channel is one its own pad accepts ---');
// The unit is the contract between a channel and a pad. A generated channel
// whose unit `parameterKindForUnit` does not know would be refused by the pad
// it was generated for, which is the one failure that makes the whole feature
// pointless.
let refused: string[] = [];
let unknown = 0;
for (const machine of plan.machines) {
  const pads = new Map(connectorsForTemplate(machine.template).map((c) => [c.code, c]));
  for (const point of machine.points) {
    const pad = pads.get(point.code);
    if (!pad) continue;
    const unit = specForKind(pad.kind).unit;
    const fit = connectorFitForUnit(pad, unit);
    if (fit === 'mismatch') refused.push(`${machine.machineName} ${point.code} (${pad.kind} → "${unit}")`);
    if (fit === 'unknown') unknown++;
  }
}
ok('no pad refuses the channel generated for it', refused.length === 0,
  refused.slice(0, 4).join('; ') || 'every unit is one the matcher knows');
ok('the unverifiable kinds are permitted rather than refused', unknown > 0,
  `${unknown} pads whose quantity the unit cannot confirm — moisture, seal leaks`);

console.log('\n--- what each demo reads ---');
const healthy = plan.machines.filter((m) => m.profile === 'healthy');
const faulty = plan.machines.filter((m) => m.profile === 'faulty');
const prediction = plan.machines.filter((m) => m.profile === 'prediction');
ok('all three demos are represented',
  healthy.length > 0 && faulty.length > 0 && prediction.length > 0,
  `${healthy.length} healthy, ${faulty.length} faulty, ${prediction.length} predictive`);

const simOf = (m: (typeof plan.machines)[number]) => m.cards.map((c) => c.simulation?.[0]).filter(Boolean);
ok('a healthy machine sits at rest and holds still',
  healthy.every((m) => simOf(m).every((c) => c!.behaviour === 'Steady')));
// Past alert, short of danger: a plant where every point is in danger at once
// is not a fault anybody diagnoses.
const faultyPastAlert = faulty.flatMap(simOf).filter(
  (c) => c!.alertLimit !== null && (c!.manualValue ?? 0) > c!.alertLimit!,
);
const faultyPastDanger = faulty.flatMap(simOf).filter(
  (c) => c!.dangerLimit !== null && (c!.manualValue ?? 0) >= c!.dangerLimit!,
);
ok('a faulty machine reads past its alert limits', faultyPastAlert.length > 0,
  `${faultyPastAlert.length} channels`);
ok('but not into danger on every point', faultyPastDanger.length === 0,
  faultyPastDanger.length ? `${faultyPastDanger.length} channels in danger` : 'degrading, not tripped');
// The third demo's whole point: reads fine today, has been climbing.
ok('a predictive machine drifts rather than sitting still',
  prediction.every((m) => simOf(m).every((c) => c!.behaviour === 'Predictive Drift')));

console.log('\n--- templates with no points are reported, not wired ---');
const generic = planMachineWiring(
  [{ id: 'g1', name: 'Motor Healthy', template: 'Motor' as MachineTemplate, projectId: null }],
  RECT,
);
ok('a template with no instrument points generates nothing',
  generic.machines.length === 0 && generic.devices.length === 0);
ok('and says why', generic.skipped.length === 1 && /no instrument points/.test(generic.skipped[0].reason),
  generic.skipped[0]?.reason ?? 'nothing reported');

console.log(failures === 0 ? '\nmachine wiring: all checks passed' : `\nmachine wiring: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
