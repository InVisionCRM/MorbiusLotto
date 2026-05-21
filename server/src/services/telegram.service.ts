/**
 * telegram.service.ts — low-level Telegram Bot API client + helpers.
 *
 * GRACEFUL DEGRADATION IS THE WHOLE POINT OF THIS FILE.
 * If TELEGRAM_BOT_TOKEN is not set, NOTHING in here throws. Every send becomes a
 * logged no-op and every helper returns a clean `{ ok: false }`. A missing or
 * bad Telegram token must NEVER be able to stop the server from booting or
 * break gameplay — this is a tiny convenience feature bolted onto a casino.
 *
 * Two directions of bot traffic this supports:
 *   1. Outbound (server -> player): sendTelegramMessage() -> api.telegram.org
 *   2. Inbound  (player -> server): handled by the webhook in telegram.routes.ts
 *      (this file just provides setTelegramWebhook() to register that webhook).
 */

import { randomInt, createHmac } from 'crypto';
import { logger } from '../utils/logger';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

/** Read + trim the bot token. Returns null when unset/empty (feature disabled). */
function getBotToken(): string | null {
  const t = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  return t.length > 0 ? t : null;
}

/** True when a bot token is configured. Callers use this to skip work silently. */
export function isTelegramConfigured(): boolean {
  return getBotToken() !== null;
}

// Warn about a missing token only once per process so logs don't get spammed.
let warnedMissingToken = false;
function warnMissingTokenOnce(context: string): void {
  if (warnedMissingToken) return;
  warnedMissingToken = true;
  logger.warn(
    `[telegram] TELEGRAM_BOT_TOKEN is not set — Telegram notifications are disabled (${context}). ` +
      'Add it to server/.env to enable. The rest of the server is unaffected.',
  );
}

/**
 * Public base URL of the web app, used to build deep links inside messages.
 * Falls back through a few env vars so a forgotten PUBLIC_APP_URL doesn't break
 * anything — returns null if truly nothing is configured (caller omits buttons).
 */
export function getPublicAppUrl(): string | null {
  const candidates = [
    process.env.PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.FRONTEND_URL,
  ];
  for (const raw of candidates) {
    if (!raw || !raw.trim()) continue;
    // FRONTEND_URL can be a comma-separated list — take the first entry.
    const first = raw.split(',')[0].trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(first)) return first;
  }
  return null;
}

export interface TelegramButton {
  text: string;
  url: string;
}

export interface SendMessageOpts {
  /** Each button becomes its own row in the inline keyboard. */
  buttons?: TelegramButton[];
  parseMode?: 'Markdown' | 'HTML';
  /** Defaults to true — link previews are noisy for our short messages. */
  disableWebPagePreview?: boolean;
}

/**
 * Send a message to a single Telegram chat. Best-effort: never throws, always
 * resolves to { ok }. Logs failures so delivery problems are visible.
 */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  opts: SendMessageOpts = {},
): Promise<{ ok: boolean; error?: string; messageId?: number }> {
  const token = getBotToken();
  if (!token) {
    warnMissingTokenOnce('sendTelegramMessage');
    return { ok: false, error: 'telegram_not_configured' };
  }
  if (!Number.isFinite(chatId)) {
    return { ok: false, error: 'invalid_chat_id' };
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      disable_web_page_preview: opts.disableWebPagePreview ?? true,
    };
    if (opts.parseMode) body.parse_mode = opts.parseMode;
    if (opts.buttons && opts.buttons.length > 0) {
      body.reply_markup = {
        inline_keyboard: opts.buttons.map((b) => [{ text: b.text, url: b.url }]),
      };
    }

    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!res.ok || !json?.ok) {
      const error = json?.description || `HTTP ${res.status}`;
      logger.warn('[telegram] sendMessage failed', { chatId, error });
      return { ok: false, error };
    }
    return { ok: true, messageId: json.result?.message_id };
  } catch (err) {
    const error = (err as Error)?.message ?? 'unknown error';
    logger.warn('[telegram] sendMessage threw', { chatId, error });
    return { ok: false, error };
  }
}

