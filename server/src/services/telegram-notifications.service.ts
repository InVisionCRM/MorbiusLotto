/**
 * telegram-notifications.service.ts — tournament "starting soon" fan-out.
 *
 * This is the piece that pings registered players before their poker tournament
 * starts. It is driven by the existing FreerollSchedulerService poll loop
 * (every ~15s), so it is restart-safe — no fragile in-memory setTimeout that
 * would be lost if the server restarts.
 *
 * It currently hooks the TIME-BASED start path: ~60s before a tournament's
 * scheduled_start_at it sends a "starting soon" ping, and ~10-15s before it
 * sends a "final call". `notifyTournamentStarting()` is written generically so
 * that if a fill-based start option is added later, it can call this directly
 * (e.g. the moment a table fills) with zero changes here.
 *
 * Best-effort by design: every failure is logged and swallowed. A Telegram
 * outage must never delay or block a tournament from starting.
 */

import type { Pool } from 'pg';
import { logger } from '../utils/logger';
import {
  sendTelegramMessage,
  isTelegramConfigured,
  getPublicAppUrl,
  type TelegramButton,
} from './telegram.service';

// Catch a tournament ~60s out. The window is wider than 60s because the
// scheduler only polls every ~15s — this guarantees we never miss one.
const STARTING_SOON_WINDOW_SECONDS = 75;
// Catch it again ~10-15s out for the "last chance" nudge.
const FINAL_CALL_WINDOW_SECONDS = 18;

type PingKind = 'starting_soon' | 'final_call';

/**
 * Called every scheduler tick. Scans for poker tournaments whose scheduled
 * start is approaching and fans out notifications. No-op when Telegram is not
 * configured or when running under tests.
 */
export async function tickTournamentStartTelegramNotifications(pool: Pool): Promise<void> {
  if (!isTelegramConfigured()) return; // feature off — stay completely silent
  if (process.env.NODE_ENV === 'test') return; // never fan out during tests

  await scanAndNotify(pool, 'starting_soon', STARTING_SOON_WINDOW_SECONDS);
  await scanAndNotify(pool, 'final_call', FINAL_CALL_WINDOW_SECONDS);
}

/** Find tournaments inside the window for `kind` and notify each one once. */
async function scanAndNotify(pool: Pool, kind: PingKind, windowSeconds: number): Promise<void> {
  let candidates;
  try {
    candidates = await pool.query(
      `SELECT t.id
         FROM tournaments t
        WHERE t.game_type = 'poker'
          AND t.status = 'registration'
          AND t.scheduled_start_at IS NOT NULL
          AND t.scheduled_start_at > now()
          AND t.scheduled_start_at <= now() + make_interval(secs => $1::int)
          AND NOT EXISTS (
                SELECT 1 FROM telegram_tournament_pings p
                 WHERE p.tournament_id = t.id::text AND p.kind = $2
              )`,
      [windowSeconds, kind],
    );
  } catch (err) {
    // e.g. migration 122 not applied yet — log once-ish and bail, never throw.
    logger.warn('[telegram] tournament scan skipped', { kind, error: (err as Error).message });
    return;
  }

  for (const row of candidates.rows) {
    try {
      await notifyTournamentStarting(pool, String(row.id), kind);
    } catch (err) {
      logger.error('[telegram] tournament notify failed', {
        tournamentId: row.id,
        kind,
        error: (err as Error).message,
      });
    }
  }
}

/**
 * Notify every linked + notifications-enabled player registered for a tournament
 * exactly once for the given `kind`. Safe to call from anywhere (the scheduler
 * tick, or a future fill-based start trigger) — the (tournament, kind) claim row
 * guarantees a message is never sent twice.
 */
export async function notifyTournamentStarting(
  pool: Pool,
  tournamentId: string,
  kind: PingKind,
): Promise<void> {
  if (!isTelegramConfigured()) return;

  // Atomically claim this (tournament, kind). If the row already exists another
  // pass already handled it — bail out so nobody gets a duplicate ping.
  const claim = await pool.query(
    `INSERT INTO telegram_tournament_pings (tournament_id, kind)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING
     RETURNING tournament_id`,
    [tournamentId, kind],
  );
  if (claim.rows.length === 0) return;

  const tRow = await pool.query(
    `SELECT id, name, poker_config FROM tournaments WHERE id = $1`,
    [tournamentId],
  );
  if (tRow.rows.length === 0) return;
  const tournament = tRow.rows[0];

  // Recipients: registered, still-in players who linked Telegram & want pings.
  const recipients = await pool.query(
    `SELECT DISTINCT tl.telegram_chat_id
       FROM tournament_entries te
       JOIN telegram_links tl ON tl.wallet_address = LOWER(te.player_address)
      WHERE te.tournament_id = $1
        AND te.status NOT IN ('busted', 'completed')
        AND tl.telegram_chat_id IS NOT NULL
        AND tl.notifications_enabled = TRUE`,
    [tournamentId],
  );
  if (recipients.rows.length === 0) return; // nobody to tell — claim row stays, no retry

  // Registered head-count for the message body.
  const countRow = await pool.query(
    `SELECT COUNT(*) AS c FROM tournament_entries
      WHERE tournament_id = $1 AND status NOT IN ('busted', 'completed')`,
    [tournamentId],
  );
  const registered = Number(countRow.rows[0]?.c ?? 0);
  const maxPlayers = parseMaxPlayers(tournament.poker_config);

  const { text, buttons } = buildMessage(kind, String(tournament.name ?? ''), registered, maxPlayers);

  let sent = 0;
  let failed = 0;
  for (const r of recipients.rows) {
    const chatId = Number(r.telegram_chat_id);
    const result = await sendTelegramMessage(chatId, text, buttons ? { buttons } : {});
    if (result.ok) sent++;
    else failed++;
  }

  logger.info('[telegram] tournament start notification sent', {
    tournamentId,
    kind,
    recipients: recipients.rows.length,
    sent,
    failed,
  });
}

/** Pull maxPlayers out of the JSONB poker_config (object or string form). */
function parseMaxPlayers(pokerConfig: unknown): number | null {
  try {
    const cfg = typeof pokerConfig === 'string' ? JSON.parse(pokerConfig) : pokerConfig;
    const m = Number((cfg as { maxPlayers?: unknown })?.maxPlayers);
    return Number.isFinite(m) && m > 0 ? m : null;
  } catch {
    return null;
  }
}

/** Build the plain-text message + optional "Take My Seat" button. */
function buildMessage(
  kind: PingKind,
  rawName: string,
  registered: number,
  maxPlayers: number | null,
): { text: string; buttons?: TelegramButton[] } {
  // Plain text (no Markdown) so a tournament name with special characters can
  // never break formatting or inject markup.
  const name = (rawName || 'Your tournament').slice(0, 120);
  const appUrl = getPublicAppUrl();
  const buttons: TelegramButton[] | undefined = appUrl
    ? [{ text: '🃏 Take My Seat', url: `${appUrl}/poker?tab=tournaments` }]
    : undefined;

  if (kind === 'final_call') {
    return {
      text:
        `⏰ Final call — "${name}" is dealing in moments!\n\n` +
        `Take your seat now or you'll be auto-folded and blinded down.`,
      buttons,
    };
  }

  const seats = maxPlayers ? `${registered}/${maxPlayers}` : `${registered}`;
  return {
    text:
      `🎰 Your MORBlotto poker tournament is about to start!\n\n` +
      `"${name}"\n` +
      `Players registered: ${seats}\n\n` +
      `Tap below to grab your seat before the cards fly.`,
    buttons,
  };
}
