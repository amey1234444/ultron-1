/**
 * The workspace save actually saves, and says so when it does not.
 *
 * Three machines created in a folder were not there after a reload. Two
 * separate faults, both of which lose work without a word:
 *
 * **Both kinds of 409 were treated as one.** The endpoint answers 409 for two
 * unrelated reasons. `{ error, hierRevision }` means somebody else wrote
 * first — rebase and send again, and the edit lands. `{ error }` alone means
 * the payload was refused, which for this endpoint is a duplicate device name
 * or IP. The old client rebased and resent for both, so a refusal was retried
 * once with a byte-identical body, refused identically, and then abandoned
 * silently. One duplicate device anywhere in a workspace therefore discarded
 * every later hierarchy edit — create, delete, move — while each one appeared
 * to work until the page reloaded.
 *
 * **Nothing was written when the page went away.** Edits debounce by 700 ms
 * so a drag does not write a layout per frame, and that window is long enough
 * to create a machine and hit reload. The timer died with the page.
 *
 * Checked against the source: this is event wiring and response handling
 * inside a React hook, and what has to be true is structural — that the two
 * 409s are told apart, that a refusal reaches the operator, and that a
 * pending write survives unload.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  archiveDuplicateConfiguredDeviceIps,
  archiveDuplicateConfiguredDeviceNames,
  findDuplicateConfiguredDeviceIp,
  findDuplicateConfiguredDeviceName,
} from '../../lib/deviceUniqueness';
import type { DeviceNode } from '../../lib/devices';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

const store = readFileSync(join(process.cwd(), 'hooks/useWorkspaceStore.ts'), 'utf8');
const page = readFileSync(join(process.cwd(), 'app/index.tsx'), 'utf8');
const api = readFileSync(join(process.cwd(), 'src/pages/api/workspace/state.ts'), 'utf8');
const server = readFileSync(join(process.cwd(), 'src/server/workspace.ts'), 'utf8');

console.log('--- the two kinds of 409 ---');
ok('the server answers a concurrency conflict with the revision to rebase on',
  api.includes("hierRevision: result.hierRevision"));
ok('and refuses a duplicate device with a 409 that carries no revision',
  server.includes("throw new ApiError(409, 'IP is already configured.')")
  && server.includes('name is already configured'),
  'which is what makes the two distinguishable on the wire');
ok('the client tells them apart',
  store.includes("res.status === 409 && typeof json.hierRevision === 'number'"),
  'retrying a refusal sends the same bytes and gets the same answer');
ok('it rebases and resends only the concurrency one',
  store.includes('hierRev.current = json.hierRevision;') && store.includes('rebased: true'));
ok('a refusal is reported rather than retried',
  store.includes('setSaveError(json.error ??'),
  'the server says which device is duplicated, and that is actionable');
ok('the old blanket retry is gone',
  !store.includes('if (!retry) return flushHierarchy(true);'));

console.log('\n--- a pending write survives the page going away ---');
ok('pending edits are flushed on pagehide',
  store.includes("window.addEventListener('pagehide', flushNow)"),
  'the event that fires on reload, navigation and tab close, including iOS');
ok('and when the tab is hidden',
  store.includes("document.addEventListener('visibilitychange', onHidden)"),
  'a backgrounded mobile tab can be discarded without ever firing pagehide');
ok('the unload write uses keepalive',
  store.includes('keepalive: true'),
  'without it the browser cancels the fetch as the document goes');
ok('the debounce timer is cancelled first, so the flush is not raced',
  store.includes('if (saveTimer.current) clearTimeout(saveTimer.current);\n      void flushHierarchy({ keepalive: true });'));
ok('nothing is sent when there is nothing pending',
  store.includes('if (!persistedRef.current || !hierDirty.current) return;'));

console.log('\n--- failures are not swallowed ---');
ok('a transient failure is retried with a backoff',
  store.includes('const scheduleRetry =') && store.includes('retryDelay.current * 2'));
ok('the backoff is capped', store.includes('30_000'),
  'an unreachable server must not be hammered by a tab left open overnight');
ok('a successful write clears the error and the backoff',
  store.includes('retryDelay.current = 0;') && store.includes('setSaveError(null);'));
ok('the edit stays dirty until it is actually written',
  store.includes('hierDirty.current = false;') && store.split('hierDirty.current = false;').length === 2,
  'cleared in exactly one place — the success branch');
ok('timers are cleared when the store goes away',
  store.includes('if (retryTimer.current) clearTimeout(retryTimer.current);'));

console.log('\n--- the operator is told ---');
ok('the store exposes why a save was refused', store.includes('saveError: string | null;'));
ok('and the console shows it', page.includes('{saveError && ('));
ok('it says the work is still there and not to reload',
  page.includes('Your work is still here') && page.includes('do not reload first'),
  'the edit is on screen and in memory; only a reload destroys it');
ok('it can be dismissed', page.includes('onPress={dismissSaveError}'));

console.log('\n--- a malformed stored device does not take the hierarchy with it ---');
// The duplicate pass runs on load, before anything is drawn. It reads fields
// the type promises but stored JSON can lack — a row written by an older
// build, or one hand-edited. Throwing here is indistinguishable from "the
// asset hierarchy will not load", because that is what it causes.
const malformed = [
  { id: 'a', type: 'Gateway', archived: false },
  { id: 'b', type: 'Rack', name: 'R1', archived: false },
  { id: 'c', type: 'Gateway', name: 'GW', ip: '10.80.10.1', archived: false },
] as unknown as DeviceNode[];
let threw = '';
try {
  findDuplicateConfiguredDeviceIp(malformed);
  findDuplicateConfiguredDeviceName(malformed);
  archiveDuplicateConfiguredDeviceIps(malformed);
  archiveDuplicateConfiguredDeviceNames(malformed);
} catch (error) {
  threw = error instanceof Error ? error.message : String(error);
}
ok('a device with no ip or no name is skipped, not thrown on', threw === '', threw);
ok('and a well-formed device beside it is still read',
  findDuplicateConfiguredDeviceIp([...malformed, { ...malformed[2], id: 'd' } as DeviceNode])?.ip === '10.80.10.1',
  'guarding the read must not disable the rule');

console.log(failures === 0 ? '\nworkspace persistence: all checks passed' : `\nworkspace persistence: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
