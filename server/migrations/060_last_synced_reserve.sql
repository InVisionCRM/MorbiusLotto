-- 060: Track the last on-chain reserve seen at deposit-sync time.
-- Used to compute deposit deltas so that sync_balance never restores
-- gaming losses (the "bounce-back" bug).
--
-- NULL  = never synced; first sync_balance call baselines this to the current
--         contract reserve WITHOUT crediting any balance.
-- 0..N  = last known contract reserve at time of most recent deposit sync.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS last_synced_reserve NUMERIC(78, 0) DEFAULT NULL;
