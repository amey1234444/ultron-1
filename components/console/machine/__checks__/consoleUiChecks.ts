/**
 * Two screens that had grown past the shape they were designed in.
 *
 * **Add Machine** offered twenty-five templates as one flat two-column grid
 * of name-and-icon cards. There was no way to search it, nothing said which
 * part of the plant a template belonged to, and nothing said what you would
 * get — a machine picked from a template with no instrument points opens a
 * canvas with nothing on it, and the only way to find that out was to create
 * it and look.
 *
 * **The analysis tabs** distinguished their two sections by text alone, and
 * gave no indication of whether the section you were not on had anything to
 * report. On a healthy machine that is a wasted trip; on a failing one it is
 * a missed one.
 *
 * Checked against the source, because this is layout and wiring rather than
 * computation — what has to be true is that the pieces are present, that the
 * grouping covers every template exactly once, and that the badge counts come
 * from real data rather than being decorative.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TEMPLATE_FAMILY_ORDER } from '../AddMachineDialog';
import { connectorsForTemplate } from '../machineConnectors';
import { MACHINE_TEMPLATES } from '../../../../lib/machines';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

const dialog = readFileSync(join(process.cwd(), 'components/console/machine/AddMachineDialog.tsx'), 'utf8');
const tabs = readFileSync(join(process.cwd(), 'components/console/machine/analysis/AnalysisTabs.tsx'), 'utf8');
const nav = readFileSync(join(process.cwd(), 'components/console/machine/analysis/analysisNav.ts'), 'utf8');
const workspace = readFileSync(join(process.cwd(), 'components/console/machine/AnalysisWorkspace.tsx'), 'utf8');
const field = readFileSync(join(process.cwd(), 'components/console/FormField.tsx'), 'utf8');
const mlDiagnosisHook = readFileSync(join(process.cwd(), 'components/console/machine/ml/useMlDiagnosis.ts'), 'utf8');
const mlPrognosisHook = readFileSync(join(process.cwd(), 'components/console/machine/ml/useMlPrognosis.ts'), 'utf8');
const diagnosisRoute = readFileSync(join(process.cwd(), 'src/pages/api/ml/diagnosis/[id].ts'), 'utf8');

console.log('--- add machine: every template is reachable ---');
// The family map is typed Record<MachineTemplate, string>, so a missing
// template will not compile. What that cannot catch is a family nobody lists
// in the order array, which would drop those templates out of the dialog
// silently — they would be in the map and rendered nowhere.
const families = [...MACHINE_TEMPLATES].map((template) => {
  const match = dialog.match(new RegExp(`['"]?${template.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}['"]?: '([^']+)'`));
  return { template, family: match?.[1] };
});
const unmapped = families.filter((entry) => !entry.family);
ok('every template names a family', unmapped.length === 0, unmapped.map((e) => e.template).join(', '));
const orphaned = families.filter((entry) => entry.family && !(TEMPLATE_FAMILY_ORDER as readonly string[]).includes(entry.family));
ok('and every family is one the dialog renders', orphaned.length === 0,
  orphaned.map((e) => `${e.template} -> ${e.family}`).join(', ') || `${TEMPLATE_FAMILY_ORDER.length} families`);
const empty = TEMPLATE_FAMILY_ORDER.filter((family) => !families.some((entry) => entry.family === family));
ok('no family heading is empty', empty.length === 0, empty.join(', '));
ok('the families partition the list',
  families.length === MACHINE_TEMPLATES.length,
  `${MACHINE_TEMPLATES.length} templates across ${TEMPLATE_FAMILY_ORDER.length} families`);

console.log('\n--- add machine: you can find one, and see what it gives you ---');
ok('the list is searchable', dialog.includes('placeholder="Search templates'));
ok('search matches the family as well as the name',
  dialog.includes('TEMPLATE_FAMILY[candidate].toLowerCase().includes(needle)'),
  '"meal" should find the four meal-handling machines');
ok('a search that matches nothing says so', dialog.includes('No template matches'));
ok('each card says how many instrument points it has',
  dialog.includes('instrument point${points === 1'),
  'the difference between the templates, and not otherwise visible');
ok('a template with none says that too', dialog.includes("'no instrument points'"));
ok('the counts are read from the registry, not written out here',
  dialog.includes('connectorsForTemplate(candidate).length'),
  'a hardcoded number would drift the first time a registry changed');
ok('the choice is restated near the button', dialog.includes('No instrument points — this machine has no canvas to wire.'),
  'the grid scrolls, so the selected card may be off-screen by then');
ok('an odd row keeps its card at half width', dialog.includes('group.templates.length % 2 === 1'));
ok('the search box carries no empty label',
  field.includes('label?: string;') && field.includes('{label ? ('),
  'an empty string still renders a blank line where a label would be');

// The counts have to be right, or the card lies about the template.
for (const [template, expected] of [['Hammer Mill', 3], ['Flaking Mill M-102', 3], ['Solvent Extractor', 8], ['DTDC', 10]] as [string, number][]) {
  ok(`  ${template} reports ${expected}`, connectorsForTemplate(template).length === expected,
    `${connectorsForTemplate(template).length}`);
}
ok('  a generic template reports none', connectorsForTemplate('Motor').length === 0);

console.log('\n--- analysis tabs: which section, and whether it has anything ---');
ok('each section carries a glyph', nav.includes("icon: 'stethoscope'") && nav.includes("icon: 'chart-line-variant'"));
ok('and the tab renders it', tabs.includes('<MaterialCommunityIcons') && tabs.includes('name={entry.icon}'));
ok('the active section has a filled edge, not only a tint',
  tabs.includes("isActive ? 'bg-accent' : 'bg-transparent'"),
  'a tint alone reads as hover at a glance');
ok('a section with open items is badged', tabs.includes('usable && count > 0'));
ok('and a section with none is not', tabs.includes("counts?.[entry.key] ?? 0"),
  'zero is better said by no badge than by a nought');
ok('the badge is in the accessible label too',
  tabs.includes('count > 0 ? `, ${count} open` : \'\''));
ok('counts come from the data, not a constant',
  workspace.includes('diagnosis: data.issues.length')
  && workspace.includes('prognosis: data.prognostics?.activeForecasts.length ?? 0'));
ok('a forecast that is not tracking anything is not counted',
  workspace.includes('activeForecasts') && !workspace.includes('prognostics?.predictions.length'),
  'activeForecasts, not every prediction the model emitted');
const wired = (workspace.match(/tabsCounts=\{tabsCounts\}/g) ?? []).length;
ok('every analysis page receives them', wired === 4, `${wired} of 4 pages`);

console.log('\n--- a failure is blamed on the thing that failed ---');
// The panel reported "the analysis service answered 503" for a status the ML
// service cannot produce. That route answers 200 for every ML problem —
// unset, unreachable, timed out, no champion — carrying `degraded` and a
// sentence, because an advisory subsystem being down is a normal state. So a
// non-200 is this application: the session lookup, the database behind it,
// or the route. Naming the wrong machine sends whoever reads it to the wrong
// logs, and on a plant floor that is the expensive kind of wrong.
ok('the route answers 200 when the ML service is unavailable',
  diagnosisRoute.includes('degraded: true')
  && diagnosisRoute.includes('// 200, not 503.'),
  'which is what makes a non-200 provably local');
for (const [label, source, subject] of [
  ['diagnosis', mlDiagnosisHook, 'analysis'],
  ['prognosis', mlPrognosisHook, 'forecasting'],
] as const) {
  ok(`  the ${label} hook reads what the body said`,
    source.includes('body.error ?? body.detail ?? null'),
    'the status alone does not say which of the local causes it was');
  ok(`  and does not attribute it to the ${subject} service`,
    source.includes(`not the ${subject} service`)
    && !source.includes(`The ${subject} service answered \${result.status}`),
    'the sentence that was there stated as fact something the hook never learned');
  ok(`  a body it cannot read still names this application`,
    source.includes('This application answered ${result.status}'));
}

console.log(failures === 0 ? '\nconsole UI: all checks passed' : `\nconsole UI: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
