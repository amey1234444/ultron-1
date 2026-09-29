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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { connectorFitForUnit, connectorsForTemplate } from '../machineConnectors';
import { planMachineWiring } from '../generateMachineWiring';
import {
  findDuplicateConfiguredDeviceIp,
  findDuplicateConfiguredDeviceName,
} from '../../../../lib/deviceUniqueness';
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

console.log('\n--- running it twice does not build it twice ---');
const twice = planMachineWiring(targets.slice(0, 3), RECT, plan.devices, plan.cards);
ok('a machine that already has generated hardware is skipped',
  twice.machines.length === 0 && twice.devices.length === 0,
  `${twice.devices.length} devices on the second run`);
ok('and says that is why',
  twice.skipped.every((entry) => entry.reason === 'already has generated hardware'));
// Adding a machine later must top up rather than regenerate everything.
const topUp = planMachineWiring(targets.slice(0, 4), RECT, plan.devices.slice(0, 0), []);
ok('with nothing present, everything is generated', topUp.machines.length === 4);

// Devices that were not generated by this — a stray gateway from an older
// build, a real one somebody added — must not block generation.
const stray = [{ id: 'sim-sse-gw-healthy', name: 'GATEWAY_SSE_HEALTHY', type: 'Gateway' }] as never[];
const withStray = planMachineWiring(targets.slice(0, 3), RECT, stray, []);
ok('an unrelated device in the workspace does not block generation',
  withStray.machines.length === 3,
  'the check is per machine, not "does this workspace have any devices"');

console.log('\n--- generating in batches does not collide with what is there ---');
// This is the bug that lost three machines. The IP block used to come from
// the machine's position in the batch, so a second run started at block 10
// again and handed its first gateway 10.80.10.1 — an address the first run's
// first gateway already had. The device list refuses duplicate configured
// IPs with a 409, and that 409 is raised by the endpoint that saves the whole
// workspace, so from then on *every* hierarchy edit failed: create a machine,
// see it appear, reload, find it gone.
const firstBatch = planMachineWiring(targets.slice(0, 3), RECT);
const secondBatch = planMachineWiring(targets.slice(3, 6), RECT, firstBatch.devices, firstBatch.cards);
ok('the second batch generates', secondBatch.machines.length === 3,
  secondBatch.skipped.map((entry) => entry.reason).join('; ') || `${secondBatch.machines.length}`);
const combined = [...firstBatch.devices, ...secondBatch.devices];
const ipClash = findDuplicateConfiguredDeviceIp(combined);
ok('and shares no address with the first', ipClash === null,
  ipClash ? `${ipClash.ip} is on ${ipClash.device.name} as well` : `${combined.length} devices, all distinct`);
const nameClash = findDuplicateConfiguredDeviceName(combined);
ok('and no name either', nameClash === null,
  nameClash ? `${nameClash.type} "${nameClash.name}" twice` : '');
ok('the same rule holds within a single batch',
  findDuplicateConfiguredDeviceIp(plan.devices) === null
  && findDuplicateConfiguredDeviceName(plan.devices) === null);

// Machines live in folders, so two of them may legitimately carry one name.
// Devices may not, and the operator's name in the hierarchy is not ours to
// rewrite — so the suffix goes on the hardware.
const sameName = planMachineWiring(
  [
    { id: 'dup-a-111111', name: 'Cracking Mill', template: 'Cracking Mill M-101', projectId: 'p1' },
    { id: 'dup-b-222222', name: 'Cracking Mill', template: 'Cracking Mill M-101', projectId: 'p1' },
  ],
  RECT,
);
ok('two machines sharing a name both get hardware', sameName.machines.length === 2,
  sameName.skipped.map((entry) => entry.reason).join('; '));
ok('with distinct device names', findDuplicateConfiguredDeviceName(sameName.devices) === null,
  sameName.devices.filter((device) => device.type === 'Gateway').map((device) => device.name).join(' / '));
ok('and distinct addresses', findDuplicateConfiguredDeviceIp(sameName.devices) === null);

// Re-running must not renumber the machines it skips, or every card's
// gateway would move under it.
const topUpAfterSkip = planMachineWiring(targets.slice(0, 6), RECT, firstBatch.devices, firstBatch.cards);
ok('a re-run skips what exists and wires only the rest',
  topUpAfterSkip.machines.length === 3 && topUpAfterSkip.skipped.length === 3,
  `${topUpAfterSkip.machines.length} wired, ${topUpAfterSkip.skipped.length} skipped`);
