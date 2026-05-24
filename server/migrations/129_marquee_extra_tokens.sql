-- Migration 129: marquee_extra_tokens — tokens that show in the poker marquee's
-- "market view" but don't have their own blackjack table.
--
-- Background: the sponsored-token marquee (components/poker/SponsoredTokenMarquee.tsx)
-- is getting a 2-state toggle. Sponsor view keeps the current per-table sponsor
-- card. Market view shows a stock-ticker tape of every catalog token. The
-- catalog is `blackjack_tables` (deduped by address) UNIONed with this new
-- table. PulseChain blue-chips (WPLS, HEX, INC, PLSX) live here so they don't
-- pollute the blackjack table picker.
--
-- Also patches two existing blackjack_tables rows that were missing data:
-- Dark Pepe and ZAPDOS. Tickers verified live against DexScreener.

BEGIN;

CREATE TABLE IF NOT EXISTS marquee_extra_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_contract_address VARCHAR(42) NOT NULL,
  ticker VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marquee_extra_tokens_addr_lower CHECK (token_contract_address = LOWER(token_contract_address)),
  CONSTRAINT marquee_extra_tokens_addr_format CHECK (token_contract_address ~ '^0x[a-f0-9]{40}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS marquee_extra_tokens_addr_uq
  ON marquee_extra_tokens (token_contract_address);

INSERT INTO marquee_extra_tokens (token_contract_address, ticker, name, sort_order) VALUES
  ('0xa1077a294dde1b09bb078844df40758a5d0f9a27', 'WPLS', 'Wrapped Pulse', 100),
  ('0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', 'HEX',  'HEX',           101),
  ('0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d', 'INC',  'Incentive',     102),
  ('0x95b303987a60c71504d99aa1b13b4da07b0790ab', 'PLSX', 'PulseX',        103)
ON CONFLICT (token_contract_address) DO NOTHING;

-- Patch two existing blackjack_tables rows that had no address/ticker, so they
-- can also appear in the market-view ticker tape.
UPDATE blackjack_tables
   SET token_contract_address = '0xe9e15d6f7380d1718a3bdeee720ee979fac1f5bc',
       ticker = 'DPEPE'
 WHERE name = 'Dark Pepe'
   AND (ticker IS NULL OR ticker = '' OR token_contract_address IS NULL OR token_contract_address = '');

UPDATE blackjack_tables
   SET token_contract_address = '0xed09372f952c3f47a60ecba80c5981df55553f33',
       ticker = 'ZAP'
 WHERE name = 'ZAPDOS'
   AND (ticker IS NULL OR ticker = '' OR token_contract_address IS NULL OR token_contract_address = '');

COMMENT ON TABLE marquee_extra_tokens IS
  'Catalog of tokens that should appear in the poker marquee market view but do not have a blackjack table.';

COMMIT;
