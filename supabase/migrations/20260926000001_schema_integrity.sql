-- Schema integrity and index hygiene.
--
-- Mirrors hardenSchema() in src/server/db.ts, which is what actually applies this
-- on a cold start. The SQL below is extracted from that function rather than
-- retyped, so the two cannot drift.
--
-- Three things happen here, and all three are about what is already in the
-- database rather than about a new feature:
--
--   1. Four indexes are dropped. Each duplicated a key that already indexes the
--      same columns in the same order (racks_live_gateway_rack repeated
--      UNIQUE (gateway_id, rack_id); rack_inventory_slots_live and
--      rack_slot_latest_rack repeated their own primary keys; rate_events_lookup
--      leads on a column every writer sets to ''). A duplicate index is never
--      read, because the planner picks one, but every INSERT and UPDATE maintains
--      it -- on rack_slot_latest that is every telemetry frame.
--
--   2. Indexes are added for the foreign keys that had none. Saving the asset
--      hierarchy deletes every project, folder, machine and device and re-inserts
--      them, so a cascade with no index behind it scans the child table on an
--      ordinary Save Config.
--
--   3. CHECK constraints are added for the rules the application has always
--      enforced in TypeScript and never told the database about, a trigger
--      rejects a folder cycle, and a view makes the cached rack counters on
--      gateways checkable against the rows they summarise.
--
-- Every CHECK is added NOT VALID. Postgres then enforces it on every insert and
-- update from here on WITHOUT scanning the rows already stored, so applying this
-- cannot fail on legacy data and cannot take a long lock on measurement_history.
-- Run scripts/validate-schema-constraints.sql afterwards to see which ones the
-- stored rows already satisfy and promote those to fully validated.
--
-- Deliberately absent: any constraint on a value that arrives from gateway
-- firmware (presence, quality, freshness, channel_status, alert_state, card_type,
-- sensor, unit, slot and channel numbers). Pinning those here would mean a
-- firmware release that adds a sensor type takes ingest down; they belong in
-- src/server/ingest/validate.mjs. See docs/database-schema.md.


-- --- 0. The ledger -----------------------------------------------------------
--
-- Created here as well as in migrate(), because src/server/ingest/db.mjs replays
-- this directory on every start of the ingest service and that process may reach
-- an empty database before the Next app does. The COMMENT at the end of this
-- file refers to it, and a missing table would abort the whole replay.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL DEFAULT 'runtime'
);

-- --- 1. Drop the indexes that duplicate a key ---------------------------------

DROP INDEX IF EXISTS racks_live_gateway_rack;
DROP INDEX IF EXISTS rack_inventory_slots_live;
DROP INDEX IF EXISTS rack_slot_latest_rack;
DROP INDEX IF EXISTS rate_events_lookup;

-- --- 2. Index the foreign keys that had none ----------------------------------

CREATE INDEX IF NOT EXISTS studio_folders_parent ON studio_folders (parent_id);
CREATE INDEX IF NOT EXISTS studio_machines_project ON studio_machines (project_id);
CREATE INDEX IF NOT EXISTS studio_devices_project ON studio_devices (project_id);
CREATE INDEX IF NOT EXISTS studio_devices_gateway ON studio_devices (gateway_id);
CREATE INDEX IF NOT EXISTS analysis_maintenance_cases_snapshot ON analysis_maintenance_cases (snapshot_id);
CREATE INDEX IF NOT EXISTS sap_asset_mappings_machine ON sap_asset_mappings (ultron_machine_id);
CREATE INDEX IF NOT EXISTS sap_material_mappings_machine ON sap_material_mappings (ultron_machine_id);
CREATE INDEX IF NOT EXISTS sap_case_links_case ON sap_case_links (maintenance_case_id);
CREATE INDEX IF NOT EXISTS sap_outbox_connection ON sap_outbox (connection_id, created_at DESC);

