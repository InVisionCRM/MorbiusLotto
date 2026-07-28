-- 177_game_bet_limits.sql
--
-- Admin-configurable per-game bet limits, replacing 44 hardcoded constants
-- spread across server/src/services/arcade-*.ts as the source of truth.
--
-- Deliberately NOT seeded here. The application ships the current constants as
-- built-in defaults (server/src/lib/game-limits.ts) and only consults this table
-- for OVERRIDES, so an empty table means "every game keeps exactly the limits it
-- has today". That makes deploying this migration a no-op behaviourally, and it
-- means a row can be deleted to fall back to the code default rather than having
-- to remember what the number used to be.
--
-- Amounts are whole MORBIUS (chips), matching how the games already validate.

CREATE TABLE IF NOT EXISTS game_bet_limits (
  game_key    VARCHAR(64) PRIMARY KEY,
  min_bet     BIGINT NOT NULL,
  max_bet     BIGINT NOT NULL,
  updated_by  VARCHAR(42),               -- admin wallet that last changed it
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT game_bet_limits_positive CHECK (min_bet > 0 AND max_bet > 0),
  CONSTRAINT game_bet_limits_ordered  CHECK (max_bet >= min_bet),
  CONSTRAINT game_bet_limits_updater_lower CHECK (
    updated_by IS NULL OR updated_by = LOWER(updated_by)
  )
);

-- Append-only history: a bet limit is a money decision, so who changed what,
-- when, and from which value has to survive the next change overwriting it.
CREATE TABLE IF NOT EXISTS game_bet_limit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_key    VARCHAR(64) NOT NULL,
  admin_address VARCHAR(42) NOT NULL,
  old_min     BIGINT,                    -- NULL when the game was on the code default
  old_max     BIGINT,
  new_min     BIGINT NOT NULL,
  new_max     BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT game_bet_limit_log_admin_lower CHECK (admin_address = LOWER(admin_address))
);

CREATE INDEX IF NOT EXISTS idx_game_bet_limit_log_game
  ON game_bet_limit_log (game_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_bet_limit_log_created
  ON game_bet_limit_log (created_at DESC);
