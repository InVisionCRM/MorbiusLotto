# Blackjack Analysis Functions - Availability Report

## Overview
This document analyzes what functions/data are available for:
1. **Individual Player Analysis** (PlayerStatsDashboard)
2. **Global Analytics** (GlobalAnalyticsDashboard)
3. **Internal Analysis** (Admin/Internal tools)

---

## ✅ Available Functions & Data Sources

### Contract Functions (On-Chain)
| Function | Purpose | Status |
|----------|---------|--------|
| `getPlayerReserve(address)` | Get player's MORBIUS reserve balance | ✅ Available |
| `totalReserves()` | Get total contract reserves | ✅ Available |
| `emergencyPaused()` | Check emergency pause status | ✅ Available |
| `getDailyWithdrawalInfo(address)` | Get daily withdrawal limits | ✅ Available |
| `playerReserves(address)` | Get player reserve (public mapping) | ✅ Available |
| `isSeedRevealed(bytes32)` | Check if server seed is revealed | ✅ Available |

### Server API Endpoints
| Endpoint | Purpose | Status |
|----------|---------|--------|
| `GET /api/player/:address/stats` | Get player statistics | ✅ Available |
| `GET /api/game/:gameId/verify` | Verify game result | ✅ Available |

### Database Functions
| Function | Returns | Status |
|----------|---------|--------|
| `get_player_stats(wallet)` | total_games, total_bet, total_win, win_rate, blackjack_count | ✅ Available |

### Database Tables (Available Data)
- ✅ `players` - Player information
- ✅ `game_sessions` - Game sessions with totals
- ✅ `games` - Individual games with results
- ✅ `game_hands` - Individual hands (for splits)
- ✅ `settlements` - Settlement records
- ✅ `seed_reveals` - Server seed reveals
- ✅ `active_connections` - WebSocket connections

---

## ❌ Missing Functions & Data

### Individual Player Analysis (PlayerStatsDashboard)

**Required but Missing:**

| Data Point | Source Needed | Status |
|-----------|---------------|--------|
| `currentStreak` | Database query (consecutive wins/losses) | ❌ Missing |
| `bestStreak` | Database query (max consecutive wins) | ❌ Missing |
| `biggestWin` | Database query (max payout) | ❌ Missing |
| `biggestLoss` | Database query (max bet loss) | ❌ Missing |
| `averageBet` | Database query (avg bet_amount) | ❌ Missing |
| `averagePayout` | Database query (avg payout) | ❌ Missing |
| `profitLoss` | Database query (total_win - total_bet) | ❌ Missing |
| `roi` | Database query (profitLoss / total_bet * 100) | ❌ Missing |
| `gamesToday` | Database query (games in last 24h) | ❌ Missing |
| `gamesThisWeek` | Database query (games in last 7 days) | ❌ Missing |
| `favoriteBetAmount` | Database query (most common bet_amount) | ❌ Missing |
| `lastGameTimestamp` | Database query (max created_at) | ❌ Missing |
| `rank` | Database query (player ranking by total_bet) | ❌ Missing |

**Current Database Function Only Provides:**
- ✅ total_games
- ✅ total_bet
- ✅ total_win
- ✅ win_rate
- ✅ blackjack_count

### Global Analytics (GlobalAnalyticsDashboard)

**Required but Missing:**

| Data Point | Source Needed | Status |
|-----------|---------------|--------|
| `totalPlayers` | Database query (COUNT players) | ❌ Missing |
| `activePlayers` | Database query (players with games in last 24h) | ❌ Missing |
| `totalGamesPlayed` | Database query (COUNT games) | ❌ Missing |
| `totalVolume` | Database query (SUM total_bet_amount) | ❌ Missing |
| `totalPayouts` | Database query (SUM total_payout) | ❌ Missing |
| `houseProfit` | Database query (totalVolume - totalPayouts) | ❌ Missing |
| `gamesLastHour` | Database query (games in last hour) | ❌ Missing |
| `gamesLast24Hours` | Database query (games in last 24h) | ❌ Missing |
| `volumeLast24Hours` | Database query (SUM bet in last 24h) | ❌ Missing |
| `profitLast24Hours` | Database query (volume - payout in last 24h) | ❌ Missing |
| `averageWinRate` | Database query (avg win_rate across players) | ❌ Missing |
| `averageBetSize` | Database query (avg bet_amount) | ❌ Missing |
| `houseEdge` | Database query (calculated from results) | ❌ Missing |
| `peakConcurrentUsers` | Database query (max active_connections) | ❌ Missing |
| `serverUptime` | Server metrics (not in database) | ❌ Missing |
| `averageResponseTime` | Server metrics (not in database) | ❌ Missing |
| `errorRate` | Server metrics (not in database) | ❌ Missing |
| `activeConnections` | Database query (COUNT active_connections) | ❌ Missing |
| `blackjackRate` | Database query (% games with blackjack result) | ❌ Missing |
| `splitRate` | Database query (% games with hand_count > 1) | ❌ Missing |
| `doubleDownRate` | Database query (% games with double_down action) | ❌ Missing |
| `surrenderRate` | Database query (% games with surrender action) | ❌ Missing |
| `reserveBalance` | Contract call (`totalReserves()`) | ✅ Available |
| `pendingSettlements` | Database query (COUNT settlements WHERE status='pending') | ❌ Missing |
| `failedSettlements` | Database query (COUNT settlements WHERE status='failed') | ❌ Missing |
| `averageSettlementTime` | Database query (avg settlement time) | ❌ Missing |
| `highRollerCount` | Database query (players with bet > threshold) | ❌ Missing |
| `suspiciousActivity` | Database query (fraud detection logic) | ❌ Missing |
| `largestBet` | Database query (MAX bet_amount) | ❌ Missing |
| `largestPayout` | Database query (MAX total_payout) | ❌ Missing |