-- --- 3. Domain, tuple and referential rules -----------------------------------

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- Accounts: closed vocabularies, already validated at the API boundary.
    ('users', 'users_role_domain', $q$role IN ('user','admin','super_admin')$q$),
    ('users', 'users_status_domain', $q$status IN ('pending','active','disabled')$q$),
    ('users', 'users_reputation_status_domain', $q$reputation_status IN ('acceptable','not_acceptable','unknown','overridden')$q$),
    -- The lowercased columns are derived, not independent facts. Without
    -- this a row can carry an email_lc that does not belong to its email,
    -- and the same address could then sign up twice under the unique index.
    ('users', 'users_email_lc_derived', $q$email_lc = lower(btrim(email))$q$),
    ('users', 'users_username_lc_derived', $q$username_lc = lower(username)$q$),
    ('users', 'users_permissions_is_array', $q$jsonb_typeof(permissions) = 'array'$q$),
    -- A session or reset token that expires before it exists is unusable.
    ('auth_sessions', 'auth_sessions_expires_after_created', $q$expires_at > created_at$q$),
    ('password_reset_tokens', 'password_reset_expires_after_created', $q$expires_at > created_at$q$),
    ('app_settings', 'app_settings_data_is_object', $q$jsonb_typeof(data) = 'object'$q$),
    -- Only the key column is asserted. bucket is written as '' by the only
    -- writer (the bucket name is encoded in the key prefix instead), so a
    -- non-blank check on it would reject every rate-limit record.
    ('rate_events', 'rate_events_key_not_blank', $q$key <> ''$q$),
    -- Email reputation: one row per address, keyed by the lowercased form.
    ('email_reputation', 'email_reputation_status_domain', $q$status IN ('acceptable','not_acceptable','unknown','overridden')$q$),
    ('email_reputation', 'email_reputation_key_is_lower', $q$email_lc = lower(email_lc)$q$),
    ('email_reputation', 'email_reputation_reasons_is_array', $q$jsonb_typeof(reasons) = 'array'$q$),
    ('reputation_queue', 'reputation_queue_state_domain', $q$state IN ('pending','processing','done','error')$q$),
    ('reputation_queue', 'reputation_queue_attempts_non_negative', $q$attempts >= 0$q$),
    ('reputation_queue', 'reputation_queue_key_is_lower', $q$email_lc = lower(email_lc)$q$),
    -- Workspace: sort_order is an array index the server assigns from zero.
    ('studio_projects', 'studio_projects_sort_order_non_negative', $q$sort_order >= 0$q$),
    ('studio_folders', 'studio_folders_sort_order_non_negative', $q$sort_order >= 0$q$),
    ('studio_machines', 'studio_machines_sort_order_non_negative', $q$sort_order >= 0$q$),
    ('studio_devices', 'studio_devices_sort_order_non_negative', $q$sort_order >= 0$q$),
    ('studio_cards', 'studio_cards_sort_order_non_negative', $q$sort_order >= 0$q$),
    -- A folder that is its own parent makes the left rail recurse forever.
    -- This catches the one-step case; the trigger below catches longer ones.
    ('studio_folders', 'studio_folders_not_own_parent', $q$parent_id IS NULL OR parent_id <> id$q$),
    ('studio_cards', 'studio_cards_slot_non_negative', $q$slot >= 0$q$),
    ('studio_machines', 'studio_machines_components_is_array', $q$jsonb_typeof(components) = 'array'$q$),
    -- The zoom range the control offers, which clampMachineZoom() enforces on
    -- the way in. NULL stays legal and still means never sized.
    ('studio_machine_layouts', 'studio_machine_layouts_zoom_range', $q$machine_zoom IS NULL OR (machine_zoom >= 0.5 AND machine_zoom <= 2)$q$),
    ('studio_machine_templates', 'studio_machine_templates_zoom_range', $q$machine_zoom IS NULL OR (machine_zoom >= 0.5 AND machine_zoom <= 2)$q$),
    ('studio_machine_layouts', 'studio_machine_layouts_json_shape', $q$jsonb_typeof(trails) = 'array' AND jsonb_typeof(boxes) = 'array'$q$),
    ('studio_machine_templates', 'studio_machine_templates_json_shape', $q$jsonb_typeof(trails) = 'array' AND jsonb_typeof(boxes) = 'array'$q$),
    -- Live identity. A blank gateway id satisfies UNIQUE once and then
    -- collides with every other gateway that failed to identify itself.
    ('gateways', 'gateways_id_not_blank', $q$gateway_id <> ''$q$),
    ('gateways', 'gateways_status_domain', $q$status IN ('ONLINE','OFFLINE','DEGRADED','QUARANTINED','UNKNOWN')$q$),
    ('gateways', 'gateways_mqtt_state_domain', $q$mqtt_state IN ('CONNECTED','DISCONNECTED','UNKNOWN')$q$),
    ('gateways', 'gateways_counters_non_negative', $q$known_racks >= 0 AND connected_racks >= 0 AND stale_racks >= 0 AND disconnected_racks >= 0 AND blocked_racks >= 0 AND unidentified_connections >= 0 AND active_tcp_connections >= 0$q$),
    ('racks', 'racks_identity_not_blank', $q$gateway_id <> '' AND rack_id <> ''$q$),
    ('racks', 'racks_status_domain', $q$status IN ('connected','disconnected','stale','blocked','unknown')$q$),
    -- slot_number / slot_id / channel_id are NOT constrained here, even
    -- though a negative one is meaningless: they come straight from the
    -- gateway frame, and validate.mjs range-checks neither. A CHECK would
    -- turn one unexpected firmware value into silently dropped telemetry,
    -- so the range belongs in validate.mjs beside the identity checks that
    -- gateways_id_not_blank and racks_identity_not_blank below do mirror.
    ('mqtt_ingest_metrics', 'mqtt_ingest_metrics_non_negative', $q$metric_value >= 0$q$),
    -- Analysis. Scores are percentages and counts are counts.
    ('analysis_snapshots', 'analysis_snapshots_readiness_range', $q$readiness_score BETWEEN 0 AND 100$q$),
    ('analysis_overview_snapshots', 'analysis_overview_percent_range', $q$readiness_percent BETWEEN 0 AND 100 AND condition_score BETWEEN 0 AND 100 AND state_confidence BETWEEN 0 AND 100$q$),
    ('analysis_overview_snapshots', 'analysis_overview_counts_non_negative', $q$mapped_count >= 0 AND expected_points >= 0 AND live_count >= 0$q$),
    ('analysis_baselines', 'analysis_baselines_sample_count_non_negative', $q$sample_count >= 0$q$),
    -- An episode cannot be last seen, or resolved, before it started.
    ('analysis_anomaly_episodes', 'analysis_episodes_time_ordered', $q$last_seen_at >= started_at AND (resolved_at IS NULL OR resolved_at >= started_at)$q$),
    ('analysis_maintenance_cases', 'analysis_cases_closed_after_created', $q$closed_at IS NULL OR closed_at >= created_at$q$),
    -- SAP. The outbox ladder is pending -> processing -> completed | retry |
    -- failed, and nothing else ever writes state.
    ('sap_outbox', 'sap_outbox_state_domain', $q$state IN ('pending','processing','retry','completed','failed')$q$),
    ('sap_outbox', 'sap_outbox_attempts_non_negative', $q$attempts >= 0$q$),
    ('sap_sync_runs', 'sap_sync_runs_time_ordered', $q$finished_at IS NULL OR finished_at >= started_at$q$),
    ('sap_sync_runs', 'sap_sync_runs_counts_non_negative', $q$objects_read >= 0 AND objects_written >= 0 AND error_count >= 0$q$),
    ('sap_audit_log', 'sap_audit_log_http_status_range', $q$http_status IS NULL OR http_status BETWEEN 100 AND 599$q$),
    ('sap_audit_log', 'sap_audit_log_duration_non_negative', $q$duration_ms IS NULL OR duration_ms >= 0$q$)
  ) AS v(tbl, cname, expr) LOOP
    IF to_regclass(r.tbl) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = r.cname AND conrelid = to_regclass(r.tbl)
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s) NOT VALID', r.tbl, r.cname, r.expr);
    END IF;
  END LOOP;
