import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createPublicClient, http } from 'viem';
import { pulsechain } from 'viem/chains';
import { DatabaseService } from './services/database.service';
import { ProvablyFairService } from './services/provably-fair.service';
import { BlackjackGameService } from './services/blackjack-game.service';
import { TournamentService } from './services/tournament.service';
import { FreerollSchedulerService } from './services/freeroll-scheduler.service';
import { TournamentSchedulerService } from './services/tournament-scheduler.service';
import { WebSocketService } from './services/websocket.service';
import { ChainAnalyticsService } from './services/chain-analytics.service';
import { logger } from './utils/logger';
import { signWithdrawApproval, MIN_WITHDRAWAL_WEI } from './utils/withdraw-sign';
import { getPublicClient } from './utils/chain-client';
import { blackjackAbi } from './abi/blackjack';
import { PLINKO_ADDRESS, KENO_ADDRESS, LOTTERY_ADDRESS, BLACKJACK_ADDRESS, MORBIUS_TOKEN_ADDRESS, getAllBlackjackContracts } from './config/contracts';

const ERC20_BALANCE_OF_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

// Load environment variables
dotenv.config();

// Admin: comma-separated wallet addresses (server-side, for /api/admin/*)
const ADMIN_WALLETS: string[] = (process.env.ADMIN_WALLETS || '')
  .split(',')
  .map((a) => a.trim().toLowerCase())
  .filter(Boolean);

function isAdminWallet(addr: string | undefined): boolean {
  if (!addr) return false;
  return ADMIN_WALLETS.includes(addr.toLowerCase());
}

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Trust proxy when behind a reverse proxy (Railway, nginx, etc.) so rate-limit sees real client IP.
// Avoids ERR_ERL_UNEXPECTED_X_FORWARDED_FOR when X-Forwarded-For is set.
// Default to trusting proxy (1) unless explicitly disabled with TRUST_PROXY=0
const trustProxyEnv = (process.env.TRUST_PROXY || '').trim().toLowerCase();
const trustProxyValue = trustProxyEnv === '0' || trustProxyEnv === 'false' ? 0 : 1;
app.set('trust proxy', trustProxyValue);
// Use console.log for trust proxy status so it always appears in logs (logger might not output in production)
console.log(`[Server] Trust proxy setting: ${trustProxyValue} (TRUST_PROXY="${process.env.TRUST_PROXY || 'unset'}")`);
if (trustProxyValue === 0) {
  console.warn(`[Server] WARNING: Trust proxy is DISABLED - rate limiter will fail behind reverse proxy if X-Forwarded-For header is present.`);
}

// CORS: allow frontend origin(s). Set FRONTEND_URL on Railway to your app URL (comma-separated for multiple).
const allowedOrigins = (process.env.FRONTEND_URL || 'https://win.morbius.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin or non-browser
    if (allowedOrigins.includes(origin)) return cb(null, true); // reflect allowed origin
    return cb(null, false);
  },
  credentials: true,
}));

// Rate limiting (relaxed for development - 1000 requests per minute)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // limit each IP to 1000 requests per minute
  message: 'Too many requests from this IP, please try again later.',
  // Disable X-Forwarded-For validation to prevent ERR_ERL_UNEXPECTED_X_FORWARDED_FOR errors
  // Trust proxy is already set above, but this prevents validation errors if there's any timing/configuration issue
  validate: {
    xForwardedForHeader: false,
  },
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Admin API: require x-admin-wallet header and that it's in ADMIN_WALLETS
app.use('/api/admin', (req, res, next) => {
  const wallet = (req.headers['x-admin-wallet'] as string)?.trim();
  if (!wallet || !isAdminWallet(wallet)) {
    res.status(403).json({ error: 'Forbidden', message: 'Admin wallet required' });
    return;
  }
  next();
});