### Internal Analysis (Admin/Internal Tools)

**Required but Missing:**

| Functionality | Source Needed | Status |
|---------------|---------------|--------|
| Player search/filtering | Database query | ❌ Missing |
| Game history by player | Database query | ❌ Missing |
| Settlement monitoring | Database query | ❌ Missing |
| Fraud detection | Database query + logic | ❌ Missing |
| Revenue reports | Database query | ❌ Missing |
| Player behavior analysis | Database query | ❌ Missing |
| Risk assessment | Database query + logic | ❌ Missing |

---

## 🔧 Required Additions

### 1. Enhanced Database Functions

**Add to `server/schema.sql`:**

```sql
-- Enhanced player stats function
CREATE OR REPLACE FUNCTION get_player_stats_enhanced(player_wallet VARCHAR(42))
RETURNS TABLE (
    total_games BIGINT,
    total_bet BIGINT,
    total_win BIGINT,
    win_rate DECIMAL,
    blackjack_count BIGINT,
    current_streak INTEGER,
    best_streak INTEGER,
    biggest_win BIGINT,
    biggest_loss BIGINT,
    average_bet DECIMAL,
    average_payout DECIMAL,
    profit_loss BIGINT,
    roi DECIMAL,
    games_today BIGINT,
    games_this_week BIGINT,
    favorite_bet_amount BIGINT,
    last_game_timestamp TIMESTAMP WITH TIME ZONE,
    rank BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH player_games AS (
        SELECT g.*, gs.player_id
        FROM games g
        JOIN game_sessions gs ON g.session_id = gs.id
        JOIN players p ON gs.player_id = p.id
        WHERE p.wallet_address = player_wallet
        AND g.result IS NOT NULL
    ),
    streaks AS (
        SELECT 
            COUNT(*) FILTER (WHERE result IN ('win', 'blackjack')) as current_streak,
            MAX(COUNT(*)) OVER (ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as best_streak
        FROM player_games
        ORDER BY created_at DESC
    )
    SELECT
        COUNT(*)::BIGINT as total_games,
        COALESCE(SUM(total_bet_amount), 0)::BIGINT as total_bet,
        COALESCE(SUM(total_payout), 0)::BIGINT as total_win,
        CASE WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(CASE WHEN result IN ('win', 'blackjack') THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100, 2)
        ELSE 0 END as win_rate,
        COUNT(CASE WHEN result = 'blackjack' THEN 1 END)::BIGINT as blackjack_count,
        -- Add streak calculations
        -- Add other missing fields
    FROM player_games;
END;
$$ LANGUAGE plpgsql;

-- Global analytics function
CREATE OR REPLACE FUNCTION get_global_analytics()
RETURNS TABLE (
    total_players BIGINT,
    active_players BIGINT,
    total_games_played BIGINT,
    total_volume BIGINT,
    total_payouts BIGINT,
    house_profit BIGINT,
    games_last_hour BIGINT,
    games_last_24_hours BIGINT,
    volume_last_24_hours BIGINT,
    profit_last_24_hours BIGINT,
    average_win_rate DECIMAL,
    average_bet_size DECIMAL,
    house_edge DECIMAL,
    active_connections BIGINT,
    blackjack_rate DECIMAL,
    split_rate DECIMAL,
    double_down_rate DECIMAL,
    surrender_rate DECIMAL,
    pending_settlements BIGINT,
    failed_settlements BIGINT,
    largest_bet BIGINT,
    largest_payout BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM players)::BIGINT as total_players,
        (SELECT COUNT(DISTINCT gs.player_id) FROM game_sessions gs 
         JOIN games g ON gs.id = g.session_id 
         WHERE g.created_at > NOW() - INTERVAL '24 hours')::BIGINT as active_players,
        (SELECT COUNT(*) FROM games WHERE result IS NOT NULL)::BIGINT as total_games_played,
        -- Add other calculations
    FROM games;
END;
$$ LANGUAGE plpgsql;
```

