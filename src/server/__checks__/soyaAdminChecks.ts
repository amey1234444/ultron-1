/**
 * The SOYA super admin, provisioned from the environment, and login by email.
 *
 * Runs itself as child processes because the seed is read once, at module
 * load, into a module-global store — so each configuration needs its own
 * process to be observed honestly. A single process re-importing would
 * silently reuse the first seed and every case after the first would be
 * testing nothing.
 *
 * Exercised against the in-memory store, which is the path taken whenever
 * DATABASE_URL is unset. The Postgres path runs the same `seedSpecs()`
 * through `ready()`, keyed on username and equally idempotent; what differs
 * is only where the row lands.
 */
import { spawnSync } from 'node:child_process';

const PASSWORD = 'soya-check-password';

type Case = {
  name: string;
  env: Record<string, string | undefined>;
  expect: (out: string) => boolean;
  detail?: string;
};

// -- child mode -------------------------------------------------------------
// Invoked with ULTRON_SOYA_CHECK_CHILD=1, prints one line of findings.
if (process.env.ULTRON_SOYA_CHECK_CHILD === '1') {
  void (async () => {
    const users = await import('../users');
    const byUsername = await users.findByUsername(process.env.PROBE_USERNAME ?? '');
    const byEmail = await users.findByEmail(process.env.PROBE_EMAIL ?? '');
    const viaUsername = await users.verifyCredentials(process.env.PROBE_USERNAME ?? '', PASSWORD);
    const viaEmail = await users.verifyCredentials(process.env.PROBE_EMAIL ?? '', PASSWORD);
    const wrongPassword = await users.verifyCredentials(process.env.PROBE_EMAIL ?? '', 'not-the-password');
    console.log(JSON.stringify({
      exists: Boolean(byUsername),
      sameRowByEmail: Boolean(byEmail) && byEmail?.id === byUsername?.id,
      role: byUsername?.role ?? null,
      workspaceId: byUsername?.workspaceId ?? null,
      stockWorkspaceId: (await users.findByUsername('superadmin'))?.workspaceId ?? null,
      status: byUsername?.status ?? null,
      permissions: byUsername?.permissions ?? [],
      email: byUsername?.email ?? null,
      name: byUsername?.name ?? null,
      loginByUsername: Boolean(viaUsername),
      loginByEmail: Boolean(viaEmail),
      wrongPasswordRejected: wrongPassword === null,
      // The three stock seeds must survive alongside it.
      stockSuperAdmin: Boolean(await users.findByUsername('superadmin')),
      stockUser: Boolean(await users.findByUsername('user')),
    }));
  })();
} else {
  // -- parent mode ----------------------------------------------------------
  let failures = 0;
  function ok(name: string, condition: boolean, detail = '') {
    console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    if (!condition) failures++;
  }

  function run(env: Record<string, string | undefined>): { out: string; stderr: string } {
    const result = spawnSync(process.execPath, [process.argv[1]], {
      env: {
        ...process.env,
        ULTRON_SOYA_CHECK_CHILD: '1',
        NODE_ENV: 'development',
        DATABASE_URL: '',
        SOYA_SUPER_ADMIN_USERNAME: undefined,
        SOYA_SUPER_ADMIN_EMAIL: undefined,
        SOYA_SUPER_ADMIN_NAME: undefined,
        SOYA_SUPER_ADMIN_PASSWORD: undefined,
        PROBE_USERNAME: 'demo',
        PROBE_EMAIL: 'demo@example.test',
        ...env,
      } as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 120_000,
    });
    return { out: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '') + (result.stdout ?? '') };
  }

  console.log('--- fully configured ---');
  const configured = run({
    SOYA_SUPER_ADMIN_USERNAME: 'demo',
    SOYA_SUPER_ADMIN_EMAIL: 'demo@example.test',
    SOYA_SUPER_ADMIN_NAME: 'Demo Super Admin',
    SOYA_SUPER_ADMIN_PASSWORD: PASSWORD,
  });
  const r = JSON.parse(configured.out.split('\n').pop() ?? '{}');
  ok('the account is created', r.exists === true);
  ok('its role is super_admin', r.role === 'super_admin', String(r.role));
  ok('it is active, not pending', r.status === 'active', String(r.status),);
  ok('it carries the super-admin permission', Array.isArray(r.permissions) && r.permissions.length > 0,
    JSON.stringify(r.permissions));
  ok('the email is the one configured', r.email === 'demo@example.test', String(r.email));
  ok('the display name is the one configured', r.name === 'Demo Super Admin', String(r.name));
  ok('username and email resolve the same row', r.sameRowByEmail === true);
  ok('it logs in by username', r.loginByUsername === true);
  ok('it logs in by email address', r.loginByEmail === true);
  ok('a wrong password is refused', r.wrongPasswordRejected === true);
  ok('the stock seed accounts still exist', r.stockSuperAdmin === true && r.stockUser === true);
  // The whole point of the separate account: its own workspace, and not the
  // one every existing account is already in.
  ok('it has its own workspace', typeof r.workspaceId === 'string' && r.workspaceId.length > 0,
    String(r.workspaceId));
  ok('which is not the shared default', r.workspaceId !== r.stockWorkspaceId,
    `soya=${r.workspaceId} stock=${r.stockWorkspaceId}`);
  ok('and the stock accounts stay in the default workspace', r.stockWorkspaceId === 'default',
    String(r.stockWorkspaceId));

  console.log('\n--- no password configured ---');
  const noPassword = run({
    SOYA_SUPER_ADMIN_USERNAME: 'demo',
    SOYA_SUPER_ADMIN_EMAIL: 'demo@example.test',
  });
  const n = JSON.parse(noPassword.out.split('\n').pop() ?? '{}');
  // The whole point of having no fallback: absent configuration creates
  // nothing, rather than creating a super admin with a guessable password.
  ok('no account is created', n.exists === false);
  ok('and the stock seeds are unaffected', n.stockSuperAdmin === true);

  console.log('\n--- password set, identity missing ---');
  const noIdentity = run({ SOYA_SUPER_ADMIN_PASSWORD: PASSWORD });
  const i = JSON.parse(noIdentity.out.split('\n').pop() ?? '{}');
  ok('no account is created', i.exists === false);
  ok('and it says why', /SOYA_SUPER_ADMIN_USERNAME/.test(noIdentity.stderr),
    'a silent no-op here is indistinguishable from a broken deploy');

  console.log('\n--- an email address given as the username ---');
  const badUsername = run({
    SOYA_SUPER_ADMIN_USERNAME: 'demo@example.test',
    SOYA_SUPER_ADMIN_EMAIL: 'demo@example.test',
    SOYA_SUPER_ADMIN_PASSWORD: PASSWORD,
  });
  const b = JSON.parse(badUsername.out.split('\n').pop() ?? '{}');
  // Refused rather than created: the signup form's own rule excludes '@', and
  // a seeded username the app considers invalid cannot be edited afterwards.
  ok('it is refused, not created with an invalid username', b.exists === false);
  ok('and it says to use the email field instead',
    /SOYA_SUPER_ADMIN_EMAIL/.test(badUsername.stderr));

  console.log('\n--- a password below the application minimum ---');
  const shortPassword = run({
    SOYA_SUPER_ADMIN_USERNAME: 'demo',
    SOYA_SUPER_ADMIN_EMAIL: 'demo@example.test',
    // Seven characters, one below the application's minimum. A literal
    // rather than a real account's password: this file is about the
    // mechanism, and a test fixture is not a place to publish a
    // credential someone actually intends to use.
    SOYA_SUPER_ADMIN_PASSWORD: 'short12',
    PROBE_USERNAME: 'demo',
  });
  const sp = JSON.parse(shortPassword.out.split('\n').pop() ?? '{}');
  // Warned about, but still created. An operator provisioning from the
  // environment is making a deliberate choice, and failing closed would leave
  // them locked out with no explanation.
  ok('the account is still created', sp.exists === true);
  ok('and the short password is warned about', /eight characters/.test(shortPassword.stderr));

  console.log(failures === 0 ? '\nsoya admin: all checks passed' : `\nsoya admin: ${failures} check(s) failed`);
  if (failures > 0) process.exit(1);
}
