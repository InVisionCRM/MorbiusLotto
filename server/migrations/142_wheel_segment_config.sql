-- Wheel segments (must match the visual order in components/wheel/CasinoWheel.tsx)
-- weights are arbitrary integers; outcome = weighted pick.
-- prize_wei is the MORBIUS payout (1 MORBIUS = 1e18 wei) credited to players.balance.
-- free_spins is added back to wheel_spin_wallets.spins_available via 'free_spin_reward' ledger row.

INSERT INTO wheel_spin_rules (rule_key, rule_value) VALUES
    ('wheel_segments', $JSON$
[
  { "index": 0,  "value": "NO_WIN",   "label": "TRY AGAIN",     "weight": 250, "prize_wei": "0",                       "free_spins": 0 },
  { "index": 1,  "value": "JACKPOT",  "label": "JACKPOT",       "weight": 1,   "prize_wei": "10000000000000000000000", "free_spins": 0 },
  { "index": 2,  "value": "2X",       "label": "MULTIPLIER",    "weight": 100, "prize_wei": "100000000000000000000",   "free_spins": 0 },
  { "index": 3,  "value": "NO_WIN",   "label": "TRY AGAIN",     "weight": 250, "prize_wei": "0",                       "free_spins": 0 },
  { "index": 4,  "value": "10X",      "label": "EPIC WIN",      "weight": 20,  "prize_wei": "1000000000000000000000",  "free_spins": 0 },
  { "index": 5,  "value": "5X",       "label": "MEGA WIN",      "weight": 50,  "prize_wei": "500000000000000000000",   "free_spins": 0 },
  { "index": 6,  "value": "NO_WIN",   "label": "TRY AGAIN",     "weight": 250, "prize_wei": "0",                       "free_spins": 0 },
  { "index": 7,  "value": "3X",       "label": "MULTIPLIER",    "weight": 75,  "prize_wei": "250000000000000000000",   "free_spins": 0 },
  { "index": 8,  "value": "FREE_SPIN","label": "SPIN AGAIN",    "weight": 30,  "prize_wei": "0",                       "free_spins": 1 },
  { "index": 9,  "value": "NO_WIN",   "label": "TRY AGAIN",     "weight": 250, "prize_wei": "0",                       "free_spins": 0 },
  { "index": 10, "value": "2X",       "label": "MULTIPLIER",    "weight": 100, "prize_wei": "100000000000000000000",   "free_spins": 0 },
  { "index": 11, "value": "20X",      "label": "SENSATIONAL",   "weight": 10,  "prize_wei": "2500000000000000000000",  "free_spins": 0 }
]
$JSON$)
ON CONFLICT (rule_key) DO NOTHING;

-- Only one pending spin commitment per wallet at a time.
CREATE UNIQUE INDEX IF NOT EXISTS wheel_spins_pending_wallet_uniq
    ON wheel_spins (wallet_address)
    WHERE status = 'pending';

-- Plaintext server seeds during the pending window live in a separate table so a
-- DB-read on wheel_spins cannot peek at an unsettled outcome. Mirrors the
-- poker_hand_pending_seeds pattern (per CLAUDE.md). Row is deleted on settle.
CREATE TABLE IF NOT EXISTS wheel_pending_seeds (
    spin_id     BIGINT PRIMARY KEY REFERENCES wheel_spins(id) ON DELETE CASCADE,
    server_seed VARCHAR(64) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
