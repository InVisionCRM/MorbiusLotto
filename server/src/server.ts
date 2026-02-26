import express from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { DatabaseService } from './services/database.service';
import { ProvablyFairService } from './services/provably-fair.service';
import { BlackjackGameService } from './services/blackjack-game.service';
import { TournamentService } from './services/tournament.service';
import { FreerollSchedulerService } from './services/freeroll-scheduler.service';
import { TournamentSchedulerService } from './services/tournament-scheduler.service';
import { WebSocketService } from './services/websocket.service';
import { PokerGameService } from './services/poker-game.service';
import { ChainAnalyticsService } from './services/chain-analytics.service';
import { MerkleDropsService } from './services/merkle-drops.service';
import { logger } from './utils/logger';
import { signWithdrawApproval, MIN_WITHDRAWAL_WEI } from './utils/withdraw-sign';
import { getPublicClient } from './utils/chain-client';
import { blackjackAbi } from './abi/blackjack';
import { PLINKO_ADDRESS, KENO_ADDRESS, LOTTERY_ADDRESS, BLACKJACK_ADDRESS, MORBIUS_TOKEN_ADDRESS, getAllBlackjackContracts } from './config/contracts';

const ERC20_BALANCE_OF_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

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
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
}));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // Allow any localhost origin in development
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
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

// Uploaded files: serve from uploads/ (relative to process cwd when running from dist/)
const uploadsDir = path.join(process.cwd(), 'uploads');
const brandedTableDir = path.join(uploadsDir, 'BlackJack', 'BrandedTable');
const videoTableDir = path.join(uploadsDir, 'BlackJack', 'video table');
[brandedTableDir, videoTableDir].forEach((d) => {
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch {
    // ignore if exists or permission error
  }
});
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

const ALLOWED_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO = ['video/mp4', 'video/webm'];
const MAX_SIZE_IMAGE = 5 * 1024 * 1024;
const MAX_SIZE_VIDEO = 50 * 1024 * 1024;

const uploadStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    const kind = (file.mimetype || '').startsWith('video/') ? 'video' : 'image';
    cb(null, kind === 'video' ? videoTableDir : brandedTableDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || (file.mimetype?.startsWith('video/') ? '.mp4' : '.png');
    const base = path.basename(file.originalname, path.extname(file.originalname));
    const safe = `${base.replace(/[^a-zA-Z0-9-_]/g, '_')}_${Date.now()}${ext}`;
    cb(null, safe);
  },
});

const uploadMulter = multer({
  storage: uploadStorage,
  limits: { fileSize: MAX_SIZE_VIDEO },
  fileFilter: (_req, file, cb) => {
    const allowed = file.mimetype?.startsWith('video/') ? ALLOWED_VIDEO : ALLOWED_IMAGE;
    if (!allowed.includes(file.mimetype || '')) {
      cb(new Error(`Invalid type. Allowed: ${allowed.join(', ')}`));
      return;
    }
    cb(null, true);
  },
});

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

