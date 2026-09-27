-- Drop studio_cards_device, which is a prefix of a key that already exists.
--
-- 20260926000001_schema_integrity.sql removed four indexes that repeated a key
-- column-for-column. This is the same defect one step removed: studio_cards_device
-- is (device_id), and studio_cards_device_slot_unique is (device_id, slot). A btree
-- on (a, b) answers WHERE a = ... as well as one on (a) does, so the shorter index
-- is never the one the planner needs -- but it is still maintained on every INSERT,
-- UPDATE and DELETE.
--
-- That write cost is not incidental here. Saving the asset hierarchy deletes every
-- row in studio_cards and re-inserts the posted snapshot, so every Save Config pays
-- for this index twice over, once on the delete and once on the insert.
--
-- The CREATE was removed from 20260714000000_durable_studio.sql and from migrate()
-- in src/server/db.ts in the same change, so a fresh database never builds it and a
-- replay of this directory does not rebuild it between the two files.

DROP INDEX IF EXISTS studio_cards_device;
