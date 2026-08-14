// Verification harness: does a canvas wired exactly like the user's screenshot
// reach the analyzer, and does a wrong-parameter connection get refused?
import { analyzeExtruder } from '../lib/analysis/extruder/pipeline';

type R = { label: string; templatePointCode?: string; value: number | null; unit: string; timestamp: string; quality?: string; valid?: boolean; source?: 'gateway' };

const now = new Date('2026-08-15T10:00:00Z').toISOString();
const r = (label: string, code: string, value: number, unit: string): R => ({
  label,
  templatePointCode: code,
  value,
  unit,
  quality: 'GOOD',
  valid: true,
  timestamp: now,
  source: 'gateway',
});

const wired: R[] = [
  r('Gearbox Vibration at Out', 'GEARBOX_VIB', 1.5, 'mm/s'),
  r('Motor Power', 'MOTOR_POWER', 34.5, 'kW'),
  r('Motor Driving End Vibration', 'MOTOR_DE_VIB', 0.76, 'mm/s'),
  r('Motor RPM', 'MOTOR_RPM', 1638, 'rpm'),
  r('Motor Temperature', 'MOTOR_TEMP', 68.6, '°C'),
  r('Gearbox Temperature', 'GEARBOX_TEMP', 67.8, '°C'),
  r('Screw RPM', 'SCREW_RPM', 43, 'rpm'),
  r('Hopper Level', 'HOPPER_LEVEL', 64.1, '%'),
  r('Barrel Zone 1 Temperature', 'BARREL_Z1_TEMP', 187.5, '°C'),
  r('Barrel Zone 2 Temperature', 'BARREL_Z2_TEMP', 183.3, '°C'),
  r('Barrel Zone 3 Temperature', 'BARREL_Z3_TEMP', 222.5, '°C'),
  r('Melt Temperature', 'MELT_TEMP', 228.8, '°C'),
  r('Melt Pressure', 'MELT_PRESSURE', 4.57, 'MPa'),
];

function show(title: string, readings: R[]) {
  const out = analyzeExtruder({ readings, history: {}, now });
  const d = out.extruder;
  console.log(`\n===== ${title} =====`);
  console.log('resolved :', d.resolvedSignals.map((s) => `${s.tag}=${s.value}${s.unit}`).join('  '));
  console.log('missing  :', d.missingTags.map((m) => `${m.tag}${m.essential ? '(essential)' : ''}`).join(', ') || 'none');
  for (const m of d.missingTags) if (m.note) console.log('   note   :', m.note.slice(0, 120) + '...');
  console.log('unconsumed:', d.unconsumedSignals.map((u) => u.label).join(', ') || 'none');
  console.log('rejected :', d.rejectedSignals.map((x) => `${x.label} -> ${x.error.slice(0, 90)}`).join('\n            ') || 'none');
  console.log('readiness:', out.readiness.score, out.readiness.ready ? 'READY' : 'NOT READY');
  console.log('state    :', d.inferredMachineState, '| candidates:', d.candidateFaults.join(', ') || 'none');
  console.log('limits   :', d.constraints.filter((c) => c.status === 'VIOLATION').map((c) => c.name).join(', ') || 'no violations');
  console.log('notEval  :', d.constraints.filter((c) => c.status !== 'PASS' && c.status !== 'VIOLATION').map((c) => c.name).join(', ') || 'none');
}

show('A. Wired exactly as the screenshot (Motor Power in kW)', wired);

show(
  'B. Same, but the meter current channel is on the motor electrical pad',
  wired.map((x) => (x.templatePointCode === 'MOTOR_POWER' ? r('Motor Power', 'MOTOR_POWER', 11.4, 'A') : x)),
);

show('C. A temperature channel wired to the melt-pressure pad', [
  ...wired.filter((x) => x.templatePointCode !== 'MELT_PRESSURE'),
  r('Melt Pressure', 'MELT_PRESSURE', 228.8, '°C'),
]);

show('D. Two cards claiming barrel zone 1', [...wired, r('Barrel Zone 1 Temperature (spare)', 'BARREL_Z1_TEMP', 500, '°C')]);

show('E. Nothing reporting', wired.map((x) => ({ ...x, value: null })));
