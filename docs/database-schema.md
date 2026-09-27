# The database: reference model, normal form, and how to change it

Everything durable in ULTRON is one PostgreSQL database — accounts and sessions,
the asset hierarchy and its canvases, live rack state and its history, the
analysis record, the ML record, and the SAP connector. This document is the
reference for its shape: what each group of tables is keyed on, which
dependencies are normalised and which are denormalised on purpose, what keeps
each denormalisation honest, and what the procedure is for changing any of it.

- Runtime schema: [`src/server/db.ts`](../src/server/db.ts) (`migrate()`, `hardenSchema()`)
- ML schema: [`src/server/mlPersistence.ts`](../src/server/mlPersistence.ts)
- Dashboard layout: [`src/server/plantOverview.ts`](../src/server/plantOverview.ts)
- Migrations, replayed by the ingest service on every start: [`supabase/migrations/`](../supabase/migrations)
- Constraint validation: [`scripts/validate-schema-constraints.sql`](../scripts/validate-schema-constraints.sql)
- Method, audit queries and SQL checkers: [`.claude/skills/postgres-schema-design/`](../.claude/skills/postgres-schema-design)

> **Two writers, one database.** The Next application and the MQTT ingest runtime
> both create tables and both can cold-start first, which is why the DDL is
> idempotent and lives in code rather than only in a migration directory. Any
> change has to survive being applied by either process, twice, concurrently.

---

## 1. Where the schema actually comes from

Two processes create tables, and **both paths run in production**:

- **The Next application.** `migrate()` in [`src/server/db.ts`](../src/server/db.ts)
  runs on the first request after a cold start. This is the authority for what
  the schema is.
- **The MQTT ingest service.** `ensureSchema()` in
  [`src/server/ingest/db.mjs`](../src/server/ingest/db.mjs) reads
  `supabase/migrations/`, sorts it by filename, and **executes every file on
  every start**, so that the ingest service can run against a fresh database
  without waiting for the app.

That second path is the one that surprises people. `supabase/migrations/` is not
a passive record: filename order is execution order, every file must be safe to
re-run, and a file that references something a later file creates aborts the
replay. Two consequences were live before 2026-09-26.

**The directory was missing half the schema.** It created 33 of the 57 tables the
runtime creates: password resets, the machine template canvases, the plant
overview layout, the nine SAP tables and the eleven ML tables existed only in
code, because each of those features shipped by adding its DDL to the runtime
path — where the next cold start applies it, and a migration file is easy to
forget.
[`20260926000000_runtime_only_tables.sql`](../supabase/migrations/20260926000000_runtime_only_tables.sql)
closes that gap, and its SQL is extracted from the three runtime modules rather
than retyped, so the file cannot describe a column the runtime does not create.

**And the replay could not reach the end.**
`20260905000000_machine_canvas_zoom.sql` does
`ALTER TABLE studio_machine_templates ADD COLUMN IF NOT EXISTS machine_zoom`, and
no migration created `studio_machine_templates` — `ADD COLUMN IF NOT EXISTS`
tolerates a missing column, not a missing table. Against an empty database the
ingest service therefore failed at that file, every start, until the app had
booted at least once and created the table behind its back. That file now creates
the table if it is absent.

Both defects are the same class, and it is worth being able to detect it rather
than rediscover it:

```bash
# Can this directory be replayed against an empty database, in filename order?
node .claude/skills/postgres-schema-design/scripts/check-replay-order.mjs supabase/migrations
```

**When you add a table or column, write both.** The runtime statement is what the
app applies; the migration file is what the ingest service applies and what makes
the change reviewable. A change in only one of them is the defect this section
exists to describe. Put a new file after everything it depends on — which is why
the tables land in `…000000_runtime_only_tables.sql` and the constraints on them
in `…000001_schema_integrity.sql`, in that order.

---

## 1a. How the database is connected

One PostgreSQL database. Three things in the application open connections to
it, and because `server.mjs` serves Next.js and runs the MQTT ingest in **one
process**, all three live side by side in that process.

