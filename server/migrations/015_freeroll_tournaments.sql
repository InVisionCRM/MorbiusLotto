-- FREEROLL Tournament Feature
-- Adds support for scheduled freeroll tournaments with elimination mode,
-- betting clocks, registration phases, and re-entry windows

-- ============================================
-- TOURNAMENTS TABLE EXTENSIONS
-- ============================================

-- Tournament type: 'standard' (existing buy-in) or 'freeroll' (free entry)
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS tournament_type VARCHAR(20) DEFAULT 'standard';

-- Freeroll scheduling
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_opens_at TIMESTAMPTZ;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS duration_minutes INT;

-- Freeroll mode: 'elimination' or 'standard_chip_count'
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS freeroll_mode VARCHAR(30) DEFAULT 'standard_chip_count';

-- Elimination mode configuration (JSONB)
-- Structure: {
--   "intervalType": "time" | "hands",
--   "intervalValue": 5,  // minutes or hands
--   "eliminationPercentage": 20,
--   "resetChipsAfterRound": true
-- }
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS elimination_config JSONB DEFAULT NULL;

-- Re-entry configuration (JSONB)
-- Structure: { "enabled": true, "windowMinutes": 5 }
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS reentry_config JSONB DEFAULT NULL;

-- Action timer (betting clock) in seconds. NULL = disabled
-- Available for ALL tournament types
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS action_timer_seconds INT DEFAULT NULL;

-- Current tournament phase
-- Values: 'registration', 'active', 'elimination_round', 'completed'
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS current_phase VARCHAR(30) DEFAULT NULL;

-- Current elimination round number (for elimination mode)
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS current_elimination_round INT DEFAULT 0;

-- Tiebreaker order for eliminations (JSONB array)
-- Values: ['blackjacks', 'hands_won', 'highest_chips', 'entry_time']
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS tiebreaker_order JSONB DEFAULT '["highest_chips", "blackjacks", "hands_won", "entry_time"]';

-- Index for scheduled tournament lookups
CREATE INDEX IF NOT EXISTS idx_tournaments_scheduled_start ON tournaments(scheduled_start_at) WHERE tournament_type = 'freeroll';
CREATE INDEX IF NOT EXISTS idx_tournaments_phase ON tournaments(current_phase) WHERE tournament_type = 'freeroll';

-- ============================================
-- TOURNAMENT ENTRIES EXTENSIONS
-- ============================================

-- Registration status for freerolls
-- 'registered' = pre-registered, waiting for start
-- 'joined' = actively playing (or ready to play)
-- 'no_show' = registered but didn't join when tournament started
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS registration_status VARCHAR(20) DEFAULT 'joined';

-- Re-entry tracking
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS reentry_count INT DEFAULT 0;
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS last_reentry_at TIMESTAMPTZ;

-- Elimination tracking
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS eliminated_in_round INT DEFAULT NULL;
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS chips_at_elimination BIGINT DEFAULT NULL;

-- Stats for tiebreaking (JSONB)
-- Structure: { "blackjacks": 5, "hands_won": 12, "hands_played": 25 }
ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS elimination_stats JSONB DEFAULT '{"blackjacks": 0, "hands_won": 0, "hands_played": 0}';

-- Index for registration status
CREATE INDEX IF NOT EXISTS idx_entries_registration ON tournament_entries(registration_status);

-- ============================================
-- NEW TABLE: TOURNAMENT ELIMINATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS tournament_eliminations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    eliminated_entries JSONB NOT NULL,  -- Array of { entry_id, player_address, chips }
    threshold_chips BIGINT NOT NULL,    -- Chip count that triggered elimination
    tiebreaker_used VARCHAR(30),        -- Which tiebreaker was applied (if any)
    survivors_count INT NOT NULL,
    eliminated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tournament_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_eliminations_tournament ON tournament_eliminations(tournament_id);

-- ============================================
-- NEW TABLE: TOURNAMENT SCHEDULED EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS tournament_scheduled_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL,  -- 'start', 'elimination_round', 'end', 'reentry_close'
    scheduled_at TIMESTAMPTZ NOT NULL,
    executed_at TIMESTAMPTZ DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled')),
    metadata JSONB DEFAULT NULL,      -- Event-specific data (e.g., round number)

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_events_tournament ON tournament_scheduled_events(tournament_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_events_pending ON tournament_scheduled_events(status, scheduled_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_events_type ON tournament_scheduled_events(event_type, status);

-- ============================================
-- NEW TABLE: PLAYER ACTION TIMERS
-- ============================================

CREATE TABLE IF NOT EXISTS player_action_timers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    entry_id UUID NOT NULL REFERENCES tournament_entries(id) ON DELETE CASCADE,
    game_id UUID NOT NULL,  -- References games table
    hand_index INT DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'completed')),

    UNIQUE(entry_id, game_id, hand_index)
);

