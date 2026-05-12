-- Migration 117: Stale-snapshot reclamation for Merkle drops (holder + LP)
--
-- Problem: when a wallet appears in epoch N but is not in epoch N+1's snapshot
-- (e.g. it sold MORBIUS / withdrew LP), its reward never gets superseded, so
-- the cron's getAvailableContractBalance() permanently treats it as "owed".
-- Once stranded reserves grow past inflows, the cron's available = 0 and no
-- new epochs can be created.
--
-- Fix path: after a configurable age, an old epoch's still-unclaimed snapshots
-- can be reclaimed: revokeEpoch() is called on-chain (only succeeds when no
-- direct claims have been made against that epoch's root), and matching
-- snapshots are marked reclaimed_at. The reclaimed amount frees up
-- "available" so the next epoch picks it up automatically.
--
-- Default: feature is OFF. Operators flip reclaim_stale_enabled=true after
-- previewing the candidate epochs through the admin endpoint.

BEGIN;

-- ─── reclaimed_at column on both snapshot tables ───────────────────────────
ALTER TABLE merkle_snapshots
  ADD COLUMN IF NOT EXISTS reclaimed_at TIMESTAMPTZ;

ALTER TABLE merkle_lp_snapshots
  ADD COLUMN IF NOT EXISTS reclaimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_merkle_snapshots_reclaimed_at
  ON merkle_snapshots (reclaimed_at)
  WHERE reclaimed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merkle_lp_snapshots_reclaimed_at
  ON merkle_lp_snapshots (reclaimed_at)
  WHERE reclaimed_at IS NOT NULL;

-- ─── Settings: holder ─────────────────────────────────────────────────────
INSERT INTO merkle_settings (key, value) VALUES
  ('reclaim_stale_enabled',     'false'),
  ('reclaim_stale_age_days',    '30'),
  ('reclaim_min_epochs_back',   '2')
ON CONFLICT (key) DO NOTHING;

-- ─── Settings: LP ─────────────────────────────────────────────────────────
INSERT INTO merkle_lp_settings (key, value) VALUES
  ('reclaim_stale_enabled',     'false'),
  ('reclaim_stale_age_days',    '30'),
  ('reclaim_min_epochs_back',   '2')
ON CONFLICT (key) DO NOTHING;

COMMIT;