END $$;


CREATE OR REPLACE FUNCTION studio_folders_reject_cycle() RETURNS trigger AS $fn$
DECLARE
  ancestor TEXT := NEW.parent_id;
  hops INT := 0;
BEGIN
  WHILE ancestor IS NOT NULL LOOP
    IF ancestor = NEW.id THEN
      RAISE EXCEPTION 'studio_folders: % cannot be a descendant of itself', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
    hops := hops + 1;
    IF hops > 10000 THEN
      RAISE EXCEPTION 'studio_folders: the parent chain above % is already cyclic', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT parent_id INTO ancestor FROM studio_folders WHERE id = ancestor;
  END LOOP;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS studio_folders_no_cycle ON studio_folders;

CREATE TRIGGER studio_folders_no_cycle
  AFTER INSERT OR UPDATE OF parent_id ON studio_folders
  FOR EACH ROW WHEN (NEW.parent_id IS NOT NULL)
  EXECUTE FUNCTION studio_folders_reject_cycle();


CREATE OR REPLACE VIEW gateway_rack_count_drift AS
SELECT
  g.gateway_id,
  g.connected_racks    AS cached_connected,
  t.connected_racks    AS actual_connected,
  g.stale_racks        AS cached_stale,
  t.stale_racks        AS actual_stale,
  g.disconnected_racks AS cached_disconnected,
  t.disconnected_racks AS actual_disconnected,
  g.updated_at
