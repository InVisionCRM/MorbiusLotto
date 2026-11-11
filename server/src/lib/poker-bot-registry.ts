/**
 * Poker bot registry — the ONE place that answers "is this wallet a bot?".
 *
 * Backed by `poker_bot_accounts` (migration 200). Loaded once at server
 * startup (`loadPokerBotRegistry`) and refreshed on an interval; every reader
 * (WS bot-token auth, tournament bot tick/fill, Weekly Drop exclusion, rail
 * feed suppression, bankroll funding) uses the synchronous cached accessors.
 *
 * Fail-fast contract: reading before `loadPokerBotRegistry` has succeeded
 * throws `PokerBotRegistryNotLoadedError`. There is no env-var fallback and
 * no built-in address list — an empty table simply means "no bots".
 *
 * Bot wallets are synthetic (no private key): chips credited to them can only
 * move through server code (lib/poker-bot-bankroll.ts), never on-chain.
 */

import type { Pool, PoolClient } from 'pg';
import { randomPlaceholderConfig } from './cosmetics-catalog';
import { logger } from '../utils/logger';

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const DISPLAY_NAME_SUFFIX = '_bot';

export interface PokerBotAccount {
  /** Lowercase 0x address (synthetic — keyless). */
  walletAddress: string;
  /** Always ends in `_bot`. */
  displayName: string;
  /** AI tuning knobs; `{}` until personalities ship. */
  personality: Record<string, unknown>;
}

export class PokerBotRegistryNotLoadedError extends Error {
  constructor() {
    super('poker_bot_accounts registry not loaded — call loadPokerBotRegistry(pool) at startup');
    this.name = 'PokerBotRegistryNotLoadedError';
  }
}

let accounts: Map<string, PokerBotAccount> | null = null;

function requireLoaded(): Map<string, PokerBotAccount> {
  if (!accounts) throw new PokerBotRegistryNotLoadedError();
  return accounts;
}

function toAccount(row: { wallet_address: string; display_name: string; personality: unknown }): PokerBotAccount {
  const walletAddress = String(row.wallet_address);
  if (!ADDRESS_RE.test(walletAddress)) {
    throw new Error(`poker_bot_accounts: invalid wallet_address "${walletAddress}" (must be lowercase 0x + 40 hex)`);
  }
  const displayName = String(row.display_name);
  if (!displayName.endsWith(DISPLAY_NAME_SUFFIX)) {
    throw new Error(`poker_bot_accounts: display_name "${displayName}" must end with "${DISPLAY_NAME_SUFFIX}"`);
  }
  const personality =
    row.personality && typeof row.personality === 'object' && !Array.isArray(row.personality)
      ? (row.personality as Record<string, unknown>)
      : {};
  return { walletAddress, displayName, personality };
}

/**
 * (Re)load active bot accounts from the DB into the in-memory registry.
 * Throws on DB error or malformed rows; on success replaces the cache atomically.
 */
export async function loadPokerBotRegistry(db: Pool | PoolClient): Promise<PokerBotAccount[]> {
  const r = await db.query<{ wallet_address: string; display_name: string; personality: unknown }>(
    `SELECT wallet_address, display_name, personality
       FROM poker_bot_accounts
      WHERE active = TRUE
      ORDER BY wallet_address ASC`,
  );
  const next = new Map<string, PokerBotAccount>();
  for (const row of r.rows) {
    const acct = toAccount(row);
    next.set(acct.walletAddress, acct);
  }
  accounts = next;
  return [...next.values()];
}

/** True when `address` is an active bot. Throws if the registry was never loaded. */
export function isPokerBotWallet(address: string): boolean {
  return requireLoaded().has(address.trim().toLowerCase());
}

/** Fresh Set of lowercase bot addresses (callers may mutate their copy). */
export function getPokerBotAddressSet(): Set<string> {
  return new Set(requireLoaded().keys());
}

export function getPokerBotAccount(address: string): PokerBotAccount | null {
  return requireLoaded().get(address.trim().toLowerCase()) ?? null;
}

export function listPokerBotAccounts(): PokerBotAccount[] {
  return [...requireLoaded().values()];
}

/**
 * Ensure each bot has the rows the table + auth paths expect:
 * `players`, `player_poker_chips`, and a `chat_display_names` row carrying
 * the `_bot` display name with a placeholder avatar (kept if already set).
 * Idempotent; run at startup after `loadPokerBotRegistry`.
 */
export async function syncPokerBotProfiles(db: Pool | PoolClient): Promise<void> {
  const bots = listPokerBotAccounts();
  for (const bot of bots) {
    await db.query(
      `INSERT INTO players (wallet_address, balance) VALUES ($1, '0')
       ON CONFLICT (wallet_address) DO NOTHING`,
      [bot.walletAddress],
    );
    await db.query(
      `INSERT INTO player_poker_chips (wallet_address, balance) VALUES ($1, 0)
       ON CONFLICT (wallet_address) DO NOTHING`,
      [bot.walletAddress],
    );
    await db.query(
      `INSERT INTO chat_display_names (wallet_address, display_name, avatar_config)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (wallet_address) DO UPDATE SET
         display_name  = EXCLUDED.display_name,
         avatar_config = COALESCE(chat_display_names.avatar_config, EXCLUDED.avatar_config),
         updated_at    = NOW()`,
      [bot.walletAddress, bot.displayName, JSON.stringify(randomPlaceholderConfig(new Set()))],
    );
  }
  logger.info('Poker bot profiles synced', { count: bots.length });
}

/**
 * Unit-test seam: install a registry without a DB. Pass `null` to reset to
 * the not-loaded state. Never call from production code.
 */
export function setPokerBotRegistryForTesting(list: PokerBotAccount[] | null): void {
  if (list === null) {
    accounts = null;
    return;
  }
  const next = new Map<string, PokerBotAccount>();
  for (const acct of list) {
    const normalized = toAccount({
      wallet_address: acct.walletAddress.toLowerCase(),
      display_name: acct.displayName,
      personality: acct.personality,
    });
    next.set(normalized.walletAddress, normalized);
  }
  accounts = next;
}
