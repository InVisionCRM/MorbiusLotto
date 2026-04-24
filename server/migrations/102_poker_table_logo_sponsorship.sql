-- Paid table logo sponsorship: 10-minute windows, MORBIUS balance debit (off-chain).
-- When table_logo_sponsored_until is NULL or in the past, lazy expiry clears table_logo
-- and sponsor columns; felt shows default Morbius asset on clients.

ALTER TABLE poker_tables
  ADD COLUMN IF NOT EXISTS table_logo_sponsored_until TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS table_logo_sponsor_address VARCHAR(42) NULL;

CREATE TABLE IF NOT EXISTS poker_table_logo_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES poker_tables(id) ON DELETE CASCADE,
  wallet_address VARCHAR(42) NOT NULL,
  morbius_chips BIGINT NOT NULL,
  logo_filename VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_table_logo_purchases_table_id
  ON poker_table_logo_purchases(table_id);

CREATE INDEX IF NOT EXISTS idx_poker_table_logo_purchases_created_at
  ON poker_table_logo_purchases(created_at DESC);