CREATE INDEX IF NOT EXISTS idx_action_timers_expires ON player_action_timers(expires_at)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_action_timers_entry ON player_action_timers(entry_id);
CREATE INDEX IF NOT EXISTS idx_action_timers_tournament ON player_action_timers(tournament_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to get pending scheduled events that should be executed
CREATE OR REPLACE FUNCTION get_pending_scheduled_events(max_events INT DEFAULT 10)
RETURNS TABLE (
    id UUID,
    tournament_id UUID,
    event_type VARCHAR(30),
    scheduled_at TIMESTAMPTZ,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.tournament_id,
        e.event_type,
        e.scheduled_at,
        e.metadata
    FROM tournament_scheduled_events e
    WHERE e.status = 'pending'
      AND e.scheduled_at <= NOW()
    ORDER BY e.scheduled_at ASC
    LIMIT max_events;
END;
$$ LANGUAGE plpgsql;

-- Function to get expired action timers
CREATE OR REPLACE FUNCTION get_expired_action_timers(max_timers INT DEFAULT 50)
RETURNS TABLE (
    id UUID,
    tournament_id UUID,
    entry_id UUID,
    game_id UUID,
    hand_index INT,
    expires_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.tournament_id,
        t.entry_id,
        t.game_id,
        t.hand_index,
        t.expires_at
    FROM player_action_timers t
    WHERE t.status = 'active'
      AND t.expires_at <= NOW()
    ORDER BY t.expires_at ASC
    LIMIT max_timers;
END;
$$ LANGUAGE plpgsql;

-- Function to get entries for elimination (sorted by chips with tiebreakers)
CREATE OR REPLACE FUNCTION get_entries_for_elimination(
    tournament_id_param UUID,
    tiebreaker_order_param JSONB DEFAULT '["highest_chips", "blackjacks", "hands_won", "entry_time"]'
)
RETURNS TABLE (
    entry_id UUID,
    player_address VARCHAR(42),
    chips_remaining BIGINT,
    highest_chip_count BIGINT,
    blackjacks INT,
    hands_won INT,
    hands_played INT,
    bought_in_at TIMESTAMPTZ,
    rank_position INT
) AS $$
BEGIN
    RETURN QUERY
    WITH entry_stats AS (
        SELECT
            te.id AS eid,
            te.player_address AS addr,
            te.chips_remaining AS chips,
            te.highest_chip_count AS highest,
            COALESCE((te.elimination_stats->>'blackjacks')::INT, 0) AS bj,
            COALESCE((te.elimination_stats->>'hands_won')::INT, 0) AS hw,
            COALESCE((te.elimination_stats->>'hands_played')::INT, 0) AS hp,
            te.bought_in_at AS entry_time
        FROM tournament_entries te
        WHERE te.tournament_id = tournament_id_param
          AND te.status = 'playing'
          AND te.registration_status = 'joined'
    )
    SELECT
        es.eid,
        es.addr,
        es.chips,
        es.highest,
        es.bj,
        es.hw,
        es.hp,
        es.entry_time,
        ROW_NUMBER() OVER (
            ORDER BY
                es.chips ASC,  -- Lowest chips first (for elimination)
                -- Dynamic tiebreakers based on config
                CASE WHEN tiebreaker_order_param->>0 = 'highest_chips' THEN es.highest ELSE 0 END ASC,
                CASE WHEN tiebreaker_order_param->>0 = 'blackjacks' THEN es.bj ELSE 0 END ASC,
                CASE WHEN tiebreaker_order_param->>0 = 'hands_won' THEN es.hw ELSE 0 END ASC,
                CASE WHEN tiebreaker_order_param->>1 = 'highest_chips' THEN es.highest ELSE 0 END ASC,
                CASE WHEN tiebreaker_order_param->>1 = 'blackjacks' THEN es.bj ELSE 0 END ASC,
                CASE WHEN tiebreaker_order_param->>1 = 'hands_won' THEN es.hw ELSE 0 END ASC,
                es.entry_time DESC  -- Earlier entry = eliminated first (tie)
        )::INT AS rank_pos
    FROM entry_stats es;
END;
$$ LANGUAGE plpgsql;

-- Function to list freeroll tournaments with registration info
CREATE OR REPLACE FUNCTION list_freeroll_tournaments(
    include_past BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    creator_address VARCHAR(42),
    tournament_type VARCHAR(20),
    freeroll_mode VARCHAR(30),
    scheduled_start_at TIMESTAMPTZ,
    registration_opens_at TIMESTAMPTZ,
    duration_minutes INT,
    starting_chips BIGINT,
    current_phase VARCHAR(30),
    registered_count BIGINT,
    action_timer_seconds INT,
    elimination_config JSONB,
    reentry_config JSONB,
    prize_distribution_type VARCHAR(30),
    custom_image TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.name,
        t.creator_address,
        t.tournament_type,
        t.freeroll_mode,
        t.scheduled_start_at,
        t.registration_opens_at,
        t.duration_minutes,
        t.starting_chips,
        t.current_phase,
        (SELECT COUNT(*) FROM tournament_entries te
         WHERE te.tournament_id = t.id
         AND te.registration_status IN ('registered', 'joined'))::BIGINT,
        t.action_timer_seconds,
        t.elimination_config,
        t.reentry_config,
        t.prize_distribution_type,
        t.custom_image,
        t.created_at
    FROM tournaments t
    WHERE t.tournament_type = 'freeroll'
      AND (include_past OR t.current_phase != 'completed' OR t.current_phase IS NULL)
      AND (include_past OR t.scheduled_start_at >= NOW() - INTERVAL '1 hour' OR t.current_phase IN ('registration', 'active', 'elimination_round'))
    ORDER BY
        CASE
            WHEN t.current_phase IN ('active', 'elimination_round') THEN 0
            WHEN t.current_phase = 'registration' THEN 1
            ELSE 2
        END,
        t.scheduled_start_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to check if re-entry window is open
CREATE OR REPLACE FUNCTION is_reentry_window_open(tournament_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
    tournament_record RECORD;
    reentry_enabled BOOLEAN;
    reentry_window INT;
    window_end TIMESTAMPTZ;
BEGIN
    SELECT * INTO tournament_record FROM tournaments WHERE id = tournament_id_param;

    IF tournament_record IS NULL THEN
        RETURN FALSE;
    END IF;

    IF tournament_record.tournament_type != 'freeroll' THEN
        RETURN FALSE;
    END IF;

    IF tournament_record.current_phase NOT IN ('active', 'elimination_round') THEN
        RETURN FALSE;
    END IF;

    -- Parse reentry config
    reentry_enabled := COALESCE((tournament_record.reentry_config->>'enabled')::BOOLEAN, FALSE);

    IF NOT reentry_enabled THEN
        RETURN FALSE;
    END IF;

    reentry_window := COALESCE((tournament_record.reentry_config->>'windowMinutes')::INT, 0);

    IF reentry_window <= 0 THEN
        RETURN FALSE;
    END IF;

    -- Check if within window from scheduled start
    window_end := tournament_record.scheduled_start_at + (reentry_window || ' minutes')::INTERVAL;

    RETURN NOW() < window_end;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN tournaments.tournament_type IS 'Type of tournament: standard (with buy-in) or freeroll (free entry)';
COMMENT ON COLUMN tournaments.freeroll_mode IS 'For freerolls: elimination (periodic eliminations) or standard_chip_count (final chips wins)';
COMMENT ON COLUMN tournaments.elimination_config IS 'Elimination settings: intervalType (time/hands), intervalValue, eliminationPercentage, resetChipsAfterRound';
COMMENT ON COLUMN tournaments.action_timer_seconds IS 'Betting clock duration in seconds. NULL = no timer. Available for ALL tournament types.';
COMMENT ON COLUMN tournaments.tiebreaker_order IS 'Order of tiebreakers for elimination: highest_chips, blackjacks, hands_won, entry_time';
COMMENT ON TABLE tournament_eliminations IS 'History of elimination rounds for freeroll tournaments';
COMMENT ON TABLE tournament_scheduled_events IS 'Scheduled events for freeroll tournaments (start, elimination rounds, end)';
COMMENT ON TABLE player_action_timers IS 'Active betting clock timers for tournament players';