/**
 * Edit an existing message's text — used to keep the group "Rail" tournament
 * card current as seats fill / the tournament goes live. Best-effort, never throws.
 */
export async function editTelegramMessage(
  chatId: number,
  messageId: number,
  text: string,
  opts: SendMessageOpts = {},
): Promise<{ ok: boolean; error?: string }> {
  const token = getBotToken();
  if (!token) {
    warnMissingTokenOnce('editTelegramMessage');
    return { ok: false, error: 'telegram_not_configured' };
  }
  if (!Number.isFinite(chatId) || !Number.isFinite(messageId)) {
    return { ok: false, error: 'invalid_ids' };
  }
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      disable_web_page_preview: opts.disableWebPagePreview ?? true,
    };
    if (opts.parseMode) body.parse_mode = opts.parseMode;
    if (opts.buttons && opts.buttons.length > 0) {
      body.reply_markup = {
        inline_keyboard: opts.buttons.map((b) => [{ text: b.text, url: b.url }]),
      };
    }
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !json?.ok) {
      // "message is not modified" just means nothing changed — treat as success.
      if (json?.description && /not modified/i.test(json.description)) {
        return { ok: true };
      }
      return { ok: false, error: json?.description || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? 'unknown error' };
  }
}

/**
 * Numeric chat id of the Telegram group the public "Rail" feed posts to. Read
 * from TELEGRAM_GROUP_CHAT_ID; null when unset (Rail posts become silent no-ops).
 * Group ids are negative — the bot's /chatid command prints it.
 */
export function getTelegramGroupChatId(): number | null {
  const raw = (process.env.TELEGRAM_GROUP_CHAT_ID || '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/**
 * Register (or re-register) the inbound webhook with Telegram. `secret` is sent
 * back by Telegram on every webhook call as the X-Telegram-Bot-Api-Secret-Token
 * header so our route can verify the request really came from Telegram.
 * One-time setup — exposed via POST /api/admin/telegram/setup-webhook.
 */
export async function setTelegramWebhook(
  url: string,
  secret: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = getBotToken();
  if (!token) {
    warnMissingTokenOnce('setTelegramWebhook');
    return { ok: false, error: 'telegram_not_configured' };
  }
  if (!/^https:\/\//i.test(url)) {
    return { ok: false, error: 'webhook url must be https' };
  }

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        secret_token: secret,
        allowed_updates: ['message'],
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.description || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? 'unknown error' };
  }
}

// 6-char codes. Alphabet deliberately excludes 0/O and 1/I so a player reading
// the code off their screen can't mistype it.
const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Generate a 6-char uppercase alphanumeric one-time link code, e.g. "AB2CD9". */
export function generateLinkCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
  }
  return out;
}

/** Short, safe display form of a wallet address, e.g. "0xAbCd…1234". */
export function shortWallet(address: string): string {
  const a = (address || '').trim();
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export interface TelegramWebAppUser {
  id: number;
  username?: string;
  firstName?: string;
}

/**
 * Verify a Telegram Mini App `initData` string against the bot token, using
 * Telegram's documented HMAC-SHA256 scheme. Returns the authenticated user, or
 * null when the signature is invalid, the data is stale (>24h), or the token is
 * unset. This is the trust anchor for the Mini App — never skip it.
 */
export function verifyTelegramInitData(initData: string): TelegramWebAppUser | null {
  const token = getBotToken();
  if (!token || !initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    // data_check_string: every remaining pair as "key=value", sorted by key,
    // joined with newlines.
    const dataCheckString = [...params.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
    const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (computed !== hash) return null;

    // Reject stale initData (older than 24h) to limit replay.
    const authDate = Number(params.get('auth_date') || '0');
    if (!authDate || Date.now() / 1000 - authDate > 86_400) return null;

    const userRaw = params.get('user');
    if (!userRaw) return null;
    const user = JSON.parse(userRaw) as { id?: number; username?: string; first_name?: string };
    if (!user || typeof user.id !== 'number') return null;
    return { id: user.id, username: user.username, firstName: user.first_name };
  } catch {
    return null;
  }
}
