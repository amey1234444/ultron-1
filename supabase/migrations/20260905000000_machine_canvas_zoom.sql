-- Machine size as a saved property of a canvas.
--
-- How large the machine is drawn used to live only in component state, so it
-- started at 100% on every visit and could not be handed to anyone. It is not a
-- viewing preference: every trail anchor is stored as a fraction of the machine
-- rect, so the size a layout was arranged at is part of what makes that layout
-- reproducible for the next person who opens it.
--
-- Saved in two places, and the difference matters. On a template it is the size
-- a super admin designed the machine at, and every machine created from that
-- template afterwards opens at it. On a machine it is that machine's own size,
-- which wins over its template's — a template is a starting point, not an
-- override, so resizing a template never disturbs a machine already sized by
-- hand.
--
-- Nullable on purpose: NULL means no size has ever been saved, which is a
-- different answer from 100% and is exactly what lets a machine fall through to
-- its template's size. Values are clamped to the range the zoom control offers
-- (0.5–2) before they are written.

ALTER TABLE studio_machine_layouts   ADD COLUMN IF NOT EXISTS machine_zoom DOUBLE PRECISION;
ALTER TABLE studio_machine_templates ADD COLUMN IF NOT EXISTS machine_zoom DOUBLE PRECISION;
