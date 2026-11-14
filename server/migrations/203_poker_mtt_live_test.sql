-- 203_poker_mtt_live_test.sql
--
-- Support for the one-shot 100-player MTT live test ("The Morbius 100-Player Freeroll"):
--
-- 1. poker_bot_accounts.role gains 'mtt' — a third bot pool, separate from the daily-freeroll
--    'tournament' bots (b071–b077) and the always-open cash-table 'cash' bots (b081–b087), so the
--    MTT can never pull a bot off those games and the daily scheduler never seats an MTT bot.
-- 2. 70 'mtt' bots, wallets 0x…b100–0x…b169 (keyless, synthetic — same convention as 200/201).
--    Made-up names, no "_bot" suffix, no real players' names. Personalities come from the
--    deterministic roster in server/src/lib/poker-mtt-bot-roster.ts (seed 0x4D545431); a unit
--    test checks these rows match it.
-- 3. tournaments.fees_waived: when TRUE, calculate_tournament_prizes distributes 100% of the
--    pool (no 5% cut) and distributePrizes pays no platform / creator fee, so an advertised
--    prize pool pays in full. Default FALSE — every existing tournament is unchanged.
--
-- Idempotent.

BEGIN;

ALTER TABLE poker_bot_accounts DROP CONSTRAINT IF EXISTS poker_bot_accounts_role_chk;
ALTER TABLE poker_bot_accounts ADD CONSTRAINT poker_bot_accounts_role_chk CHECK (role IN ('tournament', 'cash', 'mtt'));

