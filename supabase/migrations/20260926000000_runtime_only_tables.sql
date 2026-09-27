-- Tables the runtime creates that this migration history never recorded.
--
-- supabase/migrations covered 33 of the 57 tables src/server/db.ts,
-- src/server/mlPersistence.ts and src/server/plantOverview.ts actually create, so
-- a database built from this directory alone came up missing password resets, the
-- machine template canvases, the plant overview, the whole SAP connector and the
-- whole ML record. The gap opened because those features shipped by adding their
-- DDL to the runtime path only, where it is applied on the next cold start and a
-- migration file is easy to forget.
--
-- This file closes the gap as of 2026-09-26. Every statement is IF NOT EXISTS, so
-- on a deployment that has already booted the current code it is a no-op, and on
-- a fresh database it is the missing half of the schema.
--
-- The SQL is copied verbatim from those three modules. If you change a column
-- there, change it here too -- or better, see docs/database-schema.md on making
-- one of the two the single source and deriving the other.


-- --- Password reset tokens ---------------------------------------------

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash   TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ
  );
CREATE INDEX IF NOT EXISTS password_reset_tokens_user ON password_reset_tokens (user_id, consumed_at);

-- --- Machine template canvases -----------------------------------------

CREATE TABLE IF NOT EXISTS studio_machine_templates (
    machine_template TEXT PRIMARY KEY,
    trails           JSONB NOT NULL DEFAULT '[]'::jsonb,
    boxes            JSONB NOT NULL DEFAULT '[]'::jsonb,
    machine_zoom     DOUBLE PRECISION,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  );

-- --- Plant Overview dashboard layout -----------------------------------

CREATE TABLE IF NOT EXISTS studio_plant_overview (
    id         INTEGER PRIMARY KEY DEFAULT 1,
    config     JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT NOT NULL DEFAULT ''
  );

-- --- SAP S/4HANA connector ---------------------------------------------

CREATE TABLE IF NOT EXISTS sap_connections (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    edition               TEXT NOT NULL DEFAULT 'cloud_public',
    base_url              TEXT NOT NULL,
    auth_type             TEXT NOT NULL,
    token_url             TEXT NOT NULL DEFAULT '',
    encrypted_credentials TEXT NOT NULL,
    default_plant         TEXT NOT NULL DEFAULT '',
    service_paths         JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled               BOOLEAN NOT NULL DEFAULT true,
    last_tested_at        TIMESTAMPTZ,
    last_test_status      TEXT NOT NULL DEFAULT 'untested',
    last_test_detail      TEXT NOT NULL DEFAULT '',
    created_by            TEXT NOT NULL DEFAULT '',
    updated_by            TEXT NOT NULL DEFAULT '',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
  );
CREATE INDEX IF NOT EXISTS sap_connections_enabled ON sap_connections (enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS sap_project_bindings (
    project_id      TEXT PRIMARY KEY REFERENCES studio_projects(id) ON DELETE CASCADE,
    connection_id   TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
    sap_plant       TEXT NOT NULL DEFAULT '',
    planning_plant  TEXT NOT NULL DEFAULT '',
    updated_by      TEXT NOT NULL DEFAULT '',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );
CREATE INDEX IF NOT EXISTS sap_project_bindings_connection ON sap_project_bindings (connection_id);

CREATE TABLE IF NOT EXISTS sap_asset_mappings (
    id                    BIGSERIAL PRIMARY KEY,
    connection_id         TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
    ultron_machine_id     TEXT NOT NULL REFERENCES studio_machines(id) ON DELETE CASCADE,
    sap_equipment         TEXT NOT NULL,
    functional_location   TEXT NOT NULL DEFAULT '',
    plant                 TEXT NOT NULL DEFAULT '',
    work_center           TEXT NOT NULL DEFAULT '',
    measuring_points      JSONB NOT NULL DEFAULT '{}'::jsonb,
    status                TEXT NOT NULL DEFAULT 'validated',
    last_validated_at     TIMESTAMPTZ,
    updated_by            TEXT NOT NULL DEFAULT '',
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connection_id, ultron_machine_id)
  );
CREATE INDEX IF NOT EXISTS sap_asset_mappings_equipment ON sap_asset_mappings (connection_id, sap_equipment);
CREATE INDEX IF NOT EXISTS sap_asset_mappings_machine ON sap_asset_mappings (ultron_machine_id);

