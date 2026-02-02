import express from 'express';
import { WebSocketServer } from 'ws';
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
import { WebSocketService } from './services/websocket.service';
import { ChainAnalyticsService } from './services/chain-analytics.service';
import { logger } from './utils/logger';
import { signWithdrawApproval, MIN_WITHDRAWAL_WEI } from './utils/withdraw-sign';
import { blackjackAbi } from './abi/blackjack';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
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
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/src/server.ts:GET /api/player/:address/games',message:'player games request',data:{address:address?.slice(0,12)+'…',limit,offset},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        const games = await dbService.getPlayerGames(address, limit, offset);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/src/server.ts:GET /api/player/:address/games:response',message:'player games response',data:{gamesCount:games.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/src/server.ts:GET /api/game/:gameId/hands',message:'game hands request',data:{gameId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        const hands = await dbService.getGameHands(gameId);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/src/server.ts:GET /api/game/:gameId/hands:response',message:'game hands response',data:{gameId,handsCount:hands.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
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

    // Withdraw prepare: server signs withdrawal approval (amount = min(DB balance, contract reserve))
    const withdrawPublicClient = createPublicClient({
      chain: pulsechain,
      transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
    });
    const blackjackContractAddress = (process.env.BLACKJACK_CONTRACT_ADDRESS || '0xDe2c7a18de8a9d889E18874EA90A42f84FbaA080') as `0x${string}`;
    const chainId = Number(process.env.BLACKJACK_CHAIN_ID || 369);

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

        // Generate unique nonce using timestamp + random
        const nonce = BigInt(Date.now()) * BigInt(1e6) + BigInt(Math.floor(Math.random() * 1e6));

        const payload = await signWithdrawApproval(
          normalizedAddress,
          amount,
          nonce,
          blackjackContractAddress,
          chainId,
          privateKey
        );

        logger.info('Withdrawal prepared', {
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

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
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