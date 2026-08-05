-- 182_video_poker_variants.sql — video poker becomes six games.
--
-- Every hand now records which paytable it was played on. Existing rows were
-- all 9/6 Jacks or Better, which is exactly what the default backfills, so no
-- historical hand changes meaning and every old verify link keeps working.
--
-- Joker Poker deals from a 53-card deck (index 52 is the Joker). `deck` is
-- JSONB and already stores a variable-length array, so nothing else has to
-- change for that.

ALTER TABLE video_poker_hands
  ADD COLUMN IF NOT EXISTS variant TEXT NOT NULL DEFAULT 'jacks_or_better';

-- Reject a typo'd variant at the database rather than paying a hand out on a
-- paytable that doesn't exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_poker_hands_variant_check'
  ) THEN
    ALTER TABLE video_poker_hands
      ADD CONSTRAINT video_poker_hands_variant_check
      CHECK (variant IN (
        'jacks_or_better',
        'bonus_poker',
        'double_bonus',
        'double_double_bonus',
        'deuces_wild',
        'joker_poker'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_video_poker_hands_variant
  ON video_poker_hands (variant, resolved_at DESC);

COMMENT ON COLUMN video_poker_hands.variant IS
  'Which paytable this hand was played on. Drives both the payout and the verification recipe; joker_poker uses a 53-card deck.';
