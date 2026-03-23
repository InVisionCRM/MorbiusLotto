-- Multiplayer blackjack AFK: mirrors poker_seats.consecutive_timeouts.
-- Incremented on betting-phase timeout (no pending bet) and on in-round turn auto-stand.
-- Reset when the player places a bet or takes a voluntary in-round action.
-- Kick at 3 consecutive timeouts (enforced in blackjack-multi-game.service.ts).

ALTER TABLE blackjack_multi_seats
  ADD COLUMN IF NOT EXISTS consecutive_timeouts INT NOT NULL DEFAULT 0;
