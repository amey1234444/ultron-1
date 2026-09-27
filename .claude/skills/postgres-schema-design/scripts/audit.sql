-- Read-only schema audit. Nothing here writes, locks or blocks.
--
--     psql "$DATABASE_URL" -f audit.sql
--
-- Or paste a section at a time into the Supabase SQL editor. Each section is
-- independent and prints a heading, so the output reads top to bottom.
--
-- Run this BEFORE writing any DDL. Most of what wants fixing in an established
-- schema is mechanical and shows up here; the rest needs reading the writers,
-- which no query can do for you.

\pset pager off
\timing off

\echo
\echo ====================================================================
\echo 1. Tables with no primary key
\echo ====================================================================
-- A table with no primary key cannot be replicated logically, cannot be updated
-- safely by row, and has no answer to "what makes two rows the same row".
SELECT c.relname AS table_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = current_schema()
  AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary)
ORDER BY pg_total_relation_size(c.oid) DESC;

\echo
\echo ====================================================================
\echo 2. Indexes that duplicate another index or a key
\echo ====================================================================
-- An index whose column list is a prefix of another index on the same table, in
-- the same order, is never chosen by the planner and is maintained on every
-- write. Check the output before dropping: a shorter UNIQUE index is not
-- redundant with a longer non-unique one, because it enforces something.
SELECT a.indexrelid::regclass AS redundant_index,
       b.indexrelid::regclass AS covered_by,
       a.indrelid::regclass   AS on_table,
       a.indisunique          AS redundant_is_unique,
       b.indisunique          AS covering_is_unique,
       pg_size_pretty(pg_relation_size(a.indexrelid)) AS wasted
FROM pg_index a
JOIN pg_index b
  ON a.indrelid = b.indrelid
 AND a.indexrelid <> b.indexrelid
 AND array_to_string(b.indkey, ' ') LIKE array_to_string(a.indkey, ' ') || '%'
JOIN pg_class ac ON ac.oid = a.indrelid
JOIN pg_namespace n ON n.oid = ac.relnamespace
WHERE n.nspname = current_schema()
  AND NOT a.indisprimary
  AND a.indpred IS NULL
  AND b.indpred IS NULL
ORDER BY pg_relation_size(a.indexrelid) DESC;

\echo
\echo ====================================================================
\echo 3. Foreign keys with no index on the referencing side
\echo ====================================================================
-- Postgres indexes the referenced side automatically and the referencing side
-- never, so each of these makes the parent's DELETE scan the child table.
SELECT con.conrelid::regclass AS child_table,
       con.conname            AS constraint_name,
       con.confrelid::regclass AS parent_table,
       (SELECT string_agg(att.attname, ', ' ORDER BY k.ord)
          FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
       ) AS unindexed_columns,
       pg_size_pretty(pg_total_relation_size(con.conrelid)) AS child_size
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE con.contype = 'f'
  AND n.nspname = current_schema()
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = con.conrelid
      AND i.indkey[0] = con.conkey[1]
  )
ORDER BY pg_total_relation_size(con.conrelid) DESC;

\echo
\echo ====================================================================
\echo 4. Indexes no query has used
\echo ====================================================================
-- Check when the statistics were last reset before trusting a zero, and remember
-- an index serving a monthly report reads as unused for 29 days.
SELECT (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database())
         AS stats_since;

SELECT s.relname      AS table_name,
       s.indexrelname AS index_name,
       s.idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS size
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0
  AND NOT i.indisunique
  AND NOT i.indisprimary
ORDER BY pg_relation_size(s.indexrelid) DESC;

\echo
\echo ====================================================================
\echo 5. Invalid indexes (a failed CREATE INDEX CONCURRENTLY)
\echo ====================================================================
-- These cost writes and are not used by queries. Drop and recreate.
SELECT indexrelid::regclass AS invalid_index, indrelid::regclass AS on_table
FROM pg_index WHERE NOT indisvalid;

\echo
\echo ====================================================================
\echo 6. Constraints that are not validated
\echo ====================================================================
-- Added NOT VALID and never validated: enforced for new rows, never checked
-- against the stored ones, and not available to the planner.
SELECT rel.relname                   AS table_name,
       con.conname                   AS constraint_name,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = current_schema()
  AND con.contype IN ('c', 'f')
  AND NOT con.convalidated
