-- Track consecutive timeouts per poker seat for AFK auto-kick.
-- Cash game: N consecutive timeouts → kicked (stack returned); N from server constant.
-- Tournament: N consecutive timeouts → eliminated from SNG (same as bust); N from server constant.
-- Reset to 0 when the player voluntarily acts.
ALTER TABLE poker_seats
  ADD COLUMN IF NOT EXISTS consecutive_timeouts INT NOT NULL DEFAULT 0;
