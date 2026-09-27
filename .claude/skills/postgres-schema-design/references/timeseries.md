# Tables that grow forever

Any table fed by a device, a log, an event stream or an audit trail needs a growth
answer before it is large. Retrofitting partitioning onto a 500-million-row table
is a project; declaring it on an empty one is three lines.

---

## Split current state from history

These are two different tables with two different keys, and merging them is the
most common mistake in telemetry schemas.

```sql
-- Current state: one row per measurement point, upserted. Bounded by the
-- number of physical points, so it stays small and hot.
CREATE TABLE measurement_latest (
  gateway_id       TEXT NOT NULL,
  rack_id          TEXT NOT NULL,
  slot_id          INT  NOT NULL,
  channel_id       INT  NOT NULL,
  measurement_type TEXT NOT NULL,
  value            DOUBLE PRECISION NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gateway_id, rack_id, slot_id, channel_id, measurement_type)
);

-- History: append-only, partitioned by time, keyed on the SOURCE clock.
CREATE TABLE measurement_history (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY,
  gateway_id          TEXT NOT NULL,
  rack_id             TEXT NOT NULL,
  slot_id             INT  NOT NULL,
  channel_id          INT  NOT NULL,
  measurement_type    TEXT NOT NULL,
  value               DOUBLE PRECISION NOT NULL,
  source_timestamp_us BIGINT NOT NULL,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, received_at)
) PARTITION BY RANGE (received_at);
```

Why the current-state table exists at all: "what is the value now" against a
history table is a `DISTINCT ON` or a lateral join per point, which gets slower
every day. Against a current-state table it is a primary-key lookup, forever.

Note the primary key on a partitioned table must include the partition key —
which is why it is `(id, received_at)` and not `(id)`.

---

## Idempotence, and which clock to key on

A message can be redelivered. QoS 1, a retried HTTP POST and a consumer restart
all produce the same row twice. Make the duplicate collide with itself:

```sql
-- Key on the SOURCE's own clock and sequence, never on arrival time.
UNIQUE (gateway_id, rack_id, slot_id, channel_id, measurement_type,
        source_sequence, source_timestamp_us)
```

Then the writer is:

```sql
INSERT INTO measurement_history (...) VALUES (...)
ON CONFLICT DO NOTHING;
```

Keying on `received_at` instead would make every redelivery a new row, because the
arrival time differs. This is why the source timestamp has to be in the key even
though it is less convenient.

For the current-state upsert, reject out-of-order frames in the same statement
rather than in the application:

```sql
INSERT INTO measurement_latest (...) VALUES (...)
ON CONFLICT (gateway_id, rack_id, slot_id, channel_id, measurement_type) DO UPDATE
SET value = EXCLUDED.value, updated_at = now()
WHERE measurement_latest.source_timestamp_us <= EXCLUDED.source_timestamp_us;
```

The `WHERE` on the `DO UPDATE` is the whole trick: a late frame is silently
dropped, with no read-then-write race and no lock held across a round trip.

**Reboots break monotonic sequences.** A device that restarts its counter needs a
boot id in the comparison, or the first frame after a reboot looks like a very old
one:

```
newer := incoming.boot_id <> stored.boot_id
      OR incoming.timestamp_us > stored.timestamp_us
      OR (incoming.timestamp_us = stored.timestamp_us
          AND incoming.sequence >= stored.sequence)
```

**A wide unique index is an insert cost.** A seven-column unique index is
maintained on every insert into the history table. If ingest throughput matters
more than exact-once storage, the alternative is a cheap hash column
(`md5(...)::uuid` of the identity tuple) with a unique index on that one column.
Measure before choosing.

---

## Partitioning

```sql
CREATE TABLE measurement_history_2026_09 PARTITION OF measurement_history
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- Indexes declared on the parent are created on every partition, including
-- future ones.
CREATE INDEX ON measurement_history (gateway_id, rack_id, source_timestamp_us);
```

What partitioning buys, in order of how much it matters:

