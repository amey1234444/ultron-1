# Indexing

An index is a write cost you pay continuously for a read benefit you may not be
getting. Design them from the queries, then prove that none of them is dead
weight.

---

## Composite column order

One rule, and it decides almost every case:

> **Equality columns first, then the range or sort column, then anything only
> needed for a covering read.**

```sql
-- WHERE tenant_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 50
CREATE INDEX ON orders (tenant_id, status, created_at DESC);
```

The index can then seek straight to the `(tenant_id, status)` group and walk
`created_at` in order — no sort, and the `LIMIT` stops the scan early.

Two consequences worth internalising:

- **A prefix is usable; a suffix is not.** An index on `(a, b, c)` serves `WHERE
  a = …`, `WHERE a = … AND b = …` and `WHERE a = … AND b = … AND c = …`. It does
  *not* serve `WHERE b = …` efficiently. So a separate index on `(a)` alongside
  `(a, b)` is redundant — drop the shorter one.
- **A range column consumes the rest of the index.** In `(a, created_at, c)`
  with `WHERE a = … AND created_at > …`, the `c` column cannot be used for
  filtering, only as payload.

### `DESC` in an index

Postgres can scan any btree backwards, so a single-column `DESC` index buys
nothing. It matters only for a *mixed* sort:

```sql
-- Needs the direction baked in; a backward scan cannot mix directions.
CREATE INDEX ON events (account_id, created_at DESC, id ASC);
```

---

## Redundant indexes: how to find them

This is the highest-value, lowest-risk optimisation in an established schema, and
it is very common. Three forms:

1. **Duplicate of a key.** `CREATE INDEX ON racks (gateway_id, rack_id)` when
   `UNIQUE (gateway_id, rack_id)` already exists. The unique constraint is
   implemented *as* an index; the second one is never chosen and is maintained on
   every write.
2. **Duplicate of the primary key.** `CREATE INDEX ON t (a, b, c)` where the
   primary key is `(a, b, c)`. Same thing, and easy to introduce when a column
   gets renamed and the index is recreated under a new name.
3. **Prefix of a longer index.** `(a)` alongside `(a, b)`. The longer index
   serves every query the shorter one does.

```sql
-- Indexes whose column list is a prefix of another index on the same table.
SELECT a.indexrelid::regclass AS redundant,
       b.indexrelid::regclass AS covered_by
FROM pg_index a
JOIN pg_index b
  ON a.indrelid = b.indrelid
 AND a.indexrelid <> b.indexrelid
 AND array_to_string(b.indkey, ' ') LIKE array_to_string(a.indkey, ' ') || '%'
WHERE NOT a.indisprimary
  AND a.indpred IS NULL AND b.indpred IS NULL   -- ignore partial indexes
ORDER BY 1;
```

Read the output rather than acting on it blindly: a shorter *unique* index is not
redundant with a longer non-unique one, because it enforces something the longer
one does not.

### Genuinely unused indexes

```sql
SELECT relname AS table_name, indexrelname AS index_name,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size, idx_scan
FROM pg_stat_user_indexes
JOIN pg_index USING (indexrelid)
WHERE idx_scan = 0 AND NOT indisunique
ORDER BY pg_relation_size(indexrelid) DESC;
```

Caveats before dropping: statistics reset with `pg_stat_reset()` and on some
upgrades, a replica's usage is not counted here, and an index that only serves a
monthly report will read as unused for 29 days. Check the age of the statistics
(`pg_stat_get_db_stat_reset_time()`) before trusting a zero.

---

## Unindexed foreign keys

Postgres indexes the *referenced* side automatically (it must be unique) and the
*referencing* side never. So every `DELETE` or key `UPDATE` on the parent scans
the child table to find rows to cascade or restrict.

```sql
-- Foreign keys with no index that starts with the referencing column(s).
SELECT c.conrelid::regclass AS child,
       c.conname,
       a.attname AS unindexed_column
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
  )
ORDER BY 1;
```

