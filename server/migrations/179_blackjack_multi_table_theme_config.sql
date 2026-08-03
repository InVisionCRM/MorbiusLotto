-- Migration 179: Per-table theme config for multiplayer blackjack.
-- Stores the designer's output (/blackjack-multi/design): layout overrides
-- (seat/dealer placement, card sizing, motion), sound event overrides, and
-- per-event sound FX chains. Presentation only — nothing in this blob is read
-- by game logic, so a theme can never affect dealing or payouts.
--
-- Sparse by design: the JSON carries only what differs from the shipped
-- defaults, so an untouched table stores NULL and renders identically.

ALTER TABLE blackjack_multi_tables
  ADD COLUMN IF NOT EXISTS theme_config JSONB;

COMMENT ON COLUMN blackjack_multi_tables.theme_config IS
  'Sparse table theme from the designer: {version, layout, sounds, soundFx}. NULL = stock look/sound.';
