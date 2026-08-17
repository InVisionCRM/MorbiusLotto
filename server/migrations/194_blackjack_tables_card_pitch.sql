-- Migration 194: per-table card lean for SOLO blackjack tables.
--
-- Multiplayer tables already store this inside theme_config (Table Forge);
-- solo tables are flat art rows, so the lean rides directly on the row:
--   {"dealer": 30, "player": 44}   degrees of rotateX, 0-75
-- NULL means flat (0/0) — the pre-feature behaviour for every existing row.

ALTER TABLE blackjack_tables ADD COLUMN IF NOT EXISTS card_pitch JSONB;

COMMENT ON COLUMN blackjack_tables.card_pitch IS 'Card hand lean in degrees, {"dealer":n,"player":n}, 0-75; NULL = flat. Matches cards to table art drawn in perspective.';
