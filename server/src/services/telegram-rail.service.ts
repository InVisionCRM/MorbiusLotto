/**
 * telegram-rail.service.ts — "The Rail": the live Telegram feed of poker
 * tournament activity, plus per-player tournament DM alerts.
 *
 * EVERY exported function is best-effort: it catches everything internally and
 * never throws. The hooks in poker-tournament.service.ts call these
 * fire-and-forget (`void railX(...)`), so Telegram can never delay, block, or
 * break gameplay — a Telegram outage is invisible to players.
 *
 * Two destinations:
 *  - the group "Rail" (TELEGRAM_GROUP_CHAT_ID) — a public activity feed
 *  - DMs to individual linked players (telegram_links)
 *
 * Silent no-op unless TELEGRAM_BOT_TOKEN is set (and, for group posts, a group
 * chat id is configured).
 */

import type { Pool } from 'pg';
import { logger } from '../utils/logger';
import {
  sendTelegramMessage,
  editTelegramMessage,
  getTelegramGroupChatId,
  getPublicAppUrl,
  isTelegramConfigured,
  shortWallet,
  type TelegramButton,
} from './telegram.service';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Escape text for Telegram HTML parse mode. */
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function appUrl(): string {
  return getPublicAppUrl() ?? 'https://morbius.io';
}

interface TournamentRow {
  id: string;
  name: string;
  status: string;
  buy_in_amount: string | null;
  prize_pool: string | null;
  poker_config: unknown;
  scheduled_start_at: Date | null;
  creator_address: string | null;
  prize_token_symbol: string | null;
  prize_token_decimals: number | null;
}

async function loadTournament(pool: Pool, tournamentId: string): Promise<TournamentRow | null> {
  const r = await pool.query(
    `SELECT id, name, status, buy_in_amount, prize_pool, poker_config,
            scheduled_start_at, creator_address, prize_token_symbol, prize_token_decimals
     FROM tournaments WHERE id = $1 AND game_type = 'poker'`,
    [tournamentId],
  );
  return r.rows[0] ?? null;
}

