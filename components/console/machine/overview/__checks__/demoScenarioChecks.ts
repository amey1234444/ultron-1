// Numeric checks for the three ULTRON single-screw-extruder demo scenarios.
//
// These assert that feeding the exact Part 1 input values from the demo scripts
// through the real console pipeline produces the exact overview / diagnosis /
// prognosis output those scripts say the audience will see. There is no test
// runner in this project, so they run as a script:
//
//   npx esbuild components/console/machine/overview/__checks__/demoScenarioChecks.ts --bundle --platform=node --format=esm --external:react --external:react-native --outfile=demoChecks.mjs
//   node demoChecks.mjs
//
// Exit code is non-zero if anything fails.
//
// The pipeline exercised here is the same one MachineOverviewPage and
// MachineAnalysisWorkspace run, in the same order:
//
//   ensureSseSimulationWorkspace -> listChannels -> derivePointCondition
//     -> rollUpComponents / summarizeMachine / rankDiagnoses / deriveRunState
//     -> deriveAnalysis -> buildMachinePrognostics
//
// Nothing is re-implemented. A check that passes here is a statement about the
// shipped code, not about a copy of it that could agree with the page while both
// are wrong.
//
// The reading path deliberately uses the no-live-gateway case: `reading` is
// null and the buffer is empty, so each point resolves to its configured
// simulation value. That is the deterministic snapshot the demo scripts
// describe ("one fixed demo stage only"). With the virtual gateway running, the
// Steady behaviour dithers each value by at most +/-0.05, which is inside every
// margin these checks depend on.

import {
  attributeToComponent,
  DEFAULT_ISO_GROUP,
  levelFor,
  type ConditionLevel,
} from '../../../../../lib/condition';
import type { DeviceNode } from '../../../../../lib/devices';
import { componentsForTemplate, type MachineNode } from '../../../../../lib/machines';
import { listChannels, type CardNode } from '../../../../../lib/rack';
import { ensureSseSimulationWorkspace } from '../../../../../lib/sseSimulationProfile';
import { channelNumberFor } from '../../../../../lib/liveChannelValue';
import type { Issue, OverviewCondition } from '../../../../../lib/analysisOverview';
import { deriveAnalysis } from '../../deriveAnalysis';
import type { MappedChannel } from '../../RackOccupancyView';
import { derivePointCondition, type PointCondition } from '../usePointCondition';
import type { ConditionHistory } from '../useConditionHistory';
import { deriveRunState, rankDiagnoses, rollUpComponents, summarizeMachine } from '../rollup';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

// --- the demo scripts, transcribed ------------------------------------------

// Which registry pad on the extruder artwork each simulated rack channel is
// wired to. This is the canvas mapping a commissioning engineer makes in Design
// mode; declaring it here is what lets the checks build the same MappedChannel
// list the console builds from a saved layout.
const PAD_FOR_CHANNEL_LABEL: Record<string, { code: string; label: string }> = {
  'Motor DE Vibration': { code: 'MOTOR_DE_VIB', label: 'Motor Driving End Vibration' },
  'Motor NDE Vibration': { code: 'MOTOR_NDE_VIB', label: 'Motor Non Driving End Vibration' },
  'Motor Temperature': { code: 'MOTOR_TEMP', label: 'Motor Temperature' },
  'Motor RPM': { code: 'MOTOR_RPM', label: 'Motor RPM' },
  'Motor Power': { code: 'MOTOR_POWER', label: 'Motor Power' },
  'Gearbox Input Vibration': { code: 'GEARBOX_VIB_IN', label: 'Gearbox Vibration at In' },
  'Gearbox Output Vibration': { code: 'GEARBOX_VIB', label: 'Gearbox Vibration at Out' },
  'Gearbox Temperature': { code: 'GEARBOX_TEMP', label: 'Gearbox Temperature' },
  'Hopper Level': { code: 'HOPPER_LEVEL', label: 'Hopper Level' },
  'Zone 1 Temperature': { code: 'BARREL_Z1_TEMP', label: 'Barrel Zone 1 Temperature' },
  'Zone 2 Temperature': { code: 'BARREL_Z2_TEMP', label: 'Barrel Zone 2 Temperature' },
  'Zone 3 Temperature': { code: 'BARREL_Z3_TEMP', label: 'Barrel Zone 3 Temperature' },
  'Melt Temperature': { code: 'MELT_TEMP', label: 'Melt Temperature' },
  'Melt Pressure': { code: 'MELT_PRESSURE', label: 'Melt Pressure' },
  'Screw RPM': { code: 'SCREW_RPM', label: 'Screw RPM' },
};

