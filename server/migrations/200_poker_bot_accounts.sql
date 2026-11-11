-- 200_poker_bot_accounts.sql
--
-- Single source of truth for in-house poker bots ("Beat the Bots" nightly SNG).
--
-- Replaces the POKER_BOT_ADDRESSES env CSV + the built-in Cypress fallback list
-- (which included the rake and platform-fee wallets). The game server loads this
-- table at startup (lib/poker-bot-registry.ts) and uses it for:
--   - the WebSocket bot-token auth allowlist,
--   - in-process tournament bot ticks + bot fill,
--   - excluding bot wallets from Weekly Drop accrual / draws,
--   - ledgered bankroll funding (bot_bankroll_fund / bot_bankroll_sweep).
--
-- Bot addresses are synthetic: no private key exists, so chips credited here can
-- never be withdrawn on-chain. Convention: last 4 hex chars are "b07" + index
-- ("bot" in hex-speak) so a bot is recognisable in any ledger / hand export.
-- Display names always end in "_bot" so players see who is a bot at the table.

BEGIN;

CREATE TABLE IF NOT EXISTS poker_bot_accounts (
  wallet_address VARCHAR(42) PRIMARY KEY,
  display_name   VARCHAR(32) NOT NULL,
  personality    JSONB NOT NULL DEFAULT '{}'::jsonb,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT poker_bot_accounts_wallet_lower CHECK (wallet_address = LOWER(wallet_address)),
  CONSTRAINT poker_bot_accounts_wallet_hex   CHECK (wallet_address ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT poker_bot_accounts_name_suffix  CHECK (display_name ~ '_bot$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_poker_bot_accounts_display_name
  ON poker_bot_accounts (display_name);

COMMENT ON TABLE poker_bot_accounts IS
  'In-house poker bot identities. Keyless synthetic addresses; display names end in _bot. Loaded by lib/poker-bot-registry.ts.';
COMMENT ON COLUMN poker_bot_accounts.personality IS
  'Bot AI tuning (tight/loose, passive/aggro, bluff rate). Read by poker-bot-ai once personalities ship.';

-- Launch roster: 7 bots for the "Beat the Bots" SNG (10 seats: 7 bots + 3 open seats).
-- personality: tightness / aggression in [0,1], bluff = bluff frequency (lib/poker-bot-ai.ts).
INSERT INTO poker_bot_accounts (wallet_address, display_name, personality) VALUES
  ('0x000000000000000000000000000000000000b071', 'Brunson_bot',  '{"tightness":0.35,"aggression":0.85,"bluff":0.10}'),
  ('0x000000000000000000000000000000000000b072', 'Hellmuth_bot', '{"tightness":0.75,"aggression":0.45,"bluff":0.03}'),
  ('0x000000000000000000000000000000000000b073', 'Negreanu_bot', '{"tightness":0.45,"aggression":0.55,"bluff":0.07}'),
  ('0x000000000000000000000000000000000000b074', 'Ivey_bot',     '{"tightness":0.50,"aggression":0.75,"bluff":0.08}'),
  ('0x000000000000000000000000000000000000b075', 'Dwan_bot',     '{"tightness":0.25,"aggression":0.95,"bluff":0.14}'),
  ('0x000000000000000000000000000000000000b076', 'Polk_bot',     '{"tightness":0.60,"aggression":0.60,"bluff":0.05}'),
  ('0x000000000000000000000000000000000000b077', 'Selbst_bot',   '{"tightness":0.55,"aggression":0.70,"bluff":0.06}')
ON CONFLICT (wallet_address) DO NOTHING;

-- Idempotency for the scheduled bot games (services/poker-bot-schedule.service.ts):
-- one row per (local date, slot time); claimed with INSERT … ON CONFLICT DO NOTHING
-- so two server instances can never create the same game twice.
CREATE TABLE IF NOT EXISTS poker_bot_scheduled_games (
  slot_key      VARCHAR(64) PRIMARY KEY,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  tournament_id UUID,
  status        VARCHAR(16) NOT NULL DEFAULT 'claimed',
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_poker_bot_scheduled_games_at ON poker_bot_scheduled_games (scheduled_at DESC);

-- Bots need a players row (WS auth getOrCreatePlayer) and a chip row (ledger).
INSERT INTO players (wallet_address, balance)
SELECT wallet_address, '0' FROM poker_bot_accounts
ON CONFLICT (wallet_address) DO NOTHING;

INSERT INTO player_poker_chips (wallet_address, balance)
SELECT wallet_address, 0 FROM poker_bot_accounts
ON CONFLICT (wallet_address) DO NOTHING;

-- Seat-tag names. avatar_config is filled by the server at startup
-- (syncPokerBotProfiles) so the randomised placeholder lives in one place.
INSERT INTO chat_display_names (wallet_address, display_name)
SELECT wallet_address, display_name FROM poker_bot_accounts
ON CONFLICT (wallet_address) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  updated_at = NOW();

COMMIT;