ok('the skipped machines keep the addresses they already had',
  findDuplicateConfiguredDeviceIp([...firstBatch.devices, ...topUpAfterSkip.devices]) === null);
// If the id this predicts ever drifted from the one `planMachine` builds,
// nothing would ever be reported as already generated — which the skip count
// above would catch immediately.
ok('and are recognised by id, not by name',
  topUpAfterSkip.skipped.every((entry) => entry.reason === 'already has generated hardware'));

console.log('\n--- hardware built for an older version of the template ---');
// The reported failure. "Already has generated hardware" meant "its gateway
// exists", which stays true after the template's instrument list changes —
// so a machine wired when the extractor had twenty pads kept a twenty-card
// rack it no longer addresses, was skipped on every pass, and never got a
// canvas. Its pads showed on the drawing, connected to nothing.
const one = [targets[0]];
const wired = planMachineWiring(one, RECT, [], []);
const rack = wired.machines[0].racks[0];
const padCount = connectorsForTemplate(one[0].template).length;
// Cards from a template that used to have twelve more points than it does.
const leftovers = Array.from({ length: 12 }, (_, i) => ({
  id: `${rack.id}-slot-${padCount + 1 + i}`,
  deviceId: rack.id,
  slot: padCount + 1 + i,
  type: 'Vibration Card',
  enabled: true,
  config: {},
})) as unknown as typeof wired.cards;

const repair = planMachineWiring(one, RECT, wired.devices, [...wired.cards, ...leftovers]);
ok('a machine whose channel count no longer matches its pads is rebuilt',
  repair.machines.length === 1, `${repair.machines.length}`);
ok('and says so, with both numbers',
  repair.skipped.some((entry) => entry.reason === `rebuilt: ${padCount + 12} channels for ${padCount} instrument points`),
  repair.skipped.map((entry) => entry.reason).join('; '));
ok('the stale rows are named for removal',
  repair.supersededDeviceIds.length === wired.devices.length
  && repair.supersededCardIds.length === padCount + 12,
  `${repair.supersededDeviceIds.length} devices, ${repair.supersededCardIds.length} cards`);
ok('only its own rows, never a device somebody added by hand',
  repair.supersededDeviceIds.every((id) => id.startsWith(wired.machines[0].gateway.id)));
ok('it keeps the gateway id it had', repair.machines[0].gateway.id === wired.machines[0].gateway.id);
ok('and the address block it had',
  repair.machines[0].gateway.ip === wired.machines[0].gateway.ip,
  `${wired.machines[0].gateway.ip} -> ${repair.machines[0].gateway.ip}`,
);
ok('the rebuilt rack carries one card per pad', repair.cards.length === padCount, `${repair.cards.length}`);
ok('and comes with a canvas, fully bound',
  Object.keys(repair.layouts).length === 1
  && repair.layouts[one[0].id].boxes.every((box) => box.channelId),
  'this is what the machine was missing');

// Applying it has to settle, or the effect that applies it never stops.
const settledDevices = [...wired.devices.filter((d) => !repair.supersededDeviceIds.includes(d.id)), ...repair.devices];
const settledCards = [...[...wired.cards, ...leftovers].filter((c) => !repair.supersededCardIds.includes(c.id)), ...repair.cards];
const settled = planMachineWiring(one, RECT, settledDevices, settledCards);
ok('once applied, a further pass rebuilds nothing',
  settled.machines.length === 0 && settled.supersededDeviceIds.length === 0);
ok('and the machine ends with exactly its pads worth of channels',
  settledCards.filter((card) => card.deviceId.startsWith(wired.machines[0].gateway.id)).length === padCount,
  `${settledCards.filter((card) => card.deviceId.startsWith(wired.machines[0].gateway.id)).length}`);

console.log('\n--- a canvas can be restored without rewiring ---');
// Hardware that is still correct but a canvas that is empty: the machine was
// wired, then its canvas was lost — by a template prune, or never saved. The
// cards are right, so there is nothing to rebuild, only something to bind.
const intact = planMachineWiring(one, RECT, wired.devices, wired.cards);
ok('no hardware is generated', intact.machines.length === 0 && intact.devices.length === 0);
ok('but a bound canvas is offered', Object.keys(intact.rebind).length === 1);
const offered = intact.rebind[one[0].id];
ok('with a card per pad', offered.boxes.length === padCount, `${offered.boxes.length}`);
ok('every one bound to a channel that exists',
  offered.boxes.every((box) => wired.cards.some(
    (card) => `${card.deviceId}.S${String(card.slot).padStart(2, '0')}.CH1` === box.channelId,
  )),
  'recomputed ids have to address the cards actually installed');
