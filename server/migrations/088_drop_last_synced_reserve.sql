-- Deposits credit balance only via confirmed pending_deposits; chain reserve snapshot is unused.
ALTER TABLE players DROP COLUMN IF EXISTS last_synced_reserve;