// JSON helper that serializes BigInt values (Express res.json cannot)
const jsonReplacer = (_key: string, value: any) => (typeof value === 'bigint' ? value.toString() : value);
const sendJson = (res: any, data: any) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, jsonReplacer));
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize services
async function initializeServices() {
  try {
    // Initialize database
    const dbService = new DatabaseService();
    await dbService.connect();

    // Initialize provably fair service
    const pfService = new ProvablyFairService();

    // Initialize blackjack game service
    const gameService = new BlackjackGameService(dbService, pfService);

    // Initialize tournament service
    const tournamentService = new TournamentService(dbService.getPool());
    gameService.setTournamentService(tournamentService);

    // Initialize WebSocket service
    const wsService = new WebSocketService(server, gameService, dbService, tournamentService);

    // Freeroll scheduler (polls pending scheduled events: start, elimination_round, end)
    freerollScheduler = new FreerollSchedulerService(dbService.getPool(), tournamentService);
    freerollScheduler.start();

    // Tournament scheduler (time-expired buy-in tournaments, stuck-tournament recovery)
    tournamentScheduler = new TournamentSchedulerService(dbService.getPool(), tournamentService);
    tournamentScheduler.start();

    // Expire any orphaned pending withdrawals from a previous crash (refunds balances)
    try {
      const expired = await dbService.expirePendingWithdrawals();
      if (expired > 0) {
        logger.info(`Startup: expired ${expired} orphaned pending withdrawal(s) and refunded balances`);
      }
    } catch (err) {
      logger.error('Startup: failed to expire pending withdrawals', err);
    }

    // Chain analytics (on-chain games: Plinko, Keno, Lottery, BigWheel)
    const chainAnalytics = new ChainAnalyticsService();

    // API routes
    app.get('/api/player/:address/profile', async (req, res) => {
      try {
        const { address } = req.params;
        const profile = await dbService.getProfile(address);
        sendJson(res, profile ?? { displayName: null, profileImageUrl: null });
      } catch (error) {
        logger.error('Error fetching player profile:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/player/:address/stats', async (req, res) => {
      try {
        const { address } = req.params;
        const stats = await dbService.getPlayerStats(address);
        sendJson(res, stats);
      } catch (error) {
        logger.error('Error fetching player stats:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/game/:gameId/verify', async (req, res) => {
      try {
        const { gameId } = req.params;
        const verification = await gameService.verifyGame(gameId);
        if (verification == null) {
          res.status(404).json({ error: 'Game not found', message: 'No completed game with this ID. Use a game ID from your History (same backend).' });
          return;
        }
        sendJson(res, verification);
      } catch (error) {
        logger.error('Error verifying game:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Enhanced player stats endpoint
    app.get('/api/player/:address/stats/enhanced', async (req, res) => {
      try {
        const { address } = req.params;
        const stats = await dbService.getPlayerStatsEnhanced(address);
        sendJson(res, stats);
      } catch (error) {
        logger.error('Error fetching enhanced player stats:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Global analytics endpoint
    app.get('/api/analytics/global', async (req, res) => {
      try {
        const analytics = await dbService.getGlobalAnalytics();
        sendJson(res, analytics);
      } catch (error) {
        logger.error('Error fetching global analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Top players leaderboard (by total volume)
    app.get('/api/analytics/top-players', async (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit as string) || 25, 50);
        const topPlayers = await dbService.getTopPlayers(limit);
        sendJson(res, topPlayers);
      } catch (error) {
        logger.error('Error fetching top players:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Top player by category (for infinite moving cards)
    app.get('/api/analytics/top-player-by-category', async (req, res) => {
      try {
        const category = req.query.category as string;
        if (!category || !['games', 'profit_loss', 'wagered', 'win_rate', 'total_won', 'win_streak'].includes(category)) {
          res.status(400).json({ error: 'Invalid category' });
          return;
        }
        const topPlayer = await dbService.getTopPlayersByCategory(category as any);
        sendJson(res, topPlayer);
      } catch (error) {
        logger.error('Error fetching top player by category:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Platform analytics: Blackjack (DB) + Plinko, Keno, Lottery, BigWheel (chain)
    app.get('/api/analytics/platform', async (req, res) => {
      try {
        const [blackjack, chain] = await Promise.all([
          dbService.getGlobalAnalytics(),
          chainAnalytics.getAllChainStats(),
        ]);
        const bjGames = BigInt(blackjack.total_games_played);
        const bjVolume = blackjack.total_volume;
        const bjPayouts = blackjack.total_payouts;
        const plinkoGames = chain.plinko?.totalDrops ?? 0n;
        const plinkoVolume = chain.plinko?.totalRevenue ?? 0n;
        const plinkoPayouts = chain.plinko?.totalPayouts ?? 0n;
        const kenoGames = chain.keno?.ticketCount ?? 0n;
        const kenoVolume = chain.keno?.totalWagered ?? 0n;
        const kenoPayouts = chain.keno?.totalWon ?? 0n;
        const lotteryGames = chain.lottery?.totalTicketsEver ?? 0n;
        const lotteryVolume = chain.lottery?.totalCollected ?? 0n;
        const lotteryPayouts = chain.lottery?.totalClaimed ?? 0n;
        const bigWheelGames = chain.bigWheel?.spins ?? 0n;
        const bigWheelVolume = chain.bigWheel?.volume ?? 0n;
        const bigWheelPayouts = chain.bigWheel?.payouts ?? 0n;
        const combined = {
          totalGamesPlayed: bjGames + plinkoGames + kenoGames + lotteryGames + bigWheelGames,
          totalVolume: bjVolume + plinkoVolume + kenoVolume + lotteryVolume + bigWheelVolume,
          totalPayouts: bjPayouts + plinkoPayouts + kenoPayouts + lotteryPayouts + bigWheelPayouts,
        };
        sendJson(res, {
          blackjack,
          plinko: chain.plinko,
          keno: chain.keno,
          lottery: chain.lottery,
          bigWheel: chain.bigWheel,
          combined,
        });
      } catch (error) {
        logger.error('Error fetching platform analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Public: recent Blackjack wins (for Latest Wins feed)
    app.get('/api/analytics/recent-wins', async (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
        const wins = await dbService.getRecentGlobalWins(limit);
        sendJson(res, { wins });
      } catch (error) {
        logger.error('Error fetching recent wins:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Public: metrics time-series for charts (24h hourly, 7d/30d/all daily)
    app.get('/api/analytics/series', async (req, res) => {
      try {
        const range = ((req.query.range as string) || '24h') as '24h' | '7d' | '30d' | 'all';
        if (!['24h', '7d', '30d', 'all'].includes(range)) {
          res.status(400).json({ error: 'Invalid range. Use 24h, 7d, 30d, or all' });
          return;
        }
        const series = await dbService.getMetricsSeries(range);
        sendJson(res, { range, series });
      } catch (error) {
        logger.error('Error fetching metrics series:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Public: global metrics aggregates (wagered, won, deposited, withdrawn) with time range filtering
    app.get('/api/analytics/global-metrics', async (req, res) => {
      try {
        const range = ((req.query.range as string) || '24h') as '24h' | '7d' | '30d' | 'all';
        if (!['24h', '7d', '30d', 'all'].includes(range)) {
          res.status(400).json({ error: 'Invalid range. Use 24h, 7d, 30d, or all' });
          return;
        }

        // Get Blackjack metrics (filtered by range)
        const aggregates = await dbService.getMetricsAggregates(range);
        
        // Get chain stats (all-time, but we'll use them for "all" range)
        const chainStats = await chainAnalytics.getAllChainStats();
        
        // Calculate totals across all games
        const blackjackWagered = aggregates.volume;
        const blackjackWon = aggregates.volume + aggregates.pnl; // volume + profit = total payouts
        
        // For other games, use chain stats (all-time totals)
        // Note: For time-filtered ranges, we only have Blackjack data
        const plinkoWagered = chainStats.plinko?.totalRevenue ?? 0n;
        const plinkoWon = chainStats.plinko?.totalPayouts ?? 0n;
        const kenoWagered = chainStats.keno?.totalWagered ?? 0n;
        const kenoWon = chainStats.keno?.totalWon ?? 0n;
        const lotteryWagered = chainStats.lottery?.totalCollected ?? 0n;
        const lotteryWon = chainStats.lottery?.totalClaimed ?? 0n;
        const bigWheelWagered = chainStats.bigWheel?.volume ?? 0n;
        const bigWheelWon = chainStats.bigWheel?.payouts ?? 0n;

        // Total wagered and won (for filtered ranges, only Blackjack; for "all", include all games)
        const totalWagered = range === 'all' 
          ? blackjackWagered + plinkoWagered + kenoWagered + lotteryWagered + bigWheelWagered
          : blackjackWagered;
        const totalWon = range === 'all'
          ? blackjackWon + plinkoWon + kenoWon + lotteryWon + bigWheelWon
          : blackjackWon;

        // Deposits and withdrawals: from Blackjack V2 contract events (all-time)
        const { totalDeposited, totalWithdrawn } = await chainAnalytics.getBlackjackDepositWithdrawTotals();

        sendJson(res, {
          range,
          totalWagered: totalWagered.toString(),
          totalWon: totalWon.toString(),
          totalDeposited: totalDeposited.toString(),
          totalWithdrawn: totalWithdrawn.toString(),
          breakdown: {
            blackjack: {
              wagered: blackjackWagered.toString(),
              won: blackjackWon.toString(),
            },
            plinko: {
              wagered: plinkoWagered.toString(),
              won: plinkoWon.toString(),
            },
            keno: {
              wagered: kenoWagered.toString(),
              won: kenoWon.toString(),
            },
            lottery: {
              wagered: lotteryWagered.toString(),
              won: lotteryWon.toString(),
            },
            bigWheel: {
              wagered: bigWheelWagered.toString(),
              won: bigWheelWon.toString(),
            },
          },
        });
      } catch (error) {
        logger.error('Error fetching global metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Player game history endpoint
    app.get('/api/player/:address/games', async (req, res) => {
      try {
        const { address } = req.params;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const games = await dbService.getPlayerGames(address, limit, offset);
        sendJson(res, games);
      } catch (error) {
        logger.error('Error fetching player games:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Game hands endpoint (for fetching player hands for a specific game)
    app.get('/api/game/:gameId/hands', async (req, res) => {
      try {
        const { gameId } = req.params;
        const hands = await dbService.getGameHands(gameId);
        sendJson(res, hands);
      } catch (error) {
        logger.error('Error fetching game hands:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Tournament API endpoints
    app.get('/api/tournament/active', async (req, res) => {
      try {
        const tournament = await tournamentService.getActiveTournament();
        const entryCount = await tournamentService.getTournamentEntryCount(tournament.id);
        sendJson(res, {
          ...tournament,
          buy_in_amount: tournament.buy_in_amount.toString(),
          prize_pool: tournament.prize_pool.toString(),
          entryCount,
        });
      } catch (error) {
        logger.error('Error fetching active tournament:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/tournament/:tournamentId/leaderboard', async (req, res) => {
      try {
        const { tournamentId } = req.params;
        const limit = parseInt(req.query.limit as string) || 50;
        const leaderboard = await tournamentService.getLeaderboard(tournamentId, limit);
        sendJson(res, leaderboard);
      } catch (error) {
        logger.error('Error fetching tournament leaderboard:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/tournament/player/:address/state', async (req, res) => {
      try {
        const { address } = req.params;
        const state = await tournamentService.getTournamentState(address);
        if (!state) {
          return res.json({ inTournament: false });
        }
        sendJson(res, { inTournament: true, ...state });
      } catch (error) {
        logger.error('Error fetching player tournament state:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/tournament/player/:address/history', async (req, res) => {
      try {
        const { address } = req.params;
        if (!address || address.length < 20) {
          return res.status(400).json({ error: 'Valid player address required' });
        }
        const history = await tournamentService.getPlayerTournamentHistory(address);
        sendJson(res, history.map((item) => ({
          ...item,
          prizeWon: item.prizeWon.toString(),
        })));
      } catch (error) {
        logger.error('Error fetching player tournament history:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Cancel tournament (creator only)
    app.post('/api/tournament/:tournamentId/cancel', async (req, res) => {
      try {
        const { tournamentId } = req.params;
        const { cancellerAddress } = req.body;
        
        if (!cancellerAddress || typeof cancellerAddress !== 'string') {
          return res.status(400).json({ error: 'cancellerAddress is required' });
        }

        await tournamentService.cancelTournament(tournamentId, cancellerAddress);
        sendJson(res, { success: true, message: 'Tournament cancelled successfully' });
      } catch (error: any) {
        logger.error('Error cancelling tournament:', error);
        const status = error.message?.includes('not found') ? 404 :
                      error.message?.includes('Only the tournament creator') ? 403 :
                      error.message?.includes('Cannot cancel') ? 400 : 500;
        res.status(status).json({ error: error.message || 'Internal server error' });
      }
    });

    // Creator reclaim funds from cancelled tournament
    app.post('/api/tournament/:tournamentId/reclaim', async (req, res) => {
      try {
        const { tournamentId } = req.params;
        const { creatorAddress } = req.body;
        
        if (!creatorAddress || typeof creatorAddress !== 'string') {
          return res.status(400).json({ error: 'creatorAddress is required' });
        }

        const result = await tournamentService.creatorReclaimFunds(tournamentId, creatorAddress);
        if (result.success) {
          sendJson(res, { success: true, txHash: result.txHash, message: 'Funds reclaimed successfully' });
        } else {
          res.status(400).json({ error: result.error || 'Failed to reclaim funds' });
        }
      } catch (error: any) {
        logger.error('Error reclaiming tournament funds:', error);
        const status = error.message?.includes('not found') ? 404 :
                      error.message?.includes('Only the tournament creator') ? 403 :
                      error.message?.includes('must be cancelled') ? 400 : 500;
        res.status(status).json({ error: error.message || 'Internal server error' });
      }
    });

    // Public: Blackjack table list (for picker; enabled only)
    app.get('/api/blackjack/tables', async (req, res) => {
      try {
        const enabledOnly = (req.query.enabledOnly as string) !== 'false';
        const rows = await dbService.getBlackjackTables(enabledOnly);
        sendJson(res, rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          name: r.name,
          src: r.src,
          description: r.description,
          token_contract_address: r.token_contract_address,
          logo_url: r.logo_url,
          ticker: r.ticker,
          iframe_url: r.iframe_url,
          sort_order: r.sort_order,
          enabled: r.enabled,
        })));
      } catch (error) {
        logger.error('Error fetching blackjack tables:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Public: effective Blackjack bet limits from admin config (for UI; same logic as WS validation)
    const DEFAULT_MIN_BET = '1000000000000000000';
    const DEFAULT_MAX_BET = '100000000000000000000000';
    app.get('/api/blackjack/limits', async (req, res) => {
      try {
        const config = await dbService.getAdminGameConfig();
        let minBet = DEFAULT_MIN_BET;
        let maxBet = DEFAULT_MAX_BET;
        const minStr = config.blackjack_min_bet?.trim();
        const maxStr = config.blackjack_max_bet?.trim();
        if (minStr) {
          try {
            const parsed = BigInt(minStr);
            if (parsed >= 0n) minBet = parsed.toString();
          } catch {
            /* keep default */
          }
        }
        if (maxStr) {
          try {
            const parsed = BigInt(maxStr);
            if (parsed > 0n) maxBet = parsed.toString();
          } catch {
            /* keep default */
          }
        }
        if (BigInt(minBet) > BigInt(maxBet)) {
          minBet = DEFAULT_MIN_BET;
          maxBet = DEFAULT_MAX_BET;
        }
        sendJson(res, { minBet, maxBet });
      } catch (error) {
        logger.error('Error fetching blackjack limits:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Admin: Blackjack tables CRUD (requires x-admin-wallet in allowed list)
    const dbSchemaError = (err: unknown): string | null => {
      const msg = err && typeof (err as any).message === 'string' ? (err as any).message : '';
      const code = (err as any)?.code;
      if (code === '42703' || code === '42P01' || /column .* does not exist|relation .* does not exist/i.test(msg)) {
        return 'Database schema outdated. Run server migrations 026 and 028 (blackjack_tables).';
      }
      return null;
    };

    app.get('/api/admin/tables', async (req, res) => {
      try {
        const enabledOnly = (req.query.enabledOnly as string) === 'true';
        const rows = await dbService.getBlackjackTables(enabledOnly);
        sendJson(res, rows);
      } catch (error) {
        logger.error('Error fetching admin blackjack tables:', error);
        const msg = dbSchemaError(error);
        res.status(msg ? 503 : 500).json({ error: msg || 'Internal server error' });
      }
    });

    app.post('/api/admin/tables', async (req, res) => {
      try {
        const { kind, name, src, description, token_contract_address, logo_url, ticker, iframe_url, sort_order, enabled } = req.body;
        if (!kind || !name || !src) {
          res.status(400).json({ error: 'Missing required fields: kind, name, src' });
          return;
        }
        if (kind !== 'image' && kind !== 'video') {
          res.status(400).json({ error: 'kind must be image or video' });
          return;
        }
        const row = await dbService.createBlackjackTable({
          kind,
          name,
          src,
          description: description ?? null,
          token_contract_address: token_contract_address ?? null,
          logo_url: logo_url ?? null,
          ticker: ticker ?? null,
          iframe_url: iframe_url ?? null,
          sort_order: typeof sort_order === 'number' ? sort_order : 0,
          enabled: enabled !== false,
        });
        sendJson(res, row);
      } catch (error) {
        logger.error('Error creating blackjack table:', error);
        const msg = dbSchemaError(error);
        res.status(msg ? 503 : 500).json({ error: msg || 'Internal server error' });
      }
    });

    app.put('/api/admin/tables/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const updates = req.body;
        const row = await dbService.updateBlackjackTable(id, {
          name: updates.name,
          src: updates.src,
          description: updates.description,
          token_contract_address: updates.token_contract_address,
          logo_url: updates.logo_url,
          ticker: updates.ticker,
          iframe_url: updates.iframe_url,
          sort_order: updates.sort_order,
          enabled: updates.enabled,
        });
        if (!row) {
          res.status(404).json({ error: 'Table not found' });
          return;
        }
        sendJson(res, row);
      } catch (error) {
        logger.error('Error updating blackjack table:', error);
        const msg = dbSchemaError(error);
        res.status(msg ? 503 : 500).json({ error: msg || 'Internal server error' });
      }
    });

    app.delete('/api/admin/tables/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const ok = await dbService.deleteBlackjackTable(id);
        if (!ok) {
          res.status(404).json({ error: 'Table not found' });
          return;
        }
        res.status(204).send();
      } catch (error) {
        logger.error('Error deleting blackjack table:', error);
        const msg = dbSchemaError(error);
        res.status(msg ? 503 : 500).json({ error: msg || 'Internal server error' });
      }
    });

    // Admin: game health (API, WS, RPC, MORBIUS per contract, Blackjack reserves for current + all legacy)
    // MORBIUS in contract = MORBIUS_TOKEN.balanceOf(gameContract) for each game (canonical addresses in config/contracts.ts).
    app.get('/api/admin/health', async (req, res) => {
      try {
        const client = getPublicClient();

        const api = 'ok';
        const ws = 'up'; // same process

        const games: Record<string, { rpc: 'ok' | 'fail'; error?: string }> = {};
        const morbius: Record<string, string> = {};
        type ContractReserves = { contractAddress: string; label: string; totalMorbiusInContract: string; addressesWithReserve: Array<{ address: string; reserve: string }> };
        const blackjackReservesByContract: ContractReserves[] = [];

        const readMorbiusBalance = async (contractAddress: `0x${string}`): Promise<bigint> => {
          return client.readContract({ address: MORBIUS_TOKEN_ADDRESS, abi: ERC20_BALANCE_OF_ABI, functionName: 'balanceOf', args: [contractAddress] }) as Promise<bigint>;
        };

        const blackjackContracts = getAllBlackjackContracts();
        const addresses = await dbService.getPlayerAddressesForReserveCheck(100);

        for (const { address: blackjackAddress, label } of blackjackContracts) {
          try {
            const balance = await readMorbiusBalance(blackjackAddress);
            if (label === 'Current') {
              morbius.blackjack = balance.toString();
              games.blackjack = { rpc: 'ok' };
            }
            const reserves = await Promise.all(
              addresses.map(async (addr) => {
                const a = addr.startsWith('0x') ? addr as `0x${string}` : `0x${addr}` as `0x${string}`;
                try {
                  const r = await client.readContract({ address: blackjackAddress, abi: blackjackAbi, functionName: 'getPlayerReserve', args: [a] }) as bigint;
                  return { address: addr, reserve: r };
                } catch {
                  return { address: addr, reserve: 0n };
                }
              })
            );
            blackjackReservesByContract.push({
              contractAddress: blackjackAddress,
              label,
              totalMorbiusInContract: balance.toString(),
              addressesWithReserve: reserves.filter((r) => r.reserve > 0n).map((r) => ({ address: r.address, reserve: r.reserve.toString() })),
            });
          } catch (err: any) {
            if (label === 'Current') {
              games.blackjack = { rpc: 'fail', error: err?.message || 'RPC/contract read failed' };
              morbius.blackjack = '0';
            }
            blackjackReservesByContract.push({
              contractAddress: blackjackAddress,
              label,
              totalMorbiusInContract: '0',
              addressesWithReserve: [],
            });
          }
        }

        // Plinko: MORBIUS balance held by Plinko contract
        try {
          const balance = await readMorbiusBalance(PLINKO_ADDRESS);
          morbius.plinko = balance.toString();
          const plinkoStats = await chainAnalytics.getPlinkoStats();
          games.plinko = plinkoStats ? { rpc: 'ok' } : { rpc: 'ok' };
        } catch (err: any) {
          games.plinko = { rpc: 'fail', error: err?.message || 'RPC failed' };
          morbius.plinko = '0';
        }

        // Keno: MORBIUS balance held by Keno contract
        try {
          const balance = await readMorbiusBalance(KENO_ADDRESS);
          morbius.keno = balance.toString();
          const kenoStats = await chainAnalytics.getKenoStats();
          games.keno = kenoStats ? { rpc: 'ok' } : { rpc: 'ok' };
        } catch (err: any) {
          games.keno = { rpc: 'fail', error: err?.message || 'RPC failed' };
          morbius.keno = '0';
        }

        // Lottery: MORBIUS balance held by Lottery contract
        try {
          const balance = await readMorbiusBalance(LOTTERY_ADDRESS);
          morbius.lottery = balance.toString();
          const lotteryStats = await chainAnalytics.getLotteryStats();
          games.lottery = lotteryStats ? { rpc: 'ok' } : { rpc: 'ok' };
        } catch (err: any) {
          games.lottery = { rpc: 'fail', error: err?.message || 'RPC failed' };
          morbius.lottery = '0';
        }

        const contractAddresses: Record<string, string> = {
          blackjack: BLACKJACK_ADDRESS,
          plinko: PLINKO_ADDRESS,
          keno: KENO_ADDRESS,
          lottery: LOTTERY_ADDRESS,
        };
        sendJson(res, { api, ws, games, morbius, blackjackReservesByContract, contractAddresses });
      } catch (error) {
        logger.error('Error in admin health:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Admin: game config (key-value; min/max bet, fee %, feature flags)
    app.get('/api/admin/config', async (req, res) => {
      try {
        const config = await dbService.getAdminGameConfig();
        sendJson(res, config);
      } catch (error) {
        logger.error('Error fetching admin config:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.put('/api/admin/config', async (req, res) => {
      try {
        const body = req.body as Record<string, string> | { config?: Record<string, string> };
        const config = body?.config && typeof body.config === 'object' ? body.config : body;
        if (!config || typeof config !== 'object') {
          res.status(400).json({ error: 'Body must be { config: { key: value, ... } } or { key: value, ... }' });
          return;
        }
        for (const [key, value] of Object.entries(config)) {
          if (typeof key !== 'string' || key.length > 128) continue;
          await dbService.setAdminGameConfigKey(key, value == null ? '' : String(value));
        }
        const updated = await dbService.getAdminGameConfig();
        sendJson(res, updated);
      } catch (error) {
        logger.error('Error updating admin config:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Admin: chat moderation (delete message, list messages, blocked addresses)
    app.get('/api/admin/chat/messages', async (req, res) => {
      try {
        const roomId = (req.query.roomId as string)?.trim() || 'main';
        const beforeId = (req.query.beforeId as string)?.trim() || undefined;
        const limit = Math.min(Math.max(parseInt(String(req.query.limit || 100), 10) || 100, 1), 500);
        const messages = beforeId
          ? await dbService.getChatMessagesBeforeForAdmin(roomId, beforeId, limit)
          : await dbService.getRecentChatMessagesForAdmin(roomId, limit);
        const hasMore = messages.length === limit;
        sendJson(res, { roomId, messages, hasMore });
      } catch (error) {
        logger.error('Error fetching admin chat messages:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.delete('/api/admin/chat/messages/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const wallet = (req.headers['x-admin-wallet'] as string)?.trim();
        if (!wallet) {
          res.status(403).json({ error: 'Admin wallet required' });
          return;
        }
        const roomId = await dbService.deleteChatMessage(id, wallet);
        if (roomId == null) {
          res.status(404).json({ error: 'Message not found or already deleted' });
          return;
        }
        wsService.broadcastChatMessageDeleted(roomId, id);
        res.status(204).send();
      } catch (error) {
        logger.error('Error deleting chat message:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/admin/chat/blocked', async (req, res) => {
      try {
        const addresses = await dbService.getBlockedAddresses();
        sendJson(res, { addresses });
      } catch (error) {
        logger.error('Error fetching blocked addresses:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.post('/api/admin/chat/blocked', async (req, res) => {
      try {
        const address = (req.body?.address ?? req.body?.wallet_address) as string | undefined;
        const trimmed = address?.trim();
        if (!trimmed || !/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
          res.status(400).json({ error: 'Valid wallet address required (body: { address: "0x..." })' });
          return;
        }
        await dbService.addBlockedAddress(trimmed);
        const addresses = await dbService.getBlockedAddresses();
        sendJson(res, { addresses });
      } catch (error) {
        logger.error('Error adding blocked address:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.delete('/api/admin/chat/blocked/:address', async (req, res) => {
      try {
        const address = req.params.address?.trim();
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          res.status(400).json({ error: 'Valid wallet address required' });
          return;
        }
        await dbService.removeBlockedAddress(address);
        res.status(204).send();
      } catch (error) {
        logger.error('Error removing blocked address:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Admin: metrics aggregates + series for charts (range: 24h | 7d | 30d | all).
    // Includes: Blackjack (DB), Plinko/Keno/Lottery/BigWheel (chain), and Tournament metrics.
    // On any DB or serialization error we return 200 with zeros so the tab always loads; errors are logged.
    // Admin: Escrow oversight endpoints
    app.get('/api/admin/escrow/summary', async (req, res) => {
      try {
        const { getEscrowSummary } = await import('./utils/escrow-oversight');
        const summary = await getEscrowSummary();
        if (!summary) {
          return res.status(503).json({ error: 'Escrow not configured' });
        }
        sendJson(res, {
          ...summary,
          totalValueLocked: summary.totalValueLocked.toString(),
        });
      } catch (error) {
        logger.error('Error fetching escrow summary:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/admin/escrow/pools', async (req, res) => {
      try {
        const { getPoolsByDepositor, getActivePools, getPoolDetails } = await import('./utils/escrow-oversight');
        const depositor = req.query.depositor as `0x${string}` | undefined;
        const tournamentId = req.query.tournamentId as string | undefined;
        
        if (tournamentId) {
          const details = await getPoolDetails(tournamentId);
          if (!details) {
            return res.status(404).json({ error: 'Tournament pool not found' });
          }
          sendJson(res, {
            ...details,
            totalDeposited: details.totalDeposited.toString(),
            amountPaidOut: details.amountPaidOut.toString(),
            remainingBalance: details.remainingBalance.toString(),
            depositedAt: details.depositedAt.toString(),
          });
        } else if (depositor) {
          const pools = await getPoolsByDepositor(depositor);
          sendJson(res, pools.map(p => ({
            ...p,
            totalDeposited: p.totalDeposited.toString(),
            amountPaidOut: p.amountPaidOut.toString(),
            remainingBalance: p.remainingBalance.toString(),
            depositedAt: p.depositedAt.toString(),
          })));
        } else {
          const activePools = await getActivePools();
          sendJson(res, activePools.map(p => ({
            tournamentId: p.tournamentId,
            balance: p.balance.toString(),
          })));
        }
      } catch (error) {
        logger.error('Error fetching escrow pools:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/admin/escrow/tournament/:tournamentId', async (req, res) => {
      try {
        const { tournamentId } = req.params;
        const { getPoolDetails } = await import('./utils/escrow-oversight');
        const details = await getPoolDetails(tournamentId);
        if (!details) {
          return res.status(404).json({ error: 'Tournament pool not found' });
        }
        sendJson(res, {
          ...details,
          totalDeposited: details.totalDeposited.toString(),
          amountPaidOut: details.amountPaidOut.toString(),
          remainingBalance: details.remainingBalance.toString(),
          depositedAt: details.depositedAt.toString(),
        });
      } catch (error) {
        logger.error('Error fetching tournament escrow details:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/admin/metrics', async (req, res) => {
      const range = (req.query.range as string) || '24h';
      const validRange = ['24h', '7d', '30d', 'all'].includes(range) ? range : '24h';
      const zeroPayload = {
        range: validRange,
        // Blackjack metrics
        blackjack: {
          volume: '0',
          games: 0,
          activePlayers: 0,
          pnl: '0',
        },
        // Chain-based game metrics (all-time, not filtered by range)
        plinko: {
          totalDrops: '0',
          totalBallsSold: '0',
          totalRevenue: '0',
          totalPayouts: '0',
          contractReserve: '0',
        },
        keno: {
          totalWagered: '0',
          totalWon: '0',
          ticketCount: '0',
          activeRoundId: '0',
        },
        lottery: {
          totalTicketsEver: '0',
          totalCollected: '0',
          totalClaimed: '0',
        },
        bigWheel: {
          spins: '0',
          volume: '0',
          payouts: '0',
          contractBalance: '0',
        },
        // Tournament metrics
        tournaments: {
          totalTournaments: 0,
          activeTournaments: 0,
          completedTournaments: 0,
          totalEntries: 0,
          totalPrizePool: '0',
          totalBuyIns: '0',
        },
        series: [] as Array<{ period: string; volume: string; games: number }>,
      };
      try {
        if (!['24h', '7d', '30d', 'all'].includes(range)) {
          res.status(400).json({ error: 'Invalid range. Use 24h, 7d, 30d, or all' });
          return;
        }
        let aggregates: { volume: bigint; games: number; activePlayers: number; pnl: bigint; tournamentEntries: number };
        let tournamentMetrics: { totalTournaments: number; activeTournaments: number; completedTournaments: number; totalEntries: number; totalPrizePool: bigint; totalBuyIns: bigint };
        let series: Array<{ period: string; volume: string; games: number }>;
        let chainStats: { plinko: any; keno: any; lottery: any; bigWheel: any };
        try {
          [aggregates, tournamentMetrics, series, chainStats] = await Promise.all([
            dbService.getMetricsAggregates(range as '24h' | '7d' | '30d' | 'all'),
            dbService.getTournamentMetrics(range as '24h' | '7d' | '30d' | 'all'),
            dbService.getMetricsSeries(range as '24h' | '7d' | '30d' | 'all'),
            chainAnalytics.getAllChainStats(),
          ]);
        } catch (dbError) {
          logger.error('Admin metrics query failed', { error: dbError });
          sendJson(res, zeroPayload);
          return;
        }
        
        sendJson(res, {
          range,
          // Blackjack metrics
          blackjack: {
            volume: aggregates.volume.toString(),
            games: aggregates.games,
            activePlayers: aggregates.activePlayers,
            pnl: aggregates.pnl.toString(),
          },
          // Chain-based game metrics
          plinko: {
            totalDrops: chainStats.plinko?.totalDrops?.toString() ?? '0',
            totalBallsSold: chainStats.plinko?.totalBallsSold?.toString() ?? '0',
            totalRevenue: chainStats.plinko?.totalRevenue?.toString() ?? '0',
            totalPayouts: chainStats.plinko?.totalPayouts?.toString() ?? '0',
            contractReserve: chainStats.plinko?.contractReserve?.toString() ?? '0',
          },
          keno: {
            totalWagered: chainStats.keno?.totalWagered?.toString() ?? '0',
            totalWon: chainStats.keno?.totalWon?.toString() ?? '0',
            ticketCount: chainStats.keno?.ticketCount?.toString() ?? '0',
            activeRoundId: chainStats.keno?.activeRoundId?.toString() ?? '0',
          },
          lottery: {
            totalTicketsEver: chainStats.lottery?.totalTicketsEver?.toString() ?? '0',
            totalCollected: chainStats.lottery?.totalCollected?.toString() ?? '0',
            totalClaimed: chainStats.lottery?.totalClaimed?.toString() ?? '0',
          },
          bigWheel: {
            spins: chainStats.bigWheel?.spins?.toString() ?? '0',
            volume: chainStats.bigWheel?.volume?.toString() ?? '0',
            payouts: chainStats.bigWheel?.payouts?.toString() ?? '0',
            contractBalance: chainStats.bigWheel?.contractBalance?.toString() ?? '0',
          },
          // Tournament metrics
          tournaments: {
            totalTournaments: tournamentMetrics.totalTournaments,
            activeTournaments: tournamentMetrics.activeTournaments,
            completedTournaments: tournamentMetrics.completedTournaments,
            totalEntries: tournamentMetrics.totalEntries,
            totalPrizePool: tournamentMetrics.totalPrizePool.toString(),
            totalBuyIns: tournamentMetrics.totalBuyIns.toString(),
          },
          series,
        });
      } catch (error) {
        logger.error('Error in admin metrics:', error);
        sendJson(res, zeroPayload);
      }
    });

    // Withdraw prepare: server signs withdrawal approval (amount = min(DB balance, contract reserve))
    const withdrawPublicClient = createPublicClient({
      chain: pulsechain,
      transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
    });
    const blackjackContractAddress = process.env.BLACKJACK_CONTRACT_ADDRESS as `0x${string}` | undefined;
    if (!blackjackContractAddress) {
      throw new Error('BLACKJACK_CONTRACT_ADDRESS env var is required');
    }
    console.log('[Server] Using BLACKJACK_CONTRACT_ADDRESS:', blackjackContractAddress);
    const chainId = Number(process.env.BLACKJACK_CHAIN_ID || 369);
    console.log('[Server] Chain ID:', chainId);

    // Periodic cleanup of expired pending withdrawals (refund balances)
    setInterval(async () => {
      try {
        const expired = await dbService.expirePendingWithdrawals();
        if (expired > 0) {
          logger.info(`Expired ${expired} pending withdrawal(s) and refunded balances`);
        }
      } catch (err) {
        logger.error('Error expiring pending withdrawals:', err);
      }
    }, 60_000); // every minute

    app.post('/api/withdraw/prepare', async (req, res) => {
      try {
        const { address, requestedAmount } = req.body;

        if (!address || typeof address !== 'string') {
          return res.status(400).json({ error: 'Address required' });
        }

        const normalizedAddress = address.toLowerCase().startsWith('0x')
          ? address.toLowerCase()
          : `0x${address.toLowerCase()}`;

        if (normalizedAddress.length !== 42) {
          return res.status(400).json({ error: 'Invalid address' });
        }

        // Expire any pending withdrawal for this wallet (refund) so they can request a new one
        await dbService.expirePendingWithdrawalsForWallet(normalizedAddress);

        // Get database balance for this specific wallet
        const dbBalance = await dbService.getPlayerBalance(normalizedAddress);

        // Get contract reserve for this specific wallet
        const contractReserve = await withdrawPublicClient.readContract({
          address: blackjackContractAddress,
          abi: blackjackAbi,
          functionName: 'getPlayerReserve',
          args: [normalizedAddress as `0x${string}`],
        }) as bigint;

        // Cap withdrawal to minimum of: requested amount, DB balance, contract reserve
        const requested = requestedAmount != null ? BigInt(String(requestedAmount)) : dbBalance;
        const cap = dbBalance < contractReserve ? dbBalance : contractReserve;
        const amount = requested < cap ? requested : cap;

        if (amount < MIN_WITHDRAWAL_WEI) {
          return res.status(400).json({
            error: 'Insufficient withdrawable balance',
            dbBalance: dbBalance.toString(),
            contractReserve: contractReserve.toString(),
          });
        }

        const privateKey = process.env.SETTLEMENT_PRIVATE_KEY as `0x${string}`;
        if (!privateKey) {
          logger.error('SETTLEMENT_PRIVATE_KEY not set');
          return res.status(500).json({ error: 'Server configuration error' });
        }

        // Atomically deduct balance BEFORE signing (prevents stockpiling)
        try {
          await dbService.deductPlayerBalance(normalizedAddress, amount);
        } catch (deductErr) {
          return res.status(400).json({
            error: 'Insufficient balance for withdrawal',
            dbBalance: dbBalance.toString(),
          });
        }

        // Generate unique nonce using timestamp + random
        const nonce = BigInt(Date.now()) * BigInt(1e6) + BigInt(Math.floor(Math.random() * 1e6));

        // Track pending withdrawal (so we can refund on expiry)
        await dbService.createPendingWithdrawal(normalizedAddress, nonce, amount);

        const payload = await signWithdrawApproval(
          normalizedAddress,
          amount,
          nonce,
          blackjackContractAddress,
          chainId,
          privateKey
        );

        logger.info('Withdrawal prepared (balance deducted)', {
          address: normalizedAddress,
          amount: amount.toString(),
          dbBalance: dbBalance.toString(),
          contractReserve: contractReserve.toString(),
        });

        sendJson(res, payload);
      } catch (error) {
        logger.error('Error preparing withdrawal:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Start server
    server.listen(PORT, () => {
      logger.info(`Blackjack server running on port ${PORT}`);
      logger.info('WebSocket server initialized');
      logger.info('Database connected');
    });

  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Graceful shutdown (schedulers ref set in initializeServices)
let freerollScheduler: FreerollSchedulerService | null = null;
let tournamentScheduler: TournamentSchedulerService | null = null;

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  freerollScheduler?.stop();
  tournamentScheduler?.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  freerollScheduler?.stop();
  tournamentScheduler?.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Start the server
initializeServices().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});