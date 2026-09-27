# Normalization, and when to stop

Normalization is not tidiness. Each normal form removes one specific way a table
can hold two contradictory answers to the same question. If you can name the
anomaly a form prevents, you can decide whether you care about it here; if you
cannot, you are applying a ritual.

The whole apparatus rests on one idea: a **functional dependency** `X -> Y` means
"given a value of X, the value of Y is determined". Write these down for a table
before deciding its shape. Almost every normalization decision falls out of the
list mechanically.

---

## The forms, and the anomaly each one prevents

### 1NF — every column holds one value from its domain

**Prevents:** a comma-separated list that no index can search and no constraint
can validate.

```sql
-- Not 1NF: which of these is the second tag, and how do you find rows with 'x'?
tags TEXT  -- 'alpha,beta,gamma'
```

Two legitimate repairs, and the choice matters:

```sql
-- Modelled: joinable, constrainable, countable.
CREATE TABLE post_tags (post_id BIGINT, tag TEXT, PRIMARY KEY (post_id, tag));

-- Or an array / jsonb, when the set is only ever read and written whole.
tags TEXT[]   -- GIN-indexable, but no foreign key to a tag vocabulary
```

Postgres arrays and `jsonb` are genuinely 1NF — the value is one array — so the
question is not legality but whether you need to constrain, join or aggregate the
elements. If you will ever ask "how many posts have tag x", model it.

> **The JSONB test.** `jsonb` is right for what you have *decided not to model*:
> a third-party payload you keep verbatim, a plugin's settings, a snapshot of a
> frame as it arrived. It is wrong for anything you filter, join, aggregate or
> constrain on. A `jsonb` column that the application always reads through the
> same six keys is six columns that lost their types.

### 2NF — no non-key column depends on only part of a composite key

**Prevents:** the same fact stored once per row of an unrelated dimension, and
therefore updatable in one place and not another.

```sql
-- Key is (order_id, product_id). product_name depends on product_id alone,
-- so it is repeated on every line of every order, and a rename must find them all.
CREATE TABLE order_lines (
  order_id     BIGINT,
  product_id   BIGINT,
  product_name TEXT,      -- 2NF violation
  quantity     INT,
  PRIMARY KEY (order_id, product_id)
);
```

Only composite keys can violate 2NF. With a single-column key, skip to 3NF.

### 3NF — no non-key column depends on another non-key column

**Prevents:** the transitive dependency. The most common real violation, and the
one to look for first in an existing schema.

```sql
-- machine -> folder -> project, so project_id is determined by folder_id.
-- Storing it permits a machine whose project is not its folder's project.
CREATE TABLE machines (
  id         TEXT PRIMARY KEY,
  folder_id  TEXT REFERENCES folders(id),
  project_id TEXT REFERENCES projects(id)   -- 3NF violation
);
```

**The fix that keeps the column.** When the denormalised column pays for itself,
a composite foreign key makes divergence unrepresentable instead of merely
discouraged:

```sql
ALTER TABLE folders  ADD CONSTRAINT folders_id_project_unique UNIQUE (id, project_id);
ALTER TABLE machines ADD CONSTRAINT machines_folder_project_fk
  FOREIGN KEY (folder_id, project_id) REFERENCES folders (id, project_id);
```

This is the single most useful trick in this file. It converts "we denormalised
and hope it stays consistent" into "the database will not let it diverge", at the
cost of one extra unique index on the parent.

**The other common 3NF violation: the code/label pair.**

```sql
sensor_code INT,
sensor      TEXT   -- determined by sensor_code
```

The label is functionally dependent on the code, so it belongs in
`sensor_types(code, label)` and is reached by join or view. Doing this also
solves a constraint problem: a new firmware sensor type becomes an `INSERT` into
a lookup table rather than a deploy that changes a `CHECK`.

**And the derived column.** `email_lc = lower(email)`, `total = price * qty`,
`value_with_unit = value || ' ' || unit` — the derived value depends on the
source column, not on the key. Three repairs, in order of strength:

