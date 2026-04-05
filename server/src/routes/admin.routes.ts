import type { Express } from 'express';
import type { Multer } from 'multer';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { blackjackAbi } from '../abi/blackjack';
import {
  BLACKJACK_ADDRESS,
  KENO_ADDRESS,
  LOTTERY_INSTANT_ADDRESS,
  MORBIUS_TOKEN_ADDRESS,
  PLINKO_ADDRESS,
  getAllBlackjackContracts,
} from '../config/contracts';
import { sendJson } from '../http/json';
import type { BlackjackMultiGameService } from '../services/blackjack-multi-game.service';
import type { ChainAnalyticsService } from '../services/chain-analytics.service';
import type { DatabaseService } from '../services/database.service';
import type { PokerGameService } from '../services/poker-game.service';
import type { WebSocketService } from '../services/websocket.service';
import { isAdminWallet } from '../lib/cosmetics-catalog';
import { getPublicClient } from '../utils/chain-client';
import { logger } from '../utils/logger';
import { assertPokerBotControlAllowed } from '../utils/poker-bot-auth';

const ERC20_BALANCE_OF_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

interface RegisterAdminRoutesOptions {
  app: Express;
  uploadMulter: Multer;
  dbService: DatabaseService;
  pokerGameService: PokerGameService;
  bjMultiService: BlackjackMultiGameService;
  wsService: WebSocketService;
  chainAnalytics: ChainAnalyticsService;
  getHotWalletClient: () => { account?: { address?: `0x${string}` } } | null;
  refreshBjTotalsBackground: (chainAnalytics: ChainAnalyticsService) => void;
  getBjTotalsCache: () => { deposited: string; withdrawn: string };
}

type PokerBotJob = {
  tableId: string;
  numBots: number;
  startedAt: string;
  process: ChildProcess;
};

const pokerBotJobs = new Map<string, PokerBotJob>();
const MAX_ADMIN_BOTS = 10;

