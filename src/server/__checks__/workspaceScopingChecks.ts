/**
 * Every studio statement in workspace.ts is scoped to one workspace.
 *
 * This is a source check rather than a behavioural one, and deliberately so.
 * The failure it guards against is not one a functional test would catch on a
 * developer's machine: an unscoped `SELECT * FROM studio_machines` returns the
 * right answer for as long as there is only one workspace, and starts
 * returning another account's plant the day there are two. An unscoped
 * `DELETE FROM studio_cards` — which is what this module ran before workspaces
 * existed, because replaceHierarchy replaces the whole tree rather than
 * diffing it — would empty every other workspace the first time anyone pressed
 * Save.
 *
 * So the rule is mechanical: if a statement in this module names a
 * workspace-owned table, it must also name workspace_id. Anything that must
 * not be scoped is listed below with the reason, and the list is short on
 * purpose.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

/** Tables that carry a workspace_id and must always be filtered by it. */
const OWNED = [
  'studio_projects',
  'studio_folders',
  'studio_machines',
  'studio_devices',
  'studio_cards',
  'studio_machine_layouts',
  'studio_machine_templates',
];

/**
 * Statements allowed to name an owned table without naming workspace_id.
 *
 * Each is keyed on a distinctive fragment and carries the reason it is safe.
 * A new entry here is a decision to read across workspaces and should be
 * argued for in review, which is why it is a list and not a flag.
 */
const ALLOWED: { fragment: string; why: string }[] = [
  {
    fragment: 'SELECT workspace_id FROM studio_machines WHERE id = $1',
    why: 'resolves which workspace a machine is in; scoping it would be circular',
  },
  {
    fragment: 'SELECT * FROM studio_machines WHERE id = $1',
    why: 'findMachineAnywhere: background work with no session, documented as unscoped',
  },
  {
    fragment: 'SELECT * FROM studio_machines WHERE template = $1',
    why: 'machinesByTemplateAnywhere: background work with no session, documented as unscoped',
  },
  {
    fragment: 'FROM studio_machines m WHERE m.id = l.machine_id',
    why: 'orphan sweep, correlated to an already-scoped outer row',
  },
  {
    fragment: 'FROM studio_machines m WHERE m.id = c.machine_id',
    why: 'canvas cards are reached only by machine id, which is unique across workspaces',
  },
];

const source = readFileSync(join(process.cwd(), 'src/server/workspace.ts'), 'utf8');

// Statements are template literals or quoted strings passed to query()/q().
// Splitting on them rather than parsing SQL keeps this check honest about what
// it can see: it reports what it found, and a statement it cannot see is one
// it cannot vouch for.
const statements = [
  ...source.matchAll(/`([^`]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*)`/gis),
  ...source.matchAll(/'((?:SELECT|INSERT|UPDATE|DELETE)[^']*)'/gis),
].map((m) => m[1].replace(/\s+/g, ' ').trim());

ok('statements were found to check', statements.length > 10, `${statements.length} found`);

const touching = statements.filter((sql) => OWNED.some((table) => sql.includes(table)));
ok('statements touching owned tables were found', touching.length > 0, `${touching.length} found`);

const unscoped = touching.filter((sql) => {
  if (sql.includes('workspace_id')) return false;
  return !ALLOWED.some((entry) => sql.includes(entry.fragment));
});

ok(
  'every statement on a workspace-owned table names workspace_id',
  unscoped.length === 0,
  unscoped.length ? `\n      ${unscoped.join('\n      ')}` : `${touching.length} statements checked`,
);

// The destructive ones specifically, because these are the statements that
// would damage another workspace rather than merely leak from it.
const deletes = touching.filter((sql) => /^DELETE/i.test(sql));
ok('every DELETE is scoped', deletes.every((sql) => sql.includes('workspace_id') ||
  ALLOWED.some((entry) => sql.includes(entry.fragment))), `${deletes.length} deletes checked`);

// The singleton is gone; revisions are per workspace now.
ok('no statement still reads the studio_meta singleton',
  !statements.some((sql) => sql.includes('studio_meta')),
  'revision counters live in studio_workspaces');

// Every allow-list entry must still match something, or it is stale and is
// quietly widening the rule for a statement that no longer exists.
const stale = ALLOWED.filter((entry) => !touching.some((sql) => sql.includes(entry.fragment)));
ok('no allow-list entry is stale', stale.length === 0,
  stale.length ? stale.map((entry) => entry.fragment).join(' | ') : `${ALLOWED.length} entries, all live`);

console.log(failures === 0 ? '\nworkspace scoping: all checks passed' : `\nworkspace scoping: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