1. **Retention becomes instant.** `DROP TABLE measurement_history_2026_03` is a
   catalog operation. `DELETE FROM … WHERE received_at < …` on the same volume
   writes a dead tuple per row, bloats the table, and needs a `VACUUM` that may
   not keep up.
2. **Partition pruning.** A query with a time predicate touches only the relevant
   partitions.
3. **Smaller indexes.** Per-partition btrees stay shallower and more cacheable.
4. **Maintenance is per-partition.** `VACUUM` and `REINDEX` work on a month, not
   on the whole history.

The costs, honestly: you must create partitions ahead of time (a `DEFAULT`
partition catches strays but cannot be pruned, and rows in it block adding the
range later); the partition key must be in every unique constraint; and a query
with no predicate on the partition key scans everything.

Attach a `DEFAULT` partition so an early or late row is never rejected outright,
and alert on it being non-empty:

```sql
CREATE TABLE measurement_history_default PARTITION OF measurement_history DEFAULT;
```

### Choosing the interval

Aim for partitions in the low hundreds of millions of rows or a few GB, and for
the count to stay in the low hundreds — planning time grows with the number of
partitions. Monthly for most application history; daily for high-rate telemetry;
weekly is a reasonable middle.

---

## Retention, aggregation, and hot/cold

Decide all three at design time, and write the answer down next to the table:

```sql
COMMENT ON TABLE measurement_history IS
  'Raw samples. Retention 90 days by partition drop; 1-minute rollups in
   measurement_rollup_1m are kept 2 years. See docs/retention.md.';
```

**Rollups.** Raw samples answer "what exactly happened at 14:03:22"; a chart
answers "what did the hour look like". Keep raw data for the window you actually
investigate, and pre-aggregate the rest:

```sql
CREATE TABLE measurement_rollup_1m (
  gateway_id TEXT NOT NULL, rack_id TEXT NOT NULL,
  slot_id INT NOT NULL, channel_id INT NOT NULL,
  bucket  TIMESTAMPTZ NOT NULL,
  samples INT NOT NULL,
  min_value DOUBLE PRECISION, max_value DOUBLE PRECISION, avg_value DOUBLE PRECISION,
  PRIMARY KEY (gateway_id, rack_id, slot_id, channel_id, bucket)
);
```

Keep `min` and `max`, not just `avg`: the spike is usually the thing being looked
for, and an average hides it.

**BRIN for the time column.** On an append-only table the physical order already
matches `received_at`, which is exactly the case BRIN is for — a fraction of the
size of a btree, at block-range granularity:

```sql
CREATE INDEX ON measurement_history USING brin (received_at);
```

**TimescaleDB** does the partitioning, rollups (continuous aggregates) and
compression for you, and is the right answer if you can adopt an extension.
Hosted Postgres often cannot, which is why the above is worth knowing by hand.

---

## Dedup and quarantine tables

Two more tables that grow without anyone noticing:

- A **message-id dedup table** (`mqtt_messages`, `processed_events`) exists to
  recognise a redelivery. A redelivery arrives seconds later, not months, so the
  table only needs a window. Without retention it grows forever and the lookup it
  exists to make fast gets slower. Partition by day and drop, or delete on a
  schedule with an index that supports it.
- A **quarantine / dead-letter table** holds what failed validation, which is
  exactly what nobody looks at until there is an incident. Cap it, alert on its
  rate rather than its size, and keep a bounded window.

---

## The checklist for any table that accumulates

- [ ] Current state and history separated, with different keys
- [ ] The unique key is on the source's clock, so redelivery collides
- [ ] Out-of-order writes rejected in the statement, not in the application
- [ ] Partitioned by time if it will pass ~100M rows
- [ ] A `DEFAULT` partition exists and is monitored
- [ ] Retention decided, written in `COMMENT ON TABLE`, and automated
- [ ] Rollups exist for anything a chart reads
- [ ] Index count on the hot insert path kept to what queries actually use
- [ ] Dedup and quarantine tables have a window too
