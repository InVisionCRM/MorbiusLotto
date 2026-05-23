-- One-off data correction for "The Backroom" tournament on 2026-05-23.
--
-- Bug: calculate_tournament_prizes() (pre-migration 127) used highest_chip_count
-- as the tiebreaker for busted players, ranking MVS (peak 16,275, busted hand 20)
-- ahead of Midas (peak 14,125, busted hand 27). Midas survived longer and should
-- be 2nd, not 3rd.
--
-- Effect of this script:
--   1. Swap final_rank: MVS 2 -> 3, Midas 3 -> 2.
--   2. Swap prize_won: MVS 142,500 -> 95,000, Midas 95,000 -> 142,500.
--   3. Move 47,500 chips from MVS to Midas in player_poker_chips.
--   4. Record both deltas in poker_chip_ledger as an audit trail (reason
--      'tournament_prize', ref_type 'tournament_correction').
--
-- Assertions abort the whole transaction if any expected state has drifted
-- (e.g. already corrected, ranks no longer match, balances insufficient). Run
-- with: node server/run-migration.js scripts/fix-backroom-2026-05-23-payout-swap.sql

DO $$
DECLARE
    v_tournament_id UUID;
    v_mvs_entry_id UUID;
    v_midas_entry_id UUID;
    v_mvs_wallet TEXT;
    v_midas_wallet TEXT;
    v_mvs_rank INT;
    v_midas_rank INT;
    v_mvs_prize NUMERIC(78, 0);
    v_midas_prize NUMERIC(78, 0);
    v_delta NUMERIC(78, 0) := 47500;
    v_mvs_balance_before NUMERIC(78, 0);
    v_midas_balance_before NUMERIC(78, 0);
    v_mvs_balance_after NUMERIC(78, 0);
    v_midas_balance_after NUMERIC(78, 0);
BEGIN
    -- 1) Locate the tournament: most recent completed "The Backroom".
    --    Assertions below verify it's the right one (correct entries + expected
    --    pre-fix prize amounts), so a wrong match aborts safely.
    SELECT id INTO v_tournament_id
    FROM tournaments
    WHERE name = 'The Backroom'
      AND status = 'completed'
    ORDER BY COALESCE(ended_at, activated_at, created_at) DESC
    LIMIT 1;

    IF v_tournament_id IS NULL THEN
        RAISE EXCEPTION 'No completed tournament named "The Backroom" found';
    END IF;

    -- 2) Locate both entries by truncated wallet prefix/suffix. Pin by tournament_id.
    SELECT id, player_address, final_rank, COALESCE(prize_won, 0)
    INTO v_mvs_entry_id, v_mvs_wallet, v_mvs_rank, v_mvs_prize
    FROM tournament_entries
    WHERE tournament_id = v_tournament_id
      AND LOWER(player_address) LIKE '0xcc72%9285'
    FOR UPDATE;

    SELECT id, player_address, final_rank, COALESCE(prize_won, 0)
    INTO v_midas_entry_id, v_midas_wallet, v_midas_rank, v_midas_prize
    FROM tournament_entries
    WHERE tournament_id = v_tournament_id
      AND LOWER(player_address) LIKE '0x8997%6c4f'
    FOR UPDATE;

    IF v_mvs_entry_id IS NULL THEN
        RAISE EXCEPTION 'MVS entry (0xcc72...9285) not found in tournament %', v_tournament_id;
    END IF;
    IF v_midas_entry_id IS NULL THEN
        RAISE EXCEPTION 'Midas entry (0x8997...6c4f) not found in tournament %', v_tournament_id;
    END IF;

    -- 3) Verify current state matches the bug being fixed. If anyone has
    --    already corrected this, bail out cleanly rather than swap twice.
    IF v_mvs_rank IS DISTINCT FROM 2 OR v_mvs_prize <> 142500 THEN
        RAISE EXCEPTION 'MVS entry not in expected pre-fix state (rank=%, prize=%); aborting',
                        v_mvs_rank, v_mvs_prize;
    END IF;
    IF v_midas_rank IS DISTINCT FROM 3 OR v_midas_prize <> 95000 THEN
        RAISE EXCEPTION 'Midas entry not in expected pre-fix state (rank=%, prize=%); aborting',
                        v_midas_rank, v_midas_prize;
    END IF;

    RAISE NOTICE 'Tournament %: swapping ranks/prizes for MVS (%) and Midas (%)',
                 v_tournament_id, v_mvs_wallet, v_midas_wallet;

    -- 4) Swap final_rank and prize_won on the two entries.
    UPDATE tournament_entries
       SET final_rank = 3, prize_won = 95000
     WHERE id = v_mvs_entry_id;

    UPDATE tournament_entries
       SET final_rank = 2, prize_won = 142500
     WHERE id = v_midas_entry_id;

    -- 5) Move 47,500 chips from MVS to Midas. FOR UPDATE locks each row.
    SELECT balance INTO v_mvs_balance_before
      FROM player_poker_chips
     WHERE wallet_address = LOWER(v_mvs_wallet)
     FOR UPDATE;

    IF v_mvs_balance_before IS NULL THEN
        RAISE EXCEPTION 'MVS poker chip wallet row missing for %', v_mvs_wallet;
    END IF;
    IF v_mvs_balance_before < v_delta THEN
        RAISE EXCEPTION 'MVS chip balance % is below the % we need to reclaim; manual review required',
                        v_mvs_balance_before, v_delta;
    END IF;

    SELECT balance INTO v_midas_balance_before
      FROM player_poker_chips
     WHERE wallet_address = LOWER(v_midas_wallet)
     FOR UPDATE;

    IF v_midas_balance_before IS NULL THEN
        RAISE EXCEPTION 'Midas poker chip wallet row missing for %', v_midas_wallet;
    END IF;

    v_mvs_balance_after := v_mvs_balance_before - v_delta;
    v_midas_balance_after := v_midas_balance_before + v_delta;

    UPDATE player_poker_chips
       SET balance = v_mvs_balance_after, updated_at = NOW()
     WHERE wallet_address = LOWER(v_mvs_wallet);

    UPDATE player_poker_chips
       SET balance = v_midas_balance_after, updated_at = NOW()
     WHERE wallet_address = LOWER(v_midas_wallet);

    -- 6) Append audit-trail entries for both deltas.
    INSERT INTO poker_chip_ledger (wallet_address, delta, balance_after, reason, ref_type, ref_id)
    VALUES
      (LOWER(v_mvs_wallet),   -v_delta, v_mvs_balance_after,   'tournament_prize', 'tournament_correction', v_tournament_id),
      (LOWER(v_midas_wallet),  v_delta, v_midas_balance_after, 'tournament_prize', 'tournament_correction', v_tournament_id);

    RAISE NOTICE 'Done. MVS % -> % chips. Midas % -> % chips.',
                 v_mvs_balance_before, v_mvs_balance_after,
                 v_midas_balance_before, v_midas_balance_after;
END $$;
