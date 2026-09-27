# Constraints: the integrity ladder

Ordered by how much each rung rules out. Work down it for every column; the first
few are nearly free and catch most of what goes wrong.

| Rung | Mechanism | Rules out |
| --- | --- | --- |
| 1 | `NOT NULL` | "we don't know" appearing where it is not a legal answer |
| 2 | type | a date in a text column, a float where cents matter |
| 3 | `CHECK` domain | a status nobody defined, a percentage of 4000 |
| 4 | `UNIQUE` / `PRIMARY KEY` | the same entity twice |
| 5 | `REFERENCES` | a child pointing at a parent that does not exist |
| 6 | multi-column `CHECK` | `closed_at` before `created_at`; a discount above the price |
| 7 | `EXCLUDE` | two bookings of the same room at overlapping times |
| 8 | trigger | anything that needs to read another row — cycles, state machines |

Rungs 1–6 are declarative, cheap and checked by the planner. Rung 7 is
declarative and needs `btree_gist`. Rung 8 is code, so it is last: it can be
wrong, it runs per row, and it does not help the planner.

---

## NULL vs the empty string

`TEXT NOT NULL DEFAULT ''` is the most common avoidable mistake in a schema. It
makes "not set" and "set to nothing" the same value, and then every consumer has
to guess which was meant. It also breaks `UNIQUE`: several rows with `''` collide,
whereas several `NULL`s do not.

- If the fact is optional, use `NULL` and let uniqueness ignore it.
- If it must be present, use `NOT NULL` with no default and add `CHECK (col <> '')`.
- Use `''` only when the empty string is a meaningful value distinct from unknown.

Where a column already exists as `NOT NULL DEFAULT ''` and is a unique key
component, a partial unique index is the repair that does not require a data
migration:

```sql
CREATE UNIQUE INDEX users_email_lc_unique ON users (email_lc) WHERE email_lc <> '';
```

---

## Four ways to constrain a vocabulary

For a column that holds one of a fixed set of strings, in the order you should
consider them:

### 1. `CHECK (col IN (...))` — the default

```sql
ALTER TABLE users ADD CONSTRAINT users_role_domain
  CHECK (role IN ('user', 'admin', 'super_admin')) NOT VALID;
```

Cheap, visible in `\d`, and changing it is one `DROP CONSTRAINT` plus one `ADD
CONSTRAINT NOT VALID` — no table rewrite, no type catalog churn. Best choice for
a vocabulary the application owns and changes rarely.

### 2. A lookup table with a foreign key — when the vocabulary is data

```sql
CREATE TABLE sensor_types (code INT PRIMARY KEY, label TEXT NOT NULL);
ALTER TABLE readings ADD CONSTRAINT readings_sensor_fk
  FOREIGN KEY (sensor_code) REFERENCES sensor_types (code);
```

Choose this when the set changes without a deploy, when it carries attributes
beyond the name (a label, a unit, a display order), or when something outside your
control extends it. It is also the correct answer to a code/label pair: the label
stops being duplicated on every row.

This is the shape to reach for whenever Rule 1 says you cannot `CHECK` a value
because it comes from firmware or a partner: you still get referential integrity,
and adding a value is an `INSERT` rather than a release.

### 3. `CREATE TYPE … AS ENUM` — rarely worth it

Sorts in declaration order and is compact, but adding a value is DDL on a type
that every dependent table and function is bound to, removing one is not
supported, and reordering means recreating the type. The compactness almost never
matters. Prefer 1 or 2.

### 4. `CREATE DOMAIN` — when the same rule repeats across tables

```sql
CREATE DOMAIN percentage AS INT CHECK (VALUE BETWEEN 0 AND 100);
CREATE DOMAIN email_address AS TEXT CHECK (VALUE ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
```

The rule lives in one place and applies everywhere the domain is used. Underused.
The catch: a domain's `CHECK` is not visible in the table definition, so someone
reading `\d` sees only the domain name.

---

## `NOT VALID`: how to add a constraint to a table that has data

This is the single most important operational fact about constraints.

```sql
-- Enforced on every INSERT and UPDATE from now on. Does NOT scan existing rows.
ALTER TABLE t ADD CONSTRAINT c CHECK (...) NOT VALID;

-- Later, deliberately: scans the table under SHARE UPDATE EXCLUSIVE,
-- so reads and writes continue.
ALTER TABLE t VALIDATE CONSTRAINT c;
```

Why this is the right default when hardening an existing schema:

- **The deploy cannot fail.** A plain `ADD CONSTRAINT` scans the table and aborts
  on the first violating row, which turns a hardening pass into an outage on a
  database you did not have access to inspect.
