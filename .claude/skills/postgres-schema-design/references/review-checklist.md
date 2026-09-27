# Reviewing a schema

Work the checklist, then read the anti-pattern catalogue — each entry has the tell
that makes it findable without reading every line.

---

## The checklist

### Identity
- [ ] Every table has a primary key
- [ ] The natural key is expressed as `UNIQUE` even where a surrogate is the PK
- [ ] No surrogate that nothing references (an index maintained for nothing)
- [ ] Nothing keyed on a value that can change

### Domain
- [ ] `NOT NULL` on everything that must be present
- [ ] No `TEXT NOT NULL DEFAULT ''` standing in for a nullable column
- [ ] Every closed vocabulary constrained — `CHECK`, or a lookup table if it comes
      from outside
- [ ] Ranges bounded: percentages, probabilities, ports, non-negative counters
- [ ] Temporal ordering asserted: `expires_at > created_at`, `closed_at >= created_at`
- [ ] `jsonb` columns have at least a `jsonb_typeof` shape assertion
- [ ] `timestamptz` everywhere, never `timestamp`
- [ ] No float where money or exact counting is involved

### References
- [ ] Every logical parent/child relationship has an actual foreign key
- [ ] Each `ON DELETE` action is deliberate, and matches how the parent is
      actually deleted (**read the delete path before believing this box**)
- [ ] Every referencing column is indexed, unless the parent is never deleted
- [ ] Self-references have a cycle guard
- [ ] Transitive shortcuts either removed, or held by a composite foreign key

### Derived data
- [ ] Every derived column is generated, or has a `CHECK` asserting its derivation
- [ ] Every cached aggregate has something that can detect drift
- [ ] Every denormalisation has its reason in `COMMENT ON COLUMN`

### Indexes
- [ ] No index is a prefix duplicate of another index or of a key
- [ ] Composite order is equality → range → payload
- [ ] Partial indexes used where queries only touch a subset
- [ ] No index nothing queries

### Growth
- [ ] Every accumulating table has a retention or partitioning answer
- [ ] Dedup and quarantine tables have a window
- [ ] Hot insert paths carry only the indexes their queries need

### Process
- [ ] One source of truth for the schema; if two, something detects drift
- [ ] Expensive one-time steps are not on the boot path
- [ ] Concurrent schema application is serialised
- [ ] Deprecated tables marked with `COMMENT`, not silently dropped

---

## Anti-pattern catalogue

### The nullable-everything table
**Tell:** every column nullable except the key.
**Why it happens:** the table accreted columns for several row shapes.
**Consequence:** no consumer can rely on anything; every read is defensive.
**Fix:** either separate the shapes, or assert the combinations that are valid
with `CHECK (num_nonnulls(a, b) = 1)`.

### `TEXT NOT NULL DEFAULT ''`
**Tell:** the literal string.
**Consequence:** "unknown" and "empty" collapse into one value, and `UNIQUE` stops
working because several `''` collide where several `NULL`s would not.
**Fix:** nullable, or `NOT NULL` with `CHECK (col <> '')`. Where the column is
already a unique key component, `CREATE UNIQUE INDEX … WHERE col <> ''`.

### The unconstrained status column
**Tell:** `status TEXT NOT NULL DEFAULT 'pending'` with no `CHECK`, and a
TypeScript union of the same values somewhere in the code.
**Consequence:** the type says `'pending' | 'active'`; the column says *any
string*. Every path that is not the one holding the guard can write anything.
**Fix:** `CHECK … NOT VALID`, mirroring the guard — unless the value comes from
outside, in which case a lookup table.

### The code/label pair
**Tell:** `sensor_code INT` next to `sensor TEXT`.
**Consequence:** a 3NF violation duplicated on every row, and a label that can
disagree with its code.
**Fix:** `sensor_types(code, label)` and a join or a view.

### The derived column nobody guards
**Tell:** `email_lc`, `slug`, `total`, `*_with_unit`, `*_display`.
**Consequence:** it silently stops matching its source, and any uniqueness built
on it is void.
**Fix:** `GENERATED ALWAYS AS … STORED` in a new table; `CHECK (col = <expr>)` in
an existing one.

