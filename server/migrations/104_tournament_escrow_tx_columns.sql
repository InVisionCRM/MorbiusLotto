-- Track on-chain escrow funding for custom-token prize pools (poker freerolls + future games).
-- prize_token_address / prize_token_decimals already exist (migrations 016/018).
-- These columns record the verified deposit so a tournament can only be created after the
-- on-chain escrow has been funded.

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS escrow_tx_hash TEXT DEFAULT NULL;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS escrow_tournament_id_bytes32 TEXT DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_escrow_tx_hash
  ON tournaments(escrow_tx_hash)
  WHERE escrow_tx_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_escrow_tournament_id_bytes32
  ON tournaments(escrow_tournament_id_bytes32)
  WHERE escrow_tournament_id_bytes32 IS NOT NULL;

COMMENT ON COLUMN tournaments.escrow_tx_hash IS
  'Tx hash of the verified TournamentPrizeEscrowV2.depositPrizePool call that funded this tournament. NULL = no on-chain escrow (chips/promo).';
COMMENT ON COLUMN tournaments.escrow_tournament_id_bytes32 IS
  'bytes32 tournament ID used in the escrow contract (keccak256 of the row UUID). Lets the server / client rederive the on-chain key for refund/cancel/payout.';