| Owner | Kind | Size | Purpose |
| --- | --- | --- | --- |
| `src/server/db.ts` | `Pool` | `max: 5` | Every web request and API route, plus `migrate()` on the first request after a cold start |
| `src/server/ingest/db.mjs` | `Pool` | `max: 5` | The MQTT ingest path, plus `ensureSchema()` on every start |
| `src/server/liveFrame.ts` | `Client` | 1 | `LISTEN` for live frames — a single long-lived connection, which is what `LISTEN` requires |

**The connection budget is 11 per instance**, and it multiplies by instance
count. That is the number to check against the database's own limit before
scaling the web service out; a pooler in front of Postgres changes the
arithmetic and is the usual answer if the instance count ever grows.

**Two pools rather than one is deliberate.** Ingest writes continuously, at
whatever rate the gateways publish. Sharing one pool would let a burst of
telemetry writes take every connection and leave requests queueing behind it,
so the two paths are bulkheaded: ingest can exhaust its own five and the web
path still has five.

**The `LISTEN` client reconnects lazily, not automatically.** On error it clears
the shared handle, so the next `subscribeLiveFrames()` starts a fresh
connection; existing subscribers are not dropped. Callers treat an unavailable
listener as "poll instead", which is why a dead listener degrades rather than
fails.

### Guards on every pooled connection

Both pools pass `options: '-c statement_timeout=60000 -c
idle_in_transaction_session_timeout=60000'`.

`max` is 5. With no `statement_timeout`, five queries that never finish are the
entire path — the application stops serving while the database sits idle and
healthy. `idle_in_transaction_session_timeout` covers the other shape of the
same problem: a connection abandoned mid-transaction holds its locks forever,
and whatever queues behind it looks like an outage from the outside.

60 seconds is a backstop, not a latency budget. Both pools also run schema
work — `migrate()` on one, the `supabase/migrations` replay on the other — and
a one-time step against an empty database is legitimately slow. The number is
set to catch a query that will never finish, not to bound a normal one.

`lock_timeout` is deliberately **not** set. The migration directory replays on
every ingest start and takes `ACCESS EXCLUSIVE` locks; failing those fast would
convert one slow reader into a boot loop, which is worse than the brief wait it
would avoid.

---

## 2. What a cold start used to cost

`migrate()` was written to be idempotent, and it is. Idempotent is not the same
as free, and three kinds of statement cost the same on the thousandth run as on
the first:

| Statement | What it costs every time |
| --- | --- |
| `ALTER TABLE measurement_history ALTER COLUMN rack_id TYPE TEXT USING rack_id::TEXT` | `ACCESS EXCLUSIVE` on the table: every reader and writer of the telemetry history blocks until it finishes, and it must queue behind any in-flight query |
| `UPDATE users SET email_lc = lower(btrim(email)) WHERE ...` | a scan of `users`, and a write of every row whose key disagrees |
| `DELETE FROM studio_cards stale USING studio_cards keep WHERE ...` | a self-join over `studio_cards` |
| `INSERT INTO email_reputation ... SELECT ... FROM rejected_email_reputation` | a scan of a table nothing has written to since it was deprecated |

Eight of those `ALTER COLUMN ... TYPE` statements ran on every cold start, across
`racks`, `mqtt_messages`, `rack_inventory_slots`, `measurement_latest`,
`measurement_history`, `gateway_events`, `mqtt_quarantine` and `studio_devices`.
On a serverless host, cold starts are frequent and concurrent, so this was eight
exclusive locks on the live telemetry tables at an arbitrary moment, repeatedly.

