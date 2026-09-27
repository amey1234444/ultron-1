# Migrations that are safe to deploy

The schema change is usually the easy part. What breaks production is the lock it
takes, the rewrite it triggers, or the moment when the old code and the new schema
are both live.

---

## Lock levels: what each statement actually blocks

`ACCESS EXCLUSIVE` blocks *everything*, including `SELECT`. The table is
unavailable for the duration.

| Statement | Lock | Blocks reads? | Rewrites table? |
| --- | --- | --- | --- |
| `ADD COLUMN` (no default, or a constant default, PG 11+) | ACCESS EXCLUSIVE | yes, briefly | no — metadata only |
| `ADD COLUMN … DEFAULT <volatile>` | ACCESS EXCLUSIVE | yes | **yes** |
| `DROP COLUMN` | ACCESS EXCLUSIVE | yes, briefly | no — marks it dropped |
| `ALTER COLUMN … TYPE` | ACCESS EXCLUSIVE | yes | **usually yes** |
| `SET NOT NULL` | ACCESS EXCLUSIVE | yes, for a full scan | no |
| `ADD CONSTRAINT … CHECK` | ACCESS EXCLUSIVE | yes, for a full scan | no |
| `ADD CONSTRAINT … CHECK … NOT VALID` | ACCESS EXCLUSIVE | yes, briefly | no |
| `VALIDATE CONSTRAINT` | SHARE UPDATE EXCLUSIVE | **no** | no |
| `CREATE INDEX` | SHARE | no, blocks writes | no |
| `CREATE INDEX CONCURRENTLY` | SHARE UPDATE EXCLUSIVE | no | no |
| `DROP INDEX` | ACCESS EXCLUSIVE | yes, briefly | no |
| `RENAME` (table, column, constraint) | ACCESS EXCLUSIVE | yes, briefly | no |
| `CREATE OR REPLACE VIEW` / `FUNCTION` | — | no | no |

"Briefly" is the important word, and the trap: a brief `ACCESS EXCLUSIVE` still
has to *acquire* the lock, and it queues behind every in-flight query on the
table. Worse, once it is queued, every new query queues behind *it*. One long
`SELECT` plus one `ADD COLUMN` equals a stalled table. Hence:

```sql
SET lock_timeout = '3s';   -- fail fast instead of forming a queue
```

Set this at the top of every migration. A failed migration you retry is better
than a lock convoy.

### `SET NOT NULL` without the scan

The full-scan requirement can be avoided entirely if a validated `CHECK` already
proves it:

```sql
ALTER TABLE t ADD CONSTRAINT t_col_not_null CHECK (col IS NOT NULL) NOT VALID;
ALTER TABLE t VALIDATE CONSTRAINT t_col_not_null;   -- no read block
ALTER TABLE t ALTER COLUMN col SET NOT NULL;        -- PG 12+: uses the constraint, no scan
ALTER TABLE t DROP CONSTRAINT t_col_not_null;
```

---

## Expand / contract

Any change that would break the currently-running code has to be split, because
during a deploy both versions are live.

```
1. EXPAND    add the new thing, nullable / defaulted, old code unaffected
2. BACKFILL  in batches, out of band
3. MIGRATE   deploy code that writes both and reads the new
4. VERIFY    confirm nothing reads the old — logs, or a temporary trigger
5. CONTRACT  drop the old thing, in a later release
```

Renaming a column is the canonical case, and doing it in one step is how a deploy
breaks. Expand/contract for a rename:

1. add the new column;
2. backfill;
3. deploy code that writes both and reads the new;
4. drop the old column in the next release.

The tempting shortcut — an updatable view or a trigger that keeps the two in sync
— works, and is worth it only when step 3 cannot be coordinated.

### Never do these in one release

- rename a column or table that running code references
- add `NOT NULL` to a column the running code does not populate
- change a type in a way the running code's parameter binding does not produce
- drop a column the running code still `SELECT *`s and deserialises

---

## Backfills

Never `UPDATE` a large table in one statement: it holds row locks for the whole
duration, bloats the table with one dead tuple per row, and blocks `VACUUM` from
reclaiming anything until it commits.

```sql
-- One batch. Loop from the application or a DO block until zero rows are updated.
WITH batch AS (
  SELECT id FROM t
  WHERE new_col IS NULL
  ORDER BY id
  LIMIT 5000
  FOR UPDATE SKIP LOCKED
)
UPDATE t SET new_col = <expr>
FROM batch WHERE t.id = batch.id;
```

`FOR UPDATE SKIP LOCKED` means the backfill never fights live traffic for a row.
Commit between batches; sleep briefly if replication lag matters.

