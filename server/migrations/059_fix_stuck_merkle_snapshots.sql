-- ============================================================================
-- Migration 059: Fix stuck Merkle snapshot funds
--
-- Root cause: Several epochs reached 'finalized' status but were NEVER
-- published on-chain. Their calculateRewards() runs had already marked
-- snapshots from prior published epochs as superseded_by_epoch_id pointing
-- to these finalized-but-unpublished epochs. This left funds permanently
-- inaccessible: the system tells users "claim from epoch X" but epoch X has
-- no on-chain merkle root.
--
-- Fix:
--   1. Un-supersede all snapshots that point to these abandoned epochs.
--   2. Delete the snapshots BELONGING TO the abandoned epochs (they had
--      inflated/duplicate totals and should never be published).
--   3. Delete the abandoned epoch records themselves so they do not trigger
--      the new twin-epoch guard added in calculateRewards().
--
-- Affected abandoned epochs:
--   Holder epoch #5  (id=22, finalized) → 222 snapshots in epoch #4 stuck (1,055 MORBIUS)
--   LP epoch     #4  (id=4,  finalized) → 9   snapshots in LP epoch #3 stuck (91 MORBIUS)
--   LP epoch     #46 (id=46, finalized) → 9   snapshots in LP epoch #45 stuck (34,234 MORBIUS)
--   LP epoch     #49 (id=49, finalized) → 11  snapshots in LP epoch #48 stuck (34,538 MORBIUS)
--   LP epoch     #60 (id=60, finalized) → 11  snapshots in LP epoch #59 stuck (87,114 MORBIUS)
--
-- IMPORTANT: Verify before running that none of these epoch IDs have a
-- merkle_root set on-chain (published_at should be NULL for all of them).
-- ============================================================================

BEGIN;

-- ── Step 1: Verify none of the abandoned epochs are actually published ────────
-- This will raise a divide-by-zero error if any have published_at set,
-- acting as a safety check before we modify anything.
DO $$
DECLARE
  published_count INT;
BEGIN
  SELECT COUNT(*) INTO published_count
  FROM merkle_epochs
  WHERE id = 22 AND published_at IS NOT NULL;

  IF published_count > 0 THEN
    RAISE EXCEPTION 'Holder epoch id=22 has published_at set — do not run this migration';
  END IF;

  SELECT COUNT(*) INTO published_count
  FROM merkle_lp_epochs
  WHERE id IN (4, 46, 49, 60) AND published_at IS NOT NULL;

  IF published_count > 0 THEN
    RAISE EXCEPTION 'One or more LP epochs (4, 46, 49, 60) have published_at set — do not run this migration';
  END IF;
END $$;

-- ── Step 2: Un-supersede snapshots that were locked by these abandoned epochs ─

-- Holder: epoch #4's snapshots were superseded by abandoned epoch #5 (id=22)
UPDATE merkle_snapshots
SET superseded_by_epoch_id = NULL
WHERE superseded_by_epoch_id = 22;

-- LP: epoch #3's snapshots were superseded by abandoned LP epoch #4 (id=4)
-- LP: epoch #45's snapshots were superseded by abandoned LP epoch #46 (id=46)
-- LP: epoch #48's snapshots were superseded by abandoned LP epoch #49 (id=49)
-- LP: epoch #59's snapshots were superseded by abandoned LP epoch #60 (id=60)
UPDATE merkle_lp_snapshots
SET superseded_by_epoch_id = NULL
WHERE superseded_by_epoch_id IN (4, 46, 49, 60);

-- ── Step 3: Delete snapshots belonging to the abandoned epochs ────────────────

DELETE FROM merkle_snapshots
WHERE epoch_id = 22;

DELETE FROM merkle_lp_snapshots
WHERE epoch_id IN (4, 46, 49, 60);

-- ── Step 4: Delete the abandoned epoch records ────────────────────────────────

DELETE FROM merkle_epochs
WHERE id = 22;

DELETE FROM merkle_lp_epochs
WHERE id IN (4, 46, 49, 60);

COMMIT;
