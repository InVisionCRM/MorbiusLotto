-- Migration 056: Add turn_started_at to poker_hands for server-enforced 30-second turn timer.
-- Set to NOW() whenever acting_position changes so the server and clients can track
-- how long the current player has had to act.

ALTER TABLE poker_hands
  ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
