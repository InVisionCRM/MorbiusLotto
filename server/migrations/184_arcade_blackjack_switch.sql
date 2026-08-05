-- 184_arcade_blackjack_switch.sql — Blackjack Switch joins the variant table.
--
-- Switch is the one variant with a decision BEFORE ordinary play: two hands are
-- dealt and the player may trade their second cards, once. That needs a stage
-- the other four don't have, plus room for the Super Match side bet, which is
-- scored on the four opening cards and settles independently of both hands.
--
-- `stage` defaults to 'play', which is exactly what every existing row already
-- was — none of them has a pre-play decision — so no historical round changes
-- meaning.

-- The variant CHECK has to be replaced rather than extended.
ALTER TABLE arcade_blackjack_variant_rounds
  DROP CONSTRAINT IF EXISTS arcade_blackjack_variant_rounds_variant_check;

ALTER TABLE arcade_blackjack_variant_rounds
  ADD CONSTRAINT arcade_blackjack_variant_rounds_variant_check
  CHECK (variant IN ('spanish21', 'double_exposure', 'pontoon', 'free_bet', 'switch'));

-- 'switch' → the player still has to trade-or-keep; 'play' → ordinary decisions.
ALTER TABLE arcade_blackjack_variant_rounds
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'play'
    CHECK (stage IN ('switch', 'play'));

-- Super Match: staked at the deal, scored on the four opening cards, settled
-- alongside the hands but on its own terms. Zero everywhere it isn't offered.
ALTER TABLE arcade_blackjack_variant_rounds
  ADD COLUMN IF NOT EXISTS side_bet BIGINT NOT NULL DEFAULT 0;

ALTER TABLE arcade_blackjack_variant_rounds
  ADD COLUMN IF NOT EXISTS side_payout BIGINT NOT NULL DEFAULT 0;

-- 'pair' | 'two_pair' | 'three_of_a_kind' | 'four_of_a_kind' | 'none'
ALTER TABLE arcade_blackjack_variant_rounds
  ADD COLUMN IF NOT EXISTS side_result TEXT;

COMMENT ON COLUMN arcade_blackjack_variant_rounds.stage IS
  'Blackjack Switch only: ''switch'' while the trade-or-keep decision is pending. Every other variant is always ''play''.';

COMMENT ON COLUMN arcade_blackjack_variant_rounds.side_bet IS
  'Super Match stake (Blackjack Switch). Scored on the four opening cards, before any swap.';