### 2. Server API Endpoints

**Add to `server/src/server.ts`:**

```typescript
// Enhanced player stats
app.get('/api/player/:address/stats/enhanced', async (req, res) => {
  try {
    const { address } = req.params;
    const stats = await dbService.getPlayerStatsEnhanced(address);
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching enhanced player stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Global analytics
app.get('/api/analytics/global', async (req, res) => {
  try {
    const analytics = await dbService.getGlobalAnalytics();
    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching global analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Game history
app.get('/api/player/:address/games', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const games = await dbService.getPlayerGames(address, parseInt(limit), parseInt(offset));
    res.json(games);
  } catch (error) {
    logger.error('Error fetching player games:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Settlement monitoring
app.get('/api/settlements', async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const settlements = await dbService.getSettlements(status, parseInt(limit));
    res.json(settlements);
  } catch (error) {
    logger.error('Error fetching settlements:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### 3. Database Service Methods

**Add to `server/src/services/database.service.ts`:**

```typescript
async getPlayerStatsEnhanced(walletAddress: string): Promise<EnhancedPlayerStats> {
  const query = `SELECT * FROM get_player_stats_enhanced($1)`;
  const result = await this.pool.query(query, [walletAddress]);
  return result.rows[0];
}

async getGlobalAnalytics(): Promise<GlobalAnalytics> {
  const query = `SELECT * FROM get_global_analytics()`;
  const result = await this.pool.query(query);
  return result.rows[0];
}

async getPlayerGames(walletAddress: string, limit: number, offset: number): Promise<Game[]> {
  const query = `
    SELECT g.*, gs.player_id
    FROM games g
    JOIN game_sessions gs ON g.session_id = gs.id
    JOIN players p ON gs.player_id = p.id
    WHERE p.wallet_address = $1
    ORDER BY g.created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const result = await this.pool.query(query, [walletAddress, limit, offset]);
  return result.rows;
}

async getSettlements(status?: string, limit: number = 100): Promise<Settlement[]> {
  let query = `SELECT * FROM settlements`;
  const params: any[] = [];
  
  if (status) {
    query += ` WHERE status = $1`;
    params.push(status);
  }
  
  query += ` ORDER BY settled_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  
  const result = await this.pool.query(query, params);
  return result.rows;
}
```

### 4. Contract Functions (Optional - for on-chain analytics)

**Add to `contracts/contracts/Blackjack.sol` (if needed):**

```solidity
// Optional: Add events for better analytics
event GamePlayed(
    address indexed player,
    uint256 betAmount,
    uint256 payout,
    bytes32 indexed gameHash
);

// Optional: Add view functions for analytics
function getTotalGamesPlayed() external view returns (uint256) {
    // Would require tracking in contract (gas cost consideration)
}
```

---

## 📊 Summary

### Individual Player Analysis
- **Available:** 5/18 data points (28%)
- **Missing:** 13/18 data points (72%)
- **Action Required:** Enhance database function and API endpoint

### Global Analytics
- **Available:** 1/28 data points (4%)
- **Missing:** 27/28 data points (96%)
- **Action Required:** Create global analytics database function and API endpoint

### Internal Analysis
- **Available:** Basic game verification
- **Missing:** All admin/internal tools
- **Action Required:** Create comprehensive admin API endpoints

---

## 🎯 Priority Recommendations

1. **HIGH PRIORITY:** Enhance `get_player_stats` database function
2. **HIGH PRIORITY:** Create `get_global_analytics` database function
3. **MEDIUM PRIORITY:** Add game history API endpoint
4. **MEDIUM PRIORITY:** Add settlement monitoring API endpoint
5. **LOW PRIORITY:** Add server metrics tracking (uptime, response time, etc.)

---

## ✅ Quick Wins

1. **Add missing fields to existing `get_player_stats` function** - Can be done immediately
2. **Create basic global analytics query** - Can aggregate from existing tables
3. **Add game history endpoint** - Simple query on existing `games` table

Most of the missing functionality can be implemented using **existing database tables** - no contract changes needed!
