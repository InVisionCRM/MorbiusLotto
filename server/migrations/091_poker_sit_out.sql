-- Voluntary sit-out support for poker cash game.
-- sit_out_since: set when a player voluntarily sits out; cleared on sit-back or kick.
-- Auto-kick after 15 minutes of sitting out (enforced by server cron).
ALTER TABLE poker_seats
  ADD COLUMN IF NOT EXISTS sit_out_since TIMESTAMPTZ DEFAULT NULL;
