-- Migration 071: Item builder — allow dynamic item creation without code changes

ALTER TABLE cosmetic_items
  ADD COLUMN IF NOT EXISTS unlocks_field   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS unlocks_value   TEXT,
  ADD COLUMN IF NOT EXISTS is_db_created   BOOLEAN NOT NULL DEFAULT false;

-- Index for fast server-side validation lookups (field + value → itemKey)
CREATE INDEX IF NOT EXISTS idx_cosmetic_items_unlock
  ON cosmetic_items (unlocks_field, unlocks_value)
  WHERE is_db_created = true AND is_active = true;
