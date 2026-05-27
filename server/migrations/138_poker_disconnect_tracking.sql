-- Extended auto-fold clock for disconnected poker players.
-- When the player's WebSocket goes away (browser crash, network drop, app close)
-- the server stamps disconnected_at on their seat. autoFoldTimedOutTurns uses a
-- 90-second threshold instead of the normal 60-second one for these seats, giving
-- a reconnecting player extra room to act before being auto-folded.
--
-- Cleared on: any voluntary action (poker_action handler) and on any active
-- "I'm here" signal (poker_get_state, poker_join_table) — both treated as
-- reconnect evidence.
ALTER TABLE poker_seats
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ DEFAULT NULL;