```sql
-- Strongest: cannot be written wrongly, because it cannot be written at all.
email_lc TEXT GENERATED ALWAYS AS (lower(btrim(email))) STORED

-- Next: writers set it, the database refuses a value that disagrees.
CHECK (email_lc = lower(btrim(email)))

-- Weakest: a view or an expression index, and nothing stored.
CREATE UNIQUE INDEX ON users (lower(btrim(email)));
```

Prefer the generated column in new tables. In an existing one, note that Postgres
*rejects* an `INSERT` that names a generated column, so converting means changing
the table and every writer in one commit — the `CHECK` is the same guarantee at
no migration risk and is the right intermediate step.

### BCNF — every determinant is a candidate key

**Prevents:** the overlapping-candidate-key case 3NF misses. Rare, and real.

```sql
-- One teacher teaches one subject; a subject has many teachers.
-- Keys: (student, subject) and (student, teacher). Determinant teacher -> subject
-- is not a key, so a teacher's subject is stored once per student.
CREATE TABLE enrolment (student_id INT, subject TEXT, teacher_id INT);
```

Split `teacher -> subject` into `teachers(teacher_id, subject)`. Note BCNF
decomposition can lose a dependency you wanted enforced; when that happens, 3NF
plus a trigger or an exclusion constraint is the honest answer.

### 4NF — no independent multi-valued dependency in one table

**Prevents:** the cartesian-product table. Two independent one-to-many facts
about the same entity crammed together, so adding one skill forces a row per
language.

```sql
-- employee_skills_languages(employee, skill, language) -- 4NF violation
CREATE TABLE employee_skills    (employee_id INT, skill    TEXT, PRIMARY KEY (employee_id, skill));
CREATE TABLE employee_languages (employee_id INT, language TEXT, PRIMARY KEY (employee_id, language));
```

The tell is a composite key of three-or-more columns where two of them never
constrain each other.

### 5NF / 6NF — you are almost certainly not going here

5NF concerns join dependencies that are not implied by candidate keys; the
textbook case is a three-way supplier/part/project relationship where the
three-way fact really is the product of three two-way facts. 6NF (one non-key
attribute per table) is the anti-join-heavy shape used by some temporal and
data-vault designs. Both are worth recognising and almost never worth adopting in
an application schema. Reach 3NF/BCNF, denormalise deliberately, stop.

---

## Denormalising on purpose

3NF is the default, not the goal. Depart from it when a measured read pattern
justifies it, and only with a guard. The four legitimate patterns:

| Pattern | Example | The guard that makes it safe |
| --- | --- | --- |
| **Cached aggregate** | `gateway.connected_racks` counting `racks` rows | a view that recomputes it and returns only the rows where cache and truth disagree |
| **Transitive shortcut** | `machine.project_id` reached via `folder` | the composite foreign key above |
| **Historical copy** | `user.reputation_status` *as it stood at signup* | none needed — it is a different fact from the current verdict; say so in `COMMENT ON COLUMN` |
| **Verbatim payload** | the frame a device sent, kept whole beside the parsed columns | the parsed columns are authoritative; the payload is evidence, and the comment says which |

The third row is the one people get wrong in both directions. "The value at the
time" and "the value now" are genuinely two facts, and storing both is not
duplication. But it is only true if the column is never read expecting today's
answer — which is why it has to be written down.

A denormalisation without any of these justifications, added because a join
looked expensive, is a guess. Measure the join first: on an indexed foreign key
with a few thousand rows it is almost always free.

---

## Working the method on an existing table

1. List the columns.
2. For each, ask what determines it. Write `X -> Y`.
3. Group the dependencies by determinant. Every determinant that is not a
   candidate key is a violation and a candidate table.
4. For each violation, decide: **decompose**, or **keep it and add the guard**.
   Record which, and why, in `COMMENT ON COLUMN`.
5. Check the write path. A decomposition that the current writers cannot produce
   in one transaction is not yet safe — fix the writer first.

Step 5 is where schema work actually fails. The prettiest decomposition in the
world is a regression if the code that fills it can leave the two tables
disagreeing for a second.
