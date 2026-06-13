-- 150_arcade_crash_live.sql — MORBIUS Arcade: Crash, live web rounds.
--
-- The web crash game (/crash) plays a LIVE round: the bet is debited and the
-- crash point committed at /start, then the player may POST /cashout while
-- the rocket is flying. The round row is therefore created BEFORE the outcome
-- is known, with status 'active', and settled later (manual cashout, poll
-- settle, or the periodic sweep).
--
-- The Telegram instant-settle path (/play) keeps inserting fully settled rows
-- exactly as before — status defaults to 'settled'.

ALTER TABLE arcade_crash_rounds
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'settled',
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

ALTER TABLE arcade_crash_rounds
  DROP CONSTRAINT IF EXISTS arcade_crash_rounds_status_check;
ALTER TABLE arcade_crash_rounds
  ADD CONSTRAINT arcade_crash_rounds_status_check
  CHECK (status IN ('active', 'settled'));

-- The settle sweep and per-wallet "one active round" guard both scan only
-- active rows — keep that lookup O(active rounds), not O(all rounds).
CREATE INDEX IF NOT EXISTS idx_arcade_crash_rounds_active
  ON arcade_crash_rounds (wallet_address, started_at)
  WHERE status = 'active';

COMMENT ON COLUMN arcade_crash_rounds.status IS
  'active = live web round in flight; settled = outcome final (all /play rows are settled).';
COMMENT ON COLUMN arcade_crash_rounds.started_at IS
  'App-server clock at flight start (NOT the DB clock) — the multiplier curve is computed against this.';