INSERT INTO poker_bot_accounts (wallet_address, display_name, personality, role) VALUES
  ('0x000000000000000000000000000000000000b100', 'NightOwl', '{"tightness":0.56,"aggression":0.64,"bluff":0.06}', 'mtt'),
  ('0x000000000000000000000000000000000000b101', 'RiverRat', '{"tightness":0.88,"aggression":0.3,"bluff":0.03}', 'mtt'),
  ('0x000000000000000000000000000000000000b102', 'NeonNomad', '{"tightness":0.36,"aggression":0.83,"bluff":0.09}', 'mtt'),
  ('0x000000000000000000000000000000000000b103', 'MidnightMint', '{"tightness":0.67,"aggression":0.71,"bluff":0.07}', 'mtt'),
  ('0x000000000000000000000000000000000000b104', 'VelvetFold', '{"tightness":0.37,"aggression":0.18,"bluff":0.02}', 'mtt'),
  ('0x000000000000000000000000000000000000b105', 'CopperCheck', '{"tightness":0.26,"aggression":0.98,"bluff":0.18}', 'mtt'),
  ('0x000000000000000000000000000000000000b106', 'IronRaiser', '{"tightness":0.62,"aggression":0.63,"bluff":0.05}', 'mtt'),
  ('0x000000000000000000000000000000000000b107', 'SilentSnap', '{"tightness":0.77,"aggression":0.3,"bluff":0.04}', 'mtt'),
  ('0x000000000000000000000000000000000000b108', 'LuckyLantern', '{"tightness":0.32,"aggression":0.87,"bluff":0.1}', 'mtt'),
  ('0x000000000000000000000000000000000000b109', 'StackSprite', '{"tightness":0.65,"aggression":0.73,"bluff":0.04}', 'mtt'),
  ('0x000000000000000000000000000000000000b110', 'BluffBadger', '{"tightness":0.26,"aggression":0.18,"bluff":0.03}', 'mtt'),
  ('0x000000000000000000000000000000000000b111', 'FlopFox', '{"tightness":0.11,"aggression":0.95,"bluff":0.2}', 'mtt'),
  ('0x000000000000000000000000000000000000b112', 'TurnTortoise', '{"tightness":0.56,"aggression":0.78,"bluff":0.04}', 'mtt'),
  ('0x000000000000000000000000000000000000b113', 'ShoveShark', '{"tightness":0.86,"aggression":0.3,"bluff":0}', 'mtt'),
  ('0x000000000000000000000000000000000000b114', 'PocketComet', '{"tightness":0.41,"aggression":0.83,"bluff":0.1}', 'mtt'),
  ('0x000000000000000000000000000000000000b115', 'GhostCall', '{"tightness":0.63,"aggression":0.69,"bluff":0.08}', 'mtt'),
  ('0x000000000000000000000000000000000000b116', 'ChipChaser', '{"tightness":0.26,"aggression":0.28,"bluff":0.01}', 'mtt'),
  ('0x000000000000000000000000000000000000b117', 'DuskRunner', '{"tightness":0.22,"aggression":0.91,"bluff":0.17}', 'mtt'),
  ('0x000000000000000000000000000000000000b118', 'OrbitOuts', '{"tightness":0.67,"aggression":0.62,"bluff":0.04}', 'mtt'),
  ('0x000000000000000000000000000000000000b119', 'CrimsonKicker', '{"tightness":0.77,"aggression":0.25,"bluff":0.03}', 'mtt'),
  ('0x000000000000000000000000000000000000b120', 'PaperTiger', '{"tightness":0.37,"aggression":0.81,"bluff":0.11}', 'mtt'),
  ('0x000000000000000000000000000000000000b121', 'QuietQueen', '{"tightness":0.61,"aggression":0.64,"bluff":0.07}', 'mtt'),
  ('0x000000000000000000000000000000000000b122', 'TiltProof', '{"tightness":0.29,"aggression":0.21,"bluff":0.04}', 'mtt'),
  ('0x000000000000000000000000000000000000b123', 'NutHunter', '{"tightness":0.11,"aggression":0.98,"bluff":0.16}', 'mtt'),
  ('0x000000000000000000000000000000000000b124', 'AceOfDusk', '{"tightness":0.7,"aggression":0.7,"bluff":0.06}', 'mtt'),
  ('0x000000000000000000000000000000000000b125', 'GutshotGale', '{"tightness":0.86,"aggression":0.29,"bluff":0.01}', 'mtt'),
  ('0x000000000000000000000000000000000000b126', 'MoonlitMuck', '{"tightness":0.3,"aggression":0.9,"bluff":0.11}', 'mtt'),
  ('0x000000000000000000000000000000000000b127', 'CardinalCheck', '{"tightness":0.61,"aggression":0.7,"bluff":0.08}', 'mtt'),
  ('0x000000000000000000000000000000000000b128', 'SteadyHand', '{"tightness":0.24,"aggression":0.26,"bluff":0.04}', 'mtt'),
  ('0x000000000000000000000000000000000000b129', 'PotOdds', '{"tightness":0.21,"aggression":0.95,"bluff":0.18}', 'mtt'),
  ('0x000000000000000000000000000000000000b130', 'SageStack', '{"tightness":0.57,"aggression":0.67,"bluff":0.06}', 'mtt'),
  ('0x000000000000000000000000000000000000b131', 'BlindThief', '{"tightness":0.78,"aggression":0.32,"bluff":0.02}', 'mtt'),
  ('0x000000000000000000000000000000000000b132', 'FrostyFold', '{"tightness":0.27,"aggression":0.86,"bluff":0.1}', 'mtt'),
  ('0x000000000000000000000000000000000000b133', 'ThunderCall', '{"tightness":0.64,"aggression":0.65,"bluff":0.04}', 'mtt'),
  ('0x000000000000000000000000000000000000b134', 'MagpieMind', '{"tightness":0.25,"aggression":0.23,"bluff":0.01}', 'mtt'),
  ('0x000000000000000000000000000000000000b135', 'HexHandler', '{"tightness":0.11,"aggression":0.98,"bluff":0.18}', 'mtt'),
  ('0x000000000000000000000000000000000000b136', 'PixelPair', '{"tightness":0.59,"aggression":0.75,"bluff":0.06}', 'mtt'),
  ('0x000000000000000000000000000000000000b137', 'SunsetShove', '{"tightness":0.87,"aggression":0.33,"bluff":0.04}', 'mtt'),
  ('0x000000000000000000000000000000000000b138', 'RookieRiver', '{"tightness":0.35,"aggression":0.82,"bluff":0.1}', 'mtt'),
  ('0x000000000000000000000000000000000000b139', 'MarbleMind', '{"tightness":0.56,"aggression":0.67,"bluff":0.08}', 'mtt'),
  ('0x000000000000000000000000000000000000b140', 'CobaltCrush', '{"tightness":0.33,"aggression":0.19,"bluff":0.03}', 'mtt'),
  ('0x000000000000000000000000000000000000b141', 'HighCardHal', '{"tightness":0.16,"aggression":0.88,"bluff":0.17}', 'mtt'),
  ('0x000000000000000000000000000000000000b142', 'LateRegLarry', '{"tightness":0.57,"aggression":0.69,"bluff":0.04}', 'mtt'),
  ('0x000000000000000000000000000000000000b143', 'BigBlindBetty', '{"tightness":0.86,"aggression":0.25,"bluff":0.04}', 'mtt'),
  ('0x000000000000000000000000000000000000b144', 'ButtonBaron', '{"tightness":0.3,"aggression":0.82,"bluff":0.12}', 'mtt'),
  ('0x000000000000000000000000000000000000b145', 'CutoffCrow', '{"tightness":0.68,"aggression":0.7,"bluff":0.08}', 'mtt'),
  ('0x000000000000000000000000000000000000b146', 'UTGUrsa', '{"tightness":0.32,"aggression":0.27,"bluff":0.03}', 'mtt'),
  ('0x000000000000000000000000000000000000b147', 'SuitedSam', '{"tightness":0.16,"aggression":0.94,"bluff":0.16}', 'mtt'),
  ('0x000000000000000000000000000000000000b148', 'OffsuitOtis', '{"tightness":0.64,"aggression":0.69,"bluff":0.07}', 'mtt'),
  ('0x000000000000000000000000000000000000b149', 'KickerKate', '{"tightness":0.81,"aggression":0.27,"bluff":0.02}', 'mtt'),
  ('0x000000000000000000000000000000000000b150', 'SetMinerSue', '{"tightness":0.36,"aggression":0.85,"bluff":0.1}', 'mtt'),
  ('0x000000000000000000000000000000000000b151', 'SnapCallSid', '{"tightness":0.68,"aggression":0.72,"bluff":0.06}', 'mtt'),
  ('0x000000000000000000000000000000000000b152', 'TripleBarrel', '{"tightness":0.23,"aggression":0.23,"bluff":0.01}', 'mtt'),
  ('0x000000000000000000000000000000000000b153', 'CheckRaiseCleo', '{"tightness":0.22,"aggression":0.98,"bluff":0.2}', 'mtt'),
  ('0x000000000000000000000000000000000000b154', 'LimpLegend', '{"tightness":0.61,"aggression":0.73,"bluff":0.05}', 'mtt'),
  ('0x000000000000000000000000000000000000b155', 'ColdDeckCody', '{"tightness":0.73,"aggression":0.23,"bluff":0.02}', 'mtt'),
  ('0x000000000000000000000000000000000000b156', 'SplitPotPete', '{"tightness":0.43,"aggression":0.75,"bluff":0.1}', 'mtt'),
  ('0x000000000000000000000000000000000000b157', 'RunItTwice', '{"tightness":0.6,"aggression":0.7,"bluff":0.04}', 'mtt'),
  ('0x000000000000000000000000000000000000b158', 'FeltWalker', '{"tightness":0.25,"aggression":0.18,"bluff":0.02}', 'mtt'),
  ('0x000000000000000000000000000000000000b159', 'ChipLeaderLou', '{"tightness":0.15,"aggression":0.98,"bluff":0.2}', 'mtt'),
  ('0x000000000000000000000000000000000000b160', 'BountyBelle', '{"tightness":0.63,"aggression":0.68,"bluff":0.07}', 'mtt'),
  ('0x000000000000000000000000000000000000b161', 'DeepStackDot', '{"tightness":0.77,"aggression":0.37,"bluff":0.03}', 'mtt'),
  ('0x000000000000000000000000000000000000b162', 'ShortStackStu', '{"tightness":0.42,"aggression":0.74,"bluff":0.09}', 'mtt'),
  ('0x000000000000000000000000000000000000b163', 'FlushFinder', '{"tightness":0.54,"aggression":0.71,"bluff":0.07}', 'mtt'),
  ('0x000000000000000000000000000000000000b164', 'StraightShooter', '{"tightness":0.26,"aggression":0.25,"bluff":0.04}', 'mtt'),
  ('0x000000000000000000000000000000000000b165', 'QuadQueen', '{"tightness":0.2,"aggression":0.9,"bluff":0.16}', 'mtt'),
  ('0x000000000000000000000000000000000000b166', 'FullHouseFern', '{"tightness":0.57,"aggression":0.64,"bluff":0.05}', 'mtt'),
  ('0x000000000000000000000000000000000000b167', 'BadBeatBen', '{"tightness":0.78,"aggression":0.37,"bluff":0.02}', 'mtt'),
  ('0x000000000000000000000000000000000000b168', 'OnTheBubble', '{"tightness":0.4,"aggression":0.86,"bluff":0.1}', 'mtt'),
  ('0x000000000000000000000000000000000000b169', 'FinalTableFaye', '{"tightness":0.61,"aggression":0.74,"bluff":0.08}', 'mtt')