type ExpectedPoint = { label: string; value: number; level: ConditionLevel };

// Demo 1, page 1: every point healthy at its declared demo value.
const DEMO_1_POINTS: ExpectedPoint[] = [
  { label: 'Motor DE Vibration', value: 1.5, level: 'normal' },
  { label: 'Motor NDE Vibration', value: 1.4, level: 'normal' },
  { label: 'Motor Temperature', value: 45, level: 'normal' },
  { label: 'Motor RPM', value: 2000, level: 'normal' },
  { label: 'Motor Power', value: 18, level: 'normal' },
  { label: 'Gearbox Input Vibration', value: 1.5, level: 'normal' },
  { label: 'Gearbox Output Vibration', value: 1.6, level: 'normal' },
  { label: 'Gearbox Temperature', value: 52, level: 'normal' },
  { label: 'Hopper Level', value: 70, level: 'normal' },
  { label: 'Zone 1 Temperature', value: 200, level: 'normal' },
  { label: 'Zone 2 Temperature', value: 200, level: 'normal' },
  { label: 'Zone 3 Temperature', value: 200, level: 'normal' },
  { label: 'Melt Temperature', value: 220, level: 'normal' },
  { label: 'Melt Pressure', value: 8.0, level: 'normal' },
  { label: 'Screw RPM', value: 65, level: 'normal' },
];

// Demo 2, page 1: the "Demo 2 Value" and "Condition" columns of the faulty-SSE
// input table, verbatim.
const DEMO_2_POINTS: ExpectedPoint[] = [
  { label: 'Motor DE Vibration', value: 3.2, level: 'alert' },
  { label: 'Motor NDE Vibration', value: 2.9, level: 'alert' },
  { label: 'Motor Temperature', value: 68, level: 'normal' },
  { label: 'Motor RPM', value: 1875, level: 'alert' },
  { label: 'Motor Power', value: 27, level: 'alert' },
  { label: 'Gearbox Input Vibration', value: 2.4, level: 'normal' },
  { label: 'Gearbox Output Vibration', value: 3.0, level: 'alert' },
  { label: 'Gearbox Temperature', value: 66, level: 'normal' },
  { label: 'Hopper Level', value: 68, level: 'normal' },
  { label: 'Zone 1 Temperature', value: 201, level: 'normal' },
  { label: 'Zone 2 Temperature', value: 202, level: 'normal' },
  { label: 'Zone 3 Temperature', value: 203, level: 'normal' },
  { label: 'Melt Temperature', value: 214, level: 'normal' },
  { label: 'Melt Pressure', value: 10.0, level: 'alert' },
  { label: 'Screw RPM', value: 60.9, level: 'alert' },
];