async function registeredCount(pool: Pool, tournamentId: string): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*) AS c FROM tournament_entries
     WHERE tournament_id = $1 AND status NOT IN ('busted', 'completed')`,
    [tournamentId],
  );
  return Number(r.rows[0]?.c ?? 0);
}

interface ParsedConfig {
  maxPlayers: number;
  minPlayers: number;
  startMode: 'time' | 'fill';
  blindIncreaseMode: string;
  smallBlind: number;
  bigBlind: number;
}

function parseConfig(raw: unknown): ParsedConfig {
  let cfg: Record<string, unknown> = {};
  try {
    cfg = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown> ?? {};
  } catch {
    cfg = {};
  }
  const schedule = Array.isArray(cfg.blindSchedule) ? (cfg.blindSchedule as Array<Record<string, unknown>>) : [];
  const lvl1 = schedule[0] ?? {};
  return {
    maxPlayers: Number(cfg.maxPlayers ?? 6) || 6,
    minPlayers: Number(cfg.minPlayers ?? 2) || 2,
    startMode: (cfg.startMode ?? cfg.start_mode) === 'fill' ? 'fill' : 'time',
    blindIncreaseMode: String(cfg.blindIncreaseMode ?? cfg.blind_increase_mode ?? 'knockout'),
    smallBlind: Number(lvl1.smallBlind ?? 25) || 25,
    bigBlind: Number(lvl1.bigBlind ?? 50) || 50,
  };
}

/** Format a chip/token amount for display. */
function fmtAmount(row: TournamentRow, raw: string | null | undefined): string {
  const tokenSym = row.prize_token_symbol;
  if (tokenSym && row.prize_token_decimals != null) {
    try {
      const d = BigInt(Number(row.prize_token_decimals) || 0);
      const v = BigInt(String(raw ?? '0'));
      const whole = v / 10n ** d;
      return `${whole.toLocaleString('en-US')} ${tokenSym}`;
    } catch {
      return `${String(raw ?? '0')} ${tokenSym}`;
    }
  }
  const n = Number(String(raw ?? '0'));
  return `${Number.isFinite(n) ? n.toLocaleString('en-US') : String(raw)} MORBIUS`;
}

function fmtBuyIn(row: TournamentRow): string {
  const raw = String(row.buy_in_amount ?? '0');
  if (raw === '' || raw === '0' || Number(raw) === 0) return 'Free';
  return fmtAmount(row, raw);
}

const blindModeLabel: Record<string, string> = {
  knockout: 'knockout',
  by_hand: 'scheduled',
  by_time: 'timed',
};

/** A compact filled/empty seat bar, e.g. "▰▰▰▰▱▱". Capped so it never gets huge. */
function seatBar(filled: number, max: number): string {
  const cap = Math.min(Math.max(max, 1), 10);
  const f = Math.min(Math.max(filled, 0), cap);
  return '▰'.repeat(f) + '▱'.repeat(cap - f);
}

type CardState = 'open' | 'full' | 'live' | 'done' | 'cancelled';

/** Build the tournament card text (Telegram HTML) for a given lifecycle state. */
function buildCard(
  row: TournamentRow,
  count: number,
  state: CardState,
  opts: { tableId?: string | null; winnerLine?: string } = {},
): { text: string; buttons?: TelegramButton[] } {
  const cfg = parseConfig(row.poker_config);
  const name = esc(row.name || 'Poker tournament');
  const isFill = cfg.startMode === 'fill';
  const format = `${cfg.maxPlayers}-max ${isFill ? 'Sit &amp; Go' : 'tournament'}`;
  const lines: string[] = [];

  lines.push(`🎰 <b>${name}</b>`);

  if (state === 'live') {
    lines.push(`<i>${format} · ♠️ live now</i>`);
  } else if (state === 'done') {
    lines.push(`<i>${format} · ✅ finished</i>`);
  } else if (state === 'cancelled') {
    lines.push(`<i>${format} · ❌ cancelled</i>`);
  } else if (state === 'full') {
    lines.push(`<i>${format} · 🔥 table full</i>`);
  } else {
    lines.push(`<i>${format} · ${isFill ? 'starts when full' : 'scheduled start'}</i>`);
  }

  lines.push('');
  lines.push(`💰 Buy-in: <b>${esc(fmtBuyIn(row))}</b>`);
  lines.push(`🏆 Prize pool: <b>${esc(fmtAmount(row, row.prize_pool))}</b>`);

  if (state === 'open' || state === 'full') {
    lines.push(`🎚 Blinds: ${cfg.smallBlind.toLocaleString()} / ${cfg.bigBlind.toLocaleString()} · ${blindModeLabel[cfg.blindIncreaseMode] ?? cfg.blindIncreaseMode}`);
    lines.push(`🪑 Seats: ${seatBar(count, cfg.maxPlayers)}  ${count}/${cfg.maxPlayers}`);
    lines.push('');
    const left = Math.max(cfg.maxPlayers - count, 0);
    if (state === 'full' || left === 0) {
      lines.push('🔥 <b>Table full — dealing in 60 seconds!</b>');
    } else if (left === 1) {
      lines.push('⚡ <b>1 seat left</b> — grab it!');
    } else {
      lines.push(`⚡ ${left} seats left${isFill ? ' — deals the moment it fills' : ''}`);
    }
  } else if (state === 'live') {
    lines.push(`🪑 Players: ${count}`);
    lines.push('');
    lines.push('♠️ <b>Cards are in the air.</b>');
  } else if (state === 'done') {
    lines.push('');
    lines.push(opts.winnerLine ? `🏆 ${opts.winnerLine}` : '🏆 <b>Tournament complete.</b>');
  } else if (state === 'cancelled') {
    lines.push('');
    lines.push('❌ <b>Cancelled — all buy-ins refunded.</b>');
  }

  let buttons: TelegramButton[] | undefined;
  if (state === 'open' || state === 'full') {
    buttons = [{ text: '🎟 Take a seat', url: `${appUrl()}/poker?tab=tournaments` }];
  } else if (state === 'live' && opts.tableId) {
    buttons = [{ text: '👀 Spectate', url: `${appUrl()}/poker/${opts.tableId}` }];
  }

  return { text: lines.join('\n'), buttons };
}

// ---------------------------------------------------------------------------
// Group + DB plumbing
// ---------------------------------------------------------------------------

/** Post a message to the group Rail. Returns the message id, or null. */
async function postToGroup(text: string, buttons?: TelegramButton[]): Promise<number | null> {
  const groupId = getTelegramGroupChatId();
  if (groupId == null) return null;
  const res = await sendTelegramMessage(groupId, text, { parseMode: 'HTML', buttons });
  return res.ok && res.messageId != null ? res.messageId : null;
}

/** Edit the stored group card for a tournament in place. */
async function editGroupCard(
  pool: Pool,
  tournamentId: string,
  text: string,
  buttons?: TelegramButton[],
): Promise<void> {
  const groupId = getTelegramGroupChatId();
  if (groupId == null) return;
  const r = await pool.query(
    'SELECT group_message_id FROM telegram_tournament_cards WHERE tournament_id = $1',
    [tournamentId],
  );
  const messageId = r.rows[0]?.group_message_id;
  if (messageId == null) return;
  await editTelegramMessage(groupId, Number(messageId), text, { parseMode: 'HTML', buttons });
}

/**
 * Claim a one-shot event so it can never fire twice (filled / started / etc.).
 * Returns true only for the caller that won the claim.
 */
async function claimOnce(pool: Pool, tournamentId: string, kind: string): Promise<boolean> {
  const r = await pool.query(
    `INSERT INTO telegram_tournament_pings (tournament_id, kind)
     VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING tournament_id`,
    [tournamentId, kind],
  );
  return r.rows.length > 0;
}

/** Telegram chat id for a wallet, only if linked AND notifications enabled. */
async function linkedChatId(pool: Pool, wallet: string): Promise<number | null> {
  const r = await pool.query(
    `SELECT telegram_chat_id FROM telegram_links
     WHERE wallet_address = $1 AND telegram_chat_id IS NOT NULL AND notifications_enabled = TRUE`,
    [wallet.toLowerCase()],
  );
  const id = r.rows[0]?.telegram_chat_id;
  return id != null ? Number(id) : null;
}

/**
 * Every entrant of a tournament who has alerts enabled, regardless of entry
 * status — used for cancellation refunds, where entries are already marked
 * busted by the time this runs.
 */
async function allLinkedEntrants(pool: Pool, tournamentId: string): Promise<number[]> {
  const r = await pool.query(
    `SELECT DISTINCT tl.telegram_chat_id
       FROM tournament_entries te
       JOIN telegram_links tl ON tl.wallet_address = LOWER(te.player_address)
      WHERE te.tournament_id = $1
        AND tl.telegram_chat_id IS NOT NULL
        AND tl.notifications_enabled = TRUE`,
    [tournamentId],
  );
  return r.rows.map((row) => Number(row.telegram_chat_id));
}

/** Wrap a rail/DM body so a failure is logged, never thrown. */
async function safely(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    if (!isTelegramConfigured()) return;
    await fn();
  } catch (err) {
    logger.warn(`[telegram-rail] ${label} failed`, { error: (err as Error)?.message });
  }
}

// ---------------------------------------------------------------------------
// Lifecycle — exported, fire-and-forget
// ---------------------------------------------------------------------------

/** A tournament was created — post its card to the Rail. */
export async function railTournamentCreated(pool: Pool, tournamentId: string): Promise<void> {
  await safely('tournamentCreated', async () => {
    const existing = await pool.query(
      'SELECT 1 FROM telegram_tournament_cards WHERE tournament_id = $1',
      [tournamentId],
    );
    if (existing.rows.length > 0) return; // card already posted
    const row = await loadTournament(pool, tournamentId);
    if (!row) return;
    const count = await registeredCount(pool, tournamentId);
    const card = buildCard(row, count, 'open');
    const messageId = await postToGroup(card.text, card.buttons);
    if (messageId != null) {
      await pool.query(
        `INSERT INTO telegram_tournament_cards (tournament_id, group_message_id)
         VALUES ($1, $2) ON CONFLICT (tournament_id) DO NOTHING`,
        [tournamentId, messageId],
      );
    }
  });
}

/** A player joined — refresh the card and post a join line. */
export async function railPlayerJoined(
  pool: Pool,
  tournamentId: string,
  playerAddress: string,
): Promise<void> {
  await safely('playerJoined', async () => {
    const row = await loadTournament(pool, tournamentId);
    if (!row) return;
    const count = await registeredCount(pool, tournamentId);
    const cfg = parseConfig(row.poker_config);
    const card = buildCard(row, count, 'open');
    await editGroupCard(pool, tournamentId, card.text, card.buttons);
    await postToGroup(
      `👤 <b>${esc(shortWallet(playerAddress))}</b> took a seat — ` +
        `${esc(row.name)} is now <b>${count}/${cfg.maxPlayers}</b>`,
    );
  });
}

/** A player unregistered — refresh the card and post a leave line. */
export async function railPlayerLeft(
  pool: Pool,
  tournamentId: string,
  playerAddress: string,
): Promise<void> {
  await safely('playerLeft', async () => {
    const row = await loadTournament(pool, tournamentId);
    if (!row) return;
    const count = await registeredCount(pool, tournamentId);
    const cfg = parseConfig(row.poker_config);
    const card = buildCard(row, count, 'open');
    await editGroupCard(pool, tournamentId, card.text, card.buttons);
    await postToGroup(
      `↩️ ${esc(shortWallet(playerAddress))} left — ` +
        `${esc(row.name)} is now ${count}/${cfg.maxPlayers}`,
    );
  });
}

/** The table filled — flip the card to "full" + ping the creator. */
export async function railTournamentFilled(pool: Pool, tournamentId: string): Promise<void> {
  await safely('tournamentFilled', async () => {
    if (!(await claimOnce(pool, tournamentId, 'rail_filled'))) return;
    const row = await loadTournament(pool, tournamentId);
    if (!row) return;
    const count = await registeredCount(pool, tournamentId);
    const card = buildCard(row, count, 'full');
    await editGroupCard(pool, tournamentId, card.text, card.buttons);
    await postToGroup(`🔥 <b>${esc(row.name)}</b> is full — dealing in 60 seconds!`);
    // Creator DM.
    if (row.creator_address) {
      const chatId = await linkedChatId(pool, row.creator_address);
      if (chatId != null) {
        await sendTelegramMessage(
          chatId,
          `🔥 Your tournament "${esc(row.name)}" just filled up — it's about to start.`,
          { parseMode: 'HTML' },
        );
      }
    }
  });
}