CREATE TABLE IF NOT EXISTS sap_material_mappings (
    id                    BIGSERIAL PRIMARY KEY,
    connection_id         TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
    ultron_machine_id     TEXT NOT NULL REFERENCES studio_machines(id) ON DELETE CASCADE,
    component_key         TEXT NOT NULL,
    sap_material          TEXT NOT NULL,
    plant                 TEXT NOT NULL DEFAULT '',
    storage_location      TEXT NOT NULL DEFAULT '',
    required_quantity     DOUBLE PRECISION,
    unit                  TEXT NOT NULL DEFAULT '',
    approved_substitutes  JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_by            TEXT NOT NULL DEFAULT '',
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connection_id, ultron_machine_id, component_key)
  );
CREATE INDEX IF NOT EXISTS sap_material_mappings_machine ON sap_material_mappings (ultron_machine_id);

CREATE TABLE IF NOT EXISTS sap_case_links (
    id                    BIGSERIAL PRIMARY KEY,
    connection_id         TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
    maintenance_case_id   BIGINT NOT NULL REFERENCES analysis_maintenance_cases(id) ON DELETE CASCADE,
    notification_number   TEXT NOT NULL DEFAULT '',
    maintenance_order     TEXT NOT NULL DEFAULT '',
    status                TEXT NOT NULL DEFAULT 'pending',
    idempotency_key       TEXT NOT NULL UNIQUE,
    last_synced_at        TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connection_id, maintenance_case_id)
  );
CREATE INDEX IF NOT EXISTS sap_case_links_case ON sap_case_links (maintenance_case_id);

CREATE TABLE IF NOT EXISTS sap_object_cache (
    connection_id    TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
    object_type      TEXT NOT NULL,
    object_key       TEXT NOT NULL,
    payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
    etag             TEXT NOT NULL DEFAULT '',
    source_changed_at TIMESTAMPTZ,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (connection_id, object_type, object_key)
  );
CREATE INDEX IF NOT EXISTS sap_object_cache_recent ON sap_object_cache (connection_id, object_type, synced_at DESC);

CREATE TABLE IF NOT EXISTS sap_outbox (
    id                BIGSERIAL PRIMARY KEY,
    connection_id     TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
    operation         TEXT NOT NULL,
    object_type       TEXT NOT NULL,
    object_key        TEXT NOT NULL DEFAULT '',
    payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key   TEXT NOT NULL UNIQUE,
    state             TEXT NOT NULL DEFAULT 'pending',
    attempts          INT NOT NULL DEFAULT 0,
    next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error        TEXT NOT NULL DEFAULT '',
    correlation_id    TEXT NOT NULL,
    created_by        TEXT NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at      TIMESTAMPTZ
  );
CREATE INDEX IF NOT EXISTS sap_outbox_runnable ON sap_outbox (next_attempt_at, created_at)
  WHERE state IN ('pending', 'retry');