// Demo 3, page 1: all fifteen current values healthy.
const DEMO_3_POINTS: ExpectedPoint[] = [
  { label: 'Motor DE Vibration', value: 1.55, level: 'normal' },
  { label: 'Motor NDE Vibration', value: 1.45, level: 'normal' },
  { label: 'Motor Temperature', value: 46, level: 'normal' },
  { label: 'Motor RPM', value: 2000, level: 'normal' },
  { label: 'Motor Power', value: 18.5, level: 'normal' },
  { label: 'Gearbox Input Vibration', value: 1.6, level: 'normal' },
  { label: 'Gearbox Output Vibration', value: 2.45, level: 'normal' },
  { label: 'Gearbox Temperature', value: 59, level: 'normal' },
  { label: 'Hopper Level', value: 70, level: 'normal' },
  { label: 'Zone 1 Temperature', value: 200, level: 'normal' },
  { label: 'Zone 2 Temperature', value: 201, level: 'normal' },
  { label: 'Zone 3 Temperature', value: 200, level: 'normal' },
  { label: 'Melt Temperature', value: 220, level: 'normal' },
  { label: 'Melt Pressure', value: 8.1, level: 'normal' },
  { label: 'Screw RPM', value: 65, level: 'normal' },
];

// --- pipeline ----------------------------------------------------------------

const RACK_IDS: Record<string, string[]> = {
  healthy: ['sim-sse-healthy-r1', 'sim-sse-healthy-r2'],
  faulty: ['sim-sse-faulty-r1', 'sim-sse-faulty-r2'],
  prediction: ['sim-sse-prediction-r1', 'sim-sse-prediction-r2'],
};

const EMPTY_HISTORY: ConditionHistory = {
  samples: [],
  windowHours: 0,
  sampleIntervalHours: 1 / 3600,
  source: 'none',
};

type Scenario = {
  machine: MachineNode;
  mappedChannels: MappedChannel[];
  conditions: PointCondition[];
  components: ReturnType<typeof rollUpComponents>;
  summary: ReturnType<typeof summarizeMachine>;
  ranked: ReturnType<typeof rankDiagnoses>;
  runState: ReturnType<typeof deriveRunState>;
  analysis: ReturnType<typeof deriveAnalysis>;
  byLabel: Map<string, PointCondition>;
};

function buildScenario(profile: keyof typeof RACK_IDS, devices: DeviceNode[], cards: CardNode[]): Scenario {
  const rackIds = new Set(RACK_IDS[profile]);
  const scopedDevices = devices.filter((d) => d.type !== 'Rack' || rackIds.has(d.id));
  const channels = listChannels(scopedDevices, cards).filter((c) => rackIds.has(c.rackId));

  let seq = 0;
  const machine: MachineNode = {
    id: `sse-${profile}`,
    projectId: 'demo',
    folderId: 'demo',
    name: profile === 'prediction' ? 'SSE Prediction Demo' : 'Single Screw Extruder',
    template: 'Single Screw Extruder',
    components: componentsForTemplate('Single Screw Extruder', () => `c-${profile}-${seq++}`),
  };

  // Same shape MachineWorkspace produces from a saved canvas layout: the box's
  // template pad supplies the label and the point code, the rack channel
  // supplies the reading.
  const mappedChannels: MappedChannel[] = channels.flatMap((channel) => {
    const pad = PAD_FOR_CHANNEL_LABEL[channel.label];
    if (!pad) return [];
    return [{ id: `box-${profile}-${pad.code}`, channel, label: pad.label, templatePointCode: pad.code }];
  });

  const conditions = mappedChannels.map((mapped) => {
    const card = cards.find((c) => c.deviceId === mapped.channel.rackId && c.slot === mapped.channel.slot) ?? null;
    return derivePointCondition({
      machineId: machine.id,
      machineName: profile === 'prediction' ? 'SSE Prediction Demo' : machine.name,
      mapped,
      card,
      channelIndex: channelNumberFor(mapped.channel) - 1,
      history: EMPTY_HISTORY,
      reading: { value: null, status: 'none' },
      isoGroup: DEFAULT_ISO_GROUP,
      componentId: attributeToComponent(mapped.label, machine.components),
      online: true,
    });
  });

  const components = rollUpComponents(machine, conditions);
  const summary = summarizeMachine(conditions);
  const ranked = rankDiagnoses(components);
  const runState = deriveRunState(conditions);
  const analysis = deriveAnalysis({
    machine,
    mappedChannels,
    conditions,
    components,
    summary,
    ranked,
    runState,
    devices: scopedDevices,
    cards,
  });
  // Keyed by the demo script's own wording, so the assertions below read the way
  // the demo table does.
  const byLabel = new Map<string, PointCondition>();
  for (const mapped of mappedChannels) {
    const condition = conditions.find((c) => c.id === mapped.id);
    if (condition) byLabel.set(mapped.channel.label, condition);
  }

  return { machine, mappedChannels, conditions, components, summary, ranked, runState, analysis, byLabel };
}