### The cached counter with no reconciliation
**Tell:** `parent.child_count`, `gateway.connected_racks`.
**Consequence:** it drifts, and nothing notices until a number on a dashboard is
questioned.
**Fix:** keep the cache, add a view that recomputes and returns only the rows
where the two disagree. Empty is healthy.

### The delete-everything save
**Tell:** a save function that runs `DELETE FROM parent` and re-inserts from the
posted payload.
**Consequence:** this is the one that blocks everything else. Any child keyed on
the parent survives *only because there is no foreign key*; add one with
`CASCADE` and an ordinary save destroys the children, add one with `RESTRICT` and
the save fails. The missing foreign keys are not an oversight to fix in isolation
— they are blocked on this function.
**Fix:** make the save a diff — upsert what is in the payload, delete only what is
genuinely gone — inside the transaction it already runs in. Then add the keys.

### Referential integrity by convention
**Tell:** a `machine_id TEXT` column with no `REFERENCES`.
**Consequence:** orphans accumulate invisibly and are never cleaned up.
**Fix:** a `NOT VALID` foreign key, after reading the delete path.

### The unbounded history table
**Tell:** an append-only table with no partitioning, no retention and a wide
unique index.
**Consequence:** insert cost rises, `VACUUM` falls behind, and the eventual
cleanup is a project.
**Fix:** partition by time and drop partitions. See `timeseries.md`.

### The duplicate index
**Tell:** `CREATE INDEX ON t (a, b)` where `PRIMARY KEY (a, b)` or `UNIQUE (a, b)`
already exists — often introduced when a column was renamed and the index
recreated under a new name.
**Consequence:** never read, maintained on every write.
**Fix:** drop it. Run the prefix-duplicate query in `indexing.md`.

### The unindexed foreign key
**Tell:** a `REFERENCES` column that is not the leading column of any index.
**Consequence:** every parent delete scans the child table.
**Fix:** index it, unless the parent is genuinely never deleted.

### The boot-path table rewrite
**Tell:** `ALTER COLUMN … TYPE`, a backfill `UPDATE` or a self-join `DELETE` in a
function that runs on every cold start.
**Consequence:** an `ACCESS EXCLUSIVE` lock on a live table at an arbitrary
moment, repeatedly, and a stall under load.
**Fix:** catalog guard plus ledger. See `migrations.md`.

### Two sources of truth for the schema
**Tell:** a runtime `migrate()` and a migrations directory, and a table in one
that is not in the other.
**Consequence:** an environment built from the migrations comes up with a
different schema than one built by the runtime, and nobody finds out until it
matters.
**Fix:** pick which is authoritative, derive or generate the other, and add a
drift check. Counting `CREATE TABLE` in each is enough to detect it.

### The JSONB column that is really six columns
**Tell:** the application always reads the same handful of keys out of it, or a
migration parses it into real columns.
**Consequence:** no types, no constraints, no useful index, no planner statistics.
**Fix:** promote the keys that are queried; keep the blob beside them as evidence
if the original payload matters.

### Constraining someone else's vocabulary
**Tell:** a `CHECK (sensor IN (…))` on a value that arrives from a device or a
partner API.
**Consequence:** their next release becomes your outage, and the failure mode is
a dropped message rather than a visible error.
**Fix:** validate at the boundary, and use a lookup table so adding a value is an
`INSERT`. This is the mistake most likely to be made *while* hardening a schema,
so check for it in your own diff.

---

## Reading an existing schema efficiently

1. `scripts/audit.sql` first — it answers the mechanical questions in one pass.
2. Group the tables by feature and find each group's key. The keys tell you the
   model faster than the columns do.
3. For every `status`, `state`, `kind`, `type` or `*_lc` column, find its writers.
   That is where the real domain is, and where a hardening pass gets it wrong.
4. For every table that accumulates, find the retention. If there is none, that is
   a finding.
5. Find every wholesale `DELETE FROM`. Those write patterns are what determine
   which foreign keys are possible.
