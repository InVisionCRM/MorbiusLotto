import express from 'express';
import { createServer } from 'http';
import { spawn, type ChildProcess } from 'child_process';
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
import { PokerTournamentService } from './services/poker-tournament.service';
import { chipsToWei } from './lib/poker-chip-scale';
import { applyPokerChipDelta, getPokerChipBalance } from './services/poker-chip-wallet';
import { BlackjackMultiGameService } from './services/blackjack-multi-game.service';
import { ChainAnalyticsService } from './services/chain-analytics.service';
import { InstantLotteryService } from './services/instant-lottery.service';
import { MerkleDropsService } from './services/merkle-drops.service';
import { MerkleDropsLPService } from './services/merkle-lp-drops.service';
import { CosmeticsService } from './services/cosmetics.service';
import { isAdminWallet, getLockedFields, ITEM_CATALOG } from './lib/cosmetics-catalog';
import { resolveDisplayNameForProfileUpsert } from './lib/resolve-profile-display-name';
import { logger } from './utils/logger';
import { assertPokerBotControlAllowed, assertPokerTournamentBotControlAllowed } from './utils/poker-bot-auth';
import { MIN_WITHDRAWAL_WEI } from './utils/withdraw-sign';
import { getPublicClient } from './utils/chain-client';
import { blackjackAbi } from './abi/blackjack';
import { createWalletClient, http, decodeEventLog, getAddress } from 'viem';
import { pulsechain } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { PLINKO_ADDRESS, KENO_ADDRESS, LOTTERY_INSTANT_ADDRESS, BLACKJACK_ADDRESS, MORBIUS_TOKEN_ADDRESS, getAllBlackjackContracts } from './config/contracts';

const ERC20_BALANCE_OF_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

const ERC20_TRANSFER_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable' as const, inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

function getHotWalletClient(): ReturnType<typeof createWalletClient> | null {
  const pk = process.env.HOT_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk || !pk.startsWith('0x')) return null;
  const account = privateKeyToAccount(pk);
  return createWalletClient({
    account,
    chain: pulsechain,
    transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
  });
}

// Admin: comma-separated wallet addresses (server-side, for /api/admin/*)
// Cache for BJ deposit/withdraw totals (populated by background refresh; avoids blocking health endpoint)
let _bjTotalsCache: { deposited: string; withdrawn: string } = { deposited: '0', withdrawn: '0' };
let _bjTotalsRefreshing = false;

function refreshBjTotalsBackground(chainAnalytics: ChainAnalyticsService) {
  if (_bjTotalsRefreshing) return;
  _bjTotalsRefreshing = true;
  chainAnalytics.getBlackjackDepositWithdrawTotals()
    .then(t => { _bjTotalsCache = { deposited: t.totalDeposited.toString(), withdrawn: t.totalWithdrawn.toString() }; })
    .catch(() => { /* keep last cached value */ })
    .finally(() => { _bjTotalsRefreshing = false; });
}

const ADMIN_SECRET = process.env.AP;

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
const DEFAULT_ORIGINS = ['https://morbius.io'];
const envOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...DEFAULT_ORIGINS, ...envOrigins])];
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

