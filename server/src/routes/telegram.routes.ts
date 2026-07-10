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
  setTelegramCommands,
  setTelegramMenuButton,
  generateLinkCode,
  getPublicAppUrl,
  isTelegramConfigured,
  shortWallet,
  verifyTelegramInitData,
  type TelegramCommand,
} from '../services/telegram.service';
import { getPokerChipBalance } from '../services/poker-chip-wallet';
import type { DatabaseService } from '../services/database.service';
import type { PokerGameService } from '../services/poker-game.service';
import type {
  PokerTournamentService,
  CreatePokerTournamentParams,
} from '../services/poker-tournament.service';

interface RegisterTelegramRoutesOptions {
  app: Express;
  pool: Pool;
  dbService: DatabaseService;
  /** Poker services — used by the read-only Mini App lobby feed. */
  pokerGameService: PokerGameService;
  pokerTournamentService: PokerTournamentService;
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

/** The wallet linked to a Telegram chat, or null when the chat isn't linked. */
async function getLinkedWallet(pool: Pool, chatId: number): Promise<string | null> {
  const r = await pool.query(
    'SELECT wallet_address FROM telegram_links WHERE telegram_chat_id = $1',
    [chatId],
  );
  return r.rows.length > 0 ? String(r.rows[0].wallet_address) : null;
}

export function registerTelegramRoutes({
  app,
  pool,
  dbService,
  pokerGameService,
  pokerTournamentService,
}: RegisterTelegramRoutesOptions): void {
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
      const chatType = typeof message?.chat?.type === 'string' ? message.chat.type : '';
      const text = typeof message?.text === 'string' ? message.text.trim() : '';
      const fromUsername =
        typeof message?.from?.username === 'string' ? message.from.username : null;
      const isBot = message?.from?.is_bot === true;

      if (!Number.isFinite(chatId) || !text || isBot) {
        return res.json({ ok: true }); // nothing actionable
      }

      // Parse the command. Handles "/link@MyBot CODE" group-style mentions too.
      const parts = text.split(/\s+/);
      const rawFirst = parts[0];
      const command = rawFirst.toLowerCase().split('@')[0];
      const arg = parts[1] ? parts[1].trim() : '';

      const isPrivate = chatType === 'private';
      const isCommand = rawFirst.startsWith('/');

      // In a group the bot must stay silent unless it is *explicitly addressed*.
      // With Telegram Group Privacy enabled the bot only receives commands,
      // @mentions and replies to itself — but that setting can be off (and only
      // applies from the moment the bot joins), so we guard here regardless:
      //   • ignore ordinary chatter (anything not starting with "/"), and
      //   • ignore commands aimed at a different bot, e.g. "/start@OtherBot".
      // Unrecognized commands then fall through to the catch-all, which is
      // itself gated to private chats / explicit /help so a group never gets an
      // unsolicited help reply. This is what stops the bot answering every message.
      if (!isPrivate) {
        if (!isCommand) {
          return res.json({ ok: true });
        }
        const mention = rawFirst.includes('@') ? rawFirst.split('@')[1].toLowerCase() : null;
        const botUsername = getBotUsername();
        if (mention && botUsername && mention !== botUsername.toLowerCase()) {
          return res.json({ ok: true });
        }
      }

      if (command === '/start' || command === '/link') {
        if (!arg) {
          await sendTelegramMessage(
            chatId,
            '👋 Welcome to MORBIUS notifications!\n\n' +
              'To get pinged when your poker tournaments are about to start, link your ' +
              'wallet:\n\n' +
              '1. Open Settings → Notifications on the MORBIUS website.\n' +
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
                "You'll get a heads-up here when your MORBIUS poker tournaments are " +
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

      // /chatid — utility for wiring up the group activity feed. Returns the
      // current chat's id (negative for groups) so an admin can set
      // TELEGRAM_GROUP_CHAT_ID. Works in DMs and groups alike.
      if (command === '/chatid') {
        await sendTelegramMessage(
          chatId,
          `This chat's ID is:\n\n<code>${chatId}</code>\n\n` +
            'To make this group the MORBIUS activity feed, set ' +
            'TELEGRAM_GROUP_CHAT_ID to that value in the server environment.',
          { parseMode: 'HTML' },
        );
        return res.json({ ok: true });
      }

      if (command === '/app') {
        const base = getPublicAppUrl() || 'https://morbius.io';
        if (chatType === 'private') {
          await sendTelegramMessage(
            chatId,
            '🎮 Your MORBIUS hub — balances, stats, wallet and profile in one place.',
            { buttons: [{ text: 'Open MORBIUS', webAppUrl: `${base}/tg` }] },
          );
        } else {
          const bot = getBotUsername();
          await sendTelegramMessage(
            chatId,
            'Open the MORBIUS app from a direct chat with me — tap the menu button there, ' +
              'or use the link below.',
            bot ? { buttons: [{ text: 'Message the MORBIUS bot', url: `https://t.me/${bot}` }] } : {},
          );
        }
        return res.json({ ok: true });
      }

      if (command === '/balance') {
        if (chatType !== 'private') {
          await sendTelegramMessage(
            chatId,
            'Send /balance to me in a direct message — I will not post your balance in a group.',
          );
          return res.json({ ok: true });
        }
        const wallet = await getLinkedWallet(pool, chatId);
        if (!wallet) {
          await sendTelegramMessage(
            chatId,
            'No wallet is linked yet. Get a code on the website (Settings → Notifications) ' +
              'and send:  /link YOURCODE',
          );
          return res.json({ ok: true });
        }
        try {
          const [balRow, chips] = await Promise.all([
            pool.query('SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)', [
              wallet,
            ]),
            getPokerChipBalance(pool, wallet),
          ]);
          const wei =
            balRow.rows[0]?.balance != null
              ? BigInt(String(balRow.rows[0].balance).split('.')[0] || '0')
              : 0n;
          const morbius = (wei / 10n ** 18n).toLocaleString('en-US');
          await sendTelegramMessage(
            chatId,
            '💰 Your MORBIUS balance\n\n' +
              `MORBIUS: ${morbius}\n` +
              `Poker chips: ${chips.toLocaleString('en-US')}`,
          );
        } catch (err) {
          logger.error('[telegram] /balance failed', { error: (err as Error).message });
          await sendTelegramMessage(chatId, '⚠️ Could not load your balance. Try again shortly.');
        }
        return res.json({ ok: true });
      }

      if (command === '/stats') {
        if (chatType !== 'private') {
          await sendTelegramMessage(
            chatId,
            'Send /stats to me in a direct message for your personal poker numbers.',
          );
          return res.json({ ok: true });
        }
        const wallet = await getLinkedWallet(pool, chatId);
        if (!wallet) {
          await sendTelegramMessage(
            chatId,
            'No wallet is linked yet. Get a code on the website (Settings → Notifications) ' +
              'and send:  /link YOURCODE',
          );
          return res.json({ ok: true });
        }
        try {
          const s = await dbService.getPokerPlayerStats(wallet, 'all');
          const pl = BigInt(String(s.profit_loss || '0').split('.')[0] || '0');
          const plText = `${pl >= 0n ? '+' : '-'}${(pl < 0n ? -pl : pl).toLocaleString('en-US')}`;
          await sendTelegramMessage(
            chatId,
            '♠️ Your poker stats (all games)\n\n' +
              `Hands played: ${s.total_hands.toLocaleString('en-US')}\n` +
              `Win rate: ${s.win_rate.toFixed(1)}%\n` +
              `Net profit/loss: ${plText} chips\n` +
              `Best streak: ${s.best_streak}`,
          );
        } catch (err) {
          logger.error('[telegram] /stats failed', { error: (err as Error).message });
          await sendTelegramMessage(chatId, '⚠️ Could not load your stats. Try again shortly.');
        }
        return res.json({ ok: true });
      }

      if (command === '/top') {
        const base = getPublicAppUrl() || 'https://morbius.io';
        // /top [chips|pot|hands] — default chips. Aliases keep it human.
        const rawArg = (arg || '').toLowerCase();
        const category: 'net_chips' | 'biggest_pot' | 'hands_played' =
          rawArg === 'pot' || rawArg === 'biggest' || rawArg === 'biggest_pot'
            ? 'biggest_pot'
            : rawArg === 'hands' || rawArg === 'played' || rawArg === 'hands_played'
              ? 'hands_played'
              : 'net_chips';
        try {
          const top = await dbService.getPokerTopPlayers(category, 10, null);
          if (top.rows.length === 0) {
            await sendTelegramMessage(
              chatId,
              'No completed poker hands yet — the leaderboard is empty.',
              { buttons: [{ text: 'Open MORBIUS', webAppUrl: `${base}/tg` }] },
            );
            return res.json({ ok: true });
          }
          const heading =
            category === 'biggest_pot'
              ? '🏆 Top players · biggest pot won'
              : category === 'hands_played'
                ? '🏆 Top players · hands played'
                : '🏆 Top players · net chips';
          const formatValue = (r: typeof top.rows[number]): string => {
            if (category === 'hands_played') {
              return `${r.hands_played.toLocaleString('en-US')} hands`;
            }
            const raw = category === 'net_chips' ? r.net_chips : r.biggest_pot;
            let n: bigint;
            try {
              n = BigInt(String(raw || '0').split('.')[0] || '0');
            } catch {
              n = 0n;
            }
            const sign = category === 'net_chips' ? (n >= 0n ? '+' : '-') : '';
            const abs = (n < 0n ? -n : n).toLocaleString('en-US');
            return `${sign}${abs} chips`;
          };
          const nameFor = (r: typeof top.rows[number]): string => {
            if (r.display_name && r.display_name.trim().length > 0) return r.display_name;
            const a = r.address || '';
            return a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'anon';
          };
          const lines = top.rows.map(
            (r) => `${r.rank}. ${nameFor(r)} — ${formatValue(r)}`,
          );
          await sendTelegramMessage(
            chatId,
            `${heading}\n\n${lines.join('\n')}\n\n` +
              'Tip: send /top pot or /top hands for other categories.',
            { buttons: [{ text: 'Open MORBIUS', webAppUrl: `${base}/tg` }] },
          );
        } catch (err) {
          logger.error('[telegram] /top failed', { error: (err as Error).message });
          await sendTelegramMessage(
            chatId,
            '⚠️ Could not load the leaderboard. Try again shortly.',
          );
        }
        return res.json({ ok: true });
      }

      if (command === '/lobby') {
        const base = getPublicAppUrl() || 'https://morbius.io';
        try {
          const open = await pool.query(
            `SELECT name, buy_in_amount, registered_count, max_players
               FROM poker_tournament_registrations
              WHERE status = 'registration' AND COALESCE(is_private, FALSE) = FALSE
              ORDER BY created_at DESC
              LIMIT 10`,
          );
          if (open.rows.length === 0) {
            await sendTelegramMessage(
              chatId,
              'No tournaments are open for registration right now. Check back soon — ' +
                'or start one yourself.',
              { buttons: [{ text: 'Open the poker lobby', url: `${base}/poker` }] },
            );
            return res.json({ ok: true });
          }
          const lines = open.rows.map((t) => {
            const raw = BigInt(String(t.buy_in_amount ?? '0').split('.')[0] || '0');
            const buy = raw > 0n ? `${raw.toLocaleString('en-US')} buy-in` : 'Free';
            const seats = `${Number(t.registered_count ?? 0)}/${Number(t.max_players ?? 0)} players`;
            return `• ${t.name} — ${buy} · ${seats}`;
          });
          await sendTelegramMessage(
            chatId,
            `🎲 Tournaments open now (${open.rows.length})\n\n${lines.join('\n')}`,
            { buttons: [{ text: 'Open the poker lobby', url: `${base}/poker` }] },
          );
        } catch (err) {
          logger.error('[telegram] /lobby failed', { error: (err as Error).message });
          await sendTelegramMessage(chatId, '⚠️ Could not load the lobby. Try again shortly.');
        }
        return res.json({ ok: true });
      }

      if (command === '/recent' || command === '/lasthand') {
        if (chatType !== 'private') {
          await sendTelegramMessage(
            chatId,
            'Send /recent to me in a direct message — I will not post your hand history in a group.',
          );
          return res.json({ ok: true });
        }
        const wallet = await getLinkedWallet(pool, chatId);
        if (!wallet) {
          await sendTelegramMessage(
            chatId,
            'No wallet is linked yet. Get a code on the website (Settings → Notifications) ' +
              'and send:  /link YOURCODE',
          );
          return res.json({ ok: true });
        }
        const base = getPublicAppUrl() || 'https://morbius.io';
        try {
          const hands = await dbService.getPokerPlayerHands(wallet, 5, 0);
          if (hands.length === 0) {
            await sendTelegramMessage(
              chatId,
              "You haven't completed any poker hands yet. Jump into a table and try one.",
              { buttons: [{ text: 'Open the poker lobby', webAppUrl: `${base}/tg` }] },
            );
            return res.json({ ok: true });
          }
          const formatChips = (raw: string): string => {
            let n: bigint;
            try {
              n = BigInt(String(raw || '0').split('.')[0] || '0');
            } catch {
              n = 0n;
            }
            return n.toLocaleString('en-US');
          };
          const lines = hands.map((h, i) => {
            const contributed = BigInt(String(h.myContributed || '0').split('.')[0] || '0');
            const won = BigInt(String(h.myWon || '0').split('.')[0] || '0');
            const net = won - contributed;
            const sign = net >= 0n ? '+' : '-';
            const absNet = (net < 0n ? -net : net).toLocaleString('en-US');
            const label =
              h.resultType === 'win'
                ? '🟢 WIN '
                : h.resultType === 'fold'
                  ? '⚪ FOLD'
                  : '🔴 LOSS';
            // Short hand id (first 8 chars of UUID) — enough to look up in the verify page.
            const shortId = h.id.slice(0, 8);
            return (
              `${i + 1}. ${label} · ${sign}${absNet} chips · pot ${formatChips(h.pot_amount)}\n` +
              `   id: ${shortId}…  (hand #${h.hand_number})`
            );
          });
          // Link the most-recent hand directly; older ones are reachable by id on the verify page.
          const latestVerifyUrl = `${base}/poker/verify?handId=${encodeURIComponent(hands[0].id)}`;
          await sendTelegramMessage(
            chatId,
            `♣️ Your last ${hands.length} poker hand${hands.length === 1 ? '' : 's'}\n\n` +
              `${lines.join('\n\n')}\n\n` +
              'Tap below to verify the most-recent shuffle. ' +
              'For older hands, paste the id at ' +
              `${base.replace(/^https?:\/\//, '')}/poker/verify.`,
            { buttons: [{ text: 'Verify latest hand', url: latestVerifyUrl }] },
          );
        } catch (err) {
          logger.error('[telegram] /recent failed', { error: (err as Error).message });
          await sendTelegramMessage(
            chatId,
            '⚠️ Could not load your recent hands. Try again shortly.',
          );
        }
        return res.json({ ok: true });
      }

      // /help — and, in private chats only, a friendly fallback for anything
      // unrecognized. In a group we answer only an explicit /help (bare or
      // /help@ThisBot, both allowed through the guard above) and stay silent on
      // any other unrecognized command, so the bot never replies to stray text.
      if (command === '/help' || isPrivate) {
        await sendTelegramMessage(
          chatId,
          'MORBIUS bot commands:\n\n' +
            '/app — open the MORBIUS app (hub, stats, wallet, profile)\n' +
            '/balance — your MORBIUS + poker chip balance\n' +
            '/stats — your poker stats\n' +
            '/recent — your last 5 poker hands (with verify link)\n' +
            '/lobby — tournaments open right now\n' +
            '/top [chips|pot|hands] — top players leaderboard\n' +
            '/link <code> — connect your wallet (code from the website: Settings → Notifications)\n' +
            '/unlink — disconnect and stop notifications\n' +
            '/chatid — show the chat ID (for group setup)\n' +
            '/help — show this message',
        );
      }
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

  // -------------------------------------------------------------------------
  // POST /api/admin/telegram/setup-bot — register the bot's "/" command menu
  // and point its menu button at the Mini App. Run once (and again after the
  // command list changes). Mounted under /api/admin so it inherits the guard.
  // -------------------------------------------------------------------------
  app.post('/api/admin/telegram/setup-bot', async (_req: Request, res: Response) => {
    if (!isTelegramConfigured()) {
      return res.status(503).json({ error: 'TELEGRAM_BOT_TOKEN is not set on the server.' });
    }
    const commands: TelegramCommand[] = [
      { command: 'app', description: 'Open the MORBIUS app' },
      { command: 'balance', description: 'Your MORBIUS + poker chip balance' },
      { command: 'stats', description: 'Your poker stats' },
      { command: 'lobby', description: 'Tournaments open right now' },
      { command: 'top', description: 'Top players leaderboard' },
      { command: 'link', description: 'Connect your wallet' },
      { command: 'unlink', description: 'Stop notifications' },
      { command: 'chatid', description: 'Show the chat ID (group setup)' },
      { command: 'help', description: 'Show all commands' },
    ];
    const commandsResult = await setTelegramCommands(commands);
    const base = getPublicAppUrl();
    const menuResult = base
      ? await setTelegramMenuButton(`${base}/tg`, 'Open MORBIUS')
      : { ok: false, error: 'PUBLIC_APP_URL is not set — cannot build the Mini App URL.' };
    return res.json({
      ok: commandsResult.ok && menuResult.ok,
      commands: commandsResult,
      menuButton: menuResult,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/telegram/miniapp/session — verify a Telegram Mini App `initData`
  // payload and return the player's session: linked wallet, name, balances.
  // This is the auth entry point for the whole Mini App.
  // -------------------------------------------------------------------------
  app.post('/api/telegram/miniapp/session', async (req: Request, res: Response) => {
    const initData = typeof req.body?.initData === 'string' ? req.body.initData : '';
    const tgUser = verifyTelegramInitData(initData);
    if (!tgUser) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired Telegram session.' });
    }
    try {
      const linkRow = await pool.query(
        'SELECT wallet_address FROM telegram_links WHERE telegram_chat_id = $1',
        [tgUser.id],
      );
      if (linkRow.rows.length === 0) {
        return res.json({
          ok: true,
          linked: false,
          telegramUsername: tgUser.username ?? null,
          telegramName: tgUser.firstName ?? null,
        });
      }
      const wallet = String(linkRow.rows[0].wallet_address);
      const [balRow, chips, nameRow, prefsRow] = await Promise.all([
        pool.query('SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1)', [wallet]),
        getPokerChipBalance(pool, wallet),
        pool.query(
          'SELECT display_name FROM chat_display_names WHERE LOWER(wallet_address) = LOWER($1)',
          [wallet],
        ),
        pool.query(
          'SELECT notifications_enabled FROM telegram_links WHERE telegram_chat_id = $1',
          [tgUser.id],
        ),
      ]);
      return res.json({
        ok: true,
        linked: true,
        walletAddress: wallet,
        telegramUsername: tgUser.username ?? null,
        telegramName: tgUser.firstName ?? null,
        displayName: nameRow.rows[0]?.display_name ?? null,
        morbiusBalanceWei: balRow.rows[0]?.balance != null ? String(balRow.rows[0].balance) : '0',
        chipBalance: chips.toString(),
        notificationsEnabled: prefsRow.rows[0]?.notifications_enabled === true,
      });
    } catch (err) {
      logger.error('[telegram] miniapp session failed', { error: (err as Error).message });
      return res.status(500).json({ ok: false, error: 'Could not load your session.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/telegram/miniapp/profile — save the linked player's profile
  // (avatar, display name, bio, X / Telegram handles) from inside the Mini App.
  // Auth is the signed Telegram `initData`; a player can only write their own
  // linked wallet. No funds are touched here. Field handling mirrors the
  // website's POST /api/player/profile route.
  // -------------------------------------------------------------------------
  app.post('/api/telegram/miniapp/profile', async (req: Request, res: Response) => {
    const initData = typeof req.body?.initData === 'string' ? req.body.initData : '';
    const tgUser = verifyTelegramInitData(initData);
    if (!tgUser) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired Telegram session.' });
    }
    try {
      const linkRow = await pool.query(
        'SELECT wallet_address FROM telegram_links WHERE telegram_chat_id = $1',
        [tgUser.id],
      );
      if (linkRow.rows.length === 0) {
        return res
          .status(403)
          .json({ ok: false, error: 'No wallet is linked to this Telegram account.' });
      }
      const wallet = String(linkRow.rows[0].wallet_address);
      const body = (req.body ?? {}) as Record<string, unknown>;

      // display_name is always written by setDisplayName, so fall back to the
      // current stored value when the Mini App sends a blank name.
      const current = await dbService.getProfile(wallet);
      const rawName =
        typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 32) : '';
      const displayName = rawName || current?.displayName || 'MORBIUS player';

      // A string updates the field; a blank/missing value leaves the stored
      // value untouched (setDisplayName COALESCEs NULLs to the existing value).
      const avatarConfig =
        body.avatarConfig != null && typeof body.avatarConfig === 'object'
          ? (body.avatarConfig as Record<string, unknown>)
          : undefined;
      const bio =
        typeof body.bio === 'string' ? body.bio.trim().slice(0, 200) || null : undefined;
      const xHandle =
        typeof body.xHandle === 'string'
          ? body.xHandle.trim().replace(/^@/, '').slice(0, 50) || null
          : undefined;
      const tgHandle =
        typeof body.tgHandle === 'string'
          ? body.tgHandle.trim().replace(/^@/, '').slice(0, 50) || null
          : undefined;

      await dbService.setDisplayName(
        wallet,
        displayName,
        undefined,
        avatarConfig,
        bio,
        xHandle,
        tgHandle,
        undefined,
      );
      const profile = await dbService.getProfile(wallet);
      return res.json({ ok: true, profile });
    } catch (err) {
      logger.error('[telegram] miniapp profile save failed', { error: (err as Error).message });
      return res.status(500).json({ ok: false, error: 'Could not save your profile.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/telegram/miniapp/lobby — public, read-only poker lobby feed for
  // the Mini App: open / running tournaments + open cash tables. No auth —
  // this exposes only the same data as the unauthenticated WS lobby messages.
  // -------------------------------------------------------------------------
  app.get('/api/telegram/miniapp/lobby', async (_req: Request, res: Response) => {
    try {
      const [allTournaments, tables] = await Promise.all([
        pokerTournamentService.listPokerTournaments(),
        pokerGameService.listTables(),
      ]);
      // Browse view: hide finished / cancelled events and private tournaments.
      const tournaments = allTournaments.filter(
        (t) => !t.isPrivate && t.status !== 'completed' && t.status !== 'cancelled',
      );
      return res.json({ ok: true, tournaments, tables });
    } catch (err) {
      logger.error('[telegram] miniapp lobby failed', { error: (err as Error).message });
      return res.status(500).json({ ok: false, error: 'Could not load the lobby.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/telegram/miniapp/my-hands — the linked player's last completed
  // poker hands, newest first, with enough detail to render a compact history
  // row and a tap-through to /tg/verify/:handId. Auth is the signed
  // Telegram `initData`; we only ever read rows for that linked wallet.
  // -------------------------------------------------------------------------
  app.post('/api/telegram/miniapp/my-hands', async (req: Request, res: Response) => {
    const initData = typeof req.body?.initData === 'string' ? req.body.initData : '';
    const tgUser = verifyTelegramInitData(initData);
    if (!tgUser) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired Telegram session.' });
    }
    try {
      const wallet = await getLinkedWallet(pool, tgUser.id);
      if (!wallet) {
        return res
          .status(403)
          .json({ ok: false, error: 'No wallet is linked to this Telegram account.' });
      }
      // 20 most recent completed hands. server_seed being set means showdown
      // has revealed the seed, which is the only state the verifier can use.
      const r = await pool.query(
        `SELECT
           h.id              AS hand_id,
           h.hand_number     AS hand_number,
           h.pot_amount      AS pot_amount,
           h.completed_at    AS completed_at,
           h.tournament_id   AS tournament_id,
           h.server_seed     AS server_seed,
           hp.won            AS won,
           hp.won_amount     AS won_amount,
           hp.contributed    AS contributed,
           hp.folded         AS folded,
           hp.folded_street  AS folded_street,
           hp.saw_showdown   AS saw_showdown,
           hp.hand_name      AS hand_name
         FROM poker_hand_players hp
         JOIN poker_hands h ON h.id = hp.hand_id
         WHERE LOWER(hp.player_address) = LOWER($1)
           AND h.completed_at IS NOT NULL
         ORDER BY h.completed_at DESC
         LIMIT 20`,
        [wallet],
      );
      const hands = r.rows.map((row) => {
        const won = String(row.won_amount ?? '0');
        const paid = String(row.contributed ?? '0');
        let net = '0';
        try {
          net = (BigInt(won) - BigInt(paid)).toString();
        } catch {
          /* keep '0' */
        }
        return {
          handId: String(row.hand_id),
          handNumber: Number(row.hand_number),
          potAmount: String(row.pot_amount ?? '0'),
          completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
          tournamentId: row.tournament_id ? String(row.tournament_id) : null,
          verifiable: typeof row.server_seed === 'string' && row.server_seed.length > 0,
          won: row.won === true,
          wonAmount: won,
          contributed: paid,
          netAmount: net,
          folded: row.folded === true,
          foldedStreet: row.folded_street ? String(row.folded_street) : null,
          sawShowdown: row.saw_showdown === true,
          handName: row.hand_name ? String(row.hand_name) : null,
        };
      });
      return res.json({ ok: true, hands });
    } catch (err) {
      logger.error('[telegram] miniapp my-hands failed', { error: (err as Error).message });
      return res.status(500).json({ ok: false, error: 'Could not load your hand history.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/telegram/miniapp/tournament/create — create a chip-based poker
  // tournament from the Mini App. Auth is the signed Telegram `initData`; the
  // creator is the wallet linked to that account. Only the chip / chip-freeroll
  // funding path is allowed — custom-token and platform-promo sources are never
  // forwarded, so no wallet signature or on-chain step is ever required.
  // -------------------------------------------------------------------------
  app.post('/api/telegram/miniapp/tournament/create', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const initData = typeof body.initData === 'string' ? body.initData : '';
    const tgUser = verifyTelegramInitData(initData);
    if (!tgUser) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired Telegram session.' });
    }
    try {
      const wallet = await getLinkedWallet(pool, tgUser.id);
      if (!wallet) {
        return res
          .status(403)
          .json({ ok: false, error: 'No wallet is linked to this Telegram account.' });
      }

      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name.length < 3) {
        return res
          .status(400)
          .json({ ok: false, error: 'Give the tournament a name of at least 3 characters.' });
      }

      const scheduledStartAt = new Date(
        typeof body.scheduledStartAt === 'string' ? body.scheduledStartAt : '',
      );
      if (Number.isNaN(scheduledStartAt.getTime()) || scheduledStartAt.getTime() <= Date.now()) {
        return res.status(400).json({ ok: false, error: 'Pick a start time in the future.' });
      }

      if (!body.config || typeof body.config !== 'object') {
        return res.status(400).json({ ok: false, error: 'Missing tournament settings.' });
      }

      let buyInAmount: bigint;
      try {
        buyInAmount = BigInt(String(body.buyInAmount ?? '0').split('.')[0] || '0');
      } catch {
        return res.status(400).json({ ok: false, error: 'Invalid buy-in amount.' });
      }

      // Freerolls need a guaranteed pool (debited from the creator's chips);
      // buy-in tournaments must not carry one.
      let guaranteedPrizePool: bigint | undefined;
      if (buyInAmount === 0n) {
        try {
          guaranteedPrizePool = BigInt(String(body.guaranteedPrizePool ?? '0').split('.')[0] || '0');
        } catch {
          return res.status(400).json({ ok: false, error: 'Invalid guaranteed prize pool.' });
        }
        if (guaranteedPrizePool <= 0n) {
          return res
            .status(400)
            .json({ ok: false, error: 'A freeroll needs a guaranteed prize pool above zero.' });
        }
      }

      // Funding source is always the implicit 'creator' (chip) path — the
      // custom-token and platform-promo sources are deliberately never set.
      const params: CreatePokerTournamentParams = {
        creatorAddress: wallet,
        name,
        buyInAmount,
        ...(guaranteedPrizePool != null ? { guaranteedPrizePool } : {}),
        prizeDistributionType: 'custom',
        prizePercentages: Array.isArray(body.prizePercentages)
          ? (body.prizePercentages as number[])
          : [],
        config: body.config as CreatePokerTournamentParams['config'],
        isPrivate: body.isPrivate === true,
        pinCode: typeof body.pinCode === 'string' ? body.pinCode : null,
        scheduledStartAt,
        ...(typeof body.creatorFeePercent === 'number'
          ? { creatorFeePercent: body.creatorFeePercent }
          : {}),
      };

      const result = await pokerTournamentService.createPokerTournament(params);
      return res.json({
        ok: true,
        tournamentId: result.tournamentId,
        pinCode: result.pinCode,
      });
    } catch (err) {
      // createPokerTournament throws Error for validation + business failures
      // (bad config, insufficient chips for a freeroll, …) — surface the
      // message so the player can fix it.
      const message = (err as Error).message || 'Could not create the tournament.';
      logger.error('[telegram] miniapp tournament create failed', { error: message });
      return res.status(400).json({ ok: false, error: message });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/telegram/miniapp/preferences — toggle notifications from inside
  // the Mini App. Auth is the signed Telegram `initData`; the wallet is whichever
  // one is currently linked to the Telegram chat.
  // -------------------------------------------------------------------------
  app.post('/api/telegram/miniapp/preferences', async (req: Request, res: Response) => {
    const initData = typeof req.body?.initData === 'string' ? req.body.initData : '';
    const tgUser = verifyTelegramInitData(initData);
    if (!tgUser) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired Telegram session.' });
    }
    if (typeof req.body?.notificationsEnabled !== 'boolean') {
      return res
        .status(400)
        .json({ ok: false, error: 'notificationsEnabled (boolean) is required.' });
    }
    try {
      const upd = await pool.query(
        `UPDATE telegram_links SET notifications_enabled = $2
         WHERE telegram_chat_id = $1 RETURNING notifications_enabled`,
        [tgUser.id, req.body.notificationsEnabled as boolean],
      );
      if (upd.rows.length === 0) {
        return res
          .status(403)
          .json({ ok: false, error: 'No wallet is linked to this Telegram account.' });
      }
      return res.json({
        ok: true,
        notificationsEnabled: upd.rows[0].notifications_enabled === true,
      });
    } catch (err) {
      logger.error('[telegram] miniapp preferences update failed', {
        error: (err as Error).message,
      });
      return res
        .status(500)
        .json({ ok: false, error: 'Could not update notification preferences.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/telegram/miniapp/unlink — disconnect this Telegram chat from its
  // linked wallet. Auth is the signed Telegram `initData`; we only ever delete
  // the row whose `telegram_chat_id` matches the verified user, so a Mini App
  // session can't unlink anyone else.
  // -------------------------------------------------------------------------
  app.post('/api/telegram/miniapp/unlink', async (req: Request, res: Response) => {
    const initData = typeof req.body?.initData === 'string' ? req.body.initData : '';
    const tgUser = verifyTelegramInitData(initData);
    if (!tgUser) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired Telegram session.' });
    }
    try {
      await pool.query('DELETE FROM telegram_links WHERE telegram_chat_id = $1', [tgUser.id]);
      return res.json({ ok: true });
    } catch (err) {
      logger.error('[telegram] miniapp unlink failed', { error: (err as Error).message });
      return res.status(500).json({ ok: false, error: 'Could not unlink your account.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/telegram/miniapp/recent-wins — public, read-only feed of the
  // last few notable wins from the MORBIUS Arcade games (Video Poker, Limbo,
  // Mines, Hi-Lo). Used as a social "live wins" rail on the Mini App hub so
  // players see the arcade is alive even when they're not playing. No auth,
  // no PII — wallets are short-handed and a display name is attached only
  // when one is set.
  //
  // Each game's table is filtered down to its "notable" subset before the
  // union so the rail stays high-signal:
  //   • video_poker_hands — flush-or-better paying categories
  //   • arcade_limbo_rounds — result multiplier ≥ 2.00x
  //   • arcade_mines_rounds — cash-outs at ≥ 2.00x
  //   • arcade_hilo_rounds — cash-outs at ≥ 2.00x
  // Only resolved/finalized rows within the last 24h are eligible.
  // -------------------------------------------------------------------------
  app.get('/api/telegram/miniapp/recent-wins', async (_req: Request, res: Response) => {
    try {
      const sql = `
        WITH vp AS (
          SELECT
            'video_poker'::text                AS game,
            v.id                               AS round_id,
            v.wallet_address,
            v.payout::text                     AS payout,
            v.bet::text                        AS bet,
            v.result_category                  AS detail,
            NULL::numeric                      AS multiplier,
            v.resolved_at                      AS resolved_at
          FROM video_poker_hands v
          WHERE v.status = 'resolved'
            AND v.payout IS NOT NULL
            AND v.payout > 0
            AND v.resolved_at > now() - interval '24 hours'
            AND v.result_category IN (
              'royal_flush','straight_flush','four_of_a_kind','full_house','flush'
            )
          ORDER BY v.resolved_at DESC
          LIMIT 25
        ),
        lb AS (
          SELECT
            'limbo'::text                      AS game,
            l.id::text                         AS round_id,
            l.wallet_address,
            l.payout::text                     AS payout,
            l.bet::text                        AS bet,
            NULL::text                         AS detail,
            (l.result_x100::numeric / 100)     AS multiplier,
            l.created_at                       AS resolved_at
          FROM arcade_limbo_rounds l
          WHERE l.won = TRUE
            AND l.payout > 0
            AND l.result_x100 >= 200
            AND l.created_at > now() - interval '24 hours'
          ORDER BY l.created_at DESC
          LIMIT 25
        ),
        mn AS (
          SELECT
            'mines'::text                      AS game,
            m.id::text                         AS round_id,
            m.wallet_address,
            m.payout::text                     AS payout,
            m.bet::text                        AS bet,
            NULL::text                         AS detail,
            (m.multiplier_x100::numeric / 100) AS multiplier,
            m.created_at                       AS resolved_at
          FROM arcade_mines_rounds m
          WHERE m.status = 'cashed_out'
            AND m.payout > 0
            AND m.multiplier_x100 >= 200
            AND m.created_at > now() - interval '24 hours'
          ORDER BY m.created_at DESC
          LIMIT 25
        ),
        hl AS (
          SELECT
            'hilo'::text                       AS game,
            h.id::text                         AS round_id,
            h.wallet_address,
            h.payout::text                     AS payout,
            h.bet::text                        AS bet,
            NULL::text                         AS detail,
            (h.multiplier_x100::numeric / 100) AS multiplier,
            h.created_at                       AS resolved_at
          FROM arcade_hilo_rounds h
          WHERE h.status = 'cashed_out'
            AND h.payout > 0
            AND h.multiplier_x100 >= 200
            AND h.created_at > now() - interval '24 hours'
          ORDER BY h.created_at DESC
          LIMIT 25
        ),
        wins AS (
          SELECT * FROM vp
          UNION ALL SELECT * FROM lb
          UNION ALL SELECT * FROM mn
          UNION ALL SELECT * FROM hl
        )
        SELECT
          w.game,
          w.round_id,
          w.wallet_address,
          w.payout,
          w.bet,
          w.detail,
          w.multiplier,
          w.resolved_at,
          dn.display_name
        FROM wins w
        LEFT JOIN chat_display_names dn
          ON LOWER(dn.wallet_address) = LOWER(w.wallet_address)
        ORDER BY w.resolved_at DESC
        LIMIT 20;
      `;
      const r = await dbService.getPool().query(sql);
      const wins = r.rows.map((row) => ({
        game: row.game as 'video_poker' | 'limbo' | 'mines' | 'hilo',
        roundId: String(row.round_id),
        walletShort: shortWallet(String(row.wallet_address)),
        displayName: row.display_name ? String(row.display_name) : null,
        payout: String(row.payout),
        bet: String(row.bet),
        detail: row.detail ? String(row.detail) : null,
        multiplier: row.multiplier != null ? Number(row.multiplier) : null,
        resolvedAt:
          row.resolved_at instanceof Date
            ? row.resolved_at.toISOString()
            : String(row.resolved_at),
      }));
      return res.json({ ok: true, wins });
    } catch (err) {
      logger.error('[telegram] miniapp recent-wins failed', { error: (err as Error).message });
      return res.status(500).json({ ok: false, error: 'Could not load recent wins.' });
    }
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