CREATE INDEX IF NOT EXISTS sap_outbox_connection ON sap_outbox (connection_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sap_sync_runs (
    id                BIGSERIAL PRIMARY KEY,
    connection_id     TEXT NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
    scope             TEXT NOT NULL DEFAULT 'all',
    state             TEXT NOT NULL DEFAULT 'running',
    objects_read      INT NOT NULL DEFAULT 0,
    objects_written   INT NOT NULL DEFAULT 0,
    error_count       INT NOT NULL DEFAULT 0,
    detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
    requested_by      TEXT NOT NULL DEFAULT '',
    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at       TIMESTAMPTZ
  );
CREATE INDEX IF NOT EXISTS sap_sync_runs_recent ON sap_sync_runs (connection_id, started_at DESC);

CREATE TABLE IF NOT EXISTS sap_audit_log (
    id                BIGSERIAL PRIMARY KEY,
    connection_id     TEXT REFERENCES sap_connections(id) ON DELETE SET NULL,
    user_id           TEXT NOT NULL DEFAULT '',
    action            TEXT NOT NULL,
    object_type       TEXT NOT NULL DEFAULT '',
    object_key        TEXT NOT NULL DEFAULT '',
    direction         TEXT NOT NULL DEFAULT 'internal',
    status            TEXT NOT NULL,
    http_status       INT,
    duration_ms       INT,
    correlation_id    TEXT NOT NULL DEFAULT '',
    detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );
CREATE INDEX IF NOT EXISTS sap_audit_log_recent ON sap_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS sap_audit_log_connection ON sap_audit_log (connection_id, created_at DESC);

-- --- ML model registry and prediction record ---------------------------

CREATE TABLE IF NOT EXISTS ml_models (
    id                  BIGSERIAL PRIMARY KEY,
    model_id            TEXT NOT NULL,
    version             TEXT NOT NULL,
    model_kind          TEXT NOT NULL,
    role                TEXT NOT NULL DEFAULT 'CANDIDATE',
    machine_type        TEXT NOT NULL DEFAULT 'TWIN_SCREW_EXTRUDER',
    feature_set_version TEXT,
    trained_on_dataset  TEXT,
    trained_on_real_data BOOLEAN NOT NULL DEFAULT FALSE,
    knowledge_digest    TEXT,
    code_revision       TEXT,
    random_seed         INTEGER,
    approved_by         TEXT,
    promoted_at         TIMESTAMPTZ,
    registered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    contract            JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_metrics  JSONB NOT NULL DEFAULT '{}'::jsonb,
    test_metrics        JSONB NOT NULL DEFAULT '{}'::jsonb,
    golden_results      JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (model_id, version)
  );

CREATE TABLE IF NOT EXISTS ml_predictions (
    id                   BIGSERIAL PRIMARY KEY,
    prediction_id        UUID NOT NULL UNIQUE,
    machine_id           TEXT NOT NULL,
    observed_at          TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    schema_version       TEXT NOT NULL,
    ml_status            TEXT NOT NULL,
    ml_eligible          BOOLEAN NOT NULL,
    eligibility_reason   TEXT,
    ml_mode              TEXT NOT NULL,
    surfaced             BOOLEAN NOT NULL DEFAULT FALSE,
    operating_state      TEXT NOT NULL,
    state_confidence     REAL,
    context_id           TEXT,
    context_confidence   REAL,
    recipe_id            TEXT,
    configuration_version TEXT,
    baseline_id          TEXT,
    baseline_level       TEXT,
    data_quality         TEXT NOT NULL,
    signals_reporting    INTEGER,
    bad_or_missing_count INTEGER,
    condition_verdict    TEXT NOT NULL,
    rule_state           TEXT NOT NULL,
    alert_reached        BOOLEAN NOT NULL DEFAULT FALSE,
    danger_reached       BOOLEAN NOT NULL DEFAULT FALSE,
    trip_active          BOOLEAN NOT NULL DEFAULT FALSE,
    diagnosis_model      TEXT,
    temporal_model       TEXT,
    feature_set_version  TEXT,
    trained_on_real_data BOOLEAN NOT NULL DEFAULT FALSE,
    versions             JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload              JSONB NOT NULL
  );
CREATE INDEX IF NOT EXISTS ml_predictions_machine_time
  ON ml_predictions (machine_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS ml_fault_risks (
    id              BIGSERIAL PRIMARY KEY,
    prediction_id   UUID NOT NULL REFERENCES ml_predictions (prediction_id) ON DELETE CASCADE,
    machine_id      TEXT NOT NULL,
    observed_at     TIMESTAMPTZ NOT NULL,
    fault_id        TEXT NOT NULL,
    horizon_minutes INTEGER NOT NULL,
    probability     REAL NOT NULL,
    calibrated      BOOLEAN NOT NULL,
    threshold       REAL NOT NULL,
    crossed         BOOLEAN NOT NULL,
    persistence_met BOOLEAN NOT NULL,
    surfaced        BOOLEAN NOT NULL DEFAULT FALSE
  );
CREATE INDEX IF NOT EXISTS ml_fault_risks_lookup
  ON ml_fault_risks (machine_id, fault_id, horizon_minutes, observed_at DESC);

CREATE TABLE IF NOT EXISTS ml_diagnosis_events (
    id                  BIGSERIAL PRIMARY KEY,
    prediction_id       UUID NOT NULL REFERENCES ml_predictions (prediction_id) ON DELETE CASCADE,
    machine_id          TEXT NOT NULL,
    observed_at         TIMESTAMPTZ NOT NULL,
    fault_id            TEXT NOT NULL,
    fault_family        TEXT,
    diagnosis_state     TEXT NOT NULL,
    severity            TEXT NOT NULL,
    severity_authority  TEXT,
    priority            TEXT NOT NULL,
    fault_confidence    REAL,
    location_confidence REAL,
    root_cause_confidence REAL,
    source              TEXT NOT NULL,
    surfaced            BOOLEAN NOT NULL DEFAULT FALSE,
    caused_by           TEXT,
    evidence            JSONB NOT NULL DEFAULT '{}'::jsonb,
    action              JSONB NOT NULL DEFAULT '{}'::jsonb
  );
CREATE INDEX IF NOT EXISTS ml_diagnosis_events_lookup
  ON ml_diagnosis_events (machine_id, fault_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS ml_anomaly_events (
    id                  BIGSERIAL PRIMARY KEY,
    prediction_id       UUID NOT NULL REFERENCES ml_predictions (prediction_id) ON DELETE CASCADE,
    machine_id          TEXT NOT NULL,
    observed_at         TIMESTAMPTZ NOT NULL,
    signal_id           TEXT NOT NULL,
    anomaly_id          TEXT,
    verdict             TEXT NOT NULL,
    value               REAL,
    expected            REAL,
    percent_deviation   REAL,
    robust_score        REAL,
    persistence_seconds REAL,
    limit_status        TEXT,
    data_quality        TEXT
  );

CREATE TABLE IF NOT EXISTS ml_data_quality_events (
    id            BIGSERIAL PRIMARY KEY,
    prediction_id UUID NOT NULL REFERENCES ml_predictions (prediction_id) ON DELETE CASCADE,
    machine_id    TEXT NOT NULL,
    observed_at   TIMESTAMPTZ NOT NULL,
    signal_id     TEXT NOT NULL,
    rule_id       TEXT NOT NULL,
    verdict       TEXT NOT NULL,
    reason        TEXT NOT NULL,
    suppresses_physical_diagnosis BOOLEAN NOT NULL DEFAULT FALSE
  );

CREATE TABLE IF NOT EXISTS ml_prediction_explanations (
    id              BIGSERIAL PRIMARY KEY,
    prediction_id   UUID NOT NULL REFERENCES ml_predictions (prediction_id) ON DELETE CASCADE,
    fault_id        TEXT NOT NULL,
    horizon_minutes INTEGER NOT NULL,
    model_id        TEXT,
    base_value      REAL,
    contributions   JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS ml_baseline_versions (
    id                   BIGSERIAL PRIMARY KEY,
    baseline_id          TEXT NOT NULL,
    version              TEXT NOT NULL,
    machine_id           TEXT NOT NULL,
    feature_id           TEXT NOT NULL,
    context_id           TEXT NOT NULL,
    operating_state      TEXT,
    configuration_version TEXT,
    level                TEXT NOT NULL,
    status               TEXT NOT NULL,
    sample_count         INTEGER NOT NULL DEFAULT 0,
    duration_seconds     REAL NOT NULL DEFAULT 0,
    statistics           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (baseline_id, version)
  );

CREATE TABLE IF NOT EXISTS ml_model_promotions (
    id            BIGSERIAL PRIMARY KEY,
    model_id      TEXT NOT NULL,
    version       TEXT NOT NULL,
    from_role     TEXT,
    to_role       TEXT NOT NULL,
    approved_by   TEXT,
    reason        TEXT,
    golden_passed BOOLEAN,
    at            TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS ml_training_runs (
    id                 BIGSERIAL PRIMARY KEY,
    run_id             TEXT NOT NULL UNIQUE,
    command            TEXT NOT NULL,
    dataset_id         TEXT,
    seed               INTEGER,
    code_revision      TEXT,
    knowledge_digest   TEXT,
    started_at         TIMESTAMPTZ,
    finished_at        TIMESTAMPTZ,
    metrics            JSONB NOT NULL DEFAULT '{}'::jsonb,
    arguments          JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes              JSONB NOT NULL DEFAULT '[]'::jsonb
  );

CREATE TABLE IF NOT EXISTS ml_feedback (
    id                    BIGSERIAL PRIMARY KEY,
    feedback_id           UUID NOT NULL UNIQUE,
    prediction_id         UUID,
    machine_id            TEXT NOT NULL,
    submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_by          TEXT,
    diagnosis_correct     TEXT NOT NULL,
    actual_fault_id       TEXT,
    actual_location       TEXT,
    actual_root_cause     TEXT,
    action_taken          TEXT,
    post_action_result    TEXT,
    primary_anomaly_cleared TEXT,
    false_positive        BOOLEAN NOT NULL DEFAULT FALSE,
    false_negative        BOOLEAN NOT NULL DEFAULT FALSE,
    confirmation_source   TEXT,
    label_quality         TEXT NOT NULL DEFAULT 'UNVERIFIED',
    review_status         TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    notes                 TEXT
  );
CREATE INDEX IF NOT EXISTS ml_feedback_review
  ON ml_feedback (review_status, submitted_at DESC);
