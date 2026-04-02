import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { ChainAnalyticsService } from '../services/chain-analytics.service';
import { DatabaseService } from '../services/database.service';
import { InstantLotteryService } from '../services/instant-lottery.service';
import { WebSocketService } from '../services/websocket.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterPlatformRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  chainAnalytics: ChainAnalyticsService;
  wsService: WebSocketService;
  instantLotteryService: InstantLotteryService;
  getAnalyticsCacheKey: (path: string, query: Record<string, string | undefined>) => string;
  getCachedAnalytics: (key: string) => any | null;
  setCachedAnalytics: (key: string, data: any) => void;
}

export function registerPlatformRoutes({
  app,
  dbService,
  chainAnalytics,
  wsService,
  instantLotteryService,
  getAnalyticsCacheKey,
  getCachedAnalytics,
  setCachedAnalytics,
}: RegisterPlatformRoutesOptions): void {
  app.get('/api/tips/stats', async (_req, res) => {
    try {
      const pool = dbService.getPool();
      const tipAgg = await pool.query<{ total_wei: string; tip_count: string }>(
        `SELECT COALESCE(SUM((payload->>'amount')::numeric), 0)::text AS total_wei,
                COUNT(*)::text AS tip_count
         FROM blackjack_multi_audit_log WHERE action_type = 'tip_dealer'`,
      );
      const tipByPlayer = await pool.query<{ player_address: string; total_wei: string; cnt: string; display_name: string | null }>(
        `SELECT a.player_address,
                SUM((a.payload->>'amount')::numeric)::text AS total_wei,
                COUNT(*)::text AS cnt,
                p.display_name
         FROM blackjack_multi_audit_log a
         LEFT JOIN player_profiles p ON LOWER(p.wallet_address) = LOWER(a.player_address)
         WHERE a.action_type = 'tip_dealer'
         GROUP BY a.player_address, p.display_name
         ORDER BY SUM((a.payload->>'amount')::numeric) DESC LIMIT 20`,
      );
      sendJson(res, {
        totalTipAmountWei: tipAgg.rows[0]?.total_wei ?? '0',
        tipCount: parseInt(tipAgg.rows[0]?.tip_count ?? '0', 10),
        tippers: tipByPlayer.rows.map((r) => ({
          address: r.player_address,
          displayName: r.display_name || null,
          totalWei: r.total_wei,
          count: parseInt(r.cnt, 10),
        })),
      });
    } catch (error) {
      logger.error('Error fetching tip stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  const instantLotteryPlayLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: 'Too many instant lottery plays from this IP, try again later.',
    validate: { xForwardedForHeader: false },
  });
  const instantLotteryErrorBySelector: Record<string, { status: number; error: string }> = {
    '0x2b835c65': { status: 400, error: 'Invalid wager amount' }, // InvalidWagerAmount()
    '0x3a5fad5a': { status: 400, error: 'Invalid ticket numbers' }, // InvalidNumbers()
    '0x28b35f21': { status: 409, error: 'Insufficient reserve for payout' }, // InsufficientReserve()
    '0x96c7c1c2': { status: 409, error: 'Reserve constraint failed' }, // ExceedsReserve()
    '0x27e1f1e5': { status: 503, error: 'Instant lottery operator is not authorized on-chain' }, // OnlyOperator()
    '0xd0bf0d96': { status: 409, error: 'Duplicate play id detected' }, // PlayIdAlreadyUsed()
  };
  const resolveInstantLotteryPlayError = (error: unknown): { status: number; error: string } | null => {
    const msg = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    if (
      msg.includes('Valid wallet')
      || msg.includes('numbers must')
      || msg.includes('Invalid wager')
      || msg.includes('Wager must')
    ) {
      return { status: 400, error: msg };
    }
    if (msg.includes('not configured')) return { status: 503, error: msg };
    if (msg.toLowerCase().includes('insufficient allowance')) {
      return { status: 409, error: 'Insufficient MORBIUS allowance for instant lottery contract' };
    }
    if (msg.toLowerCase().includes('insufficient balance')) {
      return { status: 409, error: 'Insufficient MORBIUS balance for wager' };
    }
    let serialized = '';
    try {
      serialized = JSON.stringify(error);
    } catch {
      serialized = '';
    }
    const inspect = `${msg}\n${serialized}`.toLowerCase();
    for (const [selector, mapped] of Object.entries(instantLotteryErrorBySelector)) {
      if (inspect.includes(selector.toLowerCase())) return mapped;
    }
    if (inspect.includes('execution reverted')) {
      return { status: 409, error: 'Play reverted on-chain. Check allowance, balance, reserve, and operator config.' };
    }
    return null;
  };

  app.post('/api/lottery/instant/play', instantLotteryPlayLimiter, async (req, res) => {
    try {
      if (!instantLotteryService.isConfigured()) {
        return res.status(503).json({ error: 'Instant lottery (provably fair) is not configured' });
      }
      const body = req.body as { address?: unknown; numbers?: unknown; wager?: unknown; clientSeed?: unknown };
      const address = typeof body?.address === 'string' ? body.address.trim() : '';
      const numbers = body?.numbers;
      const wager = typeof body?.wager === 'string' ? body.wager : body?.wager != null ? String(body.wager) : '';
      const clientSeed = typeof body?.clientSeed === 'string' ? body.clientSeed : undefined;
      if (!address || !numbers || !wager) {
        return res.status(400).json({ error: 'address, numbers (array of 6), and wager (string) required' });
      }
      const result = await instantLotteryService.play({ address, numbers, wager, clientSeed });
      sendJson(res, result);
    } catch (error: unknown) {
      const mapped = resolveInstantLotteryPlayError(error);
      if (mapped) return res.status(mapped.status).json({ error: mapped.error });
      logger.error('Instant lottery play error:', error);
      res.status(500).json({ error: 'Instant lottery play failed' });
    }
  });

  app.get('/api/analytics/platform', async (_req, res) => {
    const cacheKey = getAnalyticsCacheKey('/api/analytics/platform', {});
    const cached = getCachedAnalytics(cacheKey);
    if (cached != null) {
      return sendJson(res, cached);
    }
    try {
      const [blackjack, chain] = await Promise.all([dbService.getGlobalAnalytics(), chainAnalytics.getAllChainStats()]);
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
      const payload = { blackjack, plinko: chain.plinko, keno: chain.keno, lottery: chain.lottery, bigWheel: chain.bigWheel, combined };
      setCachedAnalytics(cacheKey, payload);
      sendJson(res, payload);
    } catch (error) {
      logger.error('Error fetching platform analytics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/analytics/live-presence', (_req, res) => {
    try {
      sendJson(res, wsService.getLivePresenceByGame());
    } catch (error) {
      logger.error('Error fetching live presence:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

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
      const aggregates = await dbService.getMetricsAggregates(range);
      const chainStats = await chainAnalytics.getAllChainStats();
      const blackjackWagered = aggregates.volume;
      const blackjackWon = aggregates.volume + aggregates.pnl;
      const plinkoWagered = chainStats.plinko?.totalRevenue ?? 0n;
      const plinkoWon = chainStats.plinko?.totalPayouts ?? 0n;
      const kenoWagered = chainStats.keno?.totalWagered ?? 0n;
      const kenoWon = chainStats.keno?.totalWon ?? 0n;
      const lotteryWagered = chainStats.lottery?.totalCollected ?? 0n;
      const lotteryWon = chainStats.lottery?.totalClaimed ?? 0n;
      const bigWheelWagered = chainStats.bigWheel?.volume ?? 0n;
      const bigWheelWon = chainStats.bigWheel?.payouts ?? 0n;
      const totalWagered =
        range === 'all' ? blackjackWagered + plinkoWagered + kenoWagered + lotteryWagered + bigWheelWagered : blackjackWagered;
      const totalWon = range === 'all' ? blackjackWon + plinkoWon + kenoWon + lotteryWon + bigWheelWon : blackjackWon;
      const { totalDeposited, totalWithdrawn } = await chainAnalytics.getBlackjackDepositWithdrawTotals();
      const payload = {
        range,
        totalWagered: totalWagered.toString(),
        totalWon: totalWon.toString(),
        totalDeposited: totalDeposited.toString(),
        totalWithdrawn: totalWithdrawn.toString(),
        breakdown: {
          blackjack: { wagered: blackjackWagered.toString(), won: blackjackWon.toString() },
          plinko: { wagered: plinkoWagered.toString(), won: plinkoWon.toString() },
          keno: { wagered: kenoWagered.toString(), won: kenoWon.toString() },
          lottery: { wagered: lotteryWagered.toString(), won: lotteryWon.toString() },
          bigWheel: { wagered: bigWheelWagered.toString(), won: bigWheelWon.toString() },
        },
      };
      setCachedAnalytics(cacheKey, payload);
      sendJson(res, payload);
    } catch (error) {
      logger.error('Error fetching global metrics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