ON CONFLICT (wallet_address) DO NOTHING;

-- players (WS auth / ledger FK), chip rows, and seat-tag names for the new bots.
INSERT INTO players (wallet_address, balance)
SELECT wallet_address, '0' FROM poker_bot_accounts WHERE role = 'mtt'
ON CONFLICT (wallet_address) DO NOTHING;

INSERT INTO player_poker_chips (wallet_address, balance)
SELECT wallet_address, 0 FROM poker_bot_accounts WHERE role = 'mtt'
ON CONFLICT (wallet_address) DO NOTHING;

INSERT INTO chat_display_names (wallet_address, display_name)
SELECT wallet_address, display_name FROM poker_bot_accounts WHERE role = 'mtt'
ON CONFLICT (wallet_address) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW();

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS fees_waived BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN tournaments.fees_waived IS
  'TRUE = no prize-pool cut and no platform/creator fee at payout (server-set only, e.g. the MTT live test).';

-- Same as migration 127 except total_fee honours tournaments.fees_waived.
CREATE OR REPLACE FUNCTION calculate_tournament_prizes(tournament_id_param UUID)
RETURNS TABLE (
    entry_id UUID,
    player_address VARCHAR(42),
    final_rank INT,
    prize_amount NUMERIC(78, 0)
) AS $$
DECLARE
    total_pool NUMERIC(78, 0);
    distributable_pool NUMERIC(78, 0);
    prize_type VARCHAR(30);
    prize_percentages_json JSONB;
    percentages INT[];
    total_fee INT := 5;  -- 3% protocol + 2% creator; 0 when tournaments.fees_waived
    waived BOOLEAN;