function conditionOfComponent(scenario: Scenario, label: string): OverviewCondition | null {
  return scenario.analysis.train.find((node) => node.name === label)?.condition ?? null;
}

function issue(scenario: Scenario, id: string): Issue | null {
  return scenario.analysis.issues.find((i) => i.id === id) ?? null;
}

function inputTable(scenario: Scenario, expected: ExpectedPoint[], demo: string) {
  console.log(`\n--- ${demo}: Part 1 input ---`);
  for (const row of expected) {
    const c = scenario.byLabel.get(row.label);
    if (!c) {
      check(`${demo} · ${row.label} is mapped`, false);
      continue;
    }
    const value = c.value ?? NaN;
    const matches = Math.abs(value - row.value) < 1e-6;
    check(
      `${demo} · ${row.label} reads ${row.value} ${c.unit}`,
      matches,
      matches ? '' : `got ${value}`,
    );
    check(
      `${demo} · ${row.label} is ${row.level.toUpperCase()}`,
      c.level === row.level,
      c.level === row.level ? '' : `got ${c.level}`,
    );
    check(
      `${demo} · ${row.label} limits are commissioned, not inferred`,
      c.thresholds.configured,
      c.thresholds.configured ? '' : 'inferred',
    );
    // The level the demo table states must be the one the shared threshold
    // function produces from the stated value, not just the one the point
    // happens to carry.
    check(
      `${demo} · ${row.label} level follows from its configured limits`,
      levelFor(row.value, c.thresholds) === row.level,
      `${levelFor(row.value, c.thresholds)} vs ${row.level}`,
    );
  }
}

// --- run ---------------------------------------------------------------------

const workspace = ensureSseSimulationWorkspace([], []);
const healthy = buildScenario('healthy', workspace.devices, workspace.cards);
const faulty = buildScenario('faulty', workspace.devices, workspace.cards);
const prediction = buildScenario('prediction', workspace.devices, workspace.cards);

for (const [demo, scenario] of [['Demo 1', healthy], ['Demo 2', faulty], ['Demo 3', prediction]] as const) {
  check(`${demo} · all 15 demo measurement points are mapped`, scenario.conditions.length === 15, `${scenario.conditions.length}/15`);
  check(`${demo} · every point is attributed to a train element`, scenario.conditions.every((c) => c.componentId !== null),
    scenario.conditions.filter((c) => c.componentId === null).map((c) => c.label).join(', '));
  check(`${demo} · machine reads RUNNING`, scenario.runState.label === 'RUNNING', scenario.runState.label);
  // "Diagnostic integrity / data quality should show GOOD if all demo inputs are
  // valid" - every channel reporting, none frozen, every limit commissioned.
  check(`${demo} · data quality is GOOD`, scenario.analysis.dataQuality === 'good', scenario.analysis.dataQuality);
}

// =============================================================================
// DEMO 1 — Healthy SSE
// =============================================================================

inputTable(healthy, DEMO_1_POINTS, 'Demo 1');