ok('it is offered, not applied — the caller decides',
  Object.keys(intact.layouts).length === 0,
  'a canvas somebody arranged by hand must not be overwritten by a load');

console.log('\n--- a machine is wired without anybody pressing anything ---');
const home = readFileSync(join(process.cwd(), 'app/index.tsx'), 'utf8');
// Creating a machine and wiring it were two acts, and the second was a
// button somebody had to know about. A machine created and left unwired
// looks finished — drawing, instrument pads — and reads nothing.
ok('the console wires unwired machines on its own',
  home.includes('const candidates = machines.filter((machine) => connectorsForTemplate(machine.template).length > 0);'),
  'an effect, not only the button');
ok('and still offers the button, for re-running it by hand',
  home.includes('onPress={generateMachineHardware}'));

console.log('  gates:');
ok('  it waits for the workspace to load',
  home.includes('if (!workspaceReady || !hasConfigureAccess) return;'),
  'otherwise it generates against the seed and writes that into somebody\'s plant');
ok('  and for the permission to write',
  home.includes('hasConfigureAccess') && !home.includes('if (!workspaceReady || !canEditDeleteSchema)'),
  'the permission, not the configure-mode toggle — otherwise leaving the mode stops the wiring');
ok('  a template with no pads is skipped',
  home.includes('connectorsForTemplate(machine.template).length > 0'),
  'generic equipment has no drawing to wire');
ok('  a canvas with channels already mapped is left alone',
  home.includes('return !layout || !layout.boxes.some((box) => box.channelId);')
  && home.includes('Object.entries(plan.rebind).filter(([machineId]) => unbound(machineId))'),
  'that canvas is somebody\'s arrangement and is never overwritten from here');
ok('  the existing devices and cards are both passed',
  home.includes('      storedDevices,\n      cards,\n    );'),
  'without the cards it cannot tell correct hardware from hardware built for an older template');
ok('  and the button repairs the same way the effect does',
  home.includes('planMachineWiring(targets, null, storedDevices, cards);'));

console.log('  termination:');
// The effect writes state it also reads, so it has to stop. Two independent
// reasons why the second pass is a no-op, checked on the data rather than
// asserted about the effect.
const targets6 = targets.slice(0, 6);
const first = planMachineWiring(targets6, RECT, [], []);
ok('  a wired machine has its gateway on the next pass',
  planMachineWiring(targets6, RECT, first.devices, first.cards).machines.length === 0,
  `${planMachineWiring(targets6, RECT, first.devices, first.cards).machines.length} would be wired again`);
ok('  and the canvas it was given has its channels mapped',
  targets6.every((target) => {
    const layout = first.layouts[target.id];
    return Boolean(layout) && layout.boxes.length > 0 && layout.boxes.every((box) => box.channelId);
  }),
  'which is the other reason the filter above drops it');
ok('  so a second pass writes nothing at all',
  planMachineWiring(targets6, RECT, first.devices, first.cards).devices.length === 0);

console.log('\n--- the action is reachable ---');
const page = readFileSync(join(process.cwd(), 'app/index.tsx'), 'utf8');
// It was originally offered only from the devices empty state, which a
// workspace with a single stray gateway never shows — so on exactly the
// workspaces that most needed it, the button did not exist anywhere.
const offers = (page.match(/label="Generate From Machines"/g) ?? []).length;
ok('offered from more than one place', offers >= 2, `${offers} call sites`);
// One of them has to be in the header above the table — the region that
// renders when devices DO exist. Located by index rather than by a regex
// window, which a comment of the wrong length silently breaks.
const headerStart = page.indexOf('>Devices</Text>');
const tableStart = page.indexOf('<DevicesTable', headerStart);
const inHeader = page.slice(headerStart, tableStart).includes('label="Generate From Machines"');
ok('including the devices header, which shows whether or not devices exist',
  headerStart > 0 && tableStart > headerStart && inHeader,
  'the empty state alone is unreachable once anything has been added');
ok('and it is wired to the generator',
  page.includes('onPress={generateMachineHardware}'));
ok('existing devices and cards are passed in, so it can be pressed twice',
  page.includes('planMachineWiring(targets, null, storedDevices, cards)'));

console.log(failures === 0 ? '\nmachine wiring: all checks passed' : `\nmachine wiring: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
