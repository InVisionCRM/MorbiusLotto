-- 201_poker_bots_v2.sql
--
-- 1. Bot display names drop the "_bot" suffix (Kyle: "remove the _bot suffix"). Bots stay
--    identifiable to the server by their poker_bot_accounts row (keyless 0x…b07N addresses).
-- 2. role: 'tournament' bots are seated by the scheduled "Beat the Bots" games,
--    'cash' bots keep the always-open bot cash table alive (services/poker-bot-cash.service.ts).
-- 3. poker_bot_cash_tables: the cash tables the bot cash manager owns.

BEGIN;

ALTER TABLE poker_bot_accounts DROP CONSTRAINT IF EXISTS poker_bot_accounts_name_suffix;
ALTER TABLE poker_bot_accounts ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'tournament';
ALTER TABLE poker_bot_accounts DROP CONSTRAINT IF EXISTS poker_bot_accounts_role_chk;
ALTER TABLE poker_bot_accounts ADD CONSTRAINT poker_bot_accounts_role_chk CHECK (role IN ('tournament', 'cash'));

UPDATE poker_bot_accounts
   SET display_name = regexp_replace(display_name, '_bot$', ''), updated_at = NOW()
 WHERE display_name ~ '_bot$';

-- Cash-table roster (separate from the tournament seven so nobody sits at two tables at once).
INSERT INTO poker_bot_accounts (wallet_address, display_name, personality, role) VALUES
  ('0x000000000000000000000000000000000000b081', 'Chan',        '{"tightness":0.60,"aggression":0.55,"bluff":0.05}', 'cash'),
  ('0x000000000000000000000000000000000000b082', 'Seidel',      '{"tightness":0.55,"aggression":0.50,"bluff":0.05}', 'cash'),
  ('0x000000000000000000000000000000000000b083', 'Moneymaker',  '{"tightness":0.40,"aggression":0.70,"bluff":0.09}', 'cash'),
  ('0x000000000000000000000000000000000000b084', 'Esfandiari',  '{"tightness":0.35,"aggression":0.80,"bluff":0.11}', 'cash'),
  ('0x000000000000000000000000000000000000b085', 'Mercier',     '{"tightness":0.50,"aggression":0.65,"bluff":0.07}', 'cash'),
  ('0x000000000000000000000000000000000000b086', 'Hansen',      '{"tightness":0.30,"aggression":0.90,"bluff":0.13}', 'cash')
ON CONFLICT (wallet_address) DO NOTHING;

INSERT INTO players (wallet_address, balance)
SELECT wallet_address, '0' FROM poker_bot_accounts
ON CONFLICT (wallet_address) DO NOTHING;

INSERT INTO player_poker_chips (wallet_address, balance)
SELECT wallet_address, 0 FROM poker_bot_accounts
ON CONFLICT (wallet_address) DO NOTHING;

INSERT INTO chat_display_names (wallet_address, display_name)
SELECT wallet_address, display_name FROM poker_bot_accounts
ON CONFLICT (wallet_address) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW();

CREATE TABLE IF NOT EXISTS poker_bot_cash_tables (
  table_id   UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
