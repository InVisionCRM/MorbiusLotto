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
import { WebSocketService } from './services/websocket.service';
import { ChainAnalyticsService } from './services/chain-analytics.service';
import { logger } from './utils/logger';
import { signWithdrawApproval, MIN_WITHDRAWAL_WEI } from './utils/withdraw-sign';
import { getPublicClient } from './utils/chain-client';
import { blackjackAbi } from './abi/blackjack';

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
  message: 'Too many requests from this IP, please try again later.'
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
        const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
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
          sort_order: r.sort_order,
          enabled: r.enabled,
        })));
      } catch (error) {
        logger.error('Error fetching blackjack tables:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Admin: Blackjack tables CRUD (requires x-admin-wallet in allowed list)
    app.get('/api/admin/tables', async (req, res) => {
      try {
        const enabledOnly = (req.query.enabledOnly as string) === 'true';
        const rows = await dbService.getBlackjackTables(enabledOnly);
        sendJson(res, rows);
      } catch (error) {
        logger.error('Error fetching admin blackjack tables:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.post('/api/admin/tables', async (req, res) => {
      try {
        const { kind, name, src, description, token_contract_address, sort_order, enabled } = req.body;
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
          sort_order: typeof sort_order === 'number' ? sort_order : 0,
          enabled: enabled !== false,
        });
        sendJson(res, row);
      } catch (error) {
        logger.error('Error creating blackjack table:', error);
        res.status(500).json({ error: 'Internal server error' });
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
        res.status(500).json({ error: 'Internal server error' });
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
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Admin: game health (API, WS, RPC, MORBIUS per contract, Blackjack reserves)
    app.get('/api/admin/health', async (req, res) => {
      try {
        const client = getPublicClient();
        const blackjackAddress = process.env.BLACKJACK_CONTRACT_ADDRESS as `0x${string}` | undefined;

        const api = 'ok';
        const ws = 'up'; // same process

        const games: Record<string, { rpc: 'ok' | 'fail'; error?: string }> = {};
        const morbius: Record<string, string> = {};
        let blackjackReserves: { totalMorbiusInContract: string; addressesWithReserve: Array<{ address: string; reserve: string }> } = { totalMorbiusInContract: '0', addressesWithReserve: [] };

        // Blackjack: MORBIUS balance of contract + sample of addresses with reserve > 0
        if (blackjackAddress) {
          try {
            const tokenAddress = await client.readContract({ address: blackjackAddress, abi: blackjackAbi, functionName: 'MORBIUS_TOKEN' }) as `0x${string}`;
            const balance = await client.readContract({ address: tokenAddress, abi: ERC20_BALANCE_OF_ABI, functionName: 'balanceOf', args: [blackjackAddress] }) as bigint;
            morbius.blackjack = balance.toString();
            games.blackjack = { rpc: 'ok' };

            const addresses = await dbService.getPlayerAddressesForReserveCheck(50);
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
            blackjackReserves = {
              totalMorbiusInContract: balance.toString(),
              addressesWithReserve: reserves.filter((r) => r.reserve > 0n).map((r) => ({ address: r.address, reserve: r.reserve.toString() })),
            };
          } catch (err: any) {
            games.blackjack = { rpc: 'fail', error: err?.message || 'RPC/contract read failed' };
            morbius.blackjack = '0';
          }
        } else {
          games.blackjack = { rpc: 'fail', error: 'BLACKJACK_CONTRACT_ADDRESS not set' };
        }

        // Plinko, Keno, Lottery (exclude Big Wheel per scope)
        try {
          const plinkoStats = await chainAnalytics.getPlinkoStats();
          games.plinko = plinkoStats ? { rpc: 'ok' } : { rpc: 'fail', error: 'No data' };
          morbius.plinko = plinkoStats?.contractReserve?.toString() ?? '0';
        } catch (err: any) {
          games.plinko = { rpc: 'fail', error: err?.message || 'RPC failed' };
          morbius.plinko = '0';
        }
        try {
          const kenoStats = await chainAnalytics.getKenoStats();
          games.keno = kenoStats ? { rpc: 'ok' } : { rpc: 'fail', error: 'No data' };
          morbius.keno = '0'; // Keno getGlobalStats doesn't expose reserve
        } catch (err: any) {
          games.keno = { rpc: 'fail', error: err?.message || 'RPC failed' };
          morbius.keno = '0';
        }
        try {
          const lotteryStats = await chainAnalytics.getLotteryStats();
          games.lottery = lotteryStats ? { rpc: 'ok' } : { rpc: 'fail', error: 'No data' };
          morbius.lottery = lotteryStats?.totalCollected?.toString() ?? '0';
        } catch (err: any) {
          games.lottery = { rpc: 'fail', error: err?.message || 'RPC failed' };
          morbius.lottery = '0';
        }

        sendJson(res, { api, ws, games, morbius, blackjackReserves });
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

    // Admin: metrics aggregates + series for charts (range: 24h | 7d | 30d | all)
    app.get('/api/admin/metrics', async (req, res) => {
      try {
        const range = (req.query.range as string) || '24h';
        if (!['24h', '7d', '30d', 'all'].includes(range)) {
          res.status(400).json({ error: 'Invalid range. Use 24h, 7d, 30d, or all' });
          return;
        }
        const [aggregates, series] = await Promise.all([
          dbService.getMetricsAggregates(range as '24h' | '7d' | '30d' | 'all'),
          dbService.getMetricsSeries(range as '24h' | '7d' | '30d' | 'all'),
        ]);
        sendJson(res, {
          range,
          volume: aggregates.volume.toString(),
          games: aggregates.games,
          activePlayers: aggregates.activePlayers,
          pnl: aggregates.pnl.toString(),
          tournamentEntries: aggregates.tournamentEntries,
          series,
        });
      } catch (error) {
        logger.error('Error in admin metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
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

        // Reject if player already has a pending (un-expired) withdrawal
        const existingPending = await dbService.getActivePendingWithdrawal(normalizedAddress);
        if (existingPending) {
          return res.status(409).json({
            error: 'A withdrawal is already pending. Submit or wait for it to expire (10 min).',
          });
        }

        // Expire any old pending withdrawals first (refunds balances)
        await dbService.expirePendingWithdrawals();

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

// Graceful shutdown (freerollScheduler ref set in initializeServices)
let freerollScheduler: FreerollSchedulerService | null = null;

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  freerollScheduler?.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  freerollScheduler?.stop();
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