---

## A migration ledger, and why "idempotent" is not enough

A runtime that applies its own DDL on boot — common in serverless deployments
where there is no separate migration step — will re-run every statement on every
cold start. `IF NOT EXISTS` makes that *correct*. It does not make it *cheap*:

| Statement | Cost on the thousandth run |
| --- | --- |
| `CREATE TABLE IF NOT EXISTS` | catalog lookup. Free |
| `ADD COLUMN IF NOT EXISTS` | catalog lookup. Free |
| `CREATE INDEX IF NOT EXISTS` | catalog lookup. Free |
| `ALTER COLUMN … TYPE … USING …` | **ACCESS EXCLUSIVE, possible full rewrite. Every time** |
| `UPDATE t SET x = … WHERE x IS DISTINCT FROM …` | **full scan. Every time** |
| `DELETE … USING <self join>` | **full self-join. Every time** |
| `INSERT … SELECT FROM <legacy table>` | **full scan of the source. Every time** |

The bottom four need a ledger. The top three do not.

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL DEFAULT 'runtime'
);
```

```ts
// One transaction per step: a failure leaves neither a ledger row nor a
// half-applied change, so the next boot retries from the top.
async function once(version: string, statements: string[]): Promise<void> {
  const seen = await query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
  if (seen.rowCount) return;
  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      for (const sql of statements) await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
        [version],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}
```

**Write each guarded step so that re-running it is still harmless.** If a
deployment applied the same change through a separate migration tool, that tool's
history is not your ledger, and your step will run once more.

### The catalog guard

Better than a ledger where it applies, because it needs no bookkeeping and is
correct under any history — check the catalog and do nothing if the change is
already in place:

```sql
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('racks','rack_id'), ('measurements','rack_id'))
           AS v(tbl, col) LOOP
    IF to_regclass(r.tbl) IS NOT NULL AND EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = to_regclass(r.tbl) AND a.attname = r.col
        AND a.attnum > 0 AND NOT a.attisdropped
        AND a.atttypid <> 'text'::regtype
    ) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TEXT USING %I::TEXT',
                     r.tbl, r.col, r.col);
    END IF;
  END LOOP;
END $$;
```

In the steady state that is a catalog read instead of a table lock. Use both: the
catalog guard for correctness, the ledger to skip the work entirely.

### The advisory lock

Two instances booting in the same second will race through the same DDL.
`CREATE INDEX IF NOT EXISTS` from two connections at once is *not* safe — it can
fail on a duplicate `pg_class` row — and neither is a concurrent `ADD COLUMN IF
NOT EXISTS`. Serialise:

```ts
const MIGRATION_LOCK_KEY = 8274001;   // arbitrary, but every process must agree

async function withMigrationLock<T>(fn: () => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    // Session-level, not transaction-level: it has to outlive the individual
    // statements, which go through the pool.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try { return await fn(); }
    finally { await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]); }
  });
}
```

---

## Transactional DDL

Postgres can roll back DDL, which most databases cannot. Use it: wrap each
migration in a transaction and a failure leaves nothing behind.

The exceptions that cannot be inside a transaction block:

- `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY`
- `ALTER TYPE … ADD VALUE` (on an enum, before PG 12)
- `VACUUM`, `REINDEX CONCURRENTLY`, `CREATE DATABASE`

Put each of those in its own step.

---

## When there is no local Postgres

A syntax error in a migration that runs on cold start surfaces in production. Parse
before you ship, with the real grammar rather than a regex:

```bash
npm i pg-query-emscripten     # libpg_query compiled to wasm, no native build
node scripts/check-sql.mjs src/server/db.ts supabase/migrations/*.sql
```

`scripts/check-sql.mjs` in this skill does that, and also re-parses `DO` blocks and
function bodies with the plpgsql parser — to the SQL grammar alone, a procedural
body is just a string literal, so `END LOOP` spelled wrongly parses fine and fails
at runtime.

---

## The checklist

- [ ] `SET lock_timeout` at the top
- [ ] Every statement's lock level understood; nothing takes ACCESS EXCLUSIVE on a
      large table for a scan
- [ ] Constraints added `NOT VALID`; validation is a separate, deliberate step
- [ ] Indexes on live tables created `CONCURRENTLY`, outside a transaction
- [ ] Backfills batched, with `SKIP LOCKED`
- [ ] Nothing that breaks the currently-deployed code (expand/contract if it does)
- [ ] Reversible, or explicitly one-way with that stated
- [ ] Expensive one-time steps behind a ledger, not on the boot path
- [ ] Parsed with the real grammar before shipping