console.log('\n--- Demo 1: page 2 Overview ---');
check('Demo 1 · complete machine is HEALTHY', healthy.summary.level === 'normal', healthy.summary.level);
check('Demo 1 · overview condition is healthy', healthy.analysis.condition === 'healthy', healthy.analysis.condition);
check('Demo 1 · DANGER count is 0', healthy.summary.dangerCount === 0, String(healthy.summary.dangerCount));
check('Demo 1 · ALERT count is 0', healthy.summary.alertCount === 0, String(healthy.summary.alertCount));
check('Demo 1 · 15/15 points available', healthy.conditions.filter((c) => c.online).length === 15);
check(
  'Demo 1 · no active problem group',
  healthy.analysis.issues.filter((i) => i.condition === 'alert' || i.condition === 'danger').length === 0,
  healthy.analysis.issues.map((i) => `${i.id}:${i.condition}`).join(', '),
);
for (const part of ['Drive', 'Gear Box', 'Feed', 'Screw and Barrel']) {
  const condition = conditionOfComponent(healthy, part);
  check(`Demo 1 · ${part} is healthy`, condition === 'healthy', String(condition));
}

console.log('\n--- Demo 1: page 3 Diagnosis ---');
check('Demo 1 · no fault is invented', healthy.ranked.length === 0, healthy.ranked.map((r) => r.id).join(', '));
check(
  'Demo 1 · no downstream-restriction diagnosis',
  issue(healthy, 'dx-process-downstream-restriction') === null,
);

console.log('\n--- Demo 1: page 4 Prognosis ---');
check(
  'Demo 1 · no reliable threshold crossing is projected',
  healthy.conditions.every((c) => c.prognosis.daysToDanger === null),
  healthy.conditions.filter((c) => c.prognosis.daysToDanger !== null).map((c) => c.label).join(', '),
);
check(
  'Demo 1 · no predictive finding is raised',
  (healthy.analysis.prognostics?.predictions.length ?? 0) === 0,
  (healthy.analysis.prognostics?.predictions ?? []).map((p) => p.faultName).join(', '),
);

// =============================================================================
// DEMO 2 — Faulty SSE: developing downstream process restriction
// =============================================================================

inputTable(faulty, DEMO_2_POINTS, 'Demo 2');

console.log('\n--- Demo 2: page 1 process invariants ---');
{
  const motorRpm = faulty.byLabel.get('Motor RPM')?.value ?? NaN;
  const screwRpm = faulty.byLabel.get('Screw RPM')?.value ?? NaN;
  const ratio = motorRpm / screwRpm;
  check('Demo 2 · motor/screw speed ratio is ~30.79', Math.abs(ratio - 30.79) < 0.01, ratio.toFixed(4));
  const healthyRatio = 2000 / 65;
  check('Demo 2 · ratio is unchanged from healthy', Math.abs(ratio - healthyRatio) < 0.02, `${ratio.toFixed(3)} vs ${healthyRatio.toFixed(3)}`);
}

console.log('\n--- Demo 2: page 2 Overview ---');
check('Demo 2 · complete machine is ALERT', faulty.summary.level === 'alert', faulty.summary.level);
check('Demo 2 · complete machine is not DANGER', faulty.summary.dangerCount === 0, String(faulty.summary.dangerCount));
check('Demo 2 · overview condition is alert', faulty.analysis.condition === 'alert', faulty.analysis.condition);
check('Demo 2 · seven points are at ALERT', faulty.summary.alertCount === 7, String(faulty.summary.alertCount));

{
  const restriction = issue(faulty, 'dx-process-downstream-restriction');
  check('Demo 2 · a downstream-restriction problem group exists', restriction !== null);
  if (restriction) {
    check('Demo 2 · it is the highest-priority problem', faulty.analysis.issues[0]?.id === restriction.id,
      faulty.analysis.issues[0]?.id ?? 'none');
    check('Demo 2 · it is a process problem', restriction.category === 'process', restriction.category);
    check('Demo 2 · it is ALERT, not DANGER', restriction.condition === 'alert', restriction.condition);
    check('Demo 2 · it is located on the downstream melt path',
      restriction.componentLabel === 'Downstream melt path', restriction.componentLabel);
    check('Demo 2 · the priority action is to inspect the screen pack and die',
      restriction.action ===
        'Inspect screen-pack differential condition and downstream die/melt-flow path; clean or replace the restricted element if confirmed, then verify pressure, power, speed and vibration return toward baseline.',
      restriction.action);
  }
}

