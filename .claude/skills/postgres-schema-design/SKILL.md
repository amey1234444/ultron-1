---
name: postgres-schema-design
description: Design, audit, normalise and safely migrate a PostgreSQL schema. Use when creating or changing tables, columns, keys, constraints or indexes; when asked to normalise, optimise, review, harden or clean up a schema or a migration; when deciding between JSONB and columns, natural and surrogate keys, enum and CHECK and lookup table; when a migration must ship without downtime or data loss; or when diagnosing duplicate indexes, missing foreign keys, unbounded time-series tables or drift between migration files and the running database.
---

# PostgreSQL schema design

A schema is the only part of a system that outlives every rewrite of the code
around it, and the only part where a mistake is expensive to reverse once there
is data. This skill is the method for getting one right, and for improving one
that already carries production data.

Two rules govern everything below.

> **Rule 1 — The database enforces what the application owns; the boundary
> validates what the outside world supplies.** A closed vocabulary the code
> defines (`role`, `status`, a state machine) belongs in a `CHECK`. A string that
> arrives from a device, a partner API or a firmware release does not: a
> constraint on it turns somebody else's unexpected value into your outage. Put
> that rule at the ingest boundary and give it a lookup table, not a `CHECK`.

> **Rule 2 — A denormalisation needs a reason and a guard.** Storing a fact twice
> is a legitimate decision. Storing it twice with nothing that can detect
> divergence is a bug with a delay on it. Write the reason in `COMMENT ON COLUMN`
> and ship the guard (a constraint, a composite foreign key, or a view that
> reports drift) in the same change.

## When you are designing something new

Work in this order. Each step constrains the next, and doing them out of order
is what produces schemas that need this skill later.

1. **Name the entities and their identity.** For each, answer: what makes two
   rows the same row? That answer is the key, whether or not you also add a
   surrogate. See `references/keys-and-types.md`.
2. **Write the functional dependencies down.** `X -> Y` for every "given X, Y is
   determined". Normalise to 3NF/BCNF against that list, not against intuition.
   See `references/normalization.md`.
3. **Pick types before you pick indexes.** `timestamptz` not `timestamp`,
   `numeric` for money, `text` for text, `bigint` for microsecond epochs,
   `jsonb` only for what you have decided not to model. See
   `references/keys-and-types.md`.
4. **Constrain every column you can.** Not-null, domain, range, temporal
   ordering, cross-column. The integrity ladder in
   `references/constraints.md` is ordered by how much each rules out.
5. **Index from the queries, not from the columns.** Then check nothing you added
   is a prefix duplicate of a key you already have. See `references/indexing.md`.
6. **Decide the growth story.** Any table that accumulates rows forever needs a
   retention or partitioning answer before it is large, not after. See
   `references/timeseries.md`.

## When you are improving a schema that has data

Never start by writing DDL. Start by finding out what is true.

1. **Read the schema and its writers together.** The schema tells you what is
   representable; only the writers tell you what actually occurs. Before you
   constrain a column, find every statement that writes it — a value domain you
   inferred from type definitions and a value domain the code actually writes are
   different things, and the gap is where an outage lives.
2. **Run the audit.** `scripts/audit.sql` reports duplicate and unused indexes,
   unindexed foreign keys, nullable columns that are never null, tables without a
   primary key, `text` columns that only hold a handful of values, unvalidated
   constraints, and bloat. Run it read-only, first.
3. **Classify each finding** as one of:
   - *safe now* — additive, or provably a no-op (drop a duplicate index, add a
     `NOT VALID` constraint, add a missing index, add a `COMMENT`);
   - *needs a code change first* — the schema cannot be fixed until a write
     pattern changes (see the `writeHierarchyRows` case in
     `references/review-checklist.md`);
   - *needs a window* — rewrites a table, takes a long lock, or deletes data.
   Ship the first group. Write the second group down with its prerequisite. Do
   not do the third without asking.
4. **Verify before you assert.** Every `CHECK` you add is a promise about data
   you have not seen. `NOT VALID` makes that promise safe: Postgres enforces it
   on new and updated rows and never scans the old ones, so the deploy cannot
   fail and the lock stays short. Validate afterwards, deliberately, and treat a
   validation failure as a finding rather than a mistake.
5. **Parse the SQL before you ship it.** `scripts/check-sql.mjs` parses every SQL
   string in a repo with the real PostgreSQL grammar (libpg_query via wasm),
   including plpgsql inside `DO` blocks. Use it whenever there is no local
   Postgres to run against — a syntax error in a cold-start migration otherwise
   surfaces in production.
6. **Check the replay order if anything replays the migration directory.**
   `scripts/check-replay-order.mjs` reports files that reference a table a later
   file creates. That failure only appears against an *empty* database, so it
   survives indefinitely in an environment that was built incrementally, and it
   is the reason a new file goes after everything it depends on.

## The refusals that matter

State these plainly when they come up; they are the difference between a
hardening pass and an incident.

- **Do not add a `CHECK` on a value the application does not control.** Rule 1.
- **Do not add a foreign key without reading how the parent is deleted.** A
  `DELETE`-all-and-reinsert save turns `ON DELETE CASCADE` into data loss and
  `ON DELETE RESTRICT` into a broken endpoint.
- **Do not drop a table or column to "clean up".** That is a data deletion. Mark
  it deprecated with `COMMENT ON TABLE`, stop writing it, and let the owner
  decide.
- **Do not convert a column type on a large table casually.** `ALTER COLUMN …
  TYPE` with a `USING` clause rewrites the table under `ACCESS EXCLUSIVE`.
- **Do not put a table rewrite, a backfill or a dedupe on a path that runs on
  every boot.** Idempotent is not the same as free. See
  `references/migrations.md`.

## Reference material

| File | Read it when |
| --- | --- |
| `references/normalization.md` | deciding how to split tables; 1NF→6NF with the failure each form prevents, and when to denormalise on purpose |
| `references/constraints.md` | choosing between `CHECK`, enum type, domain and lookup table; the integrity ladder; `NOT VALID`; exclusion and deferrable constraints |
| `references/keys-and-types.md` | natural vs surrogate keys, identity vs serial, UUIDv7, and the type choices that are hard to reverse |
| `references/indexing.md` | designing an index, or finding out which of the existing ones are dead weight |
| `references/migrations.md` | writing a migration that is safe to deploy: lock levels, expand/contract, ledgers, advisory locks, batched backfills |
| `references/timeseries.md` | any table that grows forever: latest-vs-history split, partitioning, retention, upsert idempotence |
| `references/review-checklist.md` | reviewing a schema or a migration; the anti-pattern catalogue, each with its tell |

## Tools

- `scripts/audit.sql` — read-only introspection: duplicate and unused indexes,
  unindexed foreign keys, tables with no primary key, unvalidated constraints,
  unconstrained status columns, `NOT NULL DEFAULT ''`, naive timestamps, floats
  holding money, accumulating tables, sequences near their limit. Run against the
  live database.
- `scripts/check-sql.mjs` — parse every SQL string in a repo with the real
  PostgreSQL grammar, plus the plpgsql inside `DO` blocks. Needs
  `npm i pg-query-emscripten` (wasm, no native build).
- `scripts/check-replay-order.mjs` — confirm a migration directory can be replayed
  against an empty database in filename order. No dependencies.

## This repository

ULTRON's own model, its five deliberate denormalisations and the work this method
has already been applied to are in
[`docs/database-schema.md`](../../../docs/database-schema.md). Read it before
changing anything under `supabase/migrations/` or in `src/server/db.ts` — in
particular section 5, which explains which foreign keys are blocked and why.