When to skip one anyway: the parent is append-only and never deleted, the child is
tiny, or you are deliberately trading delete performance for insert throughput.
Decide, do not default.

---

## Partial indexes

The best value-for-size index in Postgres, and consistently underused. If a query
only ever looks at a small subset, index only that subset.

```sql
-- A work queue: the drain reads only runnable rows, but completed rows stay
-- forever. Indexing them all means paying for rows no query will ever match.
CREATE INDEX ON outbox (next_attempt_at, created_at)
  WHERE state IN ('pending', 'retry');

-- Uniqueness that ignores a sentinel.
CREATE UNIQUE INDEX ON users (email_lc) WHERE email_lc <> '';

-- At most one active job per key, without the application coordinating.
CREATE UNIQUE INDEX ON queue (key) WHERE state IN ('pending', 'processing');
```

The third is the pattern to remember: a partial unique index turns a concurrency
rule into a property of the table, so a burst of duplicate requests collapses
without a lock in the application.

For the planner to use a partial index, the query's `WHERE` must *imply* the
predicate. Write the predicate the way the query writes it.

---

## Index types beyond btree

| Type | Use for |
| --- | --- |
| **btree** | equality, ranges, sorting, uniqueness. The default, and right ~90% of the time |
| **GIN** | containment in `jsonb`, arrays, and full-text `tsvector` |
| **GiST** | geometric, range overlap (`&&`), and the backing for `EXCLUDE` |
| **BRIN** | a huge table whose rows are physically ordered by the indexed column — append-only time series. Tiny index, block-range granularity |
| **hash** | equality only on a large column; rarely worth it since btree does equality too |

```sql
-- Containment queries on a payload: WHERE payload @> '{"kind":"alarm"}'
CREATE INDEX ON events USING gin (payload jsonb_path_ops);

-- One key inside jsonb, queried like a column: index the expression, not the blob.
CREATE INDEX ON events ((payload->>'kind'));

-- 200M-row append-only history, queried by time window. ~1/1000th the size of btree.
CREATE INDEX ON measurement_history USING brin (received_at);
```

`jsonb_path_ops` is smaller and faster than the default `jsonb_ops` but only
supports `@>`-style containment, not existence of a key. Pick by the query.

---

## Covering indexes

```sql
CREATE INDEX ON orders (tenant_id, created_at DESC) INCLUDE (total_cents, status);
```

`INCLUDE` columns are stored in the leaf pages but not used for searching or
ordering, which lets the query be answered from the index alone (an index-only
scan). Worth it for a hot query on a wide table. Note an index-only scan also
requires the visibility map to be current, so it depends on `VACUUM` keeping up.

---

## Creating an index on a live table

```sql
CREATE INDEX CONCURRENTLY idx_name ON t (col);
```

Without `CONCURRENTLY`, `CREATE INDEX` holds a lock that blocks writes for the
whole build. With it, writes continue.

The costs of `CONCURRENTLY`, all of which matter:

- it cannot run inside a transaction block, so it cannot be part of a multi-step
  migration that needs to be atomic;
- it makes two passes, so it is slower;
- if it fails it leaves an **invalid** index behind, which still costs writes and
  is not used by queries. Find and drop those:

```sql
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
```

For a migration runner that wraps each step in a transaction, this is the one
statement that has to be handled specially.

---

## Before adding any index

1. Get the plan: `EXPLAIN (ANALYZE, BUFFERS)` on the real query with real
   parameters. Look at the actual rows vs estimated rows — a large mismatch is a
   statistics problem, not an index problem, and an index will not fix it.
2. Check an existing index does not already serve it as a prefix.
3. Check the table is not small enough that a sequential scan is genuinely
   faster. Under a few thousand rows it usually is, and the planner knows.
4. Consider whether a *partial* index would cover the query at a fraction of the
   size.