check(
  'Demo 2 · one related problem group, not many separate sensor faults',
  faulty.analysis.issues.filter((i) => i.condition === 'alert' || i.condition === 'danger').length === 1,
  faulty.analysis.issues.filter((i) => i.condition === 'alert' || i.condition === 'danger').map((i) => i.id).join(', '),
);
check(
  'Demo 2 · no separate top-level issue per abnormal sensor',
  faulty.analysis.issues.every((i) => !i.id.startsWith('pt-')),
  faulty.analysis.issues.filter((i) => i.id.startsWith('pt-')).map((i) => i.id).join(', '),
);
check(
  'Demo 2 · no bearing / misalignment / gear-damage claim without spectral evidence',
  faulty.analysis.issues.every((i) => !/bearing|misalign|gear tooth|unbalance/i.test(i.title)),
  faulty.analysis.issues.map((i) => i.title).join(' | '),
);

console.log('\n--- Demo 2: page 2 group conditions ---');
check('Demo 2 · Material Feeding is HEALTHY', faulty.byLabel.get('Hopper Level')?.level === 'normal');
check(
  'Demo 2 · Heating / Barrel Zones are HEALTHY',
  ['Zone 1 Temperature', 'Zone 2 Temperature', 'Zone 3 Temperature'].every((l) => faulty.byLabel.get(l)?.level === 'normal'),
);
check('Demo 2 · Pressure Generation is ALERT', faulty.byLabel.get('Melt Pressure')?.level === 'alert');
check('Demo 2 · Drive Loading is ALERT', faulty.byLabel.get('Motor Power')?.level === 'alert');
check('Demo 2 · Motor is ALERT', conditionOfComponent(faulty, 'Drive') === 'alert', String(conditionOfComponent(faulty, 'Drive')));
// "Gearbox: load affected; do not show a confirmed gearbox defect without
// spectral evidence" — and the same for the motor, whose vibration rise is a
// load response. The train panel is where a signature rule would surface it.
for (const part of ['Drive', 'Gear Box', 'Screw and Barrel']) {
  const node = faulty.analysis.train.find((t) => t.name === part);
  check(`Demo 2 · ${part} claims no mechanical defect without spectral evidence`,
    node !== undefined && !/bearing|misalign|unbalance|looseness|gear tooth|lubricat/i.test(node.observation),
    node?.observation ?? 'missing');
  check(`Demo 2 · ${part} is reported as a load response to the restriction`,
    node !== undefined && /load response to the downstream process restriction/i.test(node.observation),
    node?.observation ?? 'missing');
}
check('Demo 2 · no failure-mode signature survives as a machine finding',
  faulty.analysis.findings.length === 0, faulty.analysis.findings.map((f) => f.headline).join(', '));

