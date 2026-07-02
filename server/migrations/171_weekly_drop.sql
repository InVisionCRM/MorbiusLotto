-- Migration 171: The Weekly Drop — weekly raffle jackpot (WEEKLY_DROP_SPEC.md).
--
-- A weekly raffle pot funded by 0.5% of every settled bet across all games.
-- Playing earns entries (public math: 1 entry per 1,000 MORBIUS wagered; internal
-- per-game edge weights live in code — weekly-drop.service.ts DROP_ENTRY_RATES).
-- Top 3 winners drawn every Sunday 20:00 UTC via commit-reveal (same pattern as
-- the poker provably-fair shuffle) and auto-credited to their chip balance
-- through applyPokerChipDelta() (ledger reason 'weekly_drop_prize').
--
-- UNITS: all chip amounts here are WHOLE chips (1 chip = 1 MORBIUS = 10^18 wei),
-- matching poker_chip_ledger / vip_tier_config (migration 166).
--
-- Pot accounting: to avoid a platform-wide hot row (every settled bet would
-- otherwise UPDATE the one open drop_draws row inside its settlement txn), the
-- 0.5% funding accrues per player on drop_entries.pot_contributed. The live pot
-- is drop_draws.pot_chips (carryover seed) + SUM(drop_entries.pot_contributed);
-- runDraw() folds the sum into pot_chips when the draw closes.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- drop_draws
-- One row per weekly draw. commitment / server_seed / entry_list_hash implement
-- the commit-reveal fairness scheme:
--   commitment = sha256(server_seed || sha256(canonical entry list JSON))
-- commitment + entry_list_hash + entry_list_json are written at entry close,
-- BEFORE winners are selected; server_seed is revealed after crediting.
-- Status flow: open → drawn (claimed by the draw job) → paid.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drop_draws (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opens_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closes_at       TIMESTAMPTZ NOT NULL,
  -- While open: carryover seed from the previous draw (player-funded remainder).
  -- After close: the final accrued pot (seed + SUM(pot_contributed)), frozen.
  pot_chips       NUMERIC(78, 0) NOT NULL DEFAULT 0,
  -- House-guaranteed minimum prize pool; prizes pay from max(pot_chips, guaranteed_min).
  guaranteed_min  NUMERIC(78, 0) NOT NULL DEFAULT 25000,
  commitment      TEXT,           -- published before winner selection
  server_seed     TEXT,           -- NULL until reveal (after winners credited)
  entry_list_hash TEXT,           -- sha256 of the canonical entry-list JSON snapshot
  entry_list_json JSONB,          -- frozen snapshot served by GET /api/drop/verify/:drawId
  status          TEXT NOT NULL DEFAULT 'open',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT drop_draws_status_check CHECK (status IN ('open', 'drawn', 'paid')),
  CONSTRAINT drop_draws_nonneg CHECK (pot_chips >= 0 AND guaranteed_min >= 0),
  CONSTRAINT drop_draws_window CHECK (closes_at > opens_at)
);

-- The scheduler and the accrual hook both look up "the open draw" constantly.
CREATE INDEX IF NOT EXISTS idx_drop_draws_status_closes
  ON drop_draws (status, closes_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- drop_entries
-- One row per (draw, player). entries = whole raffle tickets this week.
-- wager_progress = effective chips (public 1000-chip scale) toward the NEXT
-- entry (always 0..999 after each upsert). pot_contributed = this player's
-- accrued 0.5% pot funding (see header note on pot accounting).
-- Rows are frozen once the draw leaves 'open' (accrual + daily claims target
-- the open draw only), so they double as the draw's entry snapshot.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drop_entries (
  draw_id         UUID NOT NULL REFERENCES drop_draws(id) ON DELETE CASCADE,
  player_address  TEXT NOT NULL,           -- lowercase 0x wallet
  entries         INT NOT NULL DEFAULT 0,
  wager_progress  NUMERIC(78, 0) NOT NULL DEFAULT 0,
  pot_contributed NUMERIC(78, 0) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (draw_id, player_address),
  CONSTRAINT drop_entries_nonneg
    CHECK (entries >= 0 AND wager_progress >= 0 AND pot_contributed >= 0)
);

CREATE INDEX IF NOT EXISTS idx_drop_entries_address
  ON drop_entries (player_address);

-- ─────────────────────────────────────────────────────────────────────────────
-- drop_daily_claims
-- Once-per-UTC-day gate for the free daily entry. Keyed by (address, date)
-- rather than a column on drop_entries so a claim just before a draw closes
-- cannot be repeated the same day against the freshly opened draw.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drop_daily_claims (
  player_address TEXT NOT NULL,
  claim_date     DATE NOT NULL,            -- UTC day
  draw_id        UUID REFERENCES drop_draws(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (player_address, claim_date)
);

CREATE INDEX IF NOT EXISTS idx_drop_daily_claims_draw
  ON drop_daily_claims (draw_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- drop_winners
-- Top-3 results per draw. amount is whole chips actually credited (60/25/15 of
-- max(pot, guaranteed_min); rank 1 absorbs integer-division remainder).
-- credited_at is set in the same transaction as the applyPokerChipDelta credit.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drop_winners (
  draw_id        UUID NOT NULL REFERENCES drop_draws(id) ON DELETE CASCADE,
  rank           INT NOT NULL,
  player_address TEXT NOT NULL,
  amount         NUMERIC(78, 0) NOT NULL,
  credited_at    TIMESTAMPTZ,

  PRIMARY KEY (draw_id, rank),
  CONSTRAINT drop_winners_rank_check CHECK (rank BETWEEN 1 AND 3),
  CONSTRAINT drop_winners_amount_nonneg CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_drop_winners_address
  ON drop_winners (player_address);

COMMIT;