// In-memory TTL cache for read-heavy analytics routes (30–60s to reduce DB/RPC load)
const ANALYTICS_CACHE_TTL_MS = Number(process.env.ANALYTICS_CACHE_TTL_MS) || 60_000;
const analyticsCache = new Map<string, { data: any; expiresAt: number }>();
function getAnalyticsCacheKey(path: string, query: Record<string, string | undefined>): string {
  const q = Object.keys(query)
    .filter((k) => query[k] != null)
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join('&');
  return q ? `${path}?${q}` : path;
}
function getCachedAnalytics(key: string): any | null {
  const entry = analyticsCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data;
}
function setCachedAnalytics(key: string, data: any): void {
  analyticsCache.set(key, { data, expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize services
async function initializeServices() {
  try {
    // Start HTTP server immediately so /health responds during init (avoids Railway health-check timeout)
    server.listen(PORT, () => {
      logger.info(`Blackjack server running on port ${PORT}`);
    });

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

    // Initialize poker game service
    const pokerGameService = new PokerGameService(dbService, pfService);
    const existingTables = await pokerGameService.listTables();
    if (existingTables.length === 0) {
      await pokerGameService.createTable(10n, 20n, 6);
      logger.info('Poker: created default table (10/20, 6 seats)');
    }

    // Initialize WebSocket service
    const wsService = new WebSocketService(server, gameService, dbService, tournamentService, pokerGameService);

    // Freeroll scheduler (polls pending scheduled events: start, end)
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
    const chainAnalytics = new ChainAnalyticsService(dbService);

    // Merkle drops service (MORBIUS holder epoch rewards)
    merkleDropsService = new MerkleDropsService(dbService.getPool());
    if (process.env.MERKLE_DROP_CRON_ENABLED === 'true') {
      merkleDropsService.startCron();
    }

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
      const cacheKey = getAnalyticsCacheKey('/api/analytics/platform', {});
      const cached = getCachedAnalytics(cacheKey);
      if (cached != null) {
        return sendJson(res, cached);
      }
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
        const payload = {
          blackjack,
          plinko: chain.plinko,
          keno: chain.keno,
          lottery: chain.lottery,
          bigWheel: chain.bigWheel,
          combined,
        };
        setCachedAnalytics(cacheKey, payload);
        sendJson(res, payload);
      } catch (error) {
        logger.error('Error fetching platform analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Public: recent Blackjack wins (for Latest Wins feed)
    app.get('/api/analytics/recent-wins', async (req, res) => {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const cacheKey = getAnalyticsCacheKey('/api/analytics/recent-wins', { limit: String(limit) });
      const cached = getCachedAnalytics(cacheKey);
      if (cached != null) {
        return sendJson(res, cached);
      }
      try {
        const wins = await dbService.getRecentGlobalWins(limit);
        const payload = { wins };
        setCachedAnalytics(cacheKey, payload);
        sendJson(res, payload);
      } catch (error) {
        logger.error('Error fetching recent wins:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Public: metrics time-series for charts (24h hourly, 7d/30d/all daily)
    app.get('/api/analytics/series', async (req, res) => {
      const range = ((req.query.range as string) || '24h') as '24h' | '7d' | '30d' | 'all';
      if (!['24h', '7d', '30d', 'all'].includes(range)) {
        res.status(400).json({ error: 'Invalid range. Use 24h, 7d, 30d, or all' });
        return;
      }
      const cacheKey = getAnalyticsCacheKey('/api/analytics/series', { range });
      const cached = getCachedAnalytics(cacheKey);
      if (cached != null) {
        return sendJson(res, cached);
      }
      try {
        const series = await dbService.getMetricsSeries(range);
        const payload = { range, series };
        setCachedAnalytics(cacheKey, payload);
        sendJson(res, payload);
      } catch (error) {
        logger.error('Error fetching metrics series:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Public: global metrics aggregates (wagered, won, deposited, withdrawn) with time range filtering
    app.get('/api/analytics/global-metrics', async (req, res) => {
      const range = ((req.query.range as string) || '24h') as '24h' | '7d' | '30d' | 'all';
      if (!['24h', '7d', '30d', 'all'].includes(range)) {
        res.status(400).json({ error: 'Invalid range. Use 24h, 7d, 30d, or all' });
        return;
      }
      const cacheKey = getAnalyticsCacheKey('/api/analytics/global-metrics', { range });
      const cached = getCachedAnalytics(cacheKey);
      if (cached != null) {
        return sendJson(res, cached);
      }
      try {
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

        // Deposits and withdrawals: from DB-derived totals (updated on withdraw; deposits incremental from chain)
        const { totalDeposited, totalWithdrawn } = await chainAnalytics.getBlackjackDepositWithdrawTotals();

        const payload = {
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
        };
        setCachedAnalytics(cacheKey, payload);
        sendJson(res, payload);
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

    const ensureProtocol = (url: string) => {
      if (!url) return url;
      if (/^https?:\/\//.test(url) || url.startsWith('/')) return url;
      return `https://${url}`;
    };

    // Public: Blackjack table list (for picker; enabled only)
    app.get('/api/blackjack/tables', async (req, res) => {
      try {
        const enabledOnly = (req.query.enabledOnly as string) !== 'false';
        const rows = await dbService.getBlackjackTables(enabledOnly);
        sendJson(res, rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          name: r.name,
          src: ensureProtocol(r.src),
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

    app.post('/api/admin/upload', (req, res, next) => {
      uploadMulter.single('file')(req, res, (err: unknown) => {
        if (err) {
          logger.error('Admin upload multer error:', err);
          const msg = err instanceof Error ? err.message : 'Upload failed';
          res.status(400).json({ error: msg });
          return;
        }
        next();
      });
    }, (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: 'Missing or invalid file' });
          return;
        }
        const kind = (req.body?.kind as string)?.toLowerCase() || (req.file.mimetype?.startsWith('video/') ? 'video' : 'image');
        let baseUrl = (process.env.BACKEND_PUBLIC_URL || process.env.RAILWAY_STATIC_URL || '').trim()
          || `${req.protocol}://${req.get('host') || 'localhost'}`;
        if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
          baseUrl = `https://${baseUrl}`;
        }
        const relPath = kind === 'video'
          ? `BlackJack/video%20table/${encodeURIComponent(req.file.filename)}`
          : `BlackJack/BrandedTable/${encodeURIComponent(req.file.filename)}`;
        const fullUrl = `${baseUrl.replace(/\/$/, '')}/uploads/${relPath}`;
        sendJson(res, { path: fullUrl });
      } catch (err) {
        logger.error('Admin upload error:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save file' });
      }
    });

    app.get('/api/admin/tables', async (req, res) => {
      try {
        const enabledOnly = (req.query.enabledOnly as string) === 'true';
        const rows = await dbService.getBlackjackTables(enabledOnly);
        sendJson(res, rows.map((r: any) => ({ ...r, src: ensureProtocol(r.src) })));
      } catch (error) {
        logger.error('Error fetching admin blackjack tables:', error);
        const msg = dbSchemaError(error);
        res.status(msg ? 503 : 500).json({ error: msg || 'Internal server error' });
      }
    });

    app.post('/api/admin/tables/seed', async (req, res) => {
      try {
        const { tables } = req.body;
        if (!Array.isArray(tables) || tables.length === 0) {
          res.status(400).json({ error: 'Body must include tables array with at least one item' });
          return;
        }
        let inserted = 0;
        for (const t of tables) {
          const kind = t.kind;
          const name = t.name;
          const src = t.src;
          if (!kind || !name || !src || (kind !== 'image' && kind !== 'video')) continue;
          const exists = await dbService.hasBlackjackTableByKindSrc(kind, src);
          if (exists) continue;
          await dbService.createBlackjackTable({
            kind,
            name: String(name).trim(),
            src: String(src).trim(),
            description: null,
            token_contract_address: null,
            logo_url: null,
            ticker: null,
            iframe_url: null,
            website_url: null,
            sort_order: inserted,
            enabled: true,
          });
          inserted++;
        }
        sendJson(res, { inserted, total: tables.length });
      } catch (error) {
        logger.error('Error seeding blackjack tables:', error);
        const msg = dbSchemaError(error);
        res.status(msg ? 503 : 500).json({ error: msg || 'Internal server error' });
      }
    });

    app.post('/api/admin/tables', async (req, res) => {
      try {
        const { kind, name, src, description, token_contract_address, logo_url, ticker, iframe_url, website_url, sort_order, enabled } = req.body;
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
          website_url: website_url ?? null,
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
          website_url: updates.website_url,
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
          const detailed = await Promise.all(
            activePools.map(async (p) => {
              try {
                const details = await getPoolDetails(p.tournamentId);
                if (details) {
                  return {
                    ...details,
                    totalDeposited: details.totalDeposited.toString(),
                    amountPaidOut: details.amountPaidOut.toString(),
                    remainingBalance: details.remainingBalance.toString(),
                    depositedAt: details.depositedAt.toString(),
                  };
                }
              } catch { /* fall through */ }
              return {
                tournamentId: p.tournamentId,
                token: null,
                depositor: null,
                totalDeposited: '0',
                amountPaidOut: '0',
                remainingBalance: p.balance.toString(),
                depositedAt: '0',
                cancelled: false,
                ageDays: 0,
              };
            })
          );
          sendJson(res, detailed);
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

    // ── User Reports ──────────────────────────────────────────────────────────

    // Simple in-memory rate limit for unauthenticated reporters (by IP)
    const anonReportCounts = new Map<string, { count: number; resetAt: number }>();

    app.post('/api/reports', async (req, res) => {
      try {
        const { walletAddress, category, description, pageUrl, userAgent, balanceSnapshot, recentErrors } = req.body;

        const VALID_CATEGORIES = ['Balance Issue', 'Game Bug', 'Transaction Failed', 'Other'];
        if (!category || !VALID_CATEGORIES.includes(category)) {
          return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
        }
        if (!description || typeof description !== 'string' || description.trim().length < 5) {
          return res.status(400).json({ error: 'description must be at least 5 characters' });
        }
        if (description.length > 2000) {
          return res.status(400).json({ error: 'description must be 2000 characters or fewer' });
        }

        // Rate limit: 5 reports per hour per wallet (if connected)
        if (walletAddress && typeof walletAddress === 'string') {
          const recent = await dbService.getRecentReportCountByWallet(walletAddress, 60);
          if (recent >= 5) {
            return res.status(429).json({ error: 'Too many reports. Please wait before submitting another.' });
          }
        } else {
          // No wallet — rate limit by IP (in-memory, resets per hour)
          const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
          const now = Date.now();
          const entry = anonReportCounts.get(ip);
          if (entry && now < entry.resetAt) {
            if (entry.count >= 3) {
              return res.status(429).json({ error: 'Too many reports. Please wait before submitting another.' });
            }
            entry.count++;
          } else {
            anonReportCounts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
          }
        }

        const id = await dbService.createReport({
          walletAddress: walletAddress || undefined,
          category,
          description: description.trim(),
          pageUrl: typeof pageUrl === 'string' ? pageUrl.slice(0, 500) : undefined,
          userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : undefined,
          balanceSnapshot: balanceSnapshot != null ? BigInt(String(balanceSnapshot)) : undefined,
          recentErrors: Array.isArray(recentErrors) ? recentErrors.slice(0, 20) : undefined,
        });

        logger.info('User report submitted', { id, category, walletAddress: walletAddress || null });
        return res.status(201).json({ ok: true, id });
      } catch (error) {
        logger.error('Error creating user report:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/admin/reports', async (req, res) => {
      try {
        const status = (req.query.status as string) || undefined;
        const limit = Math.min(Math.max(parseInt(String(req.query.limit || 200), 10) || 200, 1), 500);
        const reports = await dbService.getReports(status, limit);
        sendJson(res, reports);
      } catch (error) {
        logger.error('Error fetching user reports:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.patch('/api/admin/reports/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status || !['read', 'resolved'].includes(status)) {
          return res.status(400).json({ error: 'status must be "read" or "resolved"' });
        }
        const updated = await dbService.updateReportStatus(id, status as 'read' | 'resolved');
        if (!updated) return res.status(404).json({ error: 'Report not found' });
        return res.status(200).json({ ok: true });
      } catch (error) {
        logger.error('Error updating report status:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Player transaction history (deposits + withdrawals)
    app.get('/api/players/:address/transactions', async (req, res) => {
      try {
        const { address } = req.params;
        if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
          return res.status(400).json({ error: 'Invalid wallet address' });
        }
        const limit = Math.min(Math.max(parseInt(String(req.query.limit || 50), 10) || 50, 1), 200);
        const offset = Math.max(parseInt(String(req.query.offset || 0), 10) || 0, 0);
        const transactions = await dbService.getPlayerTransactionHistory(address, limit, offset);
        return res.status(200).json(transactions);
      } catch (error) {
        logger.error('Error fetching player transactions:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Deposit notify: frontend calls this immediately after a deposit tx is confirmed so it
    // appears in history right away (before the next chain-analytics scan picks it up).
    // Amount and player come from the frontend; tx hash is trusted as display-only data.
    app.post('/api/deposit/notify', async (req, res) => {
      try {
        const { walletAddress, txHash, amount } = req.body;
        if (!walletAddress || typeof walletAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
          return res.status(400).json({ error: 'Invalid wallet address' });
        }
        if (!txHash || typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
          return res.status(400).json({ error: 'Invalid tx hash' });
        }
        if (!amount || typeof amount !== 'string') {
          return res.status(400).json({ error: 'Amount required' });
        }
        let amountBigInt: bigint;
        try { amountBigInt = BigInt(amount); } catch { return res.status(400).json({ error: 'Invalid amount' }); }
        if (amountBigInt <= 0n) return res.status(400).json({ error: 'Amount must be positive' });
        await dbService.logDeposit(walletAddress, amountBigInt, txHash, null);
        return res.status(200).json({ ok: true });
      } catch (error) {
        logger.error('Error in deposit/notify:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Withdraw prepare: server signs withdrawal approval (amount = min(DB balance, contract reserve))
    const publicClient = getPublicClient();
    const blackjackContractAddress = process.env.BLACKJACK_CONTRACT_ADDRESS as `0x${string}` | undefined;
    if (!blackjackContractAddress) {
      throw new Error('BLACKJACK_CONTRACT_ADDRESS env var is required');
    }
    console.log('[Server] Using BLACKJACK_CONTRACT_ADDRESS:', blackjackContractAddress);
    const chainId = Number(process.env.BLACKJACK_CHAIN_ID || 369);
    console.log('[Server] Chain ID:', chainId);

    // Minimal ABI for checking usedNonces on the Blackjack contract
    const USED_NONCES_ABI = [
      {
        inputs: [{ name: '', type: 'uint256' }],
        name: 'usedNonces',
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
    ] as const;

    // Periodic cleanup of expired pending withdrawals.
    // CRITICAL: Before refunding a pending withdrawal, check on-chain whether the nonce
    // was actually used (meaning the withdrawal DID succeed on-chain). If it was used,
    // mark it completed instead of expired — do NOT refund the DB balance.
    setInterval(async () => {
      try {
        const expired = await dbService.getExpiredPendingWithdrawals();
        if (expired.length === 0) return;

        let refundedCount = 0;
        let completedCount = 0;

        for (const row of expired) {
          try {
            // Check on-chain if this nonce was actually used (withdrawal succeeded)
            const nonceUsed = await publicClient.readContract({
              address: blackjackContractAddress,
              abi: USED_NONCES_ABI,
              functionName: 'usedNonces',
              args: [BigInt(row.nonce)],
            }) as boolean;

            if (nonceUsed) {
              // Withdrawal DID happen on-chain — mark completed, do NOT refund
              await dbService.markPendingWithdrawalCompleted(row.wallet_address, BigInt(row.nonce));
              completedCount++;
              logger.warn('Expired pending withdrawal was actually completed on-chain — marked completed (no refund)', {
                address: row.wallet_address,
                nonce: row.nonce,
                amount: row.amount,
              });
            } else {
              // Withdrawal did NOT happen on-chain — safe to refund
              await dbService.expireSinglePendingWithdrawal(row.wallet_address, BigInt(row.nonce), BigInt(row.amount));
              refundedCount++;
            }
          } catch (rpcErr) {
            // If we can't verify on-chain, do NOT refund — err on the side of caution.
            // The withdrawal will stay pending and be re-checked next cycle.
            logger.error('Failed to check nonce on-chain for pending withdrawal — skipping (will retry)', {
              address: row.wallet_address,
              nonce: row.nonce,
              error: rpcErr instanceof Error ? rpcErr.message : String(rpcErr),
            });
          }
        }

        if (refundedCount > 0) {
          logger.info(`Expired ${refundedCount} pending withdrawal(s) and refunded balances`);
        }
        if (completedCount > 0) {
          logger.info(`Marked ${completedCount} pending withdrawal(s) as completed (on-chain nonce used, no refund)`);
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

        // Do NOT refund existing pending here — that allows double withdrawal. Only allow one pending at a time.
        const existingPending = await dbService.getActivePendingWithdrawal(normalizedAddress);
        if (existingPending) {
          return res.status(409).json({
            error: 'You have a pending withdrawal. Wait for it to complete (or 2 minutes for it to expire) before requesting another.',
          });
        }

        // Get database balance for this specific wallet
        const dbBalance = await dbService.getPlayerBalance(normalizedAddress);

        // Get contract reserve for this specific wallet
        const contractReserve = await publicClient.readContract({
          address: blackjackContractAddress,
          abi: blackjackAbi,
          functionName: 'getPlayerReserve',
          args: [normalizedAddress as `0x${string}`],
        }) as bigint;

        // Cap withdrawal to DB balance only. Contract supports off-chain payouts (house bankroll)
        // and enforces daily limits (1M per user, 10M global); liquidity is operator's responsibility.
        const requested = requestedAmount != null ? BigInt(String(requestedAmount)) : dbBalance;
        const amount = requested < dbBalance ? requested : dbBalance;

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

        // Generate unique nonce using timestamp + random
        const nonce = BigInt(Date.now()) * BigInt(1e6) + BigInt(Math.floor(Math.random() * 1e6));

        // Atomically deduct balance AND create pending withdrawal record in one transaction.
        // If either step fails (e.g. insufficient balance or DB error), both are rolled back —
        // preventing permanent balance loss from a partial failure between the two operations.
        try {
          await dbService.deductAndCreatePendingWithdrawal(normalizedAddress, nonce, amount);
        } catch (deductErr) {
          return res.status(400).json({
            error: 'Insufficient balance for withdrawal',
            dbBalance: dbBalance.toString(),
          });
        }

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

    app.post('/api/withdraw/confirm', async (req, res) => {
      try {
        const { address, nonce } = req.body;
        if (!address || typeof address !== 'string') {
          return res.status(400).json({ error: 'Address required' });
        }
        if (nonce == null || (typeof nonce !== 'string' && typeof nonce !== 'number')) {
          return res.status(400).json({ error: 'Nonce required' });
        }
        const normalizedAddress = address.toLowerCase().startsWith('0x')
          ? address.toLowerCase()
          : `0x${address.toLowerCase()}`;
        if (normalizedAddress.length !== 42) {
          return res.status(400).json({ error: 'Invalid address' });
        }
        const nonceBigInt = BigInt(String(nonce));
        const { txHash } = req.body;
        const validTxHash = (typeof txHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(txHash)) ? txHash : undefined;
        const updated = await dbService.markPendingWithdrawalCompleted(normalizedAddress, nonceBigInt, validTxHash);
        if (updated) {
          logger.info('Withdrawal confirmed (on-chain tx completed)', { address: normalizedAddress, nonce: nonceBigInt.toString() });
        }
        return res.status(200).json({ ok: true });
      } catch (error) {
        logger.error('Error confirming withdrawal:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Merkle Drop routes — public
    // ─────────────────────────────────────────────────────────────────────────

    // List all published epochs
    app.get('/api/merkle/epochs', async (req, res) => {
      try {
        const epochs = await merkleDropsService!.listPublishedEpochs();
        sendJson(res, epochs);
      } catch (error) {
        logger.error('Error listing merkle epochs:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get claim proof for a wallet in a specific epoch
    app.get('/api/merkle/claim/:epochNumber/:walletAddress', async (req, res) => {
      try {
        const epochNumber = parseInt(req.params.epochNumber, 10);
        const { walletAddress } = req.params;
        if (isNaN(epochNumber) || epochNumber < 1) {
          res.status(400).json({ error: 'Invalid epoch number' });
          return;
        }
        if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
          res.status(400).json({ error: 'Invalid wallet address' });
          return;
        }
        const proof = await merkleDropsService!.getClaimProof(epochNumber, walletAddress);
        if (!proof) {
          res.status(404).json({ error: 'No claim found for this wallet in this epoch' });
          return;
        }
        sendJson(res, proof);
      } catch (error) {
        logger.error('Error fetching merkle claim proof:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Public schedule info (non-sensitive — just the next drop time)
    app.get('/api/merkle/schedule', async (_req, res) => {
      try {
        const s = await merkleDropsService!.getSettings();
        const type = s.schedule_type as string;
        let next_drop_at: string | null = null;

        if (type !== 'manual') {
          const now  = new Date();

          if (type === 'interval_minutes' || type === 'interval_hours') {
            const interval = parseInt(s.schedule_interval ?? '60', 10) || 1;
            const intervalMs = type === 'interval_minutes'
              ? interval * 60_000
              : interval * 3_600_000;
            const nextMs = Math.ceil(now.getTime() / intervalMs) * intervalMs;
            const next = new Date(nextMs <= now.getTime() ? nextMs + intervalMs : nextMs);
            next_drop_at = next.toISOString();
          } else {
            const day  = parseInt(s.schedule_day, 10);
            const hour = parseInt(s.schedule_hour_utc, 10);
            const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));

            if (type === 'weekly' || type === 'biweekly') {
              let daysAhead = day - now.getUTCDay();
              if (daysAhead < 0 || (daysAhead === 0 && now.getUTCHours() >= hour)) daysAhead += 7;
              if (type === 'biweekly' && daysAhead < 7) daysAhead += 7;
              next.setUTCDate(now.getUTCDate() + daysAhead);
            } else if (type === 'monthly') {
              next.setUTCDate(day);
              if (next <= now) {
                next.setUTCMonth(next.getUTCMonth() + 1);
                next.setUTCDate(day);
              }
            }
            next_drop_at = next.toISOString();
          }
        }

        sendJson(res, { schedule_type: type, next_drop_at });
      } catch (error) {
        logger.error('Error fetching merkle schedule:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Merkle Drop routes — admin (protected by x-admin-wallet middleware)
    // ─────────────────────────────────────────────────────────────────────────

    // List all epochs
    app.get('/api/admin/merkle/epochs', async (req, res) => {
      try {
        const epochs = await merkleDropsService!.listEpochs();
        sendJson(res, epochs);
      } catch (error) {
        logger.error('Error listing admin merkle epochs:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Create new epoch + auto-snapshot
    app.post('/api/admin/merkle/epoch/create', async (req, res) => {
      try {
        const { minHoldingThreshold, snapshotBlock } = req.body as {
          minHoldingThreshold?: number;
          snapshotBlock?: number;
        };
        const epoch = await merkleDropsService!.createEpoch({
          minHoldingThreshold: minHoldingThreshold ?? 1000,
          snapshotBlock,
        });
        sendJson(res, epoch);
      } catch (error) {
        logger.error('Error creating merkle epoch:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // Get single epoch
    app.get('/api/admin/merkle/epoch/:epochId', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        const epoch = await merkleDropsService!.getEpoch(epochId);
        if (!epoch) { res.status(404).json({ error: 'Epoch not found' }); return; }
        sendJson(res, epoch);
      } catch (error) {
        logger.error('Error fetching merkle epoch:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Re-run snapshot for an epoch (overwrites existing)
    app.post('/api/admin/merkle/epoch/:epochId/snapshot', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        const { snapshotBlock } = req.body as { snapshotBlock?: number };
        await merkleDropsService!.takeSnapshot(epochId, snapshotBlock);
        const epoch = await merkleDropsService!.getEpoch(epochId);
        sendJson(res, epoch);
      } catch (error) {
        logger.error('Error running merkle snapshot:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // Calculate rewards
    app.post('/api/admin/merkle/epoch/:epochId/calculate', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        // Accept newRewardAmount (preferred) or totalRewardAmount (legacy)
        const body = req.body as { newRewardAmount?: string; totalRewardAmount?: string };
        const newRewardAmount = body.newRewardAmount || body.totalRewardAmount;
        if (!newRewardAmount) {
          res.status(400).json({ error: 'newRewardAmount (wei string) required' });
          return;
        }
        await merkleDropsService!.calculateRewards(epochId, newRewardAmount);
        const epoch = await merkleDropsService!.getEpoch(epochId);
        sendJson(res, epoch);
      } catch (error) {
        logger.error('Error calculating merkle rewards:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // Generate Merkle tree + finalize
    app.post('/api/admin/merkle/epoch/:epochId/finalize', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        const root = await merkleDropsService!.generateMerkleTree(epochId);
        const epoch = await merkleDropsService!.getEpoch(epochId);
        sendJson(res, { root, epoch });
      } catch (error) {
        logger.error('Error finalizing merkle epoch:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // Mark as published (admin has set root on-chain)
    app.post('/api/admin/merkle/epoch/:epochId/publish', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        await merkleDropsService!.markPublished(epochId);
        const epoch = await merkleDropsService!.getEpoch(epochId);
        sendJson(res, epoch);
      } catch (error) {
        logger.error('Error publishing merkle epoch:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // Revoke epoch — reset status to finalized after on-chain revokeEpoch()
    app.post('/api/admin/merkle/epoch/:epochId/revoke', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        await merkleDropsService!.revokeEpoch(epochId);
        const epoch = await merkleDropsService!.getEpoch(epochId);
        sendJson(res, epoch);
      } catch (error) {
        logger.error('Error revoking merkle epoch:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // Paginated snapshot view
    app.get('/api/admin/merkle/epoch/:epochId/snapshot', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        const page = Math.max(1, parseInt(String(req.query.page || 1), 10));
        const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || 50), 10)));
        const data = await merkleDropsService!.getSnapshotPage(epochId, page, pageSize);
        sendJson(res, data);
      } catch (error) {
        logger.error('Error fetching snapshot page:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Blocklist CRUD
    app.get('/api/admin/merkle/blocklist', async (req, res) => {
      try {
        const list = await merkleDropsService!.listBlocklist();
        sendJson(res, list);
      } catch (error) {
        logger.error('Error listing blocklist:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.post('/api/admin/merkle/blocklist', async (req, res) => {
      try {
        const { address, reason } = req.body as { address?: string; reason?: string };
        if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
          res.status(400).json({ error: 'Valid 0x address required' });
          return;
        }
        await merkleDropsService!.addToBlocklist(address, reason ?? '');
        res.status(200).json({ ok: true });
      } catch (error) {
        logger.error('Error adding to blocklist:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.delete('/api/admin/merkle/blocklist/:address', async (req, res) => {
      try {
        const { address } = req.params;
        if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
          res.status(400).json({ error: 'Invalid address' });
          return;
        }
        await merkleDropsService!.removeFromBlocklist(address);
        res.status(200).json({ ok: true });
      } catch (error) {
        logger.error('Error removing from blocklist:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Merkle drop schedule & default reward settings
    app.get('/api/admin/merkle/settings', async (_req, res) => {
      try {
        const settings = await merkleDropsService!.getSettings();
        sendJson(res, settings);
      } catch (error) {
        logger.error('Error fetching merkle settings:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    app.post('/api/admin/merkle/settings', async (req, res) => {
      try {
        const allowed = new Set(['schedule_type', 'schedule_day', 'schedule_hour_utc', 'schedule_interval', 'default_reward_wei', 'auto_publish_onchain']);
        const patch: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.body as Record<string, unknown>)) {
          if (allowed.has(k) && typeof v === 'string') patch[k] = v;
        }
        if (Object.keys(patch).length === 0) {
          res.status(400).json({ error: 'No valid settings keys provided' });
          return;
        }
        await merkleDropsService!.updateSettings(patch);
        const updated = await merkleDropsService!.getSettings();
        sendJson(res, updated);
      } catch (error) {
        logger.error('Error updating merkle settings:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    logger.info('WebSocket server initialized');
    logger.info('Database connected');

  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Graceful shutdown (schedulers ref set in initializeServices)
let freerollScheduler: FreerollSchedulerService | null = null;
let tournamentScheduler: TournamentSchedulerService | null = null;
let merkleDropsService: MerkleDropsService | null = null;

const PG_POOL_DOUBLE_RELEASE_MSG = 'Release called on client which has already been released to the pool';

process.on('uncaughtException', (err) => {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes(PG_POOL_DOUBLE_RELEASE_MSG)) {
    logger.warn('pg-pool double-release (known race under load/disconnect) — ignoring', {
      stack: err instanceof Error ? err.stack : undefined,
    });
    return;
  }
  console.error('[FATAL] Uncaught exception — keeping server alive:', err);
  logger.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.includes(PG_POOL_DOUBLE_RELEASE_MSG)) {
    logger.warn('pg-pool double-release (unhandled rejection) — ignoring', {
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    return;
  }
  console.error('[FATAL] Unhandled rejection — keeping server alive:', reason);
  logger.error('Unhandled rejection:', reason);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  freerollScheduler?.stop();
  tournamentScheduler?.stop();
  merkleDropsService?.stopCron();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  freerollScheduler?.stop();
  tournamentScheduler?.stop();
  merkleDropsService?.stopCron();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Start the server
initializeServices().catch((error) => {
  console.error('[FATAL] Failed to start server:', error);
  logger.error('Failed to start server:', error);
  process.exit(1);
});