**And once more from the other side.** The same eight statements are in
`20260727010000_ultron_mqtt_v2_current_state.sql`, which the ingest service
replays on every start ([section 1](#1-where-the-schema-actually-comes-from)), so
the process that writes the telemetry was also the process locking it. Both copies
are now guarded against `pg_attribute`.

Three guards now stand between that and production:

1. **A ledger.** `schema_migrations` records the one-time steps. `once(version,
   statements)` runs a step in a single transaction and records it, so a failure
   leaves neither a ledger row nor a half-applied change and the next boot
   retries from the top. The ledger is the runtime's own — the Supabase CLI keeps
   its history in `supabase_migrations.schema_migrations` — so every guarded step
   is still written to be safe to re-run, and a database that took the change
   through the CLI records a no-op once.
2. **A catalog guard.** The type conversions read `pg_attribute` first and only
   act on a column that is not already `text`. In the steady state that is a
   catalog lookup instead of a table lock. The `CREATE TABLE` statements were
   also corrected to declare the final shape, so a *new* database never creates
   the column as `INT` and immediately converts it.
3. **An advisory lock.** `withMigrationLock()` wraps the whole of `migrate()` in
   a session-level `pg_advisory_lock`, so two instances booting in the same
   second queue up rather than race. `CREATE INDEX IF NOT EXISTS` from two
   connections at once is not in fact safe — it can fail on a duplicate
   `pg_class` row — and that was reachable on every deploy.

**A fourth cost, on the write path rather than the boot path.** An index that no
query needs is still maintained by every `INSERT`, `UPDATE` and `DELETE`.
`20260926000001_schema_integrity.sql` dropped four that repeated a key
column-for-column; `20260927000000_drop_prefix_redundant_studio_cards_index.sql`
drops a fifth that the earlier pass did not match, because it is a *prefix* of a
key rather than a copy of one. `studio_cards_device` is `(device_id)` and
`studio_cards_device_slot_unique` is `(device_id, slot)`, and a btree on
`(a, b)` answers `WHERE a = …` as well as one on `(a)` does — so the shorter
index could never be the one the planner reached for. Saving the hierarchy
deletes every row in `studio_cards` and re-inserts the snapshot, so the index was
maintained twice on every Save Config for no read in return. The `CREATE` was
removed from `20260714000000_durable_studio.sql` and from `migrate()` in the same
change, so a fresh database does not build it and a replay of the directory does
not rebuild it between the two files.

---

## 3. Normal form, group by group

The schema is in third normal form almost everywhere, with five deliberate
departures documented in [section 4](#4-the-deliberate-denormalisations). What
follows is the key of each group and the dependencies that make it so.

### 3.1 Accounts and sessions

```
users(id) — surrogate, application-generated
  UNIQUE username, UNIQUE username_lc, UNIQUE email_lc WHERE email_lc <> ''
auth_sessions(token_hash) — SHA-256 of the browser token, never the token
password_reset_tokens(token_hash) — same rule, plus consumed_at for single use
```

`username_lc` and `email_lc` are not independent facts; they are
`lower(username)` and `lower(btrim(email))`. A row whose `email_lc` does not
belong to its `email` would let the same address sign up twice under the unique
index, which is precisely the vulnerability the index was added to close, so
`users_email_lc_derived` and `users_username_lc_derived` now assert the
derivation in the database.

> A generated column (`GENERATED ALWAYS AS (lower(btrim(email))) STORED`) would
> make the derivation structural instead of asserted, and is the better design.
> It is not applied here because every `INSERT` in
> [`users.ts`](../src/server/users.ts) names `email_lc` explicitly, and Postgres
> rejects an insert that writes to a generated column. Converting means changing
> the table and the four writers in the same commit; the CHECK is the same
> guarantee at no migration risk, and is the right intermediate step.

`auth_sessions` and `password_reset_tokens` are keyed by the hash rather than a
surrogate on purpose: the hash is the only thing that identifies a session, and
a surrogate would invite a second lookup path. Both now assert `expires_at >
created_at`, because a token that expires before it exists is not a token.

### 3.2 Email reputation

```
email_reputation(id) surrogate, UNIQUE email_lc — one row per address
reputation_queue(id) surrogate, UNIQUE email_lc WHERE state IN ('pending','processing')
rejected_email_reputation — DEPRECATED, see below
```

The partial unique index on `reputation_queue` is the interesting one: it makes
"at most one active job per address" a property of the table rather than of the
worker, so a burst of signups for the same address collapses to one API call
without the application coordinating.

`rejected_email_reputation` is superseded by `email_reputation` and has no
reader or writer left in the codebase. It is retained only as the source of the
one-time forward migration and is now marked `DEPRECATED` with
`COMMENT ON TABLE`. Dropping it is a data deletion, so it is left for a
deliberate decision rather than folded into a hardening pass.

### 3.3 The asset hierarchy

```
studio_projects(id)
studio_folders(id) -> project_id, parent_id (self, nullable)
studio_machines(id) -> folder_id, project_id (denormalised, see 4.1)
studio_devices(id) -> project_id?, gateway_id? (self), real_gateway_id?, real_rack_id?
studio_cards(id) -> device_id, UNIQUE (device_id, slot)
studio_machine_layouts(machine_id) — one canvas per machine
studio_machine_templates(machine_template) — one canvas per template
studio_machine_canvas_cards(machine_id, id) — the card subset of a layout
studio_meta(id = 1) — singleton: revisions clients poll, plus the seed guard
```

`UNIQUE (device_id, slot)` on `studio_cards` is a good example of the general
rule: one card per slot is physically true, so it is a key, not a validation.

`studio_folders.parent_id` is a self-reference with no structural guard against a
cycle. `saveHierarchy()` rejects one before it writes, but nothing stopped a
direct `UPDATE`, and the consequence is a left rail that never finishes
rendering and a recursive query that never returns. Two guards now exist:
`studio_folders_not_own_parent` for the one-step case, and the
`studio_folders_no_cycle` trigger, which walks the parent chain on insert or on
an update of `parent_id` and raises `check_violation` if it meets the row again.

### 3.4 Live rack state

```
gateways(id) surrogate, UNIQUE gateway_id — permanent identity; current_ip changes
gateway_ip_history(id) surrogate, UNIQUE (gateway_id, ip_address)
racks(id) surrogate, UNIQUE (gateway_id, rack_id) — the permanent rack identity
rack_inventory_slots(gateway_id, rack_id, slot_number) — retained inventory snapshot
rack_slot_latest(gateway_id, rack_id, slot_number) — current value per slot
measurement_latest(gateway_id, rack_id, slot_id, channel_id, measurement_type)
measurement_history(id) surrogate, UNIQUE (…, source_sequence, source_timestamp_us)
mqtt_messages(message_id) — envelope dedup for QoS 1 redelivery
mqtt_quarantine(id) — messages that failed schema, identity or binding checks
gateway_events(id) — alarm / fault / system events
mqtt_ingest_metrics(metric_name) — counters
```

The composite natural key `(gateway_id, rack_id, slot_number, channel_id)` is
the physical address of a measurement point, and the current-state tables use it
directly as the primary key. That is the right call: there is no identity a
surrogate could add, and the upsert path (`ON CONFLICT` on exactly that key) is
what makes a retained MQTT frame idempotent.

`measurement_history` keys on the source's own clock
(`source_timestamp_us`, `source_sequence`) rather than on arrival, so a
redelivered or out-of-order frame collides with itself instead of appending a
duplicate sample.

`racks.rack_id` is `TEXT`, not `INT`, and this matters: a rack id is an opaque
identifier the gateway chooses, and comparing it numerically would make `'07'`
and `'7'` the same rack. The conversion from the original `INT` is what
[section 2](#2-what-a-cold-start-used-to-cost) is about.

### 3.5 Analysis and ML

```
analysis_snapshots(id) -> machine_id
analysis_signal_quality(id) -> snapshot_id, machine_id (transitively redundant)
analysis_baselines(machine_id, signal_code, model_key) — natural composite key
analysis_anomaly_episodes(id) -> machine_id
analysis_maintenance_cases(id) -> machine_id, snapshot_id?
analysis_overview_snapshots(id) -> machine_id
ml_models(id) surrogate, UNIQUE (model_id, version)
ml_predictions(id) surrogate, UNIQUE prediction_id (UUID) — the join key children use
ml_fault_risks / ml_diagnosis_events / … -> prediction_id
```

`ml_predictions` is worth copying elsewhere: the surrogate `id` orders rows, and
a separate UUID `prediction_id` is what children reference. The UUID can be
generated by the producer before the row exists, which is what lets a prediction
and its fault risks be written without a round trip in between.

The percentage columns are now constrained to `0..100`
(`analysis_snapshots_readiness_range`, `analysis_overview_percent_range`) and the
counts to non-negative. Those values arrive from the browser in the Overview
path, so [`analysis.ts`](../src/server/analysis.ts) clamps them on the way in —
the constraint and the clamp are one change, because a column that says it holds
a percentage must not be reachable by a request body that says otherwise, and a
hand-edited payload should be stored as something the console can draw rather
than rejected as a 500.

---

## 4. The deliberate denormalisations

A denormalisation is a decision, and a decision needs a reason and a guard.
These five have both. All five are now stated in the database itself with
`COMMENT ON COLUMN`, so they are visible from a Supabase console and not only
from this file.

### 4.1 `studio_machines.project_id`

**The dependency.** A machine belongs to a folder; a folder belongs to a
project. `project_id` is therefore transitively dependent on `folder_id`, and
storing it is a 3NF violation that permits a machine whose `project_id` is not
its folder's.

**Why it is there.** The left rail and the SAP asset mapping both read machines
by project without walking the folder tree.

**What keeps it honest.** Nothing yet, and this is the one gap worth closing.
The textbook fix is a composite foreign key:

```sql
ALTER TABLE studio_folders ADD CONSTRAINT studio_folders_id_project_unique
  UNIQUE (id, project_id);
ALTER TABLE studio_machines ADD CONSTRAINT studio_machines_folder_project_fk
  FOREIGN KEY (folder_id, project_id) REFERENCES studio_folders (id, project_id)
  ON DELETE CASCADE NOT VALID;
```

That keeps the convenient column and makes divergence unrepresentable. It is not
applied here because it interacts with `writeHierarchyRows()` — see
[section 5](#5-what-is-blocked-and-on-what) — and wants to land with a change to
that function rather than ahead of it.

### 4.2 `gateways.{known,connected,stale,disconnected,blocked}_racks`

**The dependency.** Five aggregates over `racks`, refreshed by the ingest
runtime at most once every few seconds.

**Why they are there.** The live console reads them per gateway on every poll;
recomputing five `count(*) FILTER (…)` per gateway per poll is not worth it.

**What keeps them honest.** The `gateway_rack_count_drift` view recomputes the
same numbers from the rows they summarise and returns only the gateways where
the two disagree. Empty is healthy. A cache nothing can check is
indistinguishable from a bug; now it can be checked in one query.

### 4.3 `users.reputation_status` / `reputation_score` / `reputation_checked_at`

**The dependency.** The same verdict lives in `email_reputation`, keyed by
`email_lc`.

**Why it is there.** The user list renders without a join, and the column is a
historical record — the verdict *as it stood at signup* — which is not the same
fact as the current verdict.

**What keeps it honest.** Nothing needs to: the two are deliberately different
facts. The `COMMENT ON COLUMN` says which is which, so nobody reads the `users`
copy expecting today's answer.

### 4.4 `studio_machine_layouts.boxes` and `studio_machine_canvas_cards`

**The dependency.** The card subset of `boxes` is projected into normalised rows
in `studio_machine_canvas_cards`, so each card's position exists twice.

**Why it is there.** The JSONB holds the full canvas including trail anchors,
which the columns do not model; the normalised rows make card add, delete and
move queryable.

**What keeps it honest.** `saveMachineLayout()` writes both in one transaction,
and the `data` column keeps the original box whole so a property the columns do
not model yet survives a round trip.

### 4.5 `rack_slot_latest`'s code/label pairs and formatted values

**The dependency.** `card_type_code`/`card_type`, `sensor_code`/`sensor`,
`unit_code`/`unit`, `channel_status_code`/`channel_status`,
`alert_status_code`/`alert_status`, `danger_status_code`/`danger_status` — in
each pair the text is functionally dependent on the code, which is the
definition of a 3NF violation. `value_raw`, `value_formatted`,
`value_with_unit` and `value_display` are four forms of one number.

**Why it is there.** Every one of those strings is exactly what the gateway sent.
The table is the current-state projection of a firmware frame, and being able to
show an operator the frame as it arrived is the point.

**What would fix it, and the cost.** Lookup tables — `card_types(code, label)`,
`sensor_types`, `units`, `status_codes` — with the label reached by join or
through a view. That is the correct shape, and it is also where the constraint
problem in [section 6](#6-what-is-deliberately-not-constrained) goes away: a
firmware release adding a sensor type becomes an insert into a lookup table
rather than a deploy. It is a larger change than a hardening pass, because
`telemetry.ts` and the live frame shape read these columns directly.

---

## 5. What is blocked, and on what

Some referential integrity cannot be added to this schema as it stands, and the
reason is one function.

`writeHierarchyRows()` in [`workspace.ts`](../src/server/workspace.ts) saves the
asset hierarchy by deleting every row and re-inserting from the posted snapshot:

```
DELETE FROM studio_cards;  DELETE FROM studio_devices;  DELETE FROM studio_machines;
DELETE FROM studio_folders; DELETE FROM studio_projects;
```

Machine canvases, analysis snapshots, anomaly episodes, maintenance cases and ML
predictions are all keyed by `machine_id` and all survive that today **only
because there is no foreign key**. Adding one would make an ordinary Save Config
either destroy them (`ON DELETE CASCADE`) or fail (`ON DELETE RESTRICT`). The
missing foreign keys are not an oversight to be corrected in isolation; they are
blocked on the write pattern.

The prerequisite is to make the hierarchy save a diff — upsert the rows in the
snapshot, delete only the rows that are genuinely gone — inside the transaction
it already runs in. Once a Save Config no longer deletes surviving machines,
these become safe, and each is a one-line `NOT VALID` foreign key:

| Child | Parent | Then |
| --- | --- | --- |
| `studio_machine_layouts.machine_id` | `studio_machines(id)` | `ON DELETE CASCADE` |
| `studio_machine_canvas_cards.machine_id` | `studio_machines(id)` | `ON DELETE CASCADE` |
| `analysis_*.machine_id` | `studio_machines(id)` | decide per table whether the record outlives the machine |
| `studio_machines(folder_id, project_id)` | `studio_folders(id, project_id)` | closes [4.1](#41-studio_machinesproject_id) |

One further foreign key is not blocked by that function but is not applied
either: the telemetry tables (`measurement_latest`, `measurement_history`,
`rack_inventory_slots`, `rack_slot_latest`, `gateway_events`) carry
`(gateway_id, rack_id)` with no reference to `racks`, so an orphaned measurement
is representable. `handlers.mjs` does upsert the rack before the slot rows, so
the ordering is already right. It is left out of this pass because it cannot be
verified without a populated database: run the preflight first, and only then
add the key.

```sql
-- Preflight: must return zero rows before adding the foreign key.
SELECT DISTINCT m.gateway_id, m.rack_id
FROM measurement_latest m
LEFT JOIN racks r ON r.gateway_id = m.gateway_id AND r.rack_id = m.rack_id
WHERE r.id IS NULL;
```

The five foreign keys into `ml_predictions` *are* now indexed, by
`20260927000001_index_ml_prediction_foreign_keys.sql`. `ml_fault_risks`,
`ml_diagnosis_events`, `ml_anomaly_events`, `ml_data_quality_events` and
`ml_prediction_explanations` each reference `ml_predictions (prediction_id)`
`ON DELETE CASCADE` and none indexed the referencing column, so a deleted
prediction meant five sequential scans to find the rows to cascade to. Nothing
deletes from `ml_predictions` today — the table is insert-only — so the cascade
has never fired, and the earlier pass reasonably left these alone under the
"unless the parent is never deleted" rule in [section 7](#7-changing-the-schema).
They are added now because that exemption expires the moment retention or an
erasure request arrives, and the cost of building them is lowest while the tables
are small. Note that `ml_fault_risks_lookup` and `ml_diagnosis_events_lookup` do
not cover this: both lead on `machine_id`, and a btree is only usable from its
leading column.

Two other known items, neither urgent:

- **`measurement_history` is unbounded.** It has no retention and no
  partitioning, and its seven-column unique index is maintained on every insert.
  `PARTITION BY RANGE (received_at)` by month, with a retention window, is the
  shape this wants before the table gets large. The earlier
  `measurement_history_chunks` attempt was dropped.
- **`source_timestamp_us` is `BIGINT` in `measurement_*` and `NUMERIC` in
  `racks`, `gateways` and `rack_slot_latest`.** One fact, two types. `BIGINT`
  is correct — microseconds fit until the year 294247 — and `NUMERIC` costs
  space and comparison speed. Converting rewrites those tables, so it belongs in
  a deliberate migration and not in a hardening pass.

---

## 6. What is deliberately not constrained

`hardenSchema()` adds a `CHECK` for every closed vocabulary the application owns:
`users.role`, `users.status`, `reputation_status`, `email_reputation.status`,
`reputation_queue.state`, `gateways.status`, `gateways.mqtt_state`,
`racks.status`, `sap_outbox.state`. Each mirrors a TypeScript guard —
`isRole()`, `isUserStatus()`, the outbox retry ladder — and that is the reason it
belongs in the database too: the guard protects requests that go through the code
holding it, and a `CHECK` protects the table from every other path, including a
`psql` session, an edit in the Supabase dashboard, a future endpoint, and a bug
in the guard itself.

It adds nothing for `presence`, `online_state`, `quality`, `freshness`,
`channel_status`, `alert_state`, `danger_state`, `card_type`, `sensor`, `unit`,
`slot_number` or `channel_id`. Those values arrive from gateway firmware. A
`CHECK` on them would mean a firmware release that adds a sensor type takes
ingest down, and the failure would be a silently dropped frame. The place for
those rules is [`validate.mjs`](../src/server/ingest/validate.mjs), beside the
identity checks that already reject a blank `gateway_id` or `rack_id` — and it is
because those identity checks exist that `gateways_id_not_blank` and
`racks_identity_not_blank` *are* safe to assert here.

Two constraints were drafted and withdrawn during this pass, both for the same
reason, and they are worth recording:

- `rate_events.bucket <> ''` — the only writer passes `''` and encodes the
  bucket in the key prefix. The constraint would have failed every rate-limit
  record, meaning every login and signup. `rate_events_lookup`, whose leading
  column is that always-empty value, was dropped as redundant with
  `rate_events_key_ts`.
- `slot_id >= 0 AND channel_id >= 0` on the measurement tables — correct as a
  statement about the world, wrong as a database constraint, for the firmware
  reason above.

**The rule this pass followed:** assert in the database what the application
owns; validate at the boundary what the outside world supplies. A constraint that
turns someone else's unexpected value into an outage is not integrity.

---

## 7. Changing the schema

1. **Write the runtime statement** in `migrate()` (or in the owning module's
   `ensure*` function). Cheap and idempotent — `CREATE TABLE IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` — can go in the body
   directly. Anything that scans, writes or rewrites a table goes inside
   `once('<version>_<slug>', [...])`.
2. **Mirror it** in a new `supabase/migrations/<timestamp>_<slug>.sql`.
3. **Add a constraint with the column.** A status column gets its `CHECK`, a
   reference gets its foreign key, a derived column gets the assertion that it
   is derived. Use `NOT VALID` so deploying cannot fail on stored rows, then run
   [`scripts/validate-schema-constraints.sql`](../scripts/validate-schema-constraints.sql).
4. **Index the foreign key** unless the parent is never deleted.
5. **Check you are not adding a duplicate index.** An index whose columns are a
   prefix of an existing key in the same order is never read and is maintained
   on every write. The audit query in the `postgres-schema-design` skill finds
   these.
6. **Say why, in the schema.** If the column is denormalised, cached or derived,
   `COMMENT ON COLUMN` it, and add it to
   [section 4](#4-the-deliberate-denormalisations) with its guard.
7. **Parse it before you ship it, and check the replay order.** There is no local
   Postgres in this repo, so a syntax error otherwise surfaces at a cold start and
   an ordering mistake otherwise surfaces only on a fresh database:

   ```bash
   S=.claude/skills/postgres-schema-design/scripts
   node $S/check-sql.mjs src/server/db.ts src/server/mlPersistence.ts supabase/migrations/*.sql
   node $S/check-replay-order.mjs supabase/migrations
   ```

   `check-sql.mjs` parses with the real PostgreSQL grammar (libpg_query via wasm),
   including the plpgsql inside `DO` blocks — to the SQL grammar alone a
   procedural body is just a string literal, so `END LOOP` spelled wrongly parses
   clean and fails at runtime.
