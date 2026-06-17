-- 164_arcade_greed_dice.sql — MORBIUS Arcade: Greed Dice (Farkle push-your-luck).
--
-- One row per round. Stateful like Chicken (154_arcade_chicken.sql): the row is
-- INSERTED at /start with status='active' (debiting the bet and rolling the
-- starting dice), UPDATED on each /roll (bank the auto-scoring dice + reroll the
-- rest — a non-scoring roll FARKLEs and settles the round won=false), then
-- FINAL-UPDATED to status='settled' on a /bank (cash-out, won=true). The server
-- seed is only revealed once the round is settled — that's what makes the round
-- verifiable.
--
-- Every die face (the initial roll AND every reroll) is drawn from the committed
-- server seed's HMAC byte stream at a deterministic cursor:
--   cursor = (total dice rolled so far this round) × 4
-- face = 1 + floor(bytesToFloat(stream(cursor)) × 6). roll_log records each
-- roll's faces + the indices the engine kept, so the full sequence re-derives in
-- /verify given the recorded keep choices (the choices are forced by the scoring
-- rules, so the deck order alone reproduces the whole turn). dice_count is the
-- volatility (starting dice 5/6/7).

CREATE TABLE IF NOT EXISTS arcade_greed_dice_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- Volatility: 'five' | 'six' | 'seven' starting dice (higher count = lower variance).
  volatility          TEXT NOT NULL CHECK (volatility IN ('five', 'six', 'seven')),
  -- Starting dice count for the round (5 / 6 / 7), copied from the volatility config.
  dice_count          INTEGER NOT NULL,
  -- Accumulated points banked so far this turn (0 until the first scoring roll).
  points              INTEGER NOT NULL DEFAULT 0,
  -- Current payout multiplier ×100 (= round(points / scale × 100)). 0 while points=0.
  multiplier_x100     INTEGER NOT NULL DEFAULT 0,
  -- The sequence of rolls: [{ dice: number[], kept: number[], points: number,
  -- hot: boolean }]. Records every roll (initial + rerolls) for verification.
  roll_log            JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 'active' → still rolling; 'settled' → finished (won says how it ended).
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'settled')),
  -- TRUE on /bank; FALSE on a farkle. Meaningless while active.
  won                 BOOLEAN NOT NULL DEFAULT FALSE,
  -- Final payout in chips (0 while active and on a farkle; floor(bet*mult) on bank).
  payout              BIGINT NOT NULL DEFAULT 0,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_arcade_greed_dice_rounds_wallet
  ON arcade_greed_dice_rounds (wallet_address, created_at DESC);

-- A wallet can have at most one active round at a time; prevents the UI from
-- orphaning a bet by starting a second turn on top of the first.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_greed_dice_active_per_wallet
  ON arcade_greed_dice_rounds (wallet_address)
  WHERE status = 'active';

COMMENT ON TABLE arcade_greed_dice_rounds IS
  'MORBIUS Arcade Greed Dice — one row per Farkle turn, stateful via points/roll_log; provably fair via committed server seed.';