// Admin API: require x-admin-secret header matching AP env var.
// Exception: POST /api/admin/browser-upload uses x-admin-wallet + isAdminWallet so the browser can
// upload large files directly to this host (bypasses Vercel/serverless ~4.5MB request body limits).
app.use('/api/admin', (req, res, next) => {
  const subPath = (req.url || '').split('?')[0];
  if (req.method === 'POST' && subPath === '/browser-upload') {
    return next();
  }
  if (!ADMIN_SECRET) {
    res.status(503).json({ error: 'Admin access not configured on server' });
    return;
  }
  const secret = (req.headers['x-admin-secret'] as string)?.trim();
  if (!secret || secret !== ADMIN_SECRET) {
    res.status(403).json({ error: 'Forbidden' });
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
      await pokerGameService.createTable(10, 20, 10);
      logger.info('Poker: created default table (10/20 chips, 6 seats)');
    }

    // Clear stale/incomplete poker hands from previous server sessions.
    // Bot intervals and in-flight state are lost on restart, so any hand
    // still marked incomplete would permanently block new hands from starting.
    try {
      const pool = dbService.getPool();
      const staleResult = await pool.query(
        `UPDATE poker_hands SET completed_at = NOW(), acting_position = NULL
         WHERE completed_at IS NULL
         RETURNING id, table_id`
      );
      if (staleResult.rows.length > 0) {
        logger.info(`Poker: cleared ${staleResult.rows.length} stale hand(s) from previous session`);
        // Reset any tables still marked 'playing' back to 'waiting'
        await pool.query(
          `UPDATE poker_tables SET status = 'waiting' WHERE status = 'playing'`
        );
      }
    } catch (err: any) {
      logger.warn(`Poker: failed to clear stale hands on startup: ${err.message}`);
    }

    // Initialize multiplayer blackjack service
    const bjMultiService = new BlackjackMultiGameService(dbService, pfService);

    // Initialize WebSocket service
    const wsService = new WebSocketService(server, gameService, dbService, tournamentService, pokerGameService, bjMultiService);

    // Wire broadcast so bot actions (which bypass the WS handler) still push state to clients
    pokerGameService.setBroadcastCallback((tableId) => wsService.broadcastPokerTableState(tableId));
    // Wire notifications for AFK kick/sit-out events
    pokerGameService.setNotifyCallback((room, type, payload) => wsService.broadcastToRoom(room, { type, payload }));

    // Initialize poker tournament service and wire into WebSocket + post-hand callback
    const pokerTournamentService = new PokerTournamentService(
      dbService.getPool(), tournamentService, pokerGameService
    );
    wsService.setPokerTournamentService(pokerTournamentService);
    tournamentService.setPokerTournamentService(pokerTournamentService);
    pokerTournamentService.setBroadcastCallback((room, msg) => wsService.broadcastToRoom(room, msg as any));
    pokerGameService.setPostHandCallback(
      (tableId, handNumber) => pokerTournamentService.syncAfterHand(tableId, handNumber)
    );
    pokerGameService.setTournamentUnderfilledRecovery((tableId) =>
      pokerTournamentService.recoverTournamentTableIfUnderTwoStackedSeats(tableId));
    pokerGameService.setTournamentTimeoutEliminationCallback((tableId, playerAddress) =>
      pokerTournamentService.eliminatePlayerForConsecutiveTimeouts(tableId, playerAddress));

    // Wire BJ multi broadcast callback
    bjMultiService.setBroadcastCallback((tableId) => wsService.broadcastBJMultiTableState(tableId));

    // Freeroll scheduler (polls pending scheduled events: start, end)
    freerollScheduler = new FreerollSchedulerService(dbService.getPool(), tournamentService);
    freerollScheduler.start();

    // Tournament scheduler (time-expired buy-in tournaments, stuck-tournament recovery)
    tournamentScheduler = new TournamentSchedulerService(dbService.getPool(), tournamentService);
    tournamentScheduler.start();

    // NOTE: Orphaned pending withdrawals are NOT blindly refunded at startup.
    // The periodic cron (runs every 60s after withdrawal routes init) checks on-chain
    // nonces before refunding. This prevents double-withdrawal if the server crashed
    // after an on-chain withdrawal but before /confirm was called.

    // Chain analytics (on-chain games: Plinko, Keno, Lottery, BigWheel)
    const chainAnalytics = new ChainAnalyticsService(dbService);

    // Instant lottery (provably-fair server-side play, MORBIUS only)
    const instantLotteryService = new InstantLotteryService(dbService, pfService);

    // Merkle drops service (MORBIUS holder epoch rewards)
    merkleDropsService = new MerkleDropsService(dbService.getPool());
    if (process.env.MERKLE_DROP_CRON_ENABLED === 'true') {
      merkleDropsService.startCron();
    }

    // Merkle LP drops service (LP token holder epoch rewards)
    merkleDropsLPService = new MerkleDropsLPService(dbService.getPool());
    const cosmeticsService = new CosmeticsService(dbService.getPool());
    if (process.env.MERKLE_LP_DROP_CRON_ENABLED === 'true') {
      merkleDropsLPService.startCron();
    }

    // API routes
    // Public config (whitelisted keys only; used for ad creatives, etc.)
    const PUBLIC_CONFIG_KEYS = ['ad_creative_url', 'ad_creative_hero_url', 'ad_creative_loading_url'];
    app.get('/api/config/public', async (req, res) => {
      try {
        const full = await dbService.getAdminGameConfig();
        const publicConfig: Record<string, string> = {};
        for (const key of PUBLIC_CONFIG_KEYS) {
          const v = full[key];
          publicConfig[key] = typeof v === 'string' ? v : '';
        }
        sendJson(res, publicConfig);
      } catch (error) {
        logger.error('Error fetching public config:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/player/:address/profile', async (req, res) => {
      try {
        const { address } = req.params;
        const profile = await dbService.getProfile(address);
        sendJson(res, profile ?? { displayName: null, profileImageUrl: null, avatarConfig: null });
      } catch (error) {
        logger.error('Error fetching player profile:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Update profile by address (display name, profile image URL, avatar config). No signature required.
    app.post('/api/player/profile', express.json(), async (req, res) => {
      try {
        const {
          address: bodyAddress,
          walletAddress: bodyWalletAddress,
          displayName: rawDisplayName,
          profileImageUrl: rawProfileImageUrl,
          avatarConfig: rawAvatarConfig,
          bio: rawBio,
          xHandle: rawXHandle,
          tgHandle: rawTgHandle,
          profileDisplayMode: rawProfileDisplayMode,
        } = req.body ?? {};
        const addressRaw =
          typeof bodyAddress === 'string' && bodyAddress.trim() !== ''
            ? bodyAddress
            : typeof bodyWalletAddress === 'string' && bodyWalletAddress.trim() !== ''
              ? bodyWalletAddress
              : '';
        if (!addressRaw) {
          return res.status(400).json({ error: 'address required' });
        }
        const normalizedAddress = getAddress(addressRaw);
        const displayName = await resolveDisplayNameForProfileUpsert(
          dbService,
          normalizedAddress,
          typeof rawDisplayName === 'string' ? rawDisplayName : undefined,
        );
        const profileImageUrl = rawProfileImageUrl !== undefined
          ? (typeof rawProfileImageUrl === 'string' ? rawProfileImageUrl : null)
          : undefined;
        const avatarConfig = rawAvatarConfig !== undefined
          ? (rawAvatarConfig !== null && typeof rawAvatarConfig === 'object' ? rawAvatarConfig as Record<string, unknown> : null)
          : undefined;
        const bio     = rawBio     !== undefined ? (typeof rawBio     === 'string' ? rawBio.trim().slice(0, 200) || null     : null) : undefined;
        const xHandle = rawXHandle !== undefined ? (typeof rawXHandle === 'string' ? rawXHandle.trim().replace(/^@/, '').slice(0, 50) || null : null) : undefined;
        const tgHandle = rawTgHandle !== undefined ? (typeof rawTgHandle === 'string' ? rawTgHandle.trim().replace(/^@/, '').slice(0, 50) || null : null) : undefined;
        const profileDisplayMode: 'avatar' | 'photo' | undefined =
          rawProfileDisplayMode === 'photo' || rawProfileDisplayMode === 'avatar' ? rawProfileDisplayMode : undefined;

        // Cosmetics ownership check (skip for admin wallets)
        if (avatarConfig && !isAdminWallet(normalizedAddress)) {
          const inventory = await cosmeticsService.getInventory(normalizedAddress);
          const ownedSet = new Set(inventory);
          const locked = getLockedFields(avatarConfig as Record<string, string>, ownedSet);
          if (locked.length > 0) {
            const names = locked.map((l) => l.displayName ?? l.itemKey ?? l.value).join(', ');
            return res.status(403).json({
              error: `Avatar contains items you don\'t own: ${names}`,
              lockedItems: locked,
            });
          }

          // DB-created items check (colors added via the builder won't be in the static catalog)
          const dbValueMap = await cosmeticsService.getDbValueMap();
          if (dbValueMap.size > 0) {
            const config = avatarConfig as Record<string, string>;
            const dbLocked: string[] = [];
            for (const [key, itemKey] of dbValueMap) {
              const [field, value] = key.split(':');
              if (config[field] === value && !ownedSet.has(itemKey)) {
                dbLocked.push(itemKey);
              }
            }
            if (dbLocked.length > 0) {
              return res.status(403).json({
                error: `Avatar contains items you don't own: ${dbLocked.join(', ')}`,
                lockedItems: dbLocked.map((k) => ({ itemKey: k, value: null, field: null })),
              });
            }
          }
        }

        await dbService.setDisplayName(normalizedAddress, displayName, profileImageUrl, avatarConfig, bio, xHandle, tgHandle, profileDisplayMode);
        const profile = await dbService.getProfile(normalizedAddress);
        sendJson(res, profile ?? { displayName: null, profileImageUrl: null, avatarConfig: null });
      } catch (error) {
        logger.error('Error updating player profile:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // ── Cosmetics ─────────────────────────────────────────────────────────────

    // GET /api/cosmetics/items — full catalog with tier + pricing + live minted counts
    // ?adminAddress= — when wallet is admin, includes delisted items + shopListed on each row
    app.get('/api/cosmetics/items', async (req, res) => {
      try {
        const adminAddress = typeof req.query.adminAddress === 'string' ? req.query.adminAddress : '';
        const includeDelisted = Boolean(adminAddress && isAdminWallet(adminAddress));
        const items = await cosmeticsService.getAllItems({ includeDelisted });
        res.json(items);
      } catch (error) {
        logger.error('Error fetching cosmetic items:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /api/cosmetics/inventory/:address — player's owned item keys
    app.get('/api/cosmetics/inventory/:address', async (req, res) => {
      try {
        const { address } = req.params;
        const inventory = await cosmeticsService.getInventory(address);
        sendJson(res, { address, items: inventory });
      } catch (error) {
        logger.error('Error fetching cosmetic inventory:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // POST /api/cosmetics/purchase — verify on-chain payment and record ownership
    // Body: { walletAddress, itemKey, txHash, currency: 'PLS' | 'MORBIUS' }
    app.post('/api/cosmetics/purchase', express.json(), async (req, res) => {
      try {
        const { walletAddress, itemKey, txHash, currency } = req.body ?? {};
        if (!walletAddress || !itemKey || !txHash || !currency) {
          return res.status(400).json({ error: 'walletAddress, itemKey, txHash, and currency required' });
        }
        if (currency !== 'PLS' && currency !== 'MORBIUS') {
          return res.status(400).json({ error: 'currency must be PLS or MORBIUS' });
        }
        const result = await cosmeticsService.recordPurchase(walletAddress, itemKey, txHash, currency);
        const statusMap: Record<string, number> = {
          not_found: 404,
          not_listed: 403,
          already_owned: 409,
          tx_already_used: 409,
          tx_not_found: 422,
          tx_wrong_sender: 422,
          tx_wrong_recipient: 422,
          tx_insufficient_amount: 422,
          tx_reverted: 422,
        };
        if (result !== 'ok') {
          const status = statusMap[result] ?? 422;
          return res.status(status).json({ error: result.replace(/_/g, ' ') });
        }
        const inventory = await cosmeticsService.getInventory(walletAddress);
        sendJson(res, { success: true, items: inventory });
      } catch (error) {
        logger.error('Error recording cosmetic purchase:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // POST /api/cosmetics/gift — transfer item from one player to another
    // Body: { fromAddress, toAddress, itemKey }
    app.post('/api/cosmetics/gift', express.json(), async (req, res) => {
      try {
        const { fromAddress, toAddress, itemKey } = req.body ?? {};
        if (!fromAddress || !toAddress || !itemKey) {
          return res.status(400).json({ error: 'fromAddress, toAddress, and itemKey required' });
        }
        if (fromAddress.toLowerCase() === toAddress.toLowerCase()) {
          return res.status(400).json({ error: 'Cannot gift to yourself' });
        }
        const result = await cosmeticsService.giftItem(fromAddress, toAddress, itemKey);
        if (result === 'not_owned') return res.status(403).json({ error: 'You do not own this item' });
        if (result === 'already_owned') return res.status(409).json({ error: 'Recipient already owns this item' });
        const inventory = await cosmeticsService.getInventory(fromAddress);
        sendJson(res, { success: true, items: inventory });
      } catch (error) {
        logger.error('Error gifting cosmetic item:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // POST /api/cosmetics/grant — admin-only: grant item to a player for free
    // Body: { targetAddress, itemKey, adminKey }
    app.post('/api/cosmetics/grant', express.json(), async (req, res) => {
      try {
        const { targetAddress, itemKey, adminAddress } = req.body ?? {};
        if (!targetAddress || !itemKey || !adminAddress) {
          return res.status(400).json({ error: 'targetAddress, itemKey, and adminAddress required' });
        }
        if (!isAdminWallet(adminAddress)) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        const result = await cosmeticsService.grantItem(targetAddress, itemKey, null);
        const inventory = await cosmeticsService.getInventory(targetAddress);
        sendJson(res, { success: true, alreadyOwned: !result, items: inventory });
      } catch (error) {
        logger.error('Error granting cosmetic item:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // POST /api/cosmetics/admin/create-item — create a new dynamic item (admin only)
    // Body: { adminAddress, itemKey, displayName, tier, priceMorbius, maxSupply, unlocksField, unlocksValue }
    app.post('/api/cosmetics/admin/create-item', express.json(), async (req, res) => {
      try {
        const { adminAddress, itemKey, displayName, tier, priceMorbius, maxSupply, unlocksField, unlocksValue } = req.body ?? {};
        if (!adminAddress || !itemKey || !displayName || !tier || !unlocksField || !unlocksValue) {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        if (!isAdminWallet(adminAddress)) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        const result = await cosmeticsService.createItem({
          itemKey, displayName, tier,
          priceMorbius: Number(priceMorbius),
          maxSupply: Number(maxSupply),
          unlocksField, unlocksValue,
        });
        if (result === 'duplicate_key') return res.status(409).json({ error: `Item key "${itemKey}" already exists` });
        if (result === 'duplicate_value') return res.status(409).json({ error: `A "${unlocksField}" item with value "${unlocksValue}" already exists` });
        sendJson(res, { success: true, itemKey });
      } catch (error) {
        logger.error('Error creating cosmetic item:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // PATCH /api/cosmetics/admin/item — update tier/price/maxSupply/shopListed (admin only)
    // Body: { adminAddress, itemKey, tier?, priceMorbius?, maxSupply?, shopListed? }
    app.patch('/api/cosmetics/admin/item', express.json(), async (req, res) => {
      try {
        const { adminAddress, itemKey, tier, priceMorbius, maxSupply, shopListed } = req.body ?? {};
        if (!adminAddress || !itemKey) {
          return res.status(400).json({ error: 'adminAddress and itemKey required' });
        }
        if (!isAdminWallet(adminAddress)) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        const result = await cosmeticsService.updateItem(itemKey, {
          tier,
          priceMorbius,
          maxSupply,
          shopListed: typeof shopListed === 'boolean' ? shopListed : undefined,
        });
        if (result === 'not_found') return res.status(404).json({ error: 'Item not found' });
        if (result === 'supply_below_minted') return res.status(409).json({ error: 'New max supply cannot be below current minted count' });
        sendJson(res, { success: true });
      } catch (error) {
        logger.error('Error updating cosmetic item:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // POST /api/cosmetics/admin/bulk-shop-listed — batch shop_listed from variant review (admin only)
    // Body: { adminAddress, updates: [{ itemKey, shopListed: boolean }, ...] }
    app.post('/api/cosmetics/admin/bulk-shop-listed', express.json(), async (req, res) => {
      try {
        const { adminAddress, updates } = req.body ?? {};
        if (!adminAddress || !Array.isArray(updates)) {
          return res.status(400).json({ error: 'adminAddress and updates array required' });
        }
        if (!isAdminWallet(adminAddress)) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        const max = 500;
        if (updates.length > max) {
          return res.status(400).json({ error: `At most ${max} updates per request` });
        }
        const pairs: Array<{ itemKey: string; shopListed: boolean }> = [];
        for (const u of updates) {
          if (!u || typeof u.itemKey !== 'string' || u.itemKey.length > 120 || typeof u.shopListed !== 'boolean') {
            return res.status(400).json({ error: 'Each update must have itemKey (string) and shopListed (boolean)' });
          }
          if (!/^[a-z0-9_]+$/.test(u.itemKey)) {
            return res.status(400).json({ error: 'Invalid itemKey format' });
          }
          pairs.push({ itemKey: u.itemKey, shopListed: u.shopListed });
        }
        const { updated, notFound } = await cosmeticsService.bulkSetShopListed(pairs);
        sendJson(res, { success: true, updatedCount: updated, notFound });
      } catch (error) {
        logger.error('Error bulk-updating shop_listed:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // PATCH /api/cosmetics/admin/tier-pricing — set MORBIUS price for all items of a tier (admin only)
    // Body: { adminAddress, tier, priceMorbius }
    app.patch('/api/cosmetics/admin/tier-pricing', express.json(), async (req, res) => {
      try {
        const { adminAddress, tier, priceMorbius } = req.body ?? {};
        if (!adminAddress || !tier || priceMorbius === undefined) {
          return res.status(400).json({ error: 'adminAddress, tier, and priceMorbius required' });
        }
        if (!isAdminWallet(adminAddress)) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        const validTiers = ['common', 'uncommon', 'rare', 'legendary'];
        if (!validTiers.includes(tier)) {
          return res.status(400).json({ error: 'Invalid tier' });
        }
        const price = Number(priceMorbius);
        if (!Number.isFinite(price) || price <= 0) {
          return res.status(400).json({ error: 'priceMorbius must be a positive number' });
        }
        const count = await cosmeticsService.updateTierPricing(tier, price);
        sendJson(res, { success: true, updatedCount: count });
      } catch (error) {
        logger.error('Error updating tier pricing:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /api/cosmetics/admin/item-owners?adminAddress=&itemKey= — list wallets that own an item (admin only)
    app.get('/api/cosmetics/admin/item-owners', async (req, res) => {
      try {
        const adminAddress = typeof req.query.adminAddress === 'string' ? req.query.adminAddress : '';
        const itemKey = typeof req.query.itemKey === 'string' ? req.query.itemKey : '';
        if (!adminAddress || !itemKey) {
          return res.status(400).json({ error: 'adminAddress and itemKey query params required' });
        }
        if (!isAdminWallet(adminAddress)) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        const owners = await cosmeticsService.getOwnersForItem(itemKey);
        sendJson(res, { owners });
      } catch (error) {
        logger.error('Error listing cosmetic item owners:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // ── Marketplace ───────────────────────────────────────────────────────────

    // GET /api/cosmetics/market — active listings (optional ?itemKey=&sellerAddress=)
    app.get('/api/cosmetics/market', async (req, res) => {
      try {
        const { itemKey, sellerAddress } = req.query as Record<string, string | undefined>;
        const listings = await cosmeticsService.getListings({
          itemKey: itemKey || undefined,
          sellerAddress: sellerAddress || undefined,
        });
        res.json({ listings });
      } catch (error) {
        logger.error('Error fetching market listings:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // POST /api/cosmetics/market/list — create a listing
    // Body: { sellerAddress, itemKey, priceMorbius }
    app.post('/api/cosmetics/market/list', express.json(), async (req, res) => {
      try {
        const { sellerAddress, itemKey, priceMorbius } = req.body ?? {};
        if (!sellerAddress || !itemKey || !priceMorbius) {
          return res.status(400).json({ error: 'sellerAddress, itemKey, and priceMorbius required' });
        }
        const price = parseInt(priceMorbius, 10);
        if (isNaN(price) || price <= 0) {
          return res.status(400).json({ error: 'priceMorbius must be a positive number' });
        }
        const result = await cosmeticsService.createListing(sellerAddress, itemKey, price);
        if (result === 'not_owned')     return res.status(403).json({ error: 'You do not own this item' });
        if (result === 'already_listed') return res.status(409).json({ error: 'Item already listed for sale' });
        if (result === 'item_not_found') return res.status(404).json({ error: 'Item not found' });
        res.json({ success: true });
      } catch (error) {
        logger.error('Error creating market listing:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // POST /api/cosmetics/market/cancel — cancel a listing
    // Body: { sellerAddress, listingId }
    app.post('/api/cosmetics/market/cancel', express.json(), async (req, res) => {
      try {
        const { sellerAddress, listingId } = req.body ?? {};
        if (!sellerAddress || !listingId) {
          return res.status(400).json({ error: 'sellerAddress and listingId required' });
        }
        const result = await cosmeticsService.cancelListing(sellerAddress, parseInt(listingId, 10));
        if (result === 'not_found') return res.status(404).json({ error: 'Listing not found' });
        if (result === 'not_yours')  return res.status(403).json({ error: 'Not your listing' });
        res.json({ success: true });
      } catch (error) {
        logger.error('Error cancelling market listing:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // POST /api/cosmetics/market/update-price — update listing price
    // Body: { sellerAddress, listingId, newPrice }
    app.post('/api/cosmetics/market/update-price', express.json(), async (req, res) => {
      try {
        const { sellerAddress, listingId, newPrice } = req.body ?? {};
        if (!sellerAddress || !listingId || !newPrice) {
          return res.status(400).json({ error: 'sellerAddress, listingId, and newPrice required' });
        }
        const p = Number(newPrice);
        if (!Number.isFinite(p) || p <= 0) {
          return res.status(400).json({ error: 'newPrice must be a positive number' });
        }
        const result = await cosmeticsService.updateListingPrice(sellerAddress, parseInt(listingId, 10), p);
        if (result === 'not_found') return res.status(404).json({ error: 'Listing not found or already sold/cancelled' });
        if (result === 'not_yours')  return res.status(403).json({ error: 'Not your listing' });
        res.json({ success: true });
      } catch (error) {
        logger.error('Error updating listing price:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // POST /api/cosmetics/market/buy — buy a marketplace listing
    // Body: { buyerAddress, listingId, txHash }
    app.post('/api/cosmetics/market/buy', express.json(), async (req, res) => {
      try {
        const { buyerAddress, listingId, txHash } = req.body ?? {};
        if (!buyerAddress || !listingId || !txHash) {
          return res.status(400).json({ error: 'buyerAddress, listingId, and txHash required' });
        }
        const result = await cosmeticsService.buyListing(buyerAddress, parseInt(listingId, 10), txHash);
        const errorMap: Record<string, [number, string]> = {
          listing_not_found:     [404, 'Listing not found'],
          already_sold:          [409, 'Listing already sold or cancelled'],
          seller_no_longer_owns: [409, 'Seller no longer owns this item'],
          tx_already_used:       [409, 'Transaction already used'],
          tx_not_found:          [400, 'Transaction not found on chain'],
          tx_wrong_sender:       [400, 'Transaction not sent from your wallet'],
          tx_wrong_recipient:    [400, 'Transaction sent to wrong address'],
          tx_insufficient_amount:[400, 'Transaction amount is too low'],
          tx_reverted:           [400, 'Transaction was reverted'],
        };
        if (result !== 'ok') {
          const [status, message] = errorMap[result] ?? [500, 'Unknown error'];
          return res.status(status).json({ error: message });
        }
        const inventory = await cosmeticsService.getInventory(buyerAddress);
        res.json({ success: true, items: inventory });
      } catch (error) {
        logger.error('Error buying market listing:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // ── Follow system ─────────────────────────────────────────────────────────

    // Follow a player (body: { follower: string })
    app.post('/api/player/:address/follow', express.json(), async (req, res) => {
      try {
        const following = req.params.address;
        const { follower } = req.body ?? {};
        if (!follower || typeof follower !== 'string') return res.status(400).json({ error: 'follower address required' });
        if (follower.toLowerCase() === following.toLowerCase()) return res.status(400).json({ error: 'Cannot follow yourself' });
        await dbService.followPlayer(follower, following);
        const counts = await dbService.getFollowCounts(following);
        sendJson(res, { success: true, ...counts });
      } catch (error) {
        logger.error('Error following player:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Unfollow a player (body: { follower: string })
    app.delete('/api/player/:address/follow', express.json(), async (req, res) => {
      try {
        const following = req.params.address;
        const { follower } = req.body ?? {};
        if (!follower || typeof follower !== 'string') return res.status(400).json({ error: 'follower address required' });
        await dbService.unfollowPlayer(follower, following);
        const counts = await dbService.getFollowCounts(following);
        sendJson(res, { success: true, ...counts });
      } catch (error) {
        logger.error('Error unfollowing player:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Check follow status (?follower=address)
    app.get('/api/player/:address/is-following', async (req, res) => {
      try {
        const following = req.params.address;
        const follower = req.query.follower as string;
        if (!follower) return res.status(400).json({ error: 'follower query param required' });
        const isFollowing = await dbService.isFollowing(follower, following);
        sendJson(res, { isFollowing });
      } catch (error) {
        logger.error('Error checking follow status:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get follow counts for a player
    app.get('/api/player/:address/follow-counts', async (req, res) => {
      try {
        const counts = await dbService.getFollowCounts(req.params.address);
        sendJson(res, counts);
      } catch (error) {
        logger.error('Error fetching follow counts:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get followers of a player
    app.get('/api/player/:address/followers', async (req, res) => {
      try {
        const limit  = Math.min(100, parseInt(req.query.limit  as string) || 50);
        const offset = parseInt(req.query.offset as string) || 0;
        const followers = await dbService.getFollowers(req.params.address, limit, offset);
        sendJson(res, followers);
      } catch (error) {
        logger.error('Error fetching followers:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get who a player is following
    app.get('/api/player/:address/following', async (req, res) => {
      try {
        const limit  = Math.min(100, parseInt(req.query.limit  as string) || 50);
        const offset = parseInt(req.query.offset as string) || 0;
        const following = await dbService.getFollowing(req.params.address, limit, offset);
        sendJson(res, following);
      } catch (error) {
        logger.error('Error fetching following:', error);
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

    app.get('/api/tips/stats', async (req, res) => {
      try {
        const pool = dbService.getPool();
        const tipAgg = await pool.query<{ total_wei: string; tip_count: string }>(
          `SELECT COALESCE(SUM((payload->>'amount')::numeric), 0)::text AS total_wei,
                  COUNT(*)::text AS tip_count
           FROM blackjack_multi_audit_log WHERE action_type = 'tip_dealer'`
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
           ORDER BY SUM((a.payload->>'amount')::numeric) DESC LIMIT 20`
        );
        sendJson(res, {
          totalTipAmountWei: tipAgg.rows[0]?.total_wei ?? '0',
          tipCount: parseInt(tipAgg.rows[0]?.tip_count ?? '0', 10),
          tippers: tipByPlayer.rows.map(r => ({
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

    // ---------- Lottery (instant 6-of-55): leaderboard + player stats (from indexed chain events) ----------
    app.get('/api/lottery/top-players', async (req, res) => {
      try {
        chainAnalytics.indexInstantLotteryResults().catch((err) => logger.warn('Lottery index (background):', err));
        const limit = Math.min(parseInt(req.query.limit as string) || 25, 50);
        const topPlayers = await dbService.getLotteryTopPlayers(limit);
        sendJson(res, topPlayers);
      } catch (error) {
        logger.error('Error fetching lottery top players:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/lottery/player/:address/stats', async (req, res) => {
      try {
        const address = (req.params.address || '').trim();
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          return res.status(400).json({ error: 'Valid wallet address required' });
        }
        chainAnalytics.indexInstantLotteryResults().catch((err) => logger.warn('Lottery index (background):', err));
        const stats = await dbService.getLotteryPlayerStats(address);
        if (stats == null) {
          return sendJson(res, { total_games: 0, total_bet: '0', total_win: '0', profit_loss: '0', win_rate: 0 });
        }
        sendJson(res, {
          total_games: stats.total_games,
          total_bet: stats.total_bet.toString(),
          total_win: stats.total_win.toString(),
          profit_loss: stats.profit_loss.toString(),
          win_rate: stats.win_rate,
        });
      } catch (error) {
        logger.error('Error fetching lottery player stats:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Instant lottery provably-fair play (MORBIUS only). Stricter rate limit to avoid abuse.
    const instantLotteryPlayLimiter = rateLimit({
      windowMs: 1 * 60 * 1000,
      max: 30,
      message: 'Too many instant lottery plays from this IP, try again later.',
      validate: { xForwardedForHeader: false },
    });
    app.post('/api/lottery/instant/play', instantLotteryPlayLimiter, async (req, res) => {
      try {
        if (!instantLotteryService.isConfigured()) {
          return res.status(503).json({ error: 'Instant lottery (provably fair) is not configured' });
        }
        const body = req.body as { address?: unknown; numbers?: unknown; wager?: unknown; clientSeed?: unknown };
        const address = typeof body?.address === 'string' ? body.address.trim() : '';
        const numbers = body?.numbers;
        const wager = typeof body?.wager === 'string' ? body.wager : (body?.wager != null ? String(body.wager) : '');
        const clientSeed = typeof body?.clientSeed === 'string' ? body.clientSeed : undefined;
        if (!address || !numbers || !wager) {
          return res.status(400).json({ error: 'address, numbers (array of 6), and wager (string) required' });
        }
        const result = await instantLotteryService.play({ address, numbers, wager, clientSeed });
        sendJson(res, result);
      } catch (error: any) {
        const msg = error?.message ?? 'Internal server error';
        if (msg.includes('Valid wallet') || msg.includes('numbers must') || msg.includes('Invalid wager') || msg.includes('Wager must')) {
          return res.status(400).json({ error: msg });
        }
        if (msg.includes('not configured')) return res.status(503).json({ error: msg });
        logger.error('Instant lottery play error:', error);
        res.status(500).json({ error: 'Instant lottery play failed' });
      }
    });

    // Verify provably-fair instant lottery play by tx hash (returns serverSeed after reveal).
    app.get('/api/lottery/instant/play/verify/:txHash', async (req, res) => {
      try {
        const txHash = (req.params.txHash || '').trim();
        if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
          return res.status(400).json({ error: 'Valid tx hash (0x + 64 hex) required' });
        }
        const play = await dbService.getInstantLotteryPlayPFByTxHash(txHash);
        if (play == null) {
          return res.status(404).json({ error: 'Play not found', message: 'No provably-fair play with this tx hash' });
        }
        const hasReveal = typeof play.server_seed === 'string' && play.server_seed.length > 0;
        const computedServerSeedHash = hasReveal ? pfService.createServerSeedHash(play.server_seed!) : null;
        const nonceNumber = Number(play.nonce);
        const canVerifyDraw =
          hasReveal &&
          Number.isSafeInteger(nonceNumber) &&
          Array.isArray(play.winning_numbers) &&
          play.winning_numbers.length === 6;
        const recomputedWinningNumbers = canVerifyDraw
          ? pfService.generate6of55WinningNumbers(play.server_seed!, play.client_seed || 'default', nonceNumber)
          : null;
        const verification = {
          revealAvailable: hasReveal,
          nonceSafeInteger: Number.isSafeInteger(nonceNumber),
          serverSeedHashMatches: hasReveal ? computedServerSeedHash === play.server_seed_hash : null,
          winningNumbersMatch:
            recomputedWinningNumbers != null
              ? JSON.stringify(recomputedWinningNumbers) === JSON.stringify(play.winning_numbers)
              : null,
          recomputed_winning_numbers: recomputedWinningNumbers,
        };
        sendJson(res, {
          wallet_address: play.wallet_address,
          wager: play.wager.toString(),
          player_numbers: play.player_numbers,
          winning_numbers: play.winning_numbers,
          match_count: play.match_count,
          gross_payout: play.gross_payout.toString(),
          net_payout: play.net_payout.toString(),
          server_seed_hash: play.server_seed_hash,
          server_seed: play.server_seed,
          client_seed: play.client_seed,
          nonce: play.nonce,
          verification,
        });
      } catch (error) {
        logger.error('Error fetching instant lottery verify:', error);
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

    /** Live WS presence per game category (home page cards, etc.) */
    app.get('/api/analytics/live-presence', (_req, res) => {
      try {
        sendJson(res, wsService.getLivePresenceByGame());
      } catch (error) {
        logger.error('Error fetching live presence:', error);
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

    // Poker player hands and stats
    app.get('/api/poker/player/:address/hands', async (req, res) => {
      try {
        const { address } = req.params;
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          return res.status(400).json({ error: 'Invalid address' });
        }
        const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 25_000);
        const offset = parseInt(req.query.offset as string) || 0;
        const hands = await dbService.getPokerPlayerHands(address, limit, offset);
        sendJson(res, hands);
      } catch (error) {
        logger.error('Error fetching poker player hands:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/poker/player/:address/stats', async (req, res) => {
      try {
        const { address } = req.params;
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          return res.status(400).json({ error: 'Invalid address' });
        }
        const rawScope = String(req.query.scope ?? 'cash');
        const scope: 'cash' | 'tournament' | 'all' =
          rawScope === 'tournament' || rawScope === 'all' ? rawScope : 'cash';
        const stats = await dbService.getPokerPlayerStats(address, scope);
        sendJson(res, stats);
      } catch (error) {
        logger.error('Error fetching poker player stats:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    app.get('/api/poker/table/:tableId/dashboard', async (req, res) => {
      try {
        const { tableId } = req.params;
        if (!tableId || !UUID_REGEX.test(tableId)) {
          return res.status(400).json({ error: 'Invalid table ID' });
        }
        const data = await dbService.getPokerTableDashboardStats(tableId);
        if (!data.table) {
          return res.status(404).json({ error: 'Table not found' });
        }
        sendJson(res, data);
      } catch (error) {
        logger.error('Error fetching poker table dashboard:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/poker/table/:tableId/player/:address/stats', async (req, res) => {
      try {
        const { tableId, address } = req.params;
        if (!tableId || !UUID_REGEX.test(tableId)) {
          return res.status(400).json({ error: 'Invalid table ID' });
        }
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          return res.status(400).json({ error: 'Invalid address' });
        }
        const data = await dbService.getPokerPlayerTableStats(tableId, address);
        sendJson(res, data);
      } catch (error) {
        logger.error('Error fetching poker player table stats:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/poker/hands/:handId', async (req, res) => {
      try {
        const { handId } = req.params;
        const playerAddress = req.query.playerAddress as string | undefined;
        if (!handId || !UUID_REGEX.test(handId)) {
          return res.status(400).json({ error: 'Invalid hand ID' });
        }
        if (!playerAddress || !/^0x[a-fA-F0-9]{40}$/.test(playerAddress)) {
          return res.status(400).json({ error: 'Invalid playerAddress query' });
        }
        const detail = await dbService.getPokerHandDetail(handId, playerAddress);
        if (!detail) {
          return res.status(404).json({ error: 'Hand not found' });
        }
        sendJson(res, detail);
      } catch (error) {
        logger.error('Error fetching poker hand detail:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/poker/chips/balance', async (req, res) => {
      try {
        const address = req.query.address as string;
        if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
          return res.status(400).json({ error: 'address query required (0x…42 hex)' });
        }
        const normalized = address.toLowerCase();
        const balance = await getPokerChipBalance(dbService.getPool(), normalized);
        return res.status(200).json({ balance: balance.toString() });
      } catch (error) {
        logger.error('Error fetching poker chip balance:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.post('/api/poker/chips/purchase', express.json(), async (req, res) => {
      try {
        const { address, chips } = req.body ?? {};
        if (!address || typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
          return res.status(400).json({ error: 'address required' });
        }
        const normalized = address.toLowerCase();
        let chipsBn: bigint;
        try {
          chipsBn = BigInt(String(chips ?? '0'));
        } catch {
          return res.status(400).json({ error: 'chips must be an integer string' });
        }
        if (chipsBn <= 0n) return res.status(400).json({ error: 'chips must be positive' });
        if (chipsBn > BigInt(Number.MAX_SAFE_INTEGER)) {
          return res.status(400).json({ error: 'chips amount too large' });
        }
        const wei = chipsToWei(Number(chipsBn));
        await dbService.withTransaction(async (client) => {
          const deduct = await client.query(
            `UPDATE players SET balance = balance - $2::NUMERIC
             WHERE LOWER(wallet_address) = LOWER($1) AND balance >= $2::NUMERIC
             RETURNING balance`,
            [normalized, wei.toString()],
          );
          if (deduct.rows.length === 0) {
            throw new Error('Insufficient MORBIUS balance for chip purchase (or player not found)');
          }
          await applyPokerChipDelta(client, normalized, chipsBn, 'purchase');
        });
        const newBal = await getPokerChipBalance(dbService.getPool(), normalized);
        return res.status(200).json({ ok: true, chipsCredited: chipsBn.toString(), pokerChipBalance: newBal.toString() });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Internal server error';
        if (msg.includes('Insufficient') || msg.includes('must be')) {
          return res.status(400).json({ error: msg });
        }
        logger.error('Poker chip purchase error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.post('/api/poker/chips/cashout', express.json(), async (req, res) => {
      try {
        const { address, chips } = req.body ?? {};
        if (!address || typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
          return res.status(400).json({ error: 'address required' });
        }
        const normalized = address.toLowerCase();
        let chipsBn: bigint;
        try {
          chipsBn = BigInt(String(chips ?? '0'));
        } catch {
          return res.status(400).json({ error: 'chips must be an integer string' });
        }
        if (chipsBn <= 0n) return res.status(400).json({ error: 'chips must be positive' });
        if (chipsBn > BigInt(Number.MAX_SAFE_INTEGER)) {
          return res.status(400).json({ error: 'chips amount too large' });
        }
        const wei = chipsToWei(Number(chipsBn));
        await dbService.withTransaction(async (client) => {
          await applyPokerChipDelta(client, normalized, -chipsBn, 'cashout');
          await client.query(
            `INSERT INTO players (wallet_address, balance) VALUES ($1, $2::NUMERIC)
             ON CONFLICT (wallet_address) DO UPDATE SET balance = players.balance + $2::NUMERIC, last_seen = NOW()`,
            [normalized, wei.toString()],
          );
        });
        const newBal = await getPokerChipBalance(dbService.getPool(), normalized);
        return res.status(200).json({ ok: true, morbiusCreditedWei: wei.toString(), pokerChipBalance: newBal.toString() });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Internal server error';
        if (msg.includes('Insufficient poker chips') || msg.includes('must be')) {
          return res.status(400).json({ error: msg });
        }
        logger.error('Poker chip cashout error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/plinko/player/:address/drops', async (req, res) => {
      try {
        const { address } = req.params;
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          return res.status(400).json({ error: 'Invalid address' });
        }
        const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 300);
        const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
        const drops = await chainAnalytics.getPlinkoPlayerDrops(address, limit, offset);
        sendJson(res, drops);
      } catch (error) {
        logger.error('Error fetching plinko player drops:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/plinko/player/:address/stats', async (req, res) => {
      try {
        const { address } = req.params;
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          return res.status(400).json({ error: 'Invalid address' });
        }
        const stats = await chainAnalytics.getPlinkoPlayerStats(address);
        sendJson(res, stats);
      } catch (error) {
        logger.error('Error fetching plinko player stats:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Blackjack global recent games (for Recent Play feed)
    app.get('/api/blackjack/recent-games', async (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 200);
        const games = await dbService.getRecentGamesGlobal(limit);
        sendJson(res, games);
      } catch (error) {
        logger.error('Error fetching blackjack recent games:', error);
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

    // Public: list completed/cancelled tournaments (for poker "History" tab)
    app.get('/api/tournament/completed', async (req, res) => {
      try {
        const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);
        const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
        const rows = await tournamentService.listCompletedTournaments(limit, offset);
        sendJson(
          res,
          rows.map((r) => ({
            ...r,
            buyInAmount: r.buyInAmount.toString(),
            prizePool: r.prizePool.toString(),
          })),
        );
      } catch (error) {
        logger.error('Error fetching completed tournaments:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Public: full tournament results (standings + payouts)
    app.get('/api/tournament/:tournamentId/results', async (req, res) => {
      try {
        const { tournamentId } = req.params;
        const results = await tournamentService.getTournamentResults(tournamentId);
        if (!results) {
          return res.status(404).json({ error: 'Tournament not found' });
        }
        sendJson(res, {
          ...results,
          buyInAmount: results.buyInAmount.toString(),
          prizePool: results.prizePool.toString(),
          entries: results.entries.map((e) => ({
            ...e,
            prizeWon: e.prizeWon.toString(),
          })),
        });
      } catch (error) {
        logger.error('Error fetching tournament results:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Public: tournament-level poker aggregates (biggest pot, hand count, etc.)
    app.get('/api/tournament/:tournamentId/stats', async (req, res) => {
      try {
        const { tournamentId } = req.params;
        const stats = await tournamentService.getTournamentPokerStats(tournamentId);
        sendJson(res, {
          ...stats,
          biggestPot: stats.biggestPot.toString(),
          totalPot: stats.totalPot.toString(),
          totalRake: stats.totalRake.toString(),
          biggestHand: stats.biggestHand
            ? { ...stats.biggestHand, potAmount: stats.biggestHand.potAmount.toString() }
            : null,
        });
      } catch (error) {
        logger.error('Error fetching tournament stats:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Public: paginated hand list for a tournament (optional player filter)
    app.get('/api/tournament/:tournamentId/hands', async (req, res) => {
      try {
        const { tournamentId } = req.params;
        const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 500);
        const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
        const playerAddress = (req.query.player as string) || null;
        const hands = await tournamentService.getTournamentHands(
          tournamentId,
          limit,
          offset,
          playerAddress,
        );
        sendJson(
          res,
          hands.map((h) => ({ ...h, potAmount: h.potAmount.toString() })),
        );
      } catch (error) {
        logger.error('Error fetching tournament hands:', error);
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
          website_url: r.website_url,
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

    // Public: default Blackjack table (theme + table id) from admin config; used when user has no saved preference
    const DEFAULT_TABLE_THEME = 'image';
    const DEFAULT_TABLE_ID = 'High-Roller-2';
    app.get('/api/blackjack/default-table', async (req, res) => {
      try {
        const config = await dbService.getAdminGameConfig();
        let themeKind = (config.blackjack_default_theme_kind ?? '').trim().toLowerCase();
        if (themeKind !== 'image' && themeKind !== 'video') themeKind = DEFAULT_TABLE_THEME;
        const tableId = (config.blackjack_default_table_id ?? '').trim() || DEFAULT_TABLE_ID;
        sendJson(res, { themeKind: themeKind as 'image' | 'video', tableId });
      } catch (error) {
        logger.error('Error fetching blackjack default table:', error);
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

    const runAdminTableUploadMulter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      uploadMulter.single('file')(req, res, (err: unknown) => {
        if (err) {
          logger.error('Admin upload multer error:', err);
          const msg = err instanceof Error ? err.message : 'Upload failed';
          res.status(400).json({ error: msg });
          return;
        }
        next();
      });
    };

    const finishAdminTableUpload = (req: express.Request, res: express.Response) => {
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
    };

    app.post(
      '/api/admin/browser-upload',
      (req, res, next) => {
        const wallet = (req.headers['x-admin-wallet'] as string | undefined)?.trim();
        if (!wallet || !isAdminWallet(wallet)) {
          res.status(403).json({ error: 'Forbidden', message: 'Admin wallet required' });
          return;
        }
        next();
      },
      runAdminTableUploadMulter,
      finishAdminTableUpload,
    );

    app.post('/api/admin/upload', runAdminTableUploadMulter, finishAdminTableUpload);

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

    // Admin: delete poker table (credits seated players' stacks back to balance, then removes table)
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

    // Admin: Multiplayer Blackjack table management
    app.get('/api/admin/bj-multi/tables', async (req, res) => {
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

    // Admin: all poker tables (including tournament tables hidden from public lobby)
    app.get('/api/admin/poker/tables', async (req, res) => {
      try {
        const result = await dbService.getPool().query(
          `SELECT pt.id, pt.small_blind, pt.big_blind, pt.max_seats, pt.status,
                  pt.tournament_mode, pt.tournament_id, pt.hand_number,
                  COUNT(ps.id) AS seated_count
           FROM poker_tables pt
           LEFT JOIN poker_seats ps ON ps.table_id = pt.id
           GROUP BY pt.id
           ORDER BY pt.created_at DESC
           LIMIT 100`
        );
        res.json({ tables: result.rows });
      } catch (error) {
        logger.error('Error fetching all poker tables:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Admin: all poker tournaments (all statuses)
    app.get('/api/admin/poker/tournaments', async (req, res) => {
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
           LIMIT 100`
        );
        res.json({ tournaments: result.rows });
      } catch (error) {
        logger.error('Error fetching poker tournaments:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Admin: poker bot management
    const pokerBotJobs = new Map<string, { tableId: string; numBots: number; startedAt: string; process: ChildProcess }>();
    const pokerTournamentBotJobs = new Map<
      string,
      { tournamentId: string; numBots: number; startedAt: string; process: ChildProcess }
    >();
    const MAX_ADMIN_BOTS = 10;

    app.post('/api/admin/poker/bots/bootstrap', express.json(), async (req, res) => {
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
          [tableId],
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

        const compiledBot = path.resolve(__dirname, 'scripts/poker-bot.js');
        const botExists = fs.existsSync(compiledBot);
        const proc = botExists
          ? spawn(process.execPath, [compiledBot, tableId, String(numBots)], {
              cwd: path.resolve(__dirname, '../..'),
              env: process.env,
              stdio: ['ignore', 'pipe', 'pipe'],
            })
          : spawn('npx', ['ts-node', path.resolve(__dirname, 'scripts/poker-bot.ts'), tableId, String(numBots)], {
              cwd: path.resolve(__dirname, '..'),
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

        res.json({ ok: true, tableId, numBots, pid: proc.pid ?? null, startedAt });
      } catch (error) {
        logger.error('Error bootstrapping poker bots:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.post('/api/admin/poker/bots/stop', express.json(), async (req, res) => {
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

    /** Registration-phase bots: `npm run poker:bot -- --tournament <id> <n>` (same machine as API; needs DATABASE_URL). */
    app.post('/api/admin/poker/tournament-bots/bootstrap', express.json(), async (req, res) => {
      try {
        const tournamentId = String(req.body?.tournamentId ?? '').trim();
        if (!tournamentId) {
          res.status(400).json({ error: 'tournamentId required' });
          return;
        }

        const gate = await assertPokerTournamentBotControlAllowed(
          dbService.getPool(),
          tournamentId,
          req.headers['x-admin-wallet'] as string | undefined,
        );
        if (!gate.ok) {
          res.status(gate.status).json({ error: gate.error });
          return;
        }

        const existingJob = pokerTournamentBotJobs.get(tournamentId);
        if (existingJob && !existingJob.process.killed) {
          res.status(409).json({
            error: 'Bots already running for this tournament',
            tournamentId,
            pid: existingJob.process.pid ?? null,
            numBots: existingJob.numBots,
            startedAt: existingJob.startedAt,
          });
          return;
        }

        const tRow = await dbService.getPool().query(
          `SELECT t.max_players,
            (SELECT COUNT(*)::int FROM tournament_entries te
             WHERE te.tournament_id = t.id AND te.status NOT IN ('busted','completed')) AS registered
           FROM tournaments t
           WHERE t.id = $1 AND t.game_type = 'poker'`,
          [tournamentId],
        );
        if (tRow.rows.length === 0) {
          res.status(404).json({ error: 'Poker tournament not found' });
          return;
        }
        const maxP = Number(tRow.rows[0].max_players ?? 0);
        const registered = Number(tRow.rows[0].registered ?? 0);
        const openSlots = Math.max(0, maxP - registered);
        if (openSlots <= 0) {
          res.status(400).json({ error: 'Tournament is full — no open registration slots for bots' });
          return;
        }

        const requestedBots = Number(req.body?.numBots);
        const numBots = Number.isFinite(requestedBots)
          ? Math.max(1, Math.min(MAX_ADMIN_BOTS, Math.floor(requestedBots), openSlots))
          : Math.min(MAX_ADMIN_BOTS, openSlots);

        const pinRaw = req.body?.pinCode;
        const pinCode =
          typeof pinRaw === 'string' && pinRaw.trim() ? pinRaw.trim().slice(0, 12) : undefined;
        const childEnv = { ...process.env, ...(pinCode ? { POKER_BOT_TOURNAMENT_PIN: pinCode } : {}) };

        const compiledBot = path.resolve(__dirname, 'scripts/poker-bot.js');
        const botExists = fs.existsSync(compiledBot);
        const proc = botExists
          ? spawn(process.execPath, [compiledBot, '--tournament', tournamentId, String(numBots)], {
              cwd: path.resolve(__dirname, '../..'),
              env: childEnv,
              stdio: ['ignore', 'pipe', 'pipe'],
            })
          : spawn('npx', ['ts-node', path.resolve(__dirname, 'scripts/poker-bot.ts'), '--tournament', tournamentId, String(numBots)], {
              cwd: path.resolve(__dirname, '..'),
              env: childEnv,
              stdio: ['ignore', 'pipe', 'pipe'],
            });

        const startedAt = new Date().toISOString();
        pokerTournamentBotJobs.set(tournamentId, { tournamentId, numBots, startedAt, process: proc });

        proc.stdout?.on('data', (chunk: Buffer) => {
          logger.info('[PokerTournamentBot]', { tournamentId, line: chunk.toString().trim() });
        });
        proc.stderr?.on('data', (chunk: Buffer) => {
          logger.warn('[PokerTournamentBot]', { tournamentId, line: chunk.toString().trim() });
        });
        proc.on('error', (err) => {
          logger.error('Poker tournament bot process error', { tournamentId, err });
        });
        proc.on('exit', (code, signal) => {
          const current = pokerTournamentBotJobs.get(tournamentId);
          if (current?.process === proc) {
            pokerTournamentBotJobs.delete(tournamentId);
          }
          logger.info('Poker tournament bot process exited', { tournamentId, code, signal });
        });

        res.json({ ok: true, tournamentId, numBots, pid: proc.pid ?? null, startedAt });
      } catch (error) {
        logger.error('Error bootstrapping poker tournament bots:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.post('/api/admin/poker/tournament-bots/stop', express.json(), async (req, res) => {
      try {
        const tournamentId = String(req.body?.tournamentId ?? '').trim();
        if (!tournamentId) {
          res.status(400).json({ error: 'tournamentId required' });
          return;
        }
        const gate = await assertPokerTournamentBotControlAllowed(
          dbService.getPool(),
          tournamentId,
          req.headers['x-admin-wallet'] as string | undefined,
        );
        if (!gate.ok) {
          res.status(gate.status).json({ error: gate.error });
          return;
        }
        const job = pokerTournamentBotJobs.get(tournamentId);
        if (!job) {
          res.status(404).json({ error: 'No running tournament bot process for this id' });
          return;
        }
        const stopped = job.process.kill('SIGTERM');
        pokerTournamentBotJobs.delete(tournamentId);
        res.json({ ok: true, tournamentId, stopped, pid: job.process.pid ?? null });
      } catch (error) {
        logger.error('Error stopping poker tournament bots:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    /**
     * Dev-only: tear down a poker tournament (delete table(s), cancel scheduled events, bust entries,
     * mark tournament cancelled, zero prize_pool) without balance refunds. Stops registration bots if running.
     * Requires `POKER_TOURNAMENT_DEV_RESET=true` on the server in addition to admin secret.
     */
    app.post('/api/admin/poker/tournaments/:tournamentId/dev-reset', async (req, res) => {
      try {
        if (process.env.POKER_TOURNAMENT_DEV_RESET !== 'true') {
          res.status(403).json({
            error:
              'Dev reset disabled. Set POKER_TOURNAMENT_DEV_RESET=true in server environment (testing only; does not refund balances).',
          });
          return;
        }
        const tournamentId = String(req.params.tournamentId ?? '').trim();
        if (!tournamentId) {
          res.status(400).json({ error: 'tournamentId required' });
          return;
        }
        const botJob = pokerTournamentBotJobs.get(tournamentId);
        if (botJob) {
          try {
            botJob.process.kill('SIGTERM');
          } catch (killErr) {
            logger.warn('Dev reset: failed to SIGTERM tournament bot process', { tournamentId, killErr });
          }
          pokerTournamentBotJobs.delete(tournamentId);
        }
        const result = await pokerTournamentService.adminDevForceResetPokerTournament(tournamentId);
        res.json({ ok: true, ...result });
      } catch (error: any) {
        const msg = error?.message ? String(error.message) : 'Internal server error';
        if (msg === 'Poker tournament not found') {
          res.status(404).json({ error: msg });
          return;
        }
        if (msg === 'Invalid tournament id') {
          res.status(400).json({ error: msg });
          return;
        }
        logger.error('Error in poker tournament dev-reset:', error);
        res.status(500).json({ error: 'Internal server error' });
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

        // Hot wallet (withdrawals): address + MORBIUS balance when configured
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

        // Treasury / fee / distribution addresses: MORBIUS balance for each (env with fallbacks)
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

        // Blackjack deposit/withdrawal totals: serve cached value immediately, refresh in background
        refreshBjTotalsBackground(chainAnalytics);
        const blackjackDeposited = _bjTotalsCache.deposited;
        const blackjackWithdrawn = _bjTotalsCache.withdrawn;

        // Time-bucketed Blackjack deposits/withdrawals (1h, 24h, 7d) from DB
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

        // Tip stats — aggregate from audit log
        let tipStats: { totalTipAmountWei: string; tipCount: number; tippers: Array<{ address: string; totalWei: string; count: number }> } = { totalTipAmountWei: '0', tipCount: 0, tippers: [] };
        try {
          const pool = dbService.getPool();
          const tipAgg = await pool.query<{ total_wei: string; tip_count: string }>(
            `SELECT COALESCE(SUM((payload->>'amount')::numeric), 0)::text AS total_wei,
                    COUNT(*)::text AS tip_count
             FROM blackjack_multi_audit_log WHERE action_type = 'tip_dealer'`
          );
          const tipByPlayer = await pool.query<{ player_address: string; total_wei: string; cnt: string }>(
            `SELECT player_address,
                    SUM((payload->>'amount')::numeric)::text AS total_wei,
                    COUNT(*)::text AS cnt
             FROM blackjack_multi_audit_log WHERE action_type = 'tip_dealer'
             GROUP BY player_address ORDER BY SUM((payload->>'amount')::numeric) DESC LIMIT 50`
          );
          tipStats = {
            totalTipAmountWei: tipAgg.rows[0]?.total_wei ?? '0',
            tipCount: parseInt(tipAgg.rows[0]?.tip_count ?? '0', 10),
            tippers: tipByPlayer.rows.map(r => ({ address: r.player_address, totalWei: r.total_wei, count: parseInt(r.cnt, 10) })),
          };
        } catch { /* ignore if table doesn't exist yet */ }

        sendJson(res, {
          api,
          ws,
          games,
          morbius,
          blackjackReservesByContract,
          contractAddresses,
          ...(hotWalletAddress != null && { hotWalletAddress, hotWalletMorbius: hotWalletMorbius ?? '0', ...(hotWalletLowWarning !== undefined && { hotWalletLowWarning }) }),
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

    // Admin: recent holder and LP reward claims (when users claim holder/LP rewards)
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
          [limit]
        );
        const lpRows = await pool.query<{ wallet_address: string; reward_amount: string; claimed_at: Date; epoch_number: number }>(
          `SELECT ms.wallet_address, ms.reward_amount::text AS reward_amount, ms.claimed_at, me.epoch_number
           FROM merkle_lp_snapshots ms
           JOIN merkle_lp_epochs me ON me.id = ms.epoch_id
           WHERE ms.claimed_at IS NOT NULL
           ORDER BY ms.claimed_at DESC
           LIMIT $1`,
          [limit]
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

    // Admin: contract snapshots (daily or hourly). Daily: one row per game per day; hourly: one per game per hour.
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

    // Admin: pending deposits/withdrawals tables (paginated)
    app.get('/api/admin/pending-transfers', async (req, res) => {
      try {
        const type = String(req.query.type || 'deposits').toLowerCase();
        const limit = Math.min(Math.max(parseInt(String(req.query.limit || '25'), 10) || 25, 1), 100);
        const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

        if (type !== 'deposits' && type !== 'withdrawals') {
          res.status(400).json({ error: 'type must be "deposits" or "withdrawals"' });
          return;
        }

        if (type === 'deposits') {
          const rows = await dbService.listPendingDeposits(limit, offset);
          sendJson(res, { type, rows, limit, offset, hasMore: rows.length === limit });
          return;
        }

        const rows = await dbService.listPendingWithdrawals(limit, offset);
        sendJson(res, { type, rows, limit, offset, hasMore: rows.length === limit });
      } catch (error) {
        logger.error('Error fetching admin pending transfers:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Admin: manually refund an expired pending withdrawal (when cron couldn't verify due to RPC, etc.)
    app.post('/api/admin/withdrawals/refund-expired', async (req, res) => {
      try {
        const address = (req.body?.address ?? req.query?.address) as string | undefined;
        const force = (req.body?.force ?? req.query?.force) === true || (req.body?.force ?? req.query?.force) === 'true';
        if (!address || typeof address !== 'string') {
          return res.status(400).json({ error: 'address required (body or query)' });
        }
        const normalizedAddress = address.toLowerCase().startsWith('0x')
          ? address.toLowerCase()
          : `0x${address.toLowerCase()}`;
        if (normalizedAddress.length !== 42) {
          return res.status(400).json({ error: 'Invalid address' });
        }

        const pending = await dbService.getExpiredPendingForWallet(normalizedAddress);
        if (!pending) {
          return res.status(404).json({
            error: 'No expired pending withdrawal found for this address. Wait until the signature has expired (~15 min) or the balance was already refunded.',
          });
        }

        if (!force) {
          try {
            const nonceUsed = await publicClient.readContract({
              address: blackjackContractAddress,
              abi: USED_NONCES_ABI,
              functionName: 'usedNonces',
              args: [BigInt(pending.nonce)],
            }) as boolean;
            if (nonceUsed) {
              await dbService.markPendingWithdrawalCompleted(normalizedAddress, BigInt(pending.nonce));
              return res.status(400).json({
                error: 'This withdrawal was already completed on-chain (nonce used). Balance was not refunded; it was marked completed.',
              });
            }
          } catch (rpcErr) {
            return res.status(503).json({
              error: 'Could not verify on-chain whether the withdrawal was used. If you have verified no tx exists, retry with ?force=1 (use with caution).',
              detail: rpcErr instanceof Error ? rpcErr.message : String(rpcErr),
            });
          }
        } else {
          logger.warn('Admin force-refund expired pending (on-chain check skipped)', {
            address: normalizedAddress,
            nonce: pending.nonce,
            amount: pending.amount,
          });
        }

        await dbService.expireSinglePendingWithdrawal(normalizedAddress, BigInt(pending.nonce), BigInt(pending.amount));
        logger.info('Admin refunded expired pending withdrawal', { address: normalizedAddress, nonce: pending.nonce, amount: pending.amount });
        sendJson(res, { ok: true, refunded: pending.amount, address: normalizedAddress });
      } catch (error) {
        logger.error('Error refunding expired withdrawal:', error);
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

    // Deposit notify: record deposit as pending; balance is credited only after N block confirmations (reorg protection).
    // Amount MUST come from chain (Deposit or DepositMORBIUS from BLACKJACK_ADDRESS) — never trust client body (PLS path had no MORBIUS decode before).
    const DEPOSIT_PLS_ABI = [
      {
        type: 'event',
        name: 'Deposit',
        inputs: [
          { name: 'player', type: 'address', indexed: true },
          { name: 'morbiusAmount', type: 'uint256', indexed: false },
          { name: 'plsAmount', type: 'uint256', indexed: false },
        ],
      },
    ] as const;
    const DEPOSIT_MORBIUS_ABI = [
      { type: 'event', name: 'DepositMORBIUS', inputs: [{ name: 'player', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
    ] as const;
    app.post('/api/deposit/notify', async (req, res) => {
      try {
        const { walletAddress, txHash } = req.body;
        if (!walletAddress || typeof walletAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
          return res.status(400).json({ error: 'Invalid wallet address' });
        }
        if (!txHash || typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
          return res.status(400).json({ error: 'Invalid tx hash' });
        }
        const confirmationsRequired = Number(process.env.DEPOSIT_CONFIRMATIONS_REQUIRED || '3');
        const publicClient = getPublicClient();
        const hash = txHash as `0x${string}`;
        const blackjackAddr = getAddress(BLACKJACK_ADDRESS);

        let receipt: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>>;
        try {
          receipt = await publicClient.getTransactionReceipt({ hash });
        } catch {
          return res.status(400).json({ error: 'Transaction not found or not yet mined' });
        }
        if (receipt.status !== 'success') {
          return res.status(400).json({ error: 'Transaction reverted on-chain' });
        }

        let txTo: `0x${string}`;
        try {
          const tx = await publicClient.getTransaction({ hash });
          if (!tx.to) {
            return res.status(400).json({ error: 'Invalid transaction (no contract target)' });
          }
          txTo = getAddress(tx.to);
        } catch {
          return res.status(400).json({ error: 'Could not load transaction' });
        }
        if (txTo !== blackjackAddr) {
          return res.status(400).json({ error: 'Transaction not sent to the Blackjack contract' });
        }

        const blockNum = receipt.blockNumber;
        const walletLower = walletAddress.toLowerCase();
        let amountBigInt: bigint | null = null;

        for (const log of receipt.logs) {
          if (log.address?.toLowerCase() !== BLACKJACK_ADDRESS.toLowerCase()) continue;
          try {
            const decoded = decodeEventLog({
              abi: DEPOSIT_MORBIUS_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === 'DepositMORBIUS') {
              const args = decoded.args as { player: string; amount: bigint };
              if (args.player?.toLowerCase() === walletLower) {
                amountBigInt = args.amount;
                break;
              }
            }
          } catch {
            /* try Deposit */
          }
          try {
            const decoded = decodeEventLog({
              abi: DEPOSIT_PLS_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === 'Deposit') {
              const args = decoded.args as { player: string; morbiusAmount: bigint; plsAmount: bigint };
              if (args.player?.toLowerCase() === walletLower) {
                amountBigInt = args.morbiusAmount;
                break;
              }
            }
          } catch {
            /* not this log */
          }
        }

        if (amountBigInt == null || amountBigInt <= 0n) {
          return res.status(400).json({
            error: 'Could not verify deposit amount on-chain (no matching Deposit or DepositMORBIUS for this wallet)',
          });
        }

        await dbService.insertPendingDeposit(walletAddress, amountBigInt, txHash, blockNum, confirmationsRequired);
        return res.status(200).json({ ok: true, message: 'Deposit recorded; balance will update after confirmations' });
      } catch (error) {
        logger.error('Error in deposit/notify:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Admin: credit deposit shortfall (e.g. when client sent wrong amount to notify and user was under-credited).
    app.post('/api/admin/deposit/credit-shortfall', async (req, res) => {
      try {
        const { txHash, correctAmountWei } = req.body;
        if (!txHash || typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
          return res.status(400).json({ error: 'Invalid tx hash' });
        }
        if (!correctAmountWei || typeof correctAmountWei !== 'string') {
          return res.status(400).json({ error: 'correctAmountWei required (string)' });
        }
        let correctBigInt: bigint;
        try { correctBigInt = BigInt(correctAmountWei); } catch { return res.status(400).json({ error: 'Invalid correctAmountWei' }); }
        if (correctBigInt <= 0n) return res.status(400).json({ error: 'correctAmountWei must be positive' });
        const row = await dbService.getCreditedPendingDepositByTxHash(txHash);
        if (!row) {
          return res.status(404).json({ error: 'No credited deposit found for this tx hash' });
        }
        const creditedWei = BigInt(row.amount_wei);
        const shortfall = correctBigInt - creditedWei;
        if (shortfall <= 0n) {
          return res.status(400).json({ error: 'No shortfall; correctAmountWei must be greater than already credited amount' });
        }
        await dbService.addPlayerBalance(row.wallet_address, shortfall);
        logger.info('Deposit shortfall credited', {
          txHash,
          wallet: row.wallet_address,
          creditedBefore: row.amount_wei,
          shortfallAdded: shortfall.toString(),
        });
        return res.status(200).json({
          ok: true,
          wallet: row.wallet_address,
          shortfallCredited: shortfall.toString(),
        });
      } catch (error) {
        logger.error('Error in admin deposit/credit-shortfall:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Shared RPC client (balance checks, legacy pending_withdrawal nonce verification, hot-wallet liquidity).
    const publicClient = getPublicClient();
    const blackjackContractAddress = BLACKJACK_ADDRESS;
    console.log('[Server] Using BLACKJACK_ADDRESS:', blackjackContractAddress);
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

    // Verify SETTLEMENT_PRIVATE_KEY matches the contract's authorizedServer.
    // If they don't match, ALL withdrawWithSignature calls will revert with "Invalid signature".
    const settlementKey = process.env.SETTLEMENT_PRIVATE_KEY as `0x${string}` | undefined;
    if (settlementKey) {
      try {
        const signerAccount = privateKeyToAccount(settlementKey);
        const onChainAuthorizedServer = await publicClient.readContract({
          address: blackjackContractAddress,
          abi: blackjackAbi,
          functionName: 'authorizedServer',
        }) as string;
        if (signerAccount.address.toLowerCase() !== onChainAuthorizedServer.toString().toLowerCase()) {
          logger.error('CRITICAL: SETTLEMENT_PRIVATE_KEY does not match contract authorizedServer!', {
            signerAddress: signerAccount.address,
            contractAuthorizedServer: onChainAuthorizedServer,
            contract: blackjackContractAddress,
          });
        } else {
          logger.info('Withdrawal signer verified: matches contract authorizedServer', {
            signerAddress: signerAccount.address,
          });
        }
      } catch (err) {
        logger.warn('Could not verify SETTLEMENT_PRIVATE_KEY against contract authorizedServer', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      logger.info('SETTLEMENT_PRIVATE_KEY not set — hot-wallet withdrawals do not require it; legacy contract flows might');
    }

    // Startup: process any orphaned pending withdrawals with on-chain nonce verification.
    // This replaces the old blind-refund approach that could cause double withdrawals.
    try {
      const orphaned = await dbService.getExpiredPendingWithdrawals();
      if (orphaned.length > 0) {
        let refundedCount = 0;
        let completedCount = 0;
        for (const row of orphaned) {
          try {
            const nonceUsed = await publicClient.readContract({
              address: blackjackContractAddress,
              abi: USED_NONCES_ABI,
              functionName: 'usedNonces',
              args: [BigInt(row.nonce)],
            }) as boolean;

            if (nonceUsed) {
              await dbService.markPendingWithdrawalCompleted(row.wallet_address, BigInt(row.nonce));
              completedCount++;
              logger.warn('Startup: pending withdrawal was completed on-chain — marked completed (no refund)', {
                address: row.wallet_address, nonce: row.nonce, amount: row.amount,
              });
            } else {
              await dbService.expireSinglePendingWithdrawal(row.wallet_address, BigInt(row.nonce), BigInt(row.amount));
              refundedCount++;
            }
          } catch (rpcErr) {
            logger.error('Startup: failed to check nonce on-chain — skipping (cron will retry)', {
              address: row.wallet_address, nonce: row.nonce,
              error: rpcErr instanceof Error ? rpcErr.message : String(rpcErr),
            });
          }
        }
        if (refundedCount > 0) logger.info(`Startup: expired ${refundedCount} orphaned pending withdrawal(s) and refunded balances`);
        if (completedCount > 0) logger.info(`Startup: marked ${completedCount} pending withdrawal(s) as completed (on-chain nonce used)`);
      }
    } catch (err) {
      logger.error('Startup: failed to process pending withdrawals', err);
    }

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

    // Hot withdrawal queue worker: process one queued job at a time (broadcast only; confirmation worker finalizes).
    const HOT_WITHDRAW_QUEUE_INTERVAL_MS = Number(process.env.HOT_WITHDRAW_QUEUE_INTERVAL_MS) || 3000;
    setInterval(async () => {
      const walletClient = getHotWalletClient();
      if (!walletClient) return;
      try {
        const job = await dbService.claimNextHotWithdrawalJob();
        if (!job) return;
        const netToUser = BigInt(job.net_to_user_wei);
        const amountWei = BigInt(job.amount_wei);
        const addr = job.wallet_address as `0x${string}`;
        try {
          const txHash = await walletClient.writeContract({
            account: walletClient.account!,
            chain: pulsechain,
            address: MORBIUS_TOKEN_ADDRESS,
            abi: ERC20_TRANSFER_ABI,
            functionName: 'transfer',
            args: [addr, netToUser],
          });
          await dbService.updateHotWithdrawalJob(job.id, { status: 'pending_confirmation', tx_hash: txHash });
          logger.info('Hot withdrawal broadcast', { jobId: job.id, txHash, address: job.wallet_address });
        } catch (txErr: any) {
          const errMsg = txErr?.message?.slice(0, 500) ?? String(txErr);
          await dbService.updateHotWithdrawalJob(job.id, {
            status: 'failed',
            error_message: errMsg,
          });
          logger.error('Hot withdrawal broadcast failed (no refund — contact support)', { jobId: job.id, error: errMsg });
        }
      } catch (err) {
        logger.error('Hot withdrawal queue worker error', err);
      }
    }, HOT_WITHDRAW_QUEUE_INTERVAL_MS);

    // Hot withdrawal confirmation worker: poll receipts; complete or fail (with 15min timeout for dropped tx).
    const HOT_WITHDRAW_CONFIRM_PENDING_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
    setInterval(async () => {
      try {
        const publicClient = getPublicClient();
        const jobs = await dbService.getHotWithdrawalJobsPendingConfirmation();
        for (const job of jobs) {
          const ageMs = Date.now() - new Date(job.updated_at).getTime();
          const markDropped = async () => {
            await dbService.updateHotWithdrawalJob(job.id, {
              status: 'failed',
              error_message: 'Transaction not found after 15 minutes (dropped?) — contact support',
            });
            logger.warn('Hot withdrawal dropped/timeout (no refund — contact support)', { jobId: job.id, txHash: job.tx_hash });
          };
          try {
            const receipt = await publicClient.getTransactionReceipt({ hash: job.tx_hash as `0x${string}` });
            if (receipt) {
              if (receipt.status === 'success') {
                await dbService.updateHotWithdrawalJob(job.id, { status: 'completed' });
                await dbService.addToBlackjackWithdrawnTotal(BigInt(job.amount_wei));
                await dbService.recordHotWalletWithdrawal(job.wallet_address, BigInt(job.amount_wei), job.tx_hash);
                logger.info('Hot withdrawal confirmed', { jobId: job.id, txHash: job.tx_hash });
                // Distribute 5% fee to holders, burn, platform, LP (same split as BlackjackV2: 1.25% / 0.5% / 1.75% / 1.5%)
                const feeWei = (BigInt(job.amount_wei) * 500n) / 10000n;
                if (feeWei > 0n) {
                  const walletClient = getHotWalletClient();
                  if (walletClient?.account) {
                    try {
                      const [distRecipient, burnAddr, platformRecipient, lpRecipient] = await Promise.all([
                        publicClient.readContract({ address: blackjackContractAddress, abi: blackjackAbi, functionName: 'distributionRecipient' }) as Promise<`0x${string}`>,
                        publicClient.readContract({ address: blackjackContractAddress, abi: blackjackAbi, functionName: 'burnAddress' }) as Promise<`0x${string}`>,
                        publicClient.readContract({ address: blackjackContractAddress, abi: blackjackAbi, functionName: 'platformFeeRecipient' }) as Promise<`0x${string}`>,
                        publicClient.readContract({ address: blackjackContractAddress, abi: blackjackAbi, functionName: 'lpDistributionRecipient' }) as Promise<`0x${string}`>,
                      ]);
                      const distAmt = (feeWei * 125n) / 500n;
                      const burnAmt = (feeWei * 50n) / 500n;
                      const platformAmt = (feeWei * 175n) / 500n;
                      const lpAmt = (feeWei * 150n) / 500n;
                      const send = async (to: string, amount: bigint, label: string) => {
                        if (amount <= 0n || !to || to === '0x0000000000000000000000000000000000000000') return;
                        try {
                          await walletClient.writeContract({
                            account: walletClient.account!,
                            chain: pulsechain,
                            address: MORBIUS_TOKEN_ADDRESS,
                            abi: ERC20_TRANSFER_ABI,
                            functionName: 'transfer',
                            args: [to as `0x${string}`, amount],
                          });
                          logger.info('Hot withdrawal fee sent', { jobId: job.id, to: label, amount: amount.toString() });
                        } catch (e) {
                          logger.error('Hot withdrawal fee transfer failed', { jobId: job.id, to: label, error: e });
                        }
                      };
                      await send(distRecipient, distAmt, 'distributionRecipient');
                      await send(burnAddr, burnAmt, 'burnAddress');
                      await send(platformRecipient, platformAmt, 'platformFeeRecipient');
                      await send(lpRecipient, lpAmt, 'lpDistributionRecipient');
                    } catch (e) {
                      logger.error('Hot withdrawal fee distribution failed (reading recipients)', { jobId: job.id, error: e });
                    }
                  }
                }
              } else {
                await dbService.updateHotWithdrawalJob(job.id, { status: 'failed', error_message: 'Transaction reverted on-chain — contact support' });
                logger.warn('Hot withdrawal reverted on-chain (no refund — contact support)', { jobId: job.id, txHash: job.tx_hash });
              }
            } else if (ageMs > HOT_WITHDRAW_CONFIRM_PENDING_TIMEOUT_MS) {
              await markDropped();
            }
          } catch (receiptErr: any) {
            if (ageMs > HOT_WITHDRAW_CONFIRM_PENDING_TIMEOUT_MS) {
              await markDropped();
            }
          }
        }
      } catch (err) {
        logger.error('Hot withdrawal confirmation worker error', err);
      }
    }, 30_000); // every 30s

    // Pending deposits confirmation: credit balance only after N block confirmations (reorg protection).
    setInterval(async () => {
      try {
        const publicClient = getPublicClient();
        const currentBlock = await publicClient.getBlockNumber();
        const pending = await dbService.getPendingDepositsForConfirmation();
        for (const row of pending) {
          let blockNumber = row.block_number != null ? BigInt(row.block_number) : null;
          if (blockNumber == null) {
            try {
              const receipt = await publicClient.getTransactionReceipt({ hash: row.tx_hash as `0x${string}` });
              if (receipt?.blockNumber != null) {
                blockNumber = receipt.blockNumber;
                await dbService.updatePendingDepositBlockNumber(row.id, blockNumber);
              }
            } catch {
              continue;
            }
          }
          if (blockNumber == null) continue;
          const confirmations = Number(currentBlock - blockNumber);
          if (confirmations >= row.confirmations_required) {
            const credited = await dbService.creditPendingDeposit(row.id);
            if (credited) {
              logger.info('Deposit confirmed and credited', { wallet: row.wallet_address, txHash: row.tx_hash, confirmations });
            }
          }
        }
      } catch (err) {
        logger.error('Pending deposits confirmation worker error', err);
      }
    }, 10_000); // every 10s

    // Contract daily snapshot scheduler: take on-chain cumulative stats once per hour.
    const runContractSnapshot = async () => {
      try {
        const saved = await chainAnalytics.takeAndSaveDailySnapshots();
        logger.info(`Contract daily snapshot saved (${saved} games)`);
      } catch (err) {
        logger.error('Contract daily snapshot error', err);
      }
    };
    runContractSnapshot();
    setInterval(runContractSnapshot, 60 * 60 * 1000); // every hour

    // Prime the BJ totals cache on startup (runs in background, non-blocking)
    refreshBjTotalsBackground(chainAnalytics);

    // Authoritative playable balance over HTTP (survives refresh; no WebSocket required).
    // Legacy: if an old signature-based pending_withdrawal exists, reconcile nonce on-chain then return DB balance.
    app.get('/api/player/:address/balance', async (req, res) => {
      try {
        const rawAddress = req.params.address;
        if (!rawAddress || typeof rawAddress !== 'string') {
          return res.status(400).json({ error: 'Address required' });
        }
        const normalizedAddress = rawAddress.toLowerCase().startsWith('0x')
          ? rawAddress.toLowerCase()
          : `0x${rawAddress.toLowerCase()}`;
        if (normalizedAddress.length !== 42) {
          return res.status(400).json({ error: 'Invalid address' });
        }

        const pending = await dbService.getActivePendingWithdrawal(normalizedAddress);
        if (pending) {
          try {
            const nonceUsed = await publicClient.readContract({
              address: blackjackContractAddress,
              abi: USED_NONCES_ABI,
              functionName: 'usedNonces',
              args: [BigInt(pending.nonce)],
            }) as boolean;
            if (nonceUsed) {
              await dbService.markPendingWithdrawalCompleted(normalizedAddress, BigInt(pending.nonce));
              logger.info('Balance endpoint: resolved pending withdrawal as completed', {
                address: normalizedAddress,
                nonce: pending.nonce,
              });
            }
          } catch (rpcErr) {
            logger.warn('Balance endpoint: could not check pending withdrawal nonce', {
              address: normalizedAddress,
              error: rpcErr instanceof Error ? rpcErr.message : String(rpcErr),
            });
          }
        }

        const balance = await dbService.getPlayerBalance(normalizedAddress);
        return res.status(200).json({ balance: balance.toString() });
      } catch (error) {
        logger.error('Error fetching player balance:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Hot-wallet auto-withdrawal: payouts are ERC20 transfers from HOT_WALLET — not from the Blackjack contract.
    app.post('/api/withdraw', async (req, res) => {
      try {
        const { address, amount } = req.body;

        if (!address || typeof address !== 'string') {
          return res.status(400).json({ error: 'Address required' });
        }
        const normalizedAddress = address.toLowerCase().startsWith('0x')
          ? address.toLowerCase()
          : `0x${address.toLowerCase()}`;
        if (normalizedAddress.length !== 42) {
          return res.status(400).json({ error: 'Invalid address' });
        }

        const amountBigInt = amount != null ? BigInt(String(amount)) : 0n;
        if (amountBigInt < MIN_WITHDRAWAL_WEI) {
          return res.status(400).json({ error: 'Amount required (min 1 MORBIUS)', minWei: MIN_WITHDRAWAL_WEI.toString() });
        }

        const walletClient = getHotWalletClient();
        if (!walletClient) {
          logger.error('Hot wallet not configured (HOT_WALLET_PRIVATE_KEY)');
          return res.status(503).json({ error: 'Withdrawals temporarily unavailable' });
        }

        const feeBps = 500n; // 5%
        const feeAmount = (amountBigInt * feeBps) / 10000n;
        const netToUser = amountBigInt - feeAmount;

        const hotWalletAddress = walletClient.account!.address;
        let hotMorbiusBalance: bigint;
        try {
          hotMorbiusBalance = await publicClient.readContract({
            address: MORBIUS_TOKEN_ADDRESS,
            abi: ERC20_BALANCE_OF_ABI,
            functionName: 'balanceOf',
            args: [hotWalletAddress],
          }) as bigint;
        } catch (rpcErr) {
          logger.error('withdraw: failed to read hot wallet MORBIUS balance', {
            error: rpcErr instanceof Error ? rpcErr.message : String(rpcErr),
          });
          return res.status(503).json({ error: 'Cannot verify withdrawal liquidity. Try again shortly.' });
        }
        if (hotMorbiusBalance < netToUser) {
          logger.warn('withdraw: hot wallet cannot cover net payout', {
            hotWallet: hotWalletAddress,
            balanceWei: hotMorbiusBalance.toString(),
            netToUserWei: netToUser.toString(),
          });
          return res.status(503).json({
            error: 'Withdrawals are temporarily limited (hot wallet liquidity). Try a smaller amount or later.',
          });
        }

        const jobId = await dbService.enqueueHotWithdrawal(
          normalizedAddress,
          amountBigInt,
          netToUser,
          feeAmount,
        );

        return res.status(202).json({
          jobId,
          message: 'Queued',
          status: 'queued',
        });
      } catch (error: any) {
        if (error?.message?.startsWith('Insufficient balance')) {
          return res.status(400).json({ error: error.message });
        }
        logger.error('Withdrawal enqueue error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/api/withdraw/status/:jobId', async (req, res) => {
      try {
        const { jobId } = req.params;
        if (!jobId) return res.status(400).json({ error: 'jobId required' });
        const job = await dbService.getHotWithdrawalJobById(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        const payload: { jobId: string; status: string; txHash?: string; error?: string; netToUser?: string } = {
          jobId: job.id,
          status: job.status,
        };
        if (job.tx_hash) payload.txHash = job.tx_hash;
        if (job.error_message) payload.error = job.error_message;
        if (job.net_to_user_wei) payload.netToUser = job.net_to_user_wei;
        return res.status(200).json(payload);
      } catch (error) {
        logger.error('Withdraw status error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Withdraw pending: returns the latest in-progress job for a wallet (so frontend can resume polling after refresh)
    app.get('/api/withdraw/pending', async (req, res) => {
      try {
        const address = req.query.address as string;
        if (!address || typeof address !== 'string') return res.status(400).json({ error: 'address required' });
        const normalizedAddress = address.toLowerCase().startsWith('0x') ? address.toLowerCase() : `0x${address.toLowerCase()}`;
        if (normalizedAddress.length !== 42) return res.status(400).json({ error: 'Invalid address' });
        const job = await dbService.getActiveHotWithdrawalJob(normalizedAddress);
        if (!job) return res.status(200).json({ job: null });
        return res.status(200).json({
          job: {
            jobId: job.id,
            status: job.status,
            txHash: job.tx_hash ?? undefined,
            error: job.error_message ?? undefined,
            netToUser: job.net_to_user_wei,
          },
        });
      } catch (error) {
        logger.error('Withdraw pending error:', error);
        res.status(500).json({ error: 'Internal server error' });
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

        const countdown_duration = parseInt(s.countdown_duration ?? '0', 10) || 0;
        sendJson(res, { schedule_type: type, next_drop_at, countdown_duration });
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
        const allowed = new Set(['schedule_type', 'schedule_day', 'schedule_hour_utc', 'schedule_interval', 'default_reward_wei', 'auto_publish_onchain', 'countdown_duration']);
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

    // ─────────────────────────────────────────────────────────────────────────
    // Merkle LP drop routes — LP token holder rewards
    // ─────────────────────────────────────────────────────────────────────────

    // Public: list published LP epochs
    app.get('/api/merkle-lp/epochs', async (_req, res) => {
      try {
        const epochs = await merkleDropsLPService!.listPublishedEpochs();
        sendJson(res, epochs);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Public: get claim proof for a wallet
    app.get('/api/merkle-lp/claim/:epochNumber/:walletAddress', async (req, res) => {
      try {
        const epochNumber = parseInt(req.params.epochNumber, 10);
        const walletAddress = req.params.walletAddress;
        if (!walletAddress || !walletAddress.startsWith('0x')) {
          res.status(400).json({ error: 'Invalid wallet address' }); return;
        }
        const proof = await merkleDropsLPService!.getClaimProof(epochNumber, walletAddress);
        if (!proof) { res.status(404).json({ error: 'No claim found' }); return; }
        sendJson(res, proof);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Public: schedule info
    app.get('/api/merkle-lp/schedule', async (_req, res) => {
      try {
        const info = await merkleDropsLPService!.getScheduleInfo();
        sendJson(res, info);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Admin: list all LP epochs
    app.get('/api/admin/merkle-lp/epochs', async (req, res) => {
      try {
        const epochs = await merkleDropsLPService!.listEpochs();
        sendJson(res, epochs);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Admin: create new LP epoch (snapshot runs automatically)
    app.post('/api/admin/merkle-lp/epoch/create', async (req, res) => {
      try {
        const epoch = await merkleDropsLPService!.createEpoch({});
        sendJson(res, epoch);
      } catch (error) {
        logger.error('Error creating LP epoch:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // Admin: get single LP epoch
    app.get('/api/admin/merkle-lp/epoch/:epochId', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        const epoch = await merkleDropsLPService!.getEpoch(epochId);
        if (!epoch) { res.status(404).json({ error: 'Epoch not found' }); return; }
        sendJson(res, epoch);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Admin: re-run snapshot
    app.post('/api/admin/merkle-lp/epoch/:epochId/snapshot', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        const { snapshotBlock } = req.body as { snapshotBlock?: number };
        await merkleDropsLPService!.takeSnapshot(epochId, snapshotBlock);
        const epoch = await merkleDropsLPService!.getEpoch(epochId);
        sendJson(res, epoch);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Admin: calculate rewards
    app.post('/api/admin/merkle-lp/epoch/:epochId/calculate', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        const { newRewardAmount } = req.body as { newRewardAmount?: string };
        if (!newRewardAmount) { res.status(400).json({ error: 'newRewardAmount required' }); return; }
        await merkleDropsLPService!.calculateRewards(epochId, newRewardAmount);
        const epoch = await merkleDropsLPService!.getEpoch(epochId);
        sendJson(res, epoch);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Admin: finalize (build Merkle tree)
    app.post('/api/admin/merkle-lp/epoch/:epochId/finalize', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        const root = await merkleDropsLPService!.generateMerkleTree(epochId);
        const epoch = await merkleDropsLPService!.getEpoch(epochId);
        sendJson(res, { root, epoch });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Admin: mark published
    app.post('/api/admin/merkle-lp/epoch/:epochId/publish', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        await merkleDropsLPService!.markPublished(epochId);
        const epoch = await merkleDropsLPService!.getEpoch(epochId);
        sendJson(res, epoch);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Admin: revoke epoch
    app.post('/api/admin/merkle-lp/epoch/:epochId/revoke', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        await merkleDropsLPService!.revokeEpoch(epochId);
        const epoch = await merkleDropsLPService!.getEpoch(epochId);
        sendJson(res, epoch);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Admin: paginated snapshot data
    app.get('/api/admin/merkle-lp/epoch/:epochId/snapshot', async (req, res) => {
      try {
        const epochId = parseInt(req.params.epochId, 10);
        const page = Math.max(1, parseInt(String(req.query.page || 1), 10));
        const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || 50), 10)));
        const data = await merkleDropsLPService!.getSnapshotPage(epochId, page, pageSize);
        sendJson(res, data);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Admin: LP pair management
    app.get('/api/admin/merkle-lp/pairs', async (_req, res) => {
      try {
        const pairs = await merkleDropsLPService!.listPairs();
        sendJson(res, pairs);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.post('/api/admin/merkle-lp/pairs', async (req, res) => {
      try {
        const { pairAddress, label, dexName } = req.body as {
          pairAddress: string; label: string; dexName?: string;
        };
        if (!pairAddress || !label) { res.status(400).json({ error: 'pairAddress and label required' }); return; }
        const pair = await merkleDropsLPService!.addPair(pairAddress, label, dexName);
        sendJson(res, pair);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.patch('/api/admin/merkle-lp/pairs/:address', async (req, res) => {
      try {
        const { active } = req.body as { active: boolean };
        await merkleDropsLPService!.setPairActive(req.params.address, active);
        res.status(200).json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.delete('/api/admin/merkle-lp/pairs/:address', async (req, res) => {
      try {
        await merkleDropsLPService!.removePair(req.params.address);
        res.status(200).json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Admin: blocklist
    app.get('/api/admin/merkle-lp/blocklist', async (_req, res) => {
      try {
        sendJson(res, await merkleDropsLPService!.listBlocklist());
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.post('/api/admin/merkle-lp/blocklist', async (req, res) => {
      try {
        const { address, reason } = req.body as { address: string; reason?: string };
        if (!address) { res.status(400).json({ error: 'address required' }); return; }
        await merkleDropsLPService!.addToBlocklist(address, reason ?? '');
        res.status(200).json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.delete('/api/admin/merkle-lp/blocklist/:address', async (req, res) => {
      try {
        await merkleDropsLPService!.removeFromBlocklist(req.params.address);
        res.status(200).json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Admin: settings
    app.get('/api/admin/merkle-lp/settings', async (_req, res) => {
      try {
        sendJson(res, await merkleDropsLPService!.getSettings());
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    app.post('/api/admin/merkle-lp/settings', async (req, res) => {
      try {
        const patch = req.body as Record<string, string>;
        if (!patch || typeof patch !== 'object') { res.status(400).json({ error: 'Invalid body' }); return; }
        await merkleDropsLPService!.updateSettings(patch);
        sendJson(res, await merkleDropsLPService!.getSettings());
      } catch (error) {
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
let merkleDropsLPService: MerkleDropsLPService | null = null;

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
  merkleDropsLPService?.stopCron();
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
  merkleDropsLPService?.stopCron();
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