-- 160_arcade_cascade.sql — MORBIUS Arcade: Cascade (cluster-pays chain reaction).
--
-- Single-shot, server-resolved, provably-fair. One drop fills a 6×6 grid with
-- gems; any cluster of >= threshold connected matching gems pays and pops, the
-- grid tumbles + refills from the top, and the chain repeats — a combo
-- multiplier climbing each link — until no more clusters form. The ENTIRE
-- cascade is a deterministic function of the provably-fair HMAC float stream:
-- every gem (the opening fill AND every refill) is drawn, in a fixed order, from
-- ProvablyFairService.hmacByteStream(serverSeed, clientSeed, nonce, cursor) with
-- cursor += 4 per gem (same convention as the Plinko path / Chicken bumpers).
--
-- Because the round resolves at /play time, the whole thing (bet debit, cascade,
-- payout, row insert) happens in a single transaction — atomic, never
-- half-settled, never paid twice. We DO NOT store the per-step replay sequence;
-- it's recomputed from (server_seed, client_seed, nonce) in /verify, exactly as
-- the client replays it from the /play response.
--
-- multiplier_x100 is the TOTAL round multiplier ×100 (sum of every chain link's
-- contribution). payout = floor(bet × multiplier_x100 / 100). clusters stores a
-- compact jsonb chain summary (one entry per chain link: combo ×100 + that
-- link's win ×100) for the My-rounds panel and verify breakdown.

CREATE TABLE IF NOT EXISTS arcade_cascade_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- 'calm' | 'standard' | 'frenzy' — the volatility config used for this round.
  volatility          TEXT NOT NULL,
  -- TOTAL round multiplier ×100 (sum of every chain link). 0 on a fizzle.
  multiplier_x100     INTEGER NOT NULL,
  -- Number of chain links (tumbles) that paid. 0 on a fizzle.
  clusters            INTEGER NOT NULL DEFAULT 0,
  -- Compact chain summary: [{ chain, comboX100, winX100 }] — one per chain link.
  -- Replay step sequence is NOT stored; it re-derives from the seed in verify.
  chain_log           JSONB NOT NULL DEFAULT '[]'::jsonb,
  won                 BOOLEAN NOT NULL,
  payout              BIGINT NOT NULL,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  house_edge_bp       INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_cascade_rounds_wallet
  ON arcade_cascade_rounds (wallet_address, created_at DESC);

COMMENT ON TABLE arcade_cascade_rounds IS
  'MORBIUS Arcade Cascade — cluster-pays chain reaction; one row per drop; provably fair via committed server seed; full replay re-derived from the seed in verify.';
