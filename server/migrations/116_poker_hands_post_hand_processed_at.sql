-- Self-healing recovery marker for deferred post-hand work.
-- See `scheduleNextHandAfterShowdown` + `recoverStuckPostHandTables`
-- in server/src/services/poker-game.service.ts.
--
-- The post-hand callback (tournament eliminations + blind updates) +
-- next-hand scheduling now both ride on a single in-memory setTimeout
-- inside scheduleNextHandAfterShowdown. If the server restarts during
-- the 15s post-showdown window the timer is lost and the table sits
-- stuck. The sweep fills that gap by finding any completed hand whose
-- post-hand work hasn't been marked done and re-running it.

ALTER TABLE poker_hands
  ADD COLUMN IF NOT EXISTS post_hand_processed_at TIMESTAMPTZ;

-- Backfill: any historical completed hand predates this column and is
-- guaranteed to have had its eliminations applied (or the table would
-- already be stuck and visible). Mark them done so the sweep doesn't
-- try to re-run them.
UPDATE poker_hands
   SET post_hand_processed_at = COALESCE(completed_at, NOW())
 WHERE completed_at IS NOT NULL
   AND post_hand_processed_at IS NULL;

-- Partial index keeps the sweep query cheap regardless of table size:
-- only the (typically tiny) backlog of pending hands lives in the index.
CREATE INDEX IF NOT EXISTS idx_poker_hands_pending_post_hand
  ON poker_hands (table_id, completed_at)
  WHERE completed_at IS NOT NULL AND post_hand_processed_at IS NULL;