console.log('\n--- Demo 2: page 3 Diagnosis ---');
{
  const restriction = issue(faulty, 'dx-process-downstream-restriction');
  check('Demo 2 · diagnosis is a developing downstream process restriction',
    restriction?.title === 'Developing downstream process restriction', restriction?.title ?? 'none');
  check('Demo 2 · the critical path names screen-pack / die as the direction',
    /downstream melt path/i.test(faulty.analysis.criticalPath ?? ''), faulty.analysis.criticalPath ?? 'none');
}
// Supporting evidence the script requires the page to carry, each traced to a
// live reading rather than to the scenario label.
for (const [label, value] of [
  ['Melt Pressure', 10.0],
  ['Motor Power', 27],
  ['Motor RPM', 1875],
  ['Screw RPM', 60.9],
  ['Motor DE Vibration', 3.2],
  ['Motor NDE Vibration', 2.9],
  ['Gearbox Output Vibration', 3.0],
] as const) {
  const signal = faulty.analysis.diagnosisSignals.find((s) => s.label.startsWith(PAD_FOR_CHANNEL_LABEL[label].label));
  check(`Demo 2 · ${label} is shown as supporting evidence at ${value}`,
    signal !== undefined && Math.abs(signal.value - value) < 1e-6,
    signal ? String(signal.value) : 'not shown');
}
// Contradicting / limiting evidence.
for (const label of ['Zone 1 Temperature', 'Zone 2 Temperature', 'Zone 3 Temperature', 'Hopper Level', 'Gearbox Temperature', 'Motor Temperature']) {
  check(`Demo 2 · ${label} stays HEALTHY (limiting evidence)`, faulty.byLabel.get(label)?.level === 'normal',
    String(faulty.byLabel.get(label)?.level));
}

console.log('\n--- Demo 2: page 4 Prognosis ---');
check('Demo 2 · current condition is ALERT', faulty.analysis.condition === 'alert', faulty.analysis.condition);
check(
  'Demo 2 · no days-to-DANGER is invented from a single snapshot',
  faulty.conditions.every((c) => c.prognosis.daysToDanger === null),
  faulty.conditions.filter((c) => c.prognosis.daysToDanger !== null).map((c) => c.label).join(', '),
);
check(
  'Demo 2 · no long-term forecast is offered without degradation history',
  (faulty.analysis.prognostics?.activeForecasts.length ?? 0) === 0,
  (faulty.analysis.prognostics?.activeForecasts ?? []).map((p) => p.faultName).join(', '),
);
check(
  'Demo 2 · every prediction reports insufficient history rather than a date',
  (faulty.analysis.prognostics?.predictions ?? []).every(
    (p) => p.predictionStatus === 'INSUFFICIENT_HISTORY' || p.predictionStatus === 'NOT_PREDICTABLE' || p.predictionStatus === 'MONITORING',
  ),
  (faulty.analysis.prognostics?.predictions ?? []).map((p) => `${p.faultName}:${p.predictionStatus}`).join(', '),
);
check(
  'Demo 2 · no machine failure horizon is asserted',
  (faulty.analysis.prognostics?.machineFailureHorizonDays ?? null) === null,
  String(faulty.analysis.prognostics?.machineFailureHorizonDays),
);

// =============================================================================
// DEMO 3 — Predictive SSE: healthy now, gearbox-output degradation in history
// =============================================================================

inputTable(prediction, DEMO_3_POINTS, 'Demo 3');

console.log('\n--- Demo 3: page 2 Overview ---');
check('Demo 3 · complete machine is HEALTHY', prediction.summary.level === 'normal', prediction.summary.level);
check('Demo 3 · overview condition is healthy', prediction.analysis.condition === 'healthy', prediction.analysis.condition);
check('Demo 3 · 0 current ALERT/DANGER problems', prediction.summary.alertCount + prediction.summary.dangerCount === 0,
  `${prediction.summary.alertCount}/${prediction.summary.dangerCount}`);
check('Demo 3 · 15/15 current measurements HEALTHY',
  prediction.conditions.filter((c) => c.level === 'normal').length === 15,
  String(prediction.conditions.filter((c) => c.level === 'normal').length));