FROM gateways g
JOIN (
  SELECT
    gateway_id,
    count(*) FILTER (WHERE active AND status = 'connected' AND data_current)::int     AS connected_racks,
    count(*) FILTER (WHERE active AND status = 'connected' AND NOT data_current)::int AS stale_racks,
    count(*) FILTER (WHERE NOT active OR status <> 'connected')::int                  AS disconnected_racks
  FROM racks
  GROUP BY gateway_id
) t ON t.gateway_id = g.gateway_id
WHERE (g.connected_racks, g.stale_racks, g.disconnected_racks)
   IS DISTINCT FROM (t.connected_racks, t.stale_racks, t.disconnected_racks);


-- --- 4. Write the caveats into the database itself ----------------------------
--
-- So that the next person to open this in a Supabase console meets the same
-- caveats as the next person to read src/server/db.ts.

COMMENT ON TABLE schema_migrations IS 'Ledger of the one-time steps applied by the runtime migrate(). Separate from supabase_migrations.schema_migrations, which the Supabase CLI owns.';
COMMENT ON TABLE rejected_email_reputation IS 'DEPRECATED, superseded by email_reputation. Retained only as the source of the one-time forward migration; nothing reads or writes it. Safe to drop once email_reputation is confirmed complete.';
COMMENT ON VIEW gateway_rack_count_drift IS 'Gateways whose cached *_racks counters disagree with the racks rows they summarise. Empty is healthy.';
COMMENT ON COLUMN gateways.connected_racks IS 'Cached aggregate over racks, refreshed by the ingest runtime. The racks table is authoritative; see gateway_rack_count_drift.';
COMMENT ON COLUMN gateways.stale_racks IS 'Cached aggregate over racks; see gateway_rack_count_drift.';
COMMENT ON COLUMN gateways.disconnected_racks IS 'Cached aggregate over racks; see gateway_rack_count_drift.';
COMMENT ON COLUMN users.email_lc IS 'Derived: lower(btrim(email)). Exists to make the unique index case-insensitive; kept honest by users_email_lc_derived.';
COMMENT ON COLUMN users.username_lc IS 'Derived: lower(username). Kept honest by users_username_lc_derived.';
COMMENT ON COLUMN users.reputation_status IS 'The email_reputation verdict as it stood at signup, copied here so the user list renders without a join. email_reputation is authoritative for the current verdict.';
COMMENT ON COLUMN studio_machines.project_id IS 'Denormalised from studio_folders.project_id so the tree reads without a recursive join. See docs/database-schema.md for why a composite foreign key does not yet enforce it.';
COMMENT ON COLUMN studio_machine_layouts.boxes IS 'Full canvas geometry including trail anchors. The card subset is also normalised into studio_machine_canvas_cards; saveMachineLayout writes both in one transaction.';
COMMENT ON COLUMN studio_machine_canvas_cards.data IS 'The layout box this row was projected from, kept whole so a box property the columns do not model yet survives a round trip.';