ORDER BY 1, 2;

\echo
\echo ====================================================================
\echo 7. Text columns that hold a closed vocabulary but have no CHECK
\echo ====================================================================
-- Named like a state and unconstrained. Candidates for a CHECK if the
-- application owns the values, or a lookup table if something else does.
SELECT c.table_name, c.column_name, c.data_type, c.column_default
FROM information_schema.columns c
WHERE c.table_schema = current_schema()
  AND c.data_type IN ('text', 'character varying')
  AND (c.column_name ~ '(^|_)(status|state|kind|type|role|mode|severity|priority|presence|quality|verdict)$')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = to_regclass(quote_ident(c.table_name))
      AND con.contype = 'c'
      AND att.attname = c.column_name
  )
ORDER BY c.table_name, c.column_name;

\echo
\echo ====================================================================
\echo 8. NOT NULL DEFAULT empty-string columns
\echo ====================================================================
-- Conflates "unknown" with "empty", and breaks uniqueness because several ''
-- collide where several NULLs would not.
SELECT table_name, column_name, column_default
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND is_nullable = 'NO'
  AND column_default LIKE '%''''::text%'
ORDER BY table_name, column_name;

\echo
\echo ====================================================================
\echo 9. Timestamp columns without a time zone
\echo ====================================================================
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND data_type IN ('timestamp without time zone', 'time without time zone')
ORDER BY table_name, column_name;

\echo
\echo ====================================================================
\echo 10. Floating point columns, for a look at whether any holds money
\echo ====================================================================
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND data_type IN ('real', 'double precision')
  AND column_name ~ '(amount|price|cost|total|balance|fee|tax|cents|salary|revenue)'
ORDER BY table_name, column_name;

\echo
\echo ====================================================================
\echo 11. Largest tables, and their index overhead
\echo ====================================================================
-- An index/table ratio well above 1 on a write-heavy table is worth a look
-- against sections 2 and 4.
SELECT c.relname AS table_name,
       pg_size_pretty(pg_table_size(c.oid))   AS table_size,
       pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
       round(pg_indexes_size(c.oid)::numeric
             / GREATEST(pg_table_size(c.oid), 1), 2) AS index_to_table,
       (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid) AS index_count,
       s.n_live_tup AS approx_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE c.relkind = 'r' AND n.nspname = current_schema()
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 25;

\echo
\echo ====================================================================
\echo 12. Tables that accumulate: insert-dominated, and how far VACUUM is behind
\echo ====================================================================
-- A high insert count with almost no updates or deletes is an append-only table.
-- Each of these needs a retention or partitioning answer.
SELECT relname AS table_name,
       n_tup_ins AS inserts, n_tup_upd AS updates, n_tup_del AS deletes,
       n_live_tup AS live_rows, n_dead_tup AS dead_rows,
       last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
WHERE n_tup_ins > GREATEST(n_tup_upd + n_tup_del, 1) * 10
ORDER BY n_live_tup DESC
LIMIT 25;

\echo
\echo ====================================================================
\echo 13. Sequences approaching their limit
\echo ====================================================================
-- An int4 sequence at 2.1 billion stops the table dead.
SELECT schemaname || '.' || sequencename AS sequence_name,
       data_type, last_value, max_value,
       round(100.0 * last_value / max_value, 4) AS pct_used
FROM pg_sequences
WHERE schemaname = current_schema() AND last_value IS NOT NULL
ORDER BY pct_used DESC NULLS LAST;

\echo
\echo ====================================================================
\echo 14. Columns with no comment on a table that has denormalised-looking names
\echo ====================================================================
-- Derived and cached column names, without an explanation attached. Rule 2:
-- a denormalisation needs a reason, and the reason belongs in the schema.
SELECT c.relname AS table_name, a.attname AS column_name
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = current_schema()
  AND c.relkind = 'r'
  AND a.attnum > 0 AND NOT a.attisdropped
  AND a.attname ~ '(_count$|_total$|_lc$|_cached|_display$|_formatted$|_with_unit$|_denorm)'
  AND col_description(c.oid, a.attnum) IS NULL
ORDER BY 1, 2;
