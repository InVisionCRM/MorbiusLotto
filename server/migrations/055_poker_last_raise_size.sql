-- Migration 055: Add last_raise_size to poker_hands to correctly compute minimum re-raise.
-- Tracks the size of the last raise increment on the current street so that
-- subsequent raises must be at least as large (standard NL poker rules).
-- Reset to 0 when advancing to a new street.

ALTER TABLE poker_hands
  ADD COLUMN IF NOT EXISTS last_raise_size NUMERIC(78, 0) NOT NULL DEFAULT 0;
