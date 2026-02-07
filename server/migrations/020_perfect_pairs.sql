-- Perfect Pairs side bet: store bet and payout per game
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS perfect_pairs_bet_amount NUMERIC(78, 0) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perfect_pairs_payout NUMERIC(78, 0) DEFAULT 0;

COMMENT ON COLUMN games.perfect_pairs_bet_amount IS 'Optional side bet for Perfect Pairs (first two cards).';
COMMENT ON COLUMN games.perfect_pairs_payout IS 'Payout for Perfect Pairs (25:1 perfect, 12:1 colored, 5:1 mixed).';
