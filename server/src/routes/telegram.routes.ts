/**
 * telegram.routes.ts — HTTP routes for the Telegram notification feature.
 *
 * Inbound webhook (Telegram -> us):
 *   POST /api/telegram/webhook            (verified by secret-token header)
 *
 * Browser-facing link flow (web app -> us):
 *   POST /api/telegram/link-code          generate a one-time link code
 *   GET  /api/telegram/status             is this wallet linked?
 *   POST /api/telegram/preferences        toggle notifications on/off
 *   POST /api/telegram/unlink             disconnect this wallet
 *
 * Admin:
 *   POST /api/admin/telegram/setup-webhook   register the webhook with Telegram
 *
 * AUTH NOTE: the browser-facing endpoints trust the wallet `address` supplied in
 * the request, exactly like the existing POST /api/player/profile route — this
 * app does not sign player-profile mutations. The link code is short-lived
 * (10 min) and linking still requires the player to message the bot, so the
 * worst case of a spoofed address is limited to notification routing (no funds
 * are ever at risk here). If stronger auth is added app-wide later, these
 * endpoints should adopt it too.
 */

import type { Express, Request, Response } from 'express';
import type { Pool } from 'pg';
import { logger } from '../utils/logger';
import {
  sendTelegramMessage,
  setTelegramWebhook,
  generateLinkCode,
  getPublicAppUrl,
  isTelegramConfigured,
  shortWallet,
} from '../services/telegram.service';

interface RegisterTelegramRoutesOptions {
  app: Express;
  pool: Pool;
}

/** Validate + normalize an EVM wallet address to lowercase. Returns null if bad. */
function normalizeWallet(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const a = raw.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(a) ? a : null;
}

