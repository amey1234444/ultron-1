-- Workspace tenancy.
--
-- Until now the studio was one global workspace. studio_projects,
-- studio_folders, studio_machines, studio_devices, studio_cards and the two
-- layout tables had no owner column, so every authenticated account read and
-- wrote the same rows, and studio_meta enforced it with a CHECK (id = 1)
-- singleton holding the single pair of revision counters.
--
-- Every existing row keeps belonging to the workspace it is already in: the
-- new column defaults to 'default', which is the workspace every current
-- account is assigned to, so nothing anyone sees today changes.
--
-- studio_meta is deliberately left in place rather than dropped. It costs
-- nothing, and removing the table that holds the old revision numbers in the
-- same release that stops reading them leaves no way back.

CREATE TABLE IF NOT EXISTS studio_workspaces (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  seeded          BOOLEAN NOT NULL DEFAULT false,
  hier_revision   BIGINT NOT NULL DEFAULT 0,
  layout_revision BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Carry the singleton's state across, so a running database keeps its
-- revision counters and is not re-seeded.
INSERT INTO studio_workspaces (id, name, seeded, hier_revision, layout_revision)
SELECT 'default', 'Default workspace', seeded, hier_revision, layout_revision
  FROM studio_meta WHERE id = 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO studio_workspaces (id, name) VALUES ('default', 'Default workspace')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE studio_projects          ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE studio_folders           ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE studio_machines          ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE studio_devices           ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE studio_cards             ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE studio_machine_layouts   ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE studio_machine_templates ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';

-- Which workspace an account signs in to.
ALTER TABLE users                    ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';

-- studio_machine_templates keyed on the template name alone, which is shared
-- vocabulary: two workspaces both saving a layout for 'DTDC' would collide on
-- it. Every other table keys on a generated id, already unique across
-- workspaces.
ALTER TABLE studio_machine_templates DROP CONSTRAINT IF EXISTS studio_machine_templates_pkey;
ALTER TABLE studio_machine_templates ADD PRIMARY KEY (workspace_id, machine_template);

CREATE INDEX IF NOT EXISTS studio_projects_workspace        ON studio_projects (workspace_id, sort_order);
CREATE INDEX IF NOT EXISTS studio_folders_workspace         ON studio_folders (workspace_id, sort_order);
CREATE INDEX IF NOT EXISTS studio_machines_workspace        ON studio_machines (workspace_id, sort_order);
CREATE INDEX IF NOT EXISTS studio_devices_workspace         ON studio_devices (workspace_id, sort_order);
CREATE INDEX IF NOT EXISTS studio_cards_workspace           ON studio_cards (workspace_id, sort_order);
CREATE INDEX IF NOT EXISTS studio_machine_layouts_workspace ON studio_machine_layouts (workspace_id);
CREATE INDEX IF NOT EXISTS users_workspace                  ON users (workspace_id);
