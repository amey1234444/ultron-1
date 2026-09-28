/**
 * What the console shows a workspace that has nothing in it.
 *
 * Workspaces used to always have content: the studio was global and seeded
 * once, so "no projects and no devices" was a state nobody reached. Now a
 * workspace can be created deliberately empty, and that state has to be
 * legible rather than look like a page that failed to load — which is exactly
 * how it looked, because the dashboard rendered anyway with every tile at
 * zero and nothing on it saying where to start.
 *
 * Two kinds of assertion. The components that carry an empty state are
 * rendered and their output inspected, because a component that renders
 * nothing is the failure. The ordering inside `app/index.tsx` is checked
 * against its source, because it is a chain of ternaries whose *order* is the
 * behaviour: the empty-workspace branch has to be reached before the
 * dashboard branch, and a later edit putting it after would silently restore
 * the bug.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { EmptyState } from '../EmptyState';
import { HierarchyContents } from '../HierarchyContents';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

console.log('--- the components that carry an empty state ---');

const emptyText = text(renderToStaticMarkup(
  createElement(EmptyState, {
    eyebrow: 'Empty workspace',
    title: 'Nothing here yet',
    description: 'Start with a project to hold the asset hierarchy.',
  }),
));
ok('EmptyState renders its title', emptyText.includes('Nothing here yet'));
ok('EmptyState renders its description', emptyText.includes('Start with a project'));
ok('EmptyState renders its eyebrow', emptyText.includes('Empty workspace'));

// A project that exists but holds nothing yet: the level between "empty
// workspace" and "a machine to look at".
const levelText = text(renderToStaticMarkup(
  createElement(HierarchyContents, {
    title: 'Plant 1',
    breadcrumb: '',
    childFolders: [],
    childMachines: [],
    folders: [],
    machines: [],
    onOpenFolder: () => {},
    onOpenMachine: () => {},
    onAddFolder: () => {},
    onAddMachine: () => {},
    canConfigure: true,
  }),
));
ok('an empty project still renders its own name', levelText.includes('Plant 1'));
ok('and says the level is empty rather than rendering blank', levelText.includes('empty'),
  levelText.slice(0, 80));
ok('and tells someone with access what to do',
  levelText.includes('Add Folder') || levelText.includes('Add Machine'));

const readOnlyText = text(renderToStaticMarkup(
  createElement(HierarchyContents, {
    title: 'Plant 1', breadcrumb: '', childFolders: [], childMachines: [],
    folders: [], machines: [], onOpenFolder: () => {}, onOpenMachine: () => {},
    onAddFolder: () => {}, onAddMachine: () => {},
    canConfigure: false,
  }),
));
ok('a read-only viewer is told it is empty without being offered actions',
  readOnlyText.includes('empty') && !readOnlyText.includes('Add Folder'));

console.log('\n--- the order of the branches in app/index.tsx ---');

const source = readFileSync(join(process.cwd(), 'app/index.tsx'), 'utf8');
const emptyBranch = source.indexOf('projects.length === 0 && gateways.length === 0');
const dashboardBranch = source.indexOf("selected.kind === 'none' || projects.length === 0");
const devicesBranch = source.indexOf("selected.kind === 'devices' ?");

ok('there is an empty-workspace branch', emptyBranch !== -1);
ok('it is reached before the dashboard branch', emptyBranch !== -1 && emptyBranch < dashboardBranch,
  'the dashboard renders zeroes for an empty workspace, which reads as a failed load');
ok('the devices view is still reached before it',
  devicesBranch !== -1 && devicesBranch < emptyBranch,
  'selecting Devices on an empty workspace must show the devices view');
ok('the empty-workspace branch offers a way to start',
  emptyBranch !== -1 && source.slice(emptyBranch, dashboardBranch).includes('Create Project'));

// The SSE demo hardware belongs to the default workspace only. Without this
// every workspace was refilled with three gateways and six racks nobody
// added, on every render, so deleting one did nothing.
ok('the SSE demo hardware is only injected into the default workspace',
  source.includes('if (!isDefaultWorkspace) return;'),
  'otherwise an empty workspace is never empty for long');

console.log(failures === 0 ? '\nempty workspace: all checks passed' : `\nempty workspace: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
