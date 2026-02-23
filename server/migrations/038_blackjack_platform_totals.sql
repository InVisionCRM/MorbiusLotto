-- Blackjack V2 all-time deposit/withdraw totals (derived from our data + incremental chain scan).
-- total_withdrawn is updated when we create a pending withdrawal; total_deposited is updated
-- by incremental getLogs from last_scanned_block to current.
SET lock_timeout = '3s';
SET statement_timeout = '10s';

CREATE TABLE IF NOT EXISTS blackjack_platform_totals (
  id INT PRIMARY KEY DEFAULT 1,
  total_deposited NUMERIC(78, 0) NOT NULL DEFAULT 0,
  total_withdrawn NUMERIC(78, 0) NOT NULL DEFAULT 0,
  last_scanned_block BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO blackjack_platform_totals (id, total_deposited, total_withdrawn, last_scanned_block, updated_at)
VALUES (1, 0, 0, NULL, NOW())
ON CONFLICT (id) DO NOTHING;
