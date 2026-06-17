-- Migration 156: Unify player balances onto the chip ledger.
-- Part of the platform-wide "MORBIUS -> chips" unification (blackjack + casino-wide).
--
-- WHAT THIS DOES
--   Moves every player's MORBIUS play-balance (players.balance, stored in wei)
--   into the chip ledger (player_poker_chips) at 1 chip = 1 MORBIUS = 10^18 wei.
--   Only the WHOLE-MORBIUS portion is converted; any sub-1-MORBIUS remainder (dust)
--   is left in players.balance so no funds are ever lost or rounded up.
--
-- IDEMPOTENT
--   After running, every migrated wallet has players.balance < 10^18 wei, so the
--   WHERE filter matches nothing on a second run. Safe to re-run.
--
-- ORDERING (IMPORTANT)
--   Run this AT CUTOVER, in the same release that makes gameplay + the UI read the
--   chip ledger (Phases 2-4). If run before that deploy, balances will read as 0 in
--   the old MORBIUS-balance UI. After Phase 2 ships, on-chain deposits credit chips
--   directly, so players.balance stops growing and this drain is final.
--
-- PRE-RUN CHECK
--   The live Neon DB has drifted from migrations before. Verify the `players` table
--   has a numeric `balance` column (wei) and dry-run the temp-table SELECT below
--   before committing.

BEGIN;

-- Wallets holding at least 1 whole MORBIUS of play-balance.
CREATE TEMP TABLE _balance_migrate ON COMMIT DROP AS
SELECT
  LOWER(p.wallet_address)                                AS wallet_address,
  TRUNC(p.balance / 1000000000000000000)::NUMERIC(78,0)  AS chips
FROM players p
WHERE p.balance >= 1000000000000000000;

-- Ensure a chip row exists for each migrating wallet.
INSERT INTO player_poker_chips (wallet_address, balance)
SELECT wallet_address, 0 FROM _balance_migrate
ON CONFLICT (wallet_address) DO NOTHING;

-- Credit the whole-MORBIUS portion as chips.
UPDATE player_poker_chips ppc
SET balance = ppc.balance + m.chips,
    updated_at = NOW()
FROM _balance_migrate m
WHERE ppc.wallet_address = m.wallet_address;

-- Append audit-trail rows (balance_after = post-credit balance).
INSERT INTO poker_chip_ledger (wallet_address, delta, balance_after, reason, ref_type, ref_id)
SELECT m.wallet_address, m.chips, ppc.balance, 'migration', 'balance_migration', NULL
FROM _balance_migrate m
JOIN player_poker_chips ppc ON ppc.wallet_address = m.wallet_address;

-- Drain the converted whole-MORBIUS from players.balance, keeping sub-chip dust.
UPDATE players p
SET balance = p.balance - (TRUNC(p.balance / 1000000000000000000) * 1000000000000000000)
WHERE LOWER(p.wallet_address) IN (SELECT wallet_address FROM _balance_migrate);

COMMIT;