/** The tournament started — flip the card to "live". */
export async function railTournamentStarted(
  pool: Pool,
  tournamentId: string,
  tableId: string | null,
): Promise<void> {
  await safely('tournamentStarted', async () => {
    if (!(await claimOnce(pool, tournamentId, 'rail_started'))) return;
    const row = await loadTournament(pool, tournamentId);
    if (!row) return;
    const count = await registeredCount(pool, tournamentId);
    const card = buildCard(row, count, 'live', { tableId });
    await editGroupCard(pool, tournamentId, card.text, card.buttons);
    const spectate = tableId
      ? [{ text: '👀 Spectate', url: `${appUrl()}/poker/${tableId}` }]
      : undefined;
    await postToGroup(`♠️ <b>${esc(row.name)}</b> is live — cards are in the air.`, spectate);
  });
}

/** The tournament finished — winner line, card update, results DMs, creator DM. */
export async function railTournamentCompleted(
  pool: Pool,
  tournamentId: string,
  standings: Array<{ address: string; rank: number; prizeAmount: string }>,
): Promise<void> {
  await safely('tournamentCompleted', async () => {
    if (!(await claimOnce(pool, tournamentId, 'rail_completed'))) return;
    const row = await loadTournament(pool, tournamentId);
    if (!row) return;
    const winner = standings.find((s) => s.rank === 1);
    const winnerLine = winner
      ? `<b>${esc(shortWallet(winner.address))}</b> won "${esc(row.name)}" — ${esc(fmtAmount(row, winner.prizeAmount))}`
      : `"${esc(row.name)}" has finished.`;
    const count = await registeredCount(pool, tournamentId);
    const card = buildCard(row, count, 'done', { winnerLine });
    await editGroupCard(pool, tournamentId, card.text);
    await postToGroup(`🏆 ${winnerLine}`);

    // Results DM to every linked finisher.
    for (const s of standings) {
      const chatId = await linkedChatId(pool, s.address);
      if (chatId == null) continue;
      const prize = Number(String(s.prizeAmount ?? '0'));
      const msg =
        prize > 0
          ? `🏆 You finished #${s.rank} in "${esc(row.name)}" and won ${esc(fmtAmount(row, s.prizeAmount))}!`
          : `You finished #${s.rank} in "${esc(row.name)}". Better luck next time!`;
      await sendTelegramMessage(chatId, msg, { parseMode: 'HTML' });
    }

    // Creator DM.
    if (row.creator_address && !standings.some((s) => s.address === row.creator_address!.toLowerCase())) {
      const chatId = await linkedChatId(pool, row.creator_address);
      if (chatId != null) {
        await sendTelegramMessage(
          chatId,
          `Your tournament "${esc(row.name)}" has finished — ${winnerLine}`,
          { parseMode: 'HTML' },
        );
      }
    }
  });
}

