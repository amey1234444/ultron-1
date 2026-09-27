// Does the shared tree stay out of the Next-only tree?
//
// The repo builds two targets from one codebase (see README): Expo renders
// `app/`, Next renders `src/pages/`, and both consume the same React Native
// code in `components/`, `lib/` and `hooks/`. That only holds while the shared
// tree depends on nothing Next-specific — the moment a shared module imports
// from `src/`, the Expo target is importing web-only code and the split has
// quietly stopped being real.
//
// Nothing in the type system enforces this. tsconfig.json (Expo) includes the
// whole repo, so an import from `components/` into `src/` typechecks perfectly
// and fails later, on a device, as a runtime resolution error.
//
// Run: node scripts/checkBoundaries.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Trees that both targets share. Nothing here may reach into `src/`. */
const SHARED = ['app', 'components', 'lib', 'hooks'];
/** Every import specifier in a file, including multi-line import blocks. */
const SPEC = /(?:^|[\s(])(?:from|import|require)\s*\(?\s*['"]([^'"\n]+)['"]/g;

// List the trees whole and filter here. A `dir/**/*.ts` pathspec silently
// skips files sitting directly in `dir` -- git matches it with FNM_PATHNAME,
// so `lib/**/*.ts` never matches `lib/cn.ts`. That made an earlier version of
// this check pass against a violation planted to test it.
const files = execFileSync('git', ['ls-files', '--', ...SHARED], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

const violations = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(SPEC)) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    // Resolve against the importing file, then ask where it landed.
    const resolved = new URL(spec, new URL(file, 'file:///')).pathname.replace(/^\//, '');
    if (resolved.startsWith('src/')) {
      violations.push({ file, spec, resolved });
    }
  }
}

if (violations.length === 0) {
  console.log(`boundaries: ${files.length} shared files checked, no imports into src/`);
  process.exit(0);
}
console.error(`boundaries: ${violations.length} shared file(s) import from the Next-only tree\n`);
for (const v of violations) console.error(`  ${v.file}\n    -> ${v.spec}  (resolves to ${v.resolved})`);
console.error('\nMove the shared module into lib/, or keep the importer inside src/.');
process.exit(1);