/** Bot username (without @) used to build t.me deep links. Null if unset. */
function getBotUsername(): string | null {
  const u = (process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
  return u.length > 0 ? u : null;
}

export function registerTelegramRoutes({ app, pool }: RegisterTelegramRoutesOptions): void {
  // -------------------------------------------------------------------------
  // POST /api/telegram/webhook — inbound updates from Telegram.
  // -------------------------------------------------------------------------
  app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
    // Verify the request really came from Telegram via the shared secret token.
    const expectedSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    if (!expectedSecret) {
      logger.warn('[telegram] webhook hit but TELEGRAM_WEBHOOK_SECRET is not set — rejecting.');
      return res.status(401).json({ ok: false, error: 'webhook not configured' });
    }
    const gotSecret = (req.headers['x-telegram-bot-api-secret-token'] as string | undefined)?.trim();
    if (gotSecret !== expectedSecret) {
      return res.status(401).json({ ok: false, error: 'bad secret token' });
    }

    // Always answer 200 to Telegram (even on internal errors) so it doesn't
    // hammer us with retries. Command work happens best-effort below.
    try {
      const message = req.body?.message;
      const chatId = Number(message?.chat?.id);
      const text = typeof message?.text === 'string' ? message.text.trim() : '';
      const fromUsername =
        typeof message?.from?.username === 'string' ? message.from.username : null;
      const isBot = message?.from?.is_bot === true;

      if (!Number.isFinite(chatId) || !text || isBot) {
        return res.json({ ok: true }); // nothing actionable
      }

      // Parse the command. Handles "/link@MyBot CODE" group-style mentions too.
      const parts = text.split(/\s+/);
      const command = parts[0].toLowerCase().split('@')[0];
      const arg = parts[1] ? parts[1].trim() : '';

      if (command === '/start' || command === '/link') {
        if (!arg) {
          await sendTelegramMessage(
            chatId,
            '👋 Welcome to MORBlotto notifications!\n\n' +
              'To get pinged when your poker tournaments are about to start, link your ' +
              'wallet:\n\n' +
              '1. Open Settings → Notifications on the MORBlotto website.\n' +
              '2. Tap "Link Telegram" to get a 6-character code.\n' +
              '3. Send it here as:  /link YOURCODE\n\n' +
              'Send /help anytime to see commands.',
          );
          return res.json({ ok: true });
        }
        const code = arg.toUpperCase();
        try {
          const result = await consumeLinkCode(pool, code, chatId, fromUsername);
          if (result.ok && result.wallet) {
            await sendTelegramMessage(
              chatId,
              `✅ Linked to wallet ${shortWallet(result.wallet)}.\n\n` +
                "You'll get a heads-up here when your MORBlotto poker tournaments are " +
                'about to start. Send /unlink anytime to stop.',
            );
          } else {
            await sendTelegramMessage(
              chatId,
              '⚠️ That code is invalid, expired, or already used.\n\n' +
                'Codes last 10 minutes. Generate a fresh one on the website ' +
                '(Settings → Notifications) and send it again as:  /link NEWCODE',
            );
          }
        } catch (err) {
          logger.error('[telegram] link code consumption failed', { error: (err as Error).message });
          await sendTelegramMessage(
            chatId,
            '⚠️ Something went wrong linking your wallet. Please try again in a moment.',
          );
        }
        return res.json({ ok: true });
      }

      if (command === '/unlink') {
        try {
          const del = await pool.query(
            'DELETE FROM telegram_links WHERE telegram_chat_id = $1 RETURNING wallet_address',
            [chatId],
          );
          if (del.rows.length > 0) {
            await sendTelegramMessage(
              chatId,
              '✅ Unlinked. You will not receive any more notifications.\n\n' +
                'You can reconnect anytime from Settings → Notifications on the website.',
            );
          } else {
            await sendTelegramMessage(
              chatId,
              'There is no wallet linked to this chat, so there is nothing to unlink.',
            );
          }
        } catch (err) {
          logger.error('[telegram] unlink failed', { error: (err as Error).message });
          await sendTelegramMessage(chatId, '⚠️ Something went wrong. Please try again shortly.');
        }
        return res.json({ ok: true });
      }

      // /help and everything else.
      await sendTelegramMessage(
        chatId,
        'MORBlotto bot commands:\n\n' +
          '/link <code> — connect your wallet (get a code from the website: Settings → Notifications)\n' +
          '/unlink — disconnect and stop notifications\n' +
          '/help — show this message',
      );
      return res.json({ ok: true });
    } catch (err) {
      logger.error('[telegram] webhook handler error', { error: (err as Error).message });
      // Still 200 — see note above.
      return res.json({ ok: true });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/telegram/link-code — generate a one-time code for a wallet.
  // -------------------------------------------------------------------------
  app.post('/api/telegram/link-code', async (req: Request, res: Response) => {
    const wallet = normalizeWallet(req.body?.address ?? req.body?.walletAddress);
    if (!wallet) {
      return res.status(400).json({ error: 'A valid wallet address is required.' });
    }
    try {
      const { code, expiresAt } = await createUniqueLinkCode(pool, wallet);
      const botUsername = getBotUsername();
      res.json({
        code,
        expiresAt,
        botUsername,
        // Deep links are only usable when the bot username is configured.
        deepLink: botUsername ? `tg://resolve?domain=${botUsername}&start=${code}` : null,
        webLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
      });
    } catch (err) {
      logger.error('[telegram] link-code generation failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Could not generate a link code. Please try again.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/telegram/status?address=0x... — is this wallet linked?
  // -------------------------------------------------------------------------
  app.get('/api/telegram/status', async (req: Request, res: Response) => {
    const wallet = normalizeWallet(req.query?.address);
    if (!wallet) {
      return res.status(400).json({ error: 'A valid wallet address is required.' });
    }
    try {
      const row = await pool.query(
        `SELECT telegram_username, linked_at, notifications_enabled, telegram_chat_id
         FROM telegram_links WHERE wallet_address = $1`,
        [wallet],
      );
      if (row.rows.length === 0 || row.rows[0].telegram_chat_id == null) {
        return res.json({
          linked: false,
          username: null,
          linkedAt: null,
          notificationsEnabled: false,
        });
      }
      const r = row.rows[0];
      res.json({
        linked: true,
        username: r.telegram_username ?? null,
        linkedAt: r.linked_at ?? null,
        notificationsEnabled: r.notifications_enabled === true,
      });
    } catch (err) {
      logger.error('[telegram] status lookup failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Could not load Telegram status.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/telegram/preferences — toggle notifications on/off.
  // -------------------------------------------------------------------------
  app.post('/api/telegram/preferences', async (req: Request, res: Response) => {
    const wallet = normalizeWallet(req.body?.address ?? req.body?.walletAddress);
    if (!wallet) {
      return res.status(400).json({ error: 'A valid wallet address is required.' });
    }
    if (typeof req.body?.notificationsEnabled !== 'boolean') {
      return res.status(400).json({ error: 'notificationsEnabled (boolean) is required.' });
    }
    const enabled = req.body.notificationsEnabled as boolean;
    try {
      const upd = await pool.query(
        `UPDATE telegram_links SET notifications_enabled = $2
         WHERE wallet_address = $1 RETURNING notifications_enabled`,
        [wallet, enabled],
      );
      if (upd.rows.length === 0) {
        return res.status(404).json({ error: 'This wallet has no linked Telegram account.' });
      }
      res.json({ ok: true, notificationsEnabled: upd.rows[0].notifications_enabled === true });
    } catch (err) {
      logger.error('[telegram] preferences update failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Could not update notification preferences.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/telegram/unlink — disconnect this wallet from Telegram.
  // -------------------------------------------------------------------------
  app.post('/api/telegram/unlink', async (req: Request, res: Response) => {
    const wallet = normalizeWallet(req.body?.address ?? req.body?.walletAddress);
    if (!wallet) {
      return res.status(400).json({ error: 'A valid wallet address is required.' });
    }
    try {
      await pool.query('DELETE FROM telegram_links WHERE wallet_address = $1', [wallet]);
      res.json({ ok: true });
    } catch (err) {
      logger.error('[telegram] unlink failed', { error: (err as Error).message });
      res.status(500).json({ error: 'Could not unlink Telegram.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/admin/telegram/setup-webhook — register the webhook with Telegram.
  // Mounted under /api/admin so it inherits the existing x-admin-secret guard.
  // Body: { url?: string }  (defaults to PUBLIC_APP_URL + /api/telegram/webhook)
  // -------------------------------------------------------------------------
  app.post('/api/admin/telegram/setup-webhook', async (req: Request, res: Response) => {
    if (!isTelegramConfigured()) {
      return res.status(503).json({ error: 'TELEGRAM_BOT_TOKEN is not set on the server.' });
    }
    const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    if (!secret) {
      return res.status(503).json({ error: 'TELEGRAM_WEBHOOK_SECRET is not set on the server.' });
    }
    let url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url) {
      const base = getPublicAppUrl();
      if (!base) {
        return res.status(400).json({
          error: 'No url provided and PUBLIC_APP_URL is not set — cannot build the webhook URL.',
        });
      }
      url = `${base}/api/telegram/webhook`;
    }
    const result = await setTelegramWebhook(url, secret);
    if (!result.ok) {
      return res.status(502).json({ ok: false, error: result.error, url });
    }
    logger.info('[telegram] webhook registered', { url });
    res.json({ ok: true, url });
  });

  logger.info('[telegram] routes registered');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Insert a fresh link code, retrying on the (astronomically unlikely) PK clash. */
async function createUniqueLinkCode(
  pool: Pool,
  wallet: string,
): Promise<{ code: string; expiresAt: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateLinkCode();
    try {
      const r = await pool.query(
        `INSERT INTO telegram_link_codes (code, wallet_address, expires_at)
         VALUES ($1, $2, now() + interval '10 minutes')
         RETURNING code, expires_at`,
        [code, wallet],
      );
      return { code: r.rows[0].code, expiresAt: r.rows[0].expires_at };
    } catch (err) {
      // 23505 = unique_violation — code already exists, just try another.
      if ((err as { code?: string })?.code === '23505') continue;
      throw err;
    }
  }
  throw new Error('could not generate a unique link code after 5 attempts');
}

/**
 * Consume a one-time code and link the Telegram chat to the wallet. Runs in a
 * transaction so a half-applied link can never happen.
 */
async function consumeLinkCode(
  pool: Pool,
  code: string,
  chatId: number,
  username: string | null,
): Promise<{ ok: boolean; wallet?: string; reason?: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const codeRow = await client.query(
      `SELECT code, wallet_address FROM telegram_link_codes
       WHERE code = $1 AND consumed_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [code],
    );
    if (codeRow.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'invalid_or_expired' };
    }
    const wallet = String(codeRow.rows[0].wallet_address).toLowerCase();

    // A Telegram account links to exactly one wallet. Drop any prior row that
    // owns this chat id so moving the account to a new wallet works, and so the
    // telegram_chat_id UNIQUE constraint can't be violated by the upsert below.
    await client.query('DELETE FROM telegram_links WHERE telegram_chat_id = $1', [chatId]);

    await client.query(
      `INSERT INTO telegram_links
         (wallet_address, telegram_chat_id, telegram_username, linked_at, notifications_enabled)
       VALUES ($1, $2, $3, now(), TRUE)
       ON CONFLICT (wallet_address) DO UPDATE
         SET telegram_chat_id = EXCLUDED.telegram_chat_id,
             telegram_username = EXCLUDED.telegram_username,
             linked_at = now()`,
      [wallet, chatId, username],
    );

    await client.query(
      'UPDATE telegram_link_codes SET consumed_at = now() WHERE code = $1',
      [code],
    );

    await client.query('COMMIT');
    return { ok: true, wallet };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
