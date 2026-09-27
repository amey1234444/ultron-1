-- Index the five foreign keys into ml_predictions.
--
-- ml_fault_risks, ml_diagnosis_events, ml_anomaly_events, ml_data_quality_events
-- and ml_prediction_explanations each carry
--   prediction_id UUID NOT NULL REFERENCES ml_predictions (prediction_id) ON DELETE CASCADE
-- and none of them indexed that column. A cascading delete has to find the child
-- rows before it can remove them, and without an index on the referencing side
-- that search is a sequential scan of the whole child table -- five of them per
-- deleted prediction.
--
-- 20260926000001_schema_integrity.sql indexed the foreign keys that were on a hot
-- path already. These were left because nothing deletes from ml_predictions: the
-- table is insert-only, so the cascade has never fired. That makes this latent
-- rather than urgent -- and it is exactly why it is worth doing now, while the
-- tables are small, instead of during the first retention or GDPR-erasure pass,
-- when the delete is both larger and the thing being waited on.
--
-- The existing ml_fault_risks_lookup and ml_diagnosis_events_lookup indexes do
-- not cover this. Both lead on machine_id, and a btree can only be scanned from
-- its leading column, so neither can be used to find rows by prediction_id.

CREATE INDEX IF NOT EXISTS ml_fault_risks_prediction              ON ml_fault_risks (prediction_id);
CREATE INDEX IF NOT EXISTS ml_diagnosis_events_prediction         ON ml_diagnosis_events (prediction_id);
CREATE INDEX IF NOT EXISTS ml_anomaly_events_prediction           ON ml_anomaly_events (prediction_id);
CREATE INDEX IF NOT EXISTS ml_data_quality_events_prediction      ON ml_data_quality_events (prediction_id);
CREATE INDEX IF NOT EXISTS ml_prediction_explanations_prediction  ON ml_prediction_explanations (prediction_id);