BEGIN
    SELECT t.prize_pool, t.prize_distribution_type, t.prize_percentages, COALESCE(t.fees_waived, FALSE)
    INTO total_pool, prize_type, prize_percentages_json, waived
    FROM tournaments t
    WHERE t.id = tournament_id_param;

    IF waived THEN
        total_fee := 0;
    END IF;

    IF total_pool IS NULL OR total_pool = 0 THEN
        RETURN;
    END IF;

    distributable_pool := (total_pool * (100 - total_fee)) / 100;

    CASE prize_type
        WHEN 'winner_takes_all' THEN
            percentages := ARRAY[100, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        WHEN 'top_3' THEN
            percentages := ARRAY[50, 30, 20, 0, 0, 0, 0, 0, 0, 0];
        WHEN 'top_3_steep' THEN
            percentages := ARRAY[50, 30, 20, 0, 0, 0, 0, 0, 0, 0];
        WHEN 'top_5' THEN
            percentages := ARRAY[40, 25, 15, 12, 8, 0, 0, 0, 0, 0];
        WHEN 'custom' THEN
            IF prize_percentages_json IS NULL
               OR jsonb_typeof(prize_percentages_json) != 'array'
               OR jsonb_array_length(prize_percentages_json) = 0 THEN
                percentages := ARRAY[56, 20, 10, 2, 2, 2, 2, 2, 2, 2];
            ELSE
                percentages := ARRAY(
                    SELECT COALESCE((j::text)::int, 0)
                    FROM jsonb_array_elements_text(prize_percentages_json) AS t(j)
                );
            END IF;
        ELSE
            percentages := ARRAY[56, 20, 10, 2, 2, 2, 2, 2, 2, 2];
    END CASE;

    RETURN QUERY
    WITH ranked_entries AS (
        SELECT
            te.id AS eid,
            te.player_address AS addr,
            RANK() OVER (
                ORDER BY
                    CASE WHEN te.status = 'busted' THEN 0 ELSE 1 END DESC,
                    te.chips_remaining DESC,
                    te.finished_at DESC NULLS LAST,
                    te.highest_chip_count DESC,
                    te.bought_in_at ASC
            )::INT AS rank_pos
        FROM tournament_entries te
        WHERE te.tournament_id = tournament_id_param
          AND te.status != 'forfeited'
    )
    SELECT
        re.eid,
        re.addr,
        re.rank_pos,
        CASE
            WHEN COALESCE(percentages[re.rank_pos], 0) > 0
            THEN (distributable_pool * percentages[re.rank_pos]) / 100
            ELSE 0::NUMERIC(78, 0)
        END AS prize
    FROM ranked_entries re;
END;
$$ LANGUAGE plpgsql;

COMMIT;