export function registerAdminRoutes({
  app,
  uploadMulter,
  dbService,
  pokerGameService,
  bjMultiService,
  wsService,
  chainAnalytics,
  getHotWalletClient,
  refreshBjTotalsBackground,
  getBjTotalsCache,
}: RegisterAdminRoutesOptions): void {
  const ensureProtocol = (url: string) => {
    if (!url) return url;
    if (/^https?:\/\//.test(url) || url.startsWith('/')) return url;
    return `https://${url}`;
  };

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

  app.delete('/api/admin/poker/tables/:tableId', async (req, res) => {
    try {
      const { tableId } = req.params;
      const ok = await pokerGameService.deleteTable(tableId);
      if (!ok) {
        res.status(404).json({ error: 'Poker table not found' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting poker table:', error);
      const msg = dbSchemaError(error);
      res.status(msg ? 503 : 500).json({ error: msg || 'Internal server error' });
    }
  });

  app.get('/api/admin/bj-multi/tables', async (_req, res) => {
    try {
      const tables = await bjMultiService.listTables();
      res.json({ tables });
    } catch (error) {
      logger.error('Error fetching BJ multi tables:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/bj-multi/tables', async (req, res) => {
    try {
      const { minBet, maxBet, themeKind, themeId } = req.body as { minBet?: string; maxBet?: string; themeKind?: string; themeId?: string };
      const min = minBet ? BigInt(minBet) : BigInt('1000000000000000000');
      const max = maxBet ? BigInt(maxBet) : BigInt('50000000000000000000000');
      const table = await bjMultiService.createTable(min, max, themeKind, themeId);
      res.json({ tableId: table.id });
    } catch (error) {
      logger.error('Error creating BJ multi table:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/admin/bj-multi/tables/:tableId', async (req, res) => {
    try {
      const { tableId } = req.params;
      const ok = await bjMultiService.deleteTable(tableId);
      if (!ok) { res.status(404).json({ error: 'Table not found' }); return; }
      res.json({ ok: true });
    } catch (error) {
      logger.error('Error deleting BJ multi table:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/poker/tables', async (_req, res) => {
    try {
      const result = await dbService.getPool().query(
        `SELECT pt.id, pt.small_blind, pt.big_blind, pt.max_seats, pt.status,
                pt.tournament_mode, pt.tournament_id, pt.hand_number,
                COUNT(ps.id) AS seated_count
         FROM poker_tables pt
         LEFT JOIN poker_seats ps ON ps.table_id = pt.id
         GROUP BY pt.id
         ORDER BY pt.created_at DESC
         LIMIT 100`,
      );
      res.json({ tables: result.rows });
    } catch (error) {
      logger.error('Error fetching all poker tables:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/poker/tournaments', async (_req, res) => {
    try {
      const result = await dbService.getPool().query(
        `SELECT t.id AS tournament_id, t.name, t.status, t.buy_in_amount,
                t.prize_pool, t.min_players, t.max_players, t.starting_chips,
                t.scheduled_start_at, t.created_at, t.creator_address,
                t.prize_distribution_type,
                COUNT(te.id) FILTER (WHERE te.status = 'playing') AS active_players,
                COUNT(te.id) AS total_entries,
                (SELECT pt.id FROM poker_tables pt WHERE pt.tournament_id = t.id LIMIT 1) AS table_id
         FROM tournaments t
         LEFT JOIN tournament_entries te ON te.tournament_id = t.id
         WHERE t.game_type = 'poker'
         GROUP BY t.id
         ORDER BY t.created_at DESC
         LIMIT 100`,
      );
      res.json({ tournaments: result.rows });
    } catch (error) {
      logger.error('Error fetching poker tournaments:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/poker/bots/bootstrap', async (req, res) => {
    try {
      const tableId = String(req.body?.tableId ?? '').trim();
      if (!tableId) {
        res.status(400).json({ error: 'tableId required' });
        return;
      }

      const gate = await assertPokerBotControlAllowed(dbService.getPool(), tableId, req.headers['x-admin-wallet'] as string | undefined);
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }

      const existingJob = pokerBotJobs.get(tableId);
      if (existingJob && !existingJob.process.killed) {
        res.status(409).json({
          error: 'Bots already running for this table',
          tableId,
          pid: existingJob.process.pid ?? null,
          numBots: existingJob.numBots,
          startedAt: existingJob.startedAt,
        });
        return;
      }

      const tableResult = await dbService.getPool().query(
        `SELECT pt.max_seats,
                COUNT(ps.id) AS seated_count
         FROM poker_tables pt
         LEFT JOIN poker_seats ps ON ps.table_id = pt.id
         WHERE pt.id = $1
         GROUP BY pt.id`,
        [tableId]
      );

      if (tableResult.rows.length === 0) {
        res.status(404).json({ error: 'Poker table not found' });
        return;
      }

      const row = tableResult.rows[0];
      const maxSeats = Number(row.max_seats ?? 0);
      const seatedCount = Number(row.seated_count ?? 0);
      const emptySeats = Math.max(0, maxSeats - seatedCount);
      if (emptySeats <= 0) {
        res.status(400).json({ error: 'No empty seats available for bots' });
        return;
      }

      const requestedBots = Number(req.body?.numBots);
      const defaultBots = Math.min(MAX_ADMIN_BOTS, emptySeats);
      const numBots = Number.isFinite(requestedBots)
        ? Math.max(1, Math.min(MAX_ADMIN_BOTS, Math.floor(requestedBots), emptySeats))
        : defaultBots;

      const serverRoot = path.resolve(__dirname, '../..');
      const proc = spawn('npm', ['run', 'poker:bot', '--', tableId, String(numBots)], {
        cwd: serverRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const startedAt = new Date().toISOString();
      pokerBotJobs.set(tableId, { tableId, numBots, startedAt, process: proc });

      proc.stdout?.on('data', (chunk: Buffer) => {
        logger.info('[PokerBot]', { tableId, line: chunk.toString().trim() });
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        logger.warn('[PokerBot]', { tableId, line: chunk.toString().trim() });
      });
      proc.on('error', (err) => {
        logger.error('Poker bot process error', { tableId, err });
      });
      proc.on('exit', (code, signal) => {
        const current = pokerBotJobs.get(tableId);
        if (current?.process === proc) {
          pokerBotJobs.delete(tableId);
        }
        logger.info('Poker bot process exited', { tableId, code, signal });
      });

      res.json({
        ok: true,
        tableId,
        numBots,
        pid: proc.pid ?? null,
        startedAt,
      });
    } catch (error) {
      logger.error('Error bootstrapping poker bots:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/poker/bots/stop', async (req, res) => {
    try {
      const tableId = String(req.body?.tableId ?? '').trim();
      if (!tableId) {
        res.status(400).json({ error: 'tableId required' });
        return;
      }
      const gate = await assertPokerBotControlAllowed(dbService.getPool(), tableId, req.headers['x-admin-wallet'] as string | undefined);
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      const job = pokerBotJobs.get(tableId);
      if (!job) {
        res.status(404).json({ error: 'No running bot process for this table' });
        return;
      }
      const stopped = job.process.kill('SIGTERM');
      pokerBotJobs.delete(tableId);
      res.json({ ok: true, tableId, stopped, pid: job.process.pid ?? null });
    } catch (error) {
      logger.error('Error stopping poker bots:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/poker/bots/status', async (req, res) => {
    try {
      const tableId = typeof req.query.tableId === 'string' ? req.query.tableId.trim() : '';
      const wallet = (req.headers['x-admin-wallet'] as string | undefined)?.trim();
      if (!tableId) {
        if (!wallet || !isAdminWallet(wallet)) {
          res.status(403).json({ error: 'Admin wallet required for global bot status' });
          return;
        }
      } else {
        const gate = await assertPokerBotControlAllowed(dbService.getPool(), tableId, wallet);
        if (!gate.ok) {
          res.status(gate.status).json({ error: gate.error });
          return;
        }
      }
      if (tableId) {
        const job = pokerBotJobs.get(tableId);
        if (!job) {
          res.json({ running: false, tableId });
          return;
        }
        res.json({
          running: true,
          tableId,
          pid: job.process.pid ?? null,
          numBots: job.numBots,
          startedAt: job.startedAt,
        });
        return;
      }
      const jobs = Array.from(pokerBotJobs.values()).map((job) => ({
        tableId: job.tableId,
        pid: job.process.pid ?? null,
        numBots: job.numBots,
        startedAt: job.startedAt,
      }));
      res.json({ running: jobs.length > 0, jobs });
    } catch (error) {
      logger.error('Error reading poker bot status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/health', async (_req, res) => {
    try {
      const client = getPublicClient();
      const api = 'ok';
      const ws = 'up';

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
            }),
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

      try {
        const balance = await readMorbiusBalance(PLINKO_ADDRESS);
        morbius.plinko = balance.toString();
        const plinkoStats = await chainAnalytics.getPlinkoStats();
        games.plinko = plinkoStats ? { rpc: 'ok' } : { rpc: 'ok' };
      } catch (err: any) {
        games.plinko = { rpc: 'fail', error: err?.message || 'RPC failed' };
        morbius.plinko = '0';
      }

      try {
        const balance = await readMorbiusBalance(KENO_ADDRESS);
        morbius.keno = balance.toString();
        const kenoStats = await chainAnalytics.getKenoStats();
        games.keno = kenoStats ? { rpc: 'ok' } : { rpc: 'ok' };
      } catch (err: any) {
        games.keno = { rpc: 'fail', error: err?.message || 'RPC failed' };
        morbius.keno = '0';
      }

      try {
        const balance = await readMorbiusBalance(LOTTERY_INSTANT_ADDRESS);
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
        lottery: LOTTERY_INSTANT_ADDRESS,
      };

      let hotWalletAddress: string | undefined;
      let hotWalletMorbius: string | undefined;
      let hotWalletLowWarning: boolean | undefined;
      const lowBalanceThreshold = process.env.HOT_WALLET_LOW_BALANCE_WEI;
      const wallet = getHotWalletClient();
      if (wallet?.account?.address) {
        hotWalletAddress = wallet.account.address;
        try {
          const bal = await client.readContract({
            address: MORBIUS_TOKEN_ADDRESS,
            abi: ERC20_BALANCE_OF_ABI,
            functionName: 'balanceOf',
            args: [wallet.account.address],
          }) as bigint;
          hotWalletMorbius = bal.toString();
          if (lowBalanceThreshold) hotWalletLowWarning = bal < BigInt(lowBalanceThreshold);
        } catch {
          hotWalletMorbius = '0';
          if (lowBalanceThreshold) hotWalletLowWarning = true;
        }
      }

      const treasuryWalletEntries: Array<{ label: string; address: string; envKey: string }> = [
        { label: 'Treasury', address: (process.env.PLS_TREASURY || process.env.TREASURY || '0x41682815B05fE6b54a6C0f8813bB99423EE0309D').trim(), envKey: 'PLS_TREASURY' },
        { label: 'Platform fee wallet', address: (process.env.PLATFORM_FEE_WALLET || '0x41682815B05fE6b54a6C0f8813bB99423EE0309D').trim(), envKey: 'PLATFORM_FEE_WALLET' },
        { label: 'Distribution recipient', address: (process.env.DISTRIBUTION_RECIPIENT || '0x3807f417617E53d4c5C7D7A825a5ce4D105A75d2').trim(), envKey: 'DISTRIBUTION_RECIPIENT' },
      ];
      const treasuryWallets: Array<{ label: string; address: string; morbiusWei: string }> = [];
      for (const entry of treasuryWalletEntries) {
        if (!entry.address || !/^0x[0-9a-fA-F]{40}$/.test(entry.address)) continue;
        try {
          const bal = await client.readContract({
            address: MORBIUS_TOKEN_ADDRESS,
            abi: ERC20_BALANCE_OF_ABI,
            functionName: 'balanceOf',
            args: [entry.address as `0x${string}`],
          }) as bigint;
          treasuryWallets.push({ label: entry.label, address: entry.address, morbiusWei: bal.toString() });
        } catch {
          treasuryWallets.push({ label: entry.label, address: entry.address, morbiusWei: '0' });
        }
      }

      refreshBjTotalsBackground(chainAnalytics);
      const bjTotals = getBjTotalsCache();
      const blackjackDeposited = bjTotals.deposited;
      const blackjackWithdrawn = bjTotals.withdrawn;

      const now = new Date();
      const [bj1h, bj24h, bj7d] = await Promise.all([
        dbService.getBlackjackDepositsWithdrawalsSince(new Date(now.getTime() - 60 * 60 * 1000)),
        dbService.getBlackjackDepositsWithdrawalsSince(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
        dbService.getBlackjackDepositsWithdrawalsSince(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
      ]);
      const blackjackTimeframes = {
        allTime: { deposited: blackjackDeposited, withdrawn: blackjackWithdrawn },
        '1h': bj1h,
        '24h': bj24h,
        '7d': bj7d,
      };

      let tipStats: { totalTipAmountWei: string; tipCount: number; tippers: Array<{ address: string; totalWei: string; count: number }> } = { totalTipAmountWei: '0', tipCount: 0, tippers: [] };
      try {
        const pool = dbService.getPool();
        const tipAgg = await pool.query<{ total_wei: string; tip_count: string }>(
          `SELECT COALESCE(SUM((payload->>'amount')::numeric), 0)::text AS total_wei,
                  COUNT(*)::text AS tip_count
           FROM blackjack_multi_audit_log WHERE action_type = 'tip_dealer'`,
        );
        const tipByPlayer = await pool.query<{ player_address: string; total_wei: string; cnt: string }>(
          `SELECT player_address,
                  SUM((payload->>'amount')::numeric)::text AS total_wei,
                  COUNT(*)::text AS cnt
           FROM blackjack_multi_audit_log WHERE action_type = 'tip_dealer'
           GROUP BY player_address ORDER BY SUM((payload->>'amount')::numeric) DESC LIMIT 50`,
        );
        tipStats = {
          totalTipAmountWei: tipAgg.rows[0]?.total_wei ?? '0',
          tipCount: parseInt(tipAgg.rows[0]?.tip_count ?? '0', 10),
          tippers: tipByPlayer.rows.map(r => ({ address: r.player_address, totalWei: r.total_wei, count: parseInt(r.cnt, 10) })),
        };
      } catch {
        // ignore if table doesn't exist yet
      }

      sendJson(res, {
        api,
        ws,
        games,
        morbius,
        blackjackReservesByContract,
        contractAddresses,
        ...(hotWalletAddress != null && {
          hotWalletAddress,
          hotWalletMorbius: hotWalletMorbius ?? '0',
          ...(hotWalletLowWarning !== undefined && { hotWalletLowWarning }),
        }),
        treasuryWallets,
        blackjackDeposited,
        blackjackWithdrawn,
        blackjackTimeframes,
        tipStats,
      });
    } catch (error) {
      logger.error('Error in admin health:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/rewards/claims', async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit), 10) || 50, 200);
      const pool = dbService.getPool();
      const holderRows = await pool.query<{ wallet_address: string; reward_amount: string; claimed_at: Date; epoch_number: number }>(
        `SELECT ms.wallet_address, ms.reward_amount::text AS reward_amount, ms.claimed_at, me.epoch_number
         FROM merkle_snapshots ms
         JOIN merkle_epochs me ON me.id = ms.epoch_id
         WHERE ms.claimed_at IS NOT NULL
         ORDER BY ms.claimed_at DESC
         LIMIT $1`,
        [limit],
      );
      const lpRows = await pool.query<{ wallet_address: string; reward_amount: string; claimed_at: Date; epoch_number: number }>(
        `SELECT ms.wallet_address, ms.reward_amount::text AS reward_amount, ms.claimed_at, me.epoch_number
         FROM merkle_lp_snapshots ms
         JOIN merkle_lp_epochs me ON me.id = ms.epoch_id
         WHERE ms.claimed_at IS NOT NULL
         ORDER BY ms.claimed_at DESC
         LIMIT $1`,
        [limit],
      );
      sendJson(res, {
        holderClaims: holderRows.rows.map((r) => ({
          walletAddress: r.wallet_address,
          rewardAmount: r.reward_amount,
          claimedAt: r.claimed_at.toISOString(),
          epochNumber: r.epoch_number,
        })),
        lpClaims: lpRows.rows.map((r) => ({
          walletAddress: r.wallet_address,
          rewardAmount: r.reward_amount,
          claimedAt: r.claimed_at.toISOString(),
          epochNumber: r.epoch_number,
        })),
      });
    } catch (error) {
      logger.error('Error fetching reward claims:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/analytics/contract-snapshots', async (req, res) => {
    try {
      const granularity = String(req.query.granularity || 'daily').toLowerCase();
      if (granularity === 'hour' || granularity === 'hourly') {
        const hours = Math.min(Math.max(parseInt(String(req.query.hours), 10) || 24, 1), 48);
        const rows = await dbService.getContractHourlySnapshots(hours);
        sendJson(res, { granularity: 'hourly', hours, snapshots: rows });
      } else {
        const days = Math.min(Math.max(parseInt(String(req.query.days), 10) || 7, 1), 30);
        const rows = await dbService.getContractDailySnapshots(days);
        sendJson(res, { days, snapshots: rows });
      }
    } catch (error) {
      logger.error('Error fetching contract snapshots:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/config', async (_req, res) => {
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

  app.get('/api/admin/chat/blocked', async (_req, res) => {
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

  app.get('/api/admin/escrow/summary', async (_req, res) => {
    try {
      const { getEscrowSummary } = await import('../utils/escrow-oversight');
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
      const { getPoolsByDepositor, getActivePools, getPoolDetails } = await import('../utils/escrow-oversight');
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
            } catch {
              // fall through
            }
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
          }),
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
      const { getPoolDetails } = await import('../utils/escrow-oversight');
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
      blackjack: { volume: '0', games: 0, activePlayers: 0, pnl: '0' },
      plinko: { totalDrops: '0', totalBallsSold: '0', totalRevenue: '0', totalPayouts: '0', contractReserve: '0' },
      keno: { totalWagered: '0', totalWon: '0', ticketCount: '0', activeRoundId: '0' },
      lottery: { totalTicketsEver: '0', totalCollected: '0', totalClaimed: '0' },
      bigWheel: { spins: '0', volume: '0', payouts: '0', contractBalance: '0' },
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
        blackjack: {
          volume: aggregates.volume.toString(),
          games: aggregates.games,
          activePlayers: aggregates.activePlayers,
          pnl: aggregates.pnl.toString(),
        },
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
}
