-- Provably-fair poker: hide the plaintext server seed during a live hand.
-- See `startHand` and `persistShowdown` in
-- server/src/services/poker-game.service.ts, and the verify endpoint at
-- server/src/routes/poker-verify.routes.ts.
--
-- Protocol (per-hand):
--   At hand start:
--     - generate serverSeed (random), serverSeedHash = SHA256(serverSeed), clientSeed (random)
--     - the deck is derived deterministically: pfService.fisherYatesShuffle(serverSeed, clientSeed, 0)
--       — this replaces chevtek's Math.random() shuffle by overriding `table.newDeck` on the instance.
--     - poker_hands gets `server_seed_hash` + `client_seed` populated; `server_seed` stays NULL.
--     - the plaintext goes into `poker_hand_pending_seeds` in the same transaction.
--   At showdown (`persistShowdown`):
--     - move plaintext from `poker_hand_pending_seeds` into `poker_hands.server_seed`.
--     - DELETE the pending row.
--   Verification (`GET /api/poker/verify/:handId`):
--     - returns commitment (serverSeedHash), reveal (serverSeed + clientSeed), and deck order.
--     - clients can independently compute pfService.fisherYatesShuffle(...) and confirm it matches.
--
-- Grant ACL note: this table holds the in-flight seed. In production, consider
-- restricting SELECT on this table to the application role only — leakage of a
-- pending row to a player would let them predict remaining cards mid-hand.

CREATE TABLE IF NOT EXISTS poker_hand_pending_seeds (
  hand_id UUID PRIMARY KEY REFERENCES poker_hands(id) ON DELETE CASCADE,
  server_seed TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cleanup index: post-launch, the table should be empty most of the time
-- (rows live only for the duration of a hand). The PK already covers lookups
-- by hand_id; no additional indexes needed.