/** The tournament was cancelled — card update + refund DMs to registered players. */
export async function railTournamentCancelled(pool: Pool, tournamentId: string): Promise<void> {
  await safely('tournamentCancelled', async () => {
    if (!(await claimOnce(pool, tournamentId, 'rail_cancelled'))) return;
    const row = await loadTournament(pool, tournamentId);
    if (!row) return;
    const recipients = await allLinkedEntrants(pool, tournamentId);
    const count = await registeredCount(pool, tournamentId);
    const card = buildCard(row, count, 'cancelled');
    await editGroupCard(pool, tournamentId, card.text);
    await postToGroup(`❌ <b>${esc(row.name)}</b> was cancelled — all buy-ins refunded.`);
    for (const chatId of recipients) {
      await sendTelegramMessage(
        chatId,
        `"${esc(row.name)}" was cancelled — your buy-in has been refunded.`,
        { parseMode: 'HTML' },
      );
    }
  });
}

/** DM each busted player. No group post — busts are personal, not Rail noise. */
export async function dmPlayersBusted(
  pool: Pool,
  tournamentId: string,
  addresses: string[],
): Promise<void> {
  await safely('playersBusted', async () => {
    if (addresses.length === 0) return;
    const row = await loadTournament(pool, tournamentId);
    const name = row ? esc(row.name) : 'your tournament';
    for (const addr of addresses) {
      const chatId = await linkedChatId(pool, addr);
      if (chatId == null) continue;
      await sendTelegramMessage(
        chatId,
        `☠️ You busted out of "${name}". Better luck next time!`,
        { parseMode: 'HTML' },
      );
    }
  });
}
