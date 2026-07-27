DELETE FROM studio_cards stale
USING studio_cards keep
WHERE stale.device_id = keep.device_id
  AND stale.slot = keep.slot
  AND (
    stale.sort_order < keep.sort_order
    OR (stale.sort_order = keep.sort_order AND stale.updated_at < keep.updated_at)
    OR (stale.sort_order = keep.sort_order AND stale.updated_at = keep.updated_at AND stale.id < keep.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS studio_cards_device_slot_unique
  ON studio_cards (device_id, slot);
