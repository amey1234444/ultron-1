-- Promote the NOT VALID constraints to fully validated, one at a time.
--
-- 20260926000001_schema_integrity.sql adds every CHECK as NOT VALID, which means
-- Postgres enforces it on new and updated rows but has never looked at the rows
-- that were already stored. That is what makes the migration safe to deploy
-- without knowing the state of the data. It also means the database cannot yet
-- rely on the rule when planning, and nobody knows whether the stored rows
-- actually satisfy it.
--
-- This script closes that gap. Run it against the deployment (psql, or the
-- Supabase SQL editor) whenever you want the answer:
--
--     psql "$DATABASE_URL" -f scripts/validate-schema-constraints.sql
--
-- What it does, per constraint:
--   * tries VALIDATE CONSTRAINT, which scans the table once;
--   * on success, the constraint becomes a fact the planner may use;
--   * on failure, it reports the constraint and moves on, leaving it NOT VALID.
--
-- A failure is not an error in the constraint. It means there are stored rows
-- that break a rule the application believes it has always enforced, and those
-- rows are worth looking at -- that is the finding. Use the query printed at the
-- end to list them.
--
-- Locking: VALIDATE CONSTRAINT takes a SHARE UPDATE EXCLUSIVE lock, so reads and
-- writes continue; it does scan the whole table, so on measurement_history expect
-- it to take a while. Each constraint is validated in its own transaction, so
-- stopping the script part-way leaves the ones already done validated.

\set ON_ERROR_STOP off

DO $$
DECLARE
  c RECORD;
  ok INT := 0;
  failed INT := 0;
  skipped INT := 0;
BEGIN
  FOR c IN
    SELECT con.conname,
           rel.relname,
           pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = current_schema()
      AND con.contype IN ('c', 'f')
      AND NOT con.convalidated
    ORDER BY rel.relname, con.conname
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', c.relname, c.conname);
      ok := ok + 1;
      RAISE NOTICE 'validated   %.%', c.relname, c.conname;
    EXCEPTION WHEN check_violation OR foreign_key_violation THEN
      failed := failed + 1;
      RAISE WARNING 'STORED ROWS VIOLATE %.%  --  %', c.relname, c.conname, c.def;
    WHEN others THEN
      skipped := skipped + 1;
      RAISE WARNING 'could not validate %.%  --  %', c.relname, c.conname, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '% validated, % violated by stored rows, % could not be checked', ok, failed, skipped;
END $$;

-- Anything still NOT VALID after the run, with the rule it asserts. For each one,
-- the offending rows are found by negating the definition, e.g.
--
--     SELECT * FROM users WHERE NOT (email_lc = lower(btrim(email)));
--
SELECT rel.relname                       AS table_name,
       con.conname                       AS constraint_name,
       pg_get_constraintdef(con.oid)     AS asserts,
       format('SELECT * FROM %I WHERE NOT (%s) LIMIT 20;',
              rel.relname,
              regexp_replace(pg_get_constraintdef(con.oid), '^CHECK \s*\((.*)\)$', '\1'))
                                         AS find_offending_rows
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = current_schema()
  AND con.contype = 'c'
  AND NOT con.convalidated
ORDER BY rel.relname, con.conname;