- **The lock stays short.** A plain `ADD CONSTRAINT` holds `ACCESS EXCLUSIVE` for
  the length of the scan. On a large history table that is a stall.
- **A validation failure becomes a finding.** Run the validation separately and
  a failure tells you something true: there are stored rows breaking a rule the
  application believes it has always enforced. Those rows are the bug.

The same applies to foreign keys: `ADD CONSTRAINT … FOREIGN KEY … NOT VALID`
enforces on new rows without scanning the old ones.

**The one gotcha.** A `NOT VALID` constraint *is* checked when an existing row is
updated. A legacy row that violates it cannot be saved again until it is fixed. So
`NOT VALID` protects the deploy, not every future request — which is why you
validate, and why you look at what fails.

---

## Multi-column and temporal rules

Cheap, declarative, and almost always missing:

```sql
CHECK (expires_at  > created_at)                          -- a token must outlive its creation
CHECK (finished_at IS NULL OR finished_at >= started_at)   -- a run cannot end before it starts
CHECK (resolved_at IS NULL OR resolved_at >= started_at)
CHECK (discount <= price)
CHECK (attempts >= 0)
CHECK (probability BETWEEN 0 AND 1)
CHECK (jsonb_typeof(permissions) = 'array')                -- shape of a jsonb column
CHECK (parent_id IS NULL OR parent_id <> id)               -- no self-parent
CHECK (num_nonnulls(user_id, api_key_id) = 1)              -- exactly one owner
```

The last two are worth memorising. `num_nonnulls(...) = 1` is the clean way to
express an exclusive-arc — a row owned by exactly one of several possible parents
— which people otherwise implement with a trigger.

For a `jsonb` column you have decided not to model, still assert its top-level
shape. `jsonb_typeof(col) = 'array'` costs nothing and stops an object being
written where every reader expects a list.

---

## Exclusion constraints

For "these two rows must not overlap", which no `UNIQUE` can express:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (room_id WITH =, during WITH &&);
```

`during` is a `tstzrange`. This is the correct tool for booking systems, shift
rosters, price validity periods and any temporal-validity table — anywhere the
alternative is a trigger that does a `SELECT … FOR UPDATE` and races anyway.

---

## Deferrable constraints

```sql
ALTER TABLE t ADD CONSTRAINT c UNIQUE (position) DEFERRABLE INITIALLY IMMEDIATE;
SET CONSTRAINTS c DEFERRED;   -- inside a transaction
```

The use case is a swap or a reorder that is momentarily inconsistent but
consistent at commit — renumbering positions, exchanging two unique values. Keep
`INITIALLY IMMEDIATE` and defer explicitly where needed, so an ordinary statement
still fails fast.

Note: foreign keys are deferrable, but `NOT NULL` and `CHECK` are not.

---

## Generated columns

```sql
total_cents BIGINT GENERATED ALWAYS AS (unit_cents * quantity) STORED
search      tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || body)) STORED
```

Stored, indexable, and impossible to write wrongly because they cannot be written
at all. Two constraints to know: the expression must be immutable (so no `now()`,
no other rows), and Postgres rejects an `INSERT` or `UPDATE` that names the
column — which is what makes converting an existing column a coordinated change
rather than an additive one.

---

## Naming

Deterministic names make a constraint findable, greppable and idempotent to
create. Postgres-generated names (`users_role_check1`) are none of those.

```
<table>_<column(s)>_<rule>
users_role_domain
users_email_lc_derived
sap_sync_runs_time_ordered
studio_folders_not_own_parent
```

Then adding one is idempotent without a migration ledger:

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'users_role_domain'
                   AND conrelid = 'users'::regclass) THEN
    ALTER TABLE users ADD CONSTRAINT users_role_domain
      CHECK (role IN ('user','admin','super_admin')) NOT VALID;
  END IF;
END $$;
```

For more than a handful, declare them as data and loop, so the set of rules reads
as one list and adding a rule is adding a row:

```sql
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('users', 'users_role_domain',   $q$role IN ('user','admin','super_admin')$q$),
    ('users', 'users_status_domain', $q$status IN ('pending','active','disabled')$q$)
  ) AS v(tbl, cname, expr) LOOP
    IF to_regclass(r.tbl) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = r.cname AND conrelid = to_regclass(r.tbl)
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s) NOT VALID', r.tbl, r.cname, r.expr);
    END IF;
  END LOOP;
END $$;
```

Nested dollar-quoting (`$q$` inside `$$`) is what keeps the expressions readable
with their own quotes intact. `to_regclass()` returning `NULL` for a table this
deployment has not created yet is what makes the whole block safe to run anywhere.
