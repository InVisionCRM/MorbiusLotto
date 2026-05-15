-- Server-driven all-in runout state.
-- See `scheduleRunout` + `recoverStuckPostHandTables` in
-- server/src/services/poker-game.service.ts.
--
-- When chevtek auto-resolves an all-in showdown it produces the full
-- final board in one synchronous tick. Phase 2 makes the server pace
-- the reveal: emit intermediate `flop`/`turn`/`river` broadcasts before
-- the final showdown. Between the first intermediate frame and the
-- final showdown, the hand is in a "runout in progress" state — no
-- player can act, `completed_at` is still NULL, but the engine has
-- already determined the winner. If the server crashes during this
-- window the recovery sweep needs to know:
--   1. that a runout WAS in progress (runout_resolved_at)
--   2. what the final board looks like so persistShowdown can finish
--      (runout_final_community_cards)

ALTER TABLE poker_hands
  ADD COLUMN IF NOT EXISTS runout_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS runout_final_community_cards JSONB;

-- Partial index for the recovery sweep — only mid-runout rows live in it.
CREATE INDEX IF NOT EXISTS idx_poker_hands_runout_in_progress
  ON poker_hands (table_id, runout_resolved_at)
  WHERE runout_resolved_at IS NOT NULL AND completed_at IS NULL;
