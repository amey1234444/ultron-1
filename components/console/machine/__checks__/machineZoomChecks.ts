/**
 * Checks for the saved machine size.
 *
 * There is no test runner in this project, so these run as a script the same
 * way `twinScrewChecks.ts` does:
 *
 *   npm run check:machine-zoom
 *
 * Exit code is non-zero if anything fails.
 *
 * What is worth checking here is the precedence and the round trip, because
 * both are easy to get subtly wrong and neither shows up as a crash: a template
 * resize that silently overrides a machine somebody already sized by hand, or a
 * size that survives the client and is dropped on the way to the database, both
 * look like nothing happening.
 *
 * Nothing is re-implemented. Every assertion imports the shipped module.
 */

import {
  clampMachineZoom,
  DEFAULT_MACHINE_ZOOM,
  MACHINE_ZOOM_STEP,
  MAX_MACHINE_ZOOM,
  MIN_MACHINE_ZOOM,
  resolveMachineZoom,
  roundMachineZoom,
} from '../../../../lib/machineZoom';

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — got: ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n--- What counts as a size ---');

check('a size inside the range is kept', clampMachineZoom(1.4) === 1.4);
check('a size above the range is pulled back to the maximum', clampMachineZoom(9) === MAX_MACHINE_ZOOM, String(clampMachineZoom(9)));
check('a size below the range is pulled up to the minimum', clampMachineZoom(0.01) === MIN_MACHINE_ZOOM, String(clampMachineZoom(0.01)));

// A hand-edited payload must not be able to leave a machine at a size the zoom
// control cannot reach, because there would then be no way to undo it.
const NOT_SIZES: [string, unknown][] = [
  ['null', null],
  ['undefined', undefined],
  ['a string', 'big'],
  ['an object', {}],
  ['an array', []],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['-Infinity', Number.NEGATIVE_INFINITY],
];
for (const [label, bad] of NOT_SIZES) {
  check(`${label} is not a size`, clampMachineZoom(bad) === null, String(clampMachineZoom(bad)));
}

check(
  'a size is stored at the granularity the control moves in',
  roundMachineZoom(1 + MACHINE_ZOOM_STEP * 3) === 1.3,
  String(roundMachineZoom(1 + MACHINE_ZOOM_STEP * 3)),
);
check('a stored size round-trips through the clamp unchanged', clampMachineZoom(clampMachineZoom(1.7)) === 1.7);

// ---------------------------------------------------------------------------
console.log('\n--- Which size a machine opens at ---');

check(
  'with nothing saved anywhere, a machine opens at the default',
  resolveMachineZoom(null, null) === DEFAULT_MACHINE_ZOOM,
);

// The case this whole mechanism exists for: a super admin sizes the template,
// and a machine created from it afterwards has no size of its own.
check(
  "a new machine opens at the size saved on its template",
  resolveMachineZoom({ machineZoom: undefined }, { machineZoom: 1.6 }) === 1.6,
  String(resolveMachineZoom({ machineZoom: undefined }, { machineZoom: 1.6 })),
);
check(
  'a machine with no layout at all still picks up its template size',
  resolveMachineZoom(null, { machineZoom: 0.8 }) === 0.8,
);

// The complement: a template is a starting point, not an override. Resizing a
// template must not disturb a machine somebody has already sized by hand.
check(
  "a machine's own saved size wins over its template's",
  resolveMachineZoom({ machineZoom: 0.7 }, { machineZoom: 1.6 }) === 0.7,
  String(resolveMachineZoom({ machineZoom: 0.7 }, { machineZoom: 1.6 })),
);
check(
  'a machine saved at exactly 100% is not mistaken for one that was never sized',
  resolveMachineZoom({ machineZoom: 1 }, { machineZoom: 1.6 }) === 1,
  String(resolveMachineZoom({ machineZoom: 1 }, { machineZoom: 1.6 })),
);

check(
  'a corrupt size on a machine falls through to the template rather than to the default',
  resolveMachineZoom({ machineZoom: Number.NaN }, { machineZoom: 1.3 }) === 1.3,
  String(resolveMachineZoom({ machineZoom: Number.NaN }, { machineZoom: 1.3 })),
);
check(
  'a corrupt size everywhere still opens the machine at the default',
  resolveMachineZoom({ machineZoom: Number.NaN }, { machineZoom: Number.NaN }) === DEFAULT_MACHINE_ZOOM,
);

// ---------------------------------------------------------------------------
console.log('\n--- The size survives the trip to storage and back ---');

/**
 * The database column is nullable and the client field is optional, so the
 * round trip has to preserve three states, not two: a size, no size, and a
 * size that was rejected. This mirrors what `saveMachineTemplate` writes and
 * what `getWorkspace` reads back, without needing a database to run.
 */
function throughStorage(input: unknown): number | null {
  const written = clampMachineZoom(input); // what the server stores
  return clampMachineZoom(written); // what it reads back
}

check('a saved size comes back as the same size', throughStorage(1.5) === 1.5);
check('an unsaved size comes back as unsaved', throughStorage(undefined) === null);
check('a rejected size is stored as unsaved rather than as zero', throughStorage('1.5') === null, String(throughStorage('1.5')));
check(
  'a size that came back from storage still opens the machine at that size',
  resolveMachineZoom({ machineZoom: throughStorage(1.5) ?? undefined }, null) === 1.5,
);

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.log(`\n${failures} CHECK(S) FAILED\n`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED\n');
