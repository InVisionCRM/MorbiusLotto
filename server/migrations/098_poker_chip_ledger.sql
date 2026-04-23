-- Poker off-chain chip ledger. MORBIUS (players.balance) is not used for poker play;
-- chips move here; MORBIUS only at explicit purchase/cashout API.
-- For game_type = 'poker', tournaments.buy_in_amount and tournaments.prize_pool are WHOLE CHIPS
-- (this migration converts existing poker rows from legacy wei semantics).

BEGIN;

CREATE TABLE IF NOT EXISTS player_poker_chips (
  wallet_address VARCHAR(42) PRIMARY KEY,
  balance NUMERIC(78, 0) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT player_poker_chips_wallet_lower CHECK (wallet_address = LOWER(wallet_address))
);

CREATE TABLE IF NOT EXISTS poker_chip_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(42) NOT NULL,
  delta NUMERIC(78, 0) NOT NULL,
  balance_after NUMERIC(78, 0) NOT NULL,
  reason VARCHAR(40) NOT NULL,
  ref_type VARCHAR(32),
  ref_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_chip_ledger_wallet_created
  ON poker_chip_ledger (wallet_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_poker_chip_ledger_ref
  ON poker_chip_ledger (ref_type, ref_id);

-- Default rake + platform fee wallets (lowercase; app env may override addresses at runtime)
INSERT INTO player_poker_chips (wallet_address, balance) VALUES
  ('0x2d6f6a61cfdc7c7d000c9279bd7a743d277736bb', 0),
  ('0x41682815b05fe6b54a6c0f8813bb99423ee0309d', 0)
ON CONFLICT (wallet_address) DO NOTHING;

-- One-time: poker tournaments — wei-stored pools → chip counts (1 chip = 10^18 wei)
UPDATE tournaments
SET
  buy_in_amount = TRUNC(COALESCE(buy_in_amount, 0) / 1000000000000000000),
  prize_pool = TRUNC(COALESCE(prize_pool, 0) / 1000000000000000000)
WHERE game_type = 'poker';

UPDATE tournament_entries te
SET prize_won = TRUNC(COALESCE(te.prize_won, 0) / 1000000000000000000)
FROM tournaments t
WHERE te.tournament_id = t.id
  AND t.game_type = 'poker'
  AND COALESCE(te.prize_won, 0) > 0;

COMMENT ON TABLE player_poker_chips IS 'Off-chain poker chip balance per wallet; gameplay debits/credits only here.';
COMMENT ON TABLE poker_chip_ledger IS 'Append-only audit trail for player_poker_chips movements.';
COMMENT ON COLUMN tournaments.buy_in_amount IS
  'Blackjack / on-chain: wei. Poker (game_type=poker): whole chip count.';
COMMENT ON COLUMN tournaments.prize_pool IS
  'Blackjack / on-chain: wei. Poker (game_type=poker): whole chip count.';

COMMIT;
