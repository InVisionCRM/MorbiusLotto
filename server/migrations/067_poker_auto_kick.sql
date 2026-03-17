-- Track consecutive timeouts per poker seat for AFK auto-kick.
-- Cash game: 6 consecutive timeouts → kicked (stack returned).
-- Tournament: 6 consecutive timeouts → sitting_out (bleeds blinds naturally).
-- Reset to 0 when the player voluntarily acts.
ALTER TABLE poker_seats
  ADD COLUMN IF NOT EXISTS consecutive_timeouts INT NOT NULL DEFAULT 0;
