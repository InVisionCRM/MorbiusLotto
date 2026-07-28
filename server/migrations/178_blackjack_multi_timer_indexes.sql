-- Migration 178: indexes for the multiplayer-blackjack timer watchdog.
--
-- tickBJMultiTimers (websocket.service.impl.js) sweeps for stalled tables every
-- 5 seconds and now runs six queries per tick. Most filter blackjack_multi_rounds
-- by `status` GLOBALLY (not per table), but the only index on that table is
-- idx_bj_multi_rounds_table_id, which leads with table_id and so cannot serve
-- those predicates — every tick seq-scans the full round history, and the sweeps
-- get slower as the table accumulates rounds.
--
-- All three are partial/covering for exactly the watchdog's access patterns and
-- are safe to re-run.

-- Acting-turn expiry + dealer-turn stranding: both scan the small set of rounds
-- that are not finished, ordered by when the turn started.
CREATE INDEX IF NOT EXISTS idx_bj_multi_rounds_active_turn
    ON blackjack_multi_rounds (turn_started_at)
    WHERE status IN ('playing', 'dealer_turn');

-- Expired betting window sweep, and the "table in betting with no betting round"
-- repair probe.
CREATE INDEX IF NOT EXISTS idx_bj_multi_rounds_open_betting
    ON blackjack_multi_rounds (table_id, created_at)
    WHERE status = 'betting';

-- "Latest round for this table" — the LATERAL lookup in the new desync-recovery
-- sweep, and loadLatestRoundMeta() on every betting-phase transition.
CREATE INDEX IF NOT EXISTS idx_bj_multi_rounds_table_round_desc
    ON blackjack_multi_rounds (table_id, round_number DESC);