check(
  'Demo 3 · no current ALERT/DANGER problem group is shown',
  prediction.analysis.issues.every((i) => i.condition !== 'alert' && i.condition !== 'danger'),
  prediction.analysis.issues.filter((i) => i.condition === 'alert' || i.condition === 'danger').map((i) => i.id).join(', '),
);
{
  const gbo = prediction.byLabel.get('Gearbox Output Vibration');
  check('Demo 3 · gearbox output RMS is below its H threshold',
    gbo !== undefined && gbo.value !== null && gbo.value < gbo.thresholds.alert,
    gbo ? `${gbo.value} < ${gbo.thresholds.alert}` : 'missing');
  check('Demo 3 · gearbox output carries 120 days of history',
    gbo !== undefined && Math.abs(gbo.windowHours - 120 * 24) < 1e-6, gbo ? `${gbo.windowHours} h` : 'missing');
  check('Demo 3 · that history rises persistently',
    gbo !== undefined && gbo.rising && gbo.changeFraction > 0.4, gbo ? gbo.changeFraction.toFixed(3) : 'missing');
  check('Demo 3 · gearbox input stays comparatively stable',
    prediction.byLabel.get('Gearbox Input Vibration')?.rising === false);
}

console.log('\n--- Demo 3: predictive summary ---');
{
  const predictions = prediction.analysis.prognostics?.predictions ?? [];
  check('Demo 3 · exactly one predictive finding', predictions.length === 1,
    predictions.map((p) => p.faultName).join(', '));
  const gearbox = predictions[0];
  if (gearbox) {
    check('Demo 3 · it is located at the gearbox output side',
      gearbox.location.some((l) => /gearbox output/i.test(l)), gearbox.location.join(' / '));
    check('Demo 3 · degradation is reported as detected',
      gearbox.degradationDetected && gearbox.predictionStatus !== 'INSUFFICIENT_HISTORY',
      `${gearbox.degradationDetected} / ${gearbox.predictionStatus}`);
    check('Demo 3 · it does not overwrite the current machine condition',
      prediction.analysis.condition === 'healthy', prediction.analysis.condition);
    check('Demo 3 · 120 days of history back the forecast',
      Math.abs(gearbox.historyDurationDays - 120) < 0.5, String(gearbox.historyDurationDays));
    check('Demo 3 · projected ALERT crossing is 12-18 days',
      gearbox.estimatedTimeToAlertDays !== null && gearbox.estimatedTimeToAlertDays >= 12 && gearbox.estimatedTimeToAlertDays <= 18,
      gearbox.estimatedTimeToAlertDays === null ? 'none' : gearbox.estimatedTimeToAlertDays.toFixed(1));
    check('Demo 3 · projected DANGER crossing is 70-90 days',
      gearbox.estimatedTimeToDangerDays !== null && gearbox.estimatedTimeToDangerDays >= 70 && gearbox.estimatedTimeToDangerDays <= 90,
      gearbox.estimatedTimeToDangerDays === null ? 'none' : gearbox.estimatedTimeToDangerDays.toFixed(1));
    check('Demo 3 · DANGER is projected later than ALERT',
      gearbox.estimatedTimeToAlertDays !== null && gearbox.estimatedTimeToDangerDays !== null &&
        gearbox.estimatedTimeToDangerDays > gearbox.estimatedTimeToAlertDays);
    check('Demo 3 · the forecast is worded as a threshold projection, not a failure date',
      gearbox.thresholdProjectionWording !== null && !/will fail/i.test(gearbox.thresholdProjectionWording),
      gearbox.thresholdProjectionWording ?? 'none');
  }
}

console.log('\n--- Demo 3: page 3 Diagnosis ---');
check('Demo 3 · current diagnosis is HEALTHY with no current fault',
  prediction.ranked.length === 0, prediction.ranked.map((r) => r.id).join(', '));
check('Demo 3 · no downstream-restriction diagnosis', issue(prediction, 'dx-process-downstream-restriction') === null);
check('Demo 3 · motor vibration stays healthy and stable',
  ['Motor DE Vibration', 'Motor NDE Vibration'].every((l) => prediction.byLabel.get(l)?.level === 'normal'));
check('Demo 3 · motor power and melt pressure stay healthy',
  ['Motor Power', 'Melt Pressure'].every((l) => prediction.byLabel.get(l)?.level === 'normal'));
check('Demo 3 · gearbox temperature stays healthy', prediction.byLabel.get('Gearbox Temperature')?.level === 'normal');

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
