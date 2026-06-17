'use client';

/**
 * /tg — the MORBIUS Telegram Mini App.
 *
 * Loads Telegram's WebApp SDK, verifies the signed `initData` against the
 * backend (POST /api/telegram/miniapp/session), then shows the hub.
 *
 * Screens: hub, Stats, Profile (avatar editor), and the MORBIUS Arcade
 * (Video Poker). MORBIUS ↔ chip swapping is a deep-link to morbius.io — real
 * value moves stay behind the site's wallet auth. The old standalone Wallet
 * screen was removed; balances live on the hub and Swap is a button there.
 *
 * Visual style is matched to the site's Poker onboarding modal
 * (components/poker/PokerOnboardingChecklist.tsx): navy gradient, cyan accents,
 * the Mitr brutalist headings, cyan-to-blue glow buttons.
 *
 * This page deliberately uses no site chrome (no GlobalMainNav) — inside
 * Telegram it IS the app.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  IconUser,
  IconChartBar,
  IconArrowsExchange,
  IconArrowLeft,
  IconArrowRight,
  IconChevronRight,
  IconExternalLink,
  IconCards,
  IconTrophy,
  IconClock,
  IconEye,
  IconLock,
  IconBolt,
  IconBomb,
  IconArrowsUpDown,
  IconDice5,
  IconGift,
  IconPlus,
  IconCheck,
  IconBell,
  IconSettings,
  IconLogout,
  IconCrown,
  IconShieldCheck,
  IconHistory,
  IconRocket,
  IconCircleDot,
} from '@tabler/icons-react';
import MiniAppProfileEditor from '@/components/telegram/MiniAppProfileEditor';
import MiniAppVideoPoker from '@/components/telegram/MiniAppVideoPoker';
import MiniAppLimbo from '@/components/telegram/MiniAppLimbo';
import MiniAppMines from '@/components/telegram/MiniAppMines';
import MiniAppHiLo from '@/components/telegram/MiniAppHiLo';
import MiniAppDice from '@/components/telegram/MiniAppDice';
import MiniAppBaccarat from '@/components/telegram/MiniAppBaccarat';
import MiniAppCrash from '@/components/telegram/MiniAppCrash';
import MiniAppRoulette from '@/components/telegram/MiniAppRoulette';
import MiniAppRecentWins from '@/components/telegram/MiniAppRecentWins';
import {
  MTT_TEMPLATES,
  type MttTemplate,
} from '@/components/poker/tournament/mtt-creator/mtt-templates';
import { buildPrizePercents } from '@/lib/poker-tournament-prize-presets';
import { POKER_TOURNAMENT_DEFAULT_CONFIG } from '@/hooks/use-poker-tournament';

// ---------------------------------------------------------------------------

interface TgHapticFeedback {
  impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged: () => void;
}

interface TgBackButton {
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
}

interface TgWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  colorScheme?: string;
  HapticFeedback?: TgHapticFeedback;
  BackButton?: TgBackButton;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
}

interface MiniAppSession {
  ok: boolean;
  linked: boolean;
  walletAddress?: string;
  telegramUsername?: string | null;
  telegramName?: string | null;
  displayName?: string | null;
  morbiusBalanceWei?: string;
  chipBalance?: string;
  notificationsEnabled?: boolean;
}

/** Subset of GET /api/poker/player/:address/stats we render in the Mini App. */
interface PokerStats {
  total_hands: number;
  hands_won: number;
  win_rate: number;
  profit_loss: string;
  biggest_pot_won: string;
  current_streak: number;
  best_streak: number;
  vpip_pct: number;
  pfr_pct: number;
  three_bet_pct: number;
  wtsd_pct: number;
  wsd_pct: number;
  aggression_factor: number | null;
}

type View =
  | 'hub'
  | 'stats'
  | 'profile'
  | 'arcade'
  | 'videopoker'
  | 'limbo'
  | 'mines'
  | 'hilo'
  | 'dice'
  | 'baccarat'
  | 'crash'
  | 'roulette'
  | 'lobby'
  | 'createTournament'
  | 'leaderboard'
  | 'myhands'
  | 'settings';
type StatScope = 'cash' | 'tournament' | 'all';
type LbCategory = 'net_chips' | 'biggest_pot' | 'hands_played';
type LoadState = 'loading' | 'no-telegram' | 'error' | 'ready';
type FetchState = 'idle' | 'loading' | 'error' | 'ready';

const SDK_SRC = 'https://telegram.org/js/telegram-web-app.js';

// --- design tokens — matched to PokerOnboardingChecklist.tsx ----------------
const SCREEN_BG = 'linear-gradient(165deg,#0c1c30 0%,#050a14 72%)';
const GRAD_BTN = 'linear-gradient(135deg,#0891b2,#2563eb)';
const GLOW_BTN = '0 8px 26px -8px rgba(6,182,212,0.55), 0 0 0 1px rgba(34,211,238,0.20)';

/** Load Telegram's WebApp SDK; resolves the WebApp object, or null if absent. */
function loadTelegramSdk(): Promise<TgWebApp | null> {
  return new Promise((resolve) => {
    const w = window as unknown as { Telegram?: { WebApp?: TgWebApp } };
    if (w.Telegram?.WebApp) {
      resolve(w.Telegram.WebApp);
      return;
    }
    const done = () => resolve(w.Telegram?.WebApp ?? null);
    const existing = document.querySelector(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', done);
      window.setTimeout(done, 2000);
      return;
    }
    const s = document.createElement('script');
    s.src = SDK_SRC;
    s.onload = done;
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

function formatMorbius(wei: string | undefined): string {
  try {
    const whole = BigInt(wei || '0') / 10n ** 18n;
    return whole.toLocaleString('en-US');
  } catch {
    return '0';
  }
}

function formatChips(raw: string | undefined): string {
  const n = Number(raw || '0');
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '0';
}

/** Format a signed chip integer string for display, e.g. "+1,250" / "-800". */
function formatSignedChips(raw: string | undefined): { text: string; positive: boolean } {
  try {
    const n = BigInt((raw || '0').split('.')[0] || '0');
    const positive = n >= 0n;
    const abs = (n < 0n ? -n : n).toLocaleString('en-US');
    return { text: `${positive ? '+' : '-'}${abs}`, positive };
  } catch {
    return { text: '0', positive: true };
  }
}

/** A light, descriptive label for a player's style — mirrors the website. */
function archetypeName(s: PokerStats | null): string {
  if (!s || s.total_hands < 50) return 'Rookie';
  const vpip = s.vpip_pct ?? 0;
  const agg = s.aggression_factor ?? 0;
  if (vpip < 10) return 'Nit';
  const loose = vpip > 28;
  const aggressive = agg >= 3.0;
  if (loose && aggressive) return 'Maniac';
  if (loose && !aggressive) return 'Fish';
  if (!loose && aggressive) return 'Shark';
  return 'Rock';
}

function initials(session: MiniAppSession): string {
  const src = session.displayName || session.telegramName || session.telegramUsername || '';
  const cleaned = src.trim();
  if (cleaned) {
    const parts = cleaned.split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || cleaned[0].toUpperCase();
  }
  const w = session.walletAddress || '';
  return w ? w.slice(2, 4).toUpperCase() : 'M';
}

// --- small presentational pieces -------------------------------------------

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-cyan-500/15 bg-[#0b1a2c] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={`mitr-bold mt-1 text-2xl tabular-nums ${accent ?? 'text-white'}`}>{value}</div>
    </div>
  );
}

function LeaderboardRow({
  entry,
  category,
  isMe,
}: {
  entry: LeaderboardEntry;
  category: LbCategory;
  isMe: boolean;
}) {
  const accent = rankAccent(entry.rank);
  const v = leaderboardValue(entry, category);
  const valueColor =
    category === 'hands_played'
      ? 'text-white'
      : v.positive
        ? 'text-cyan-400'
        : 'text-red-400';
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
        isMe ? 'border-cyan-500/50 bg-[#0f2238]' : 'border-cyan-500/15 bg-[#0b1a2c]'
      }`}
      style={isMe ? { boxShadow: '0 0 0 1px rgba(34,211,238,0.18)' } : undefined}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-500/20 bg-[#091627]">
        {accent ? (
          <IconCrown size={16} className={accent.color} aria-hidden />
        ) : (
          <span className="mitr-bold text-xs text-slate-400 tabular-nums">
            {entry.rank}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate text-sm font-semibold text-white">
            {entryLabel(entry)}
          </span>
          {isMe && (
            <span className="rounded-md border border-cyan-500/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-300">
              You
            </span>
          )}
        </div>
        <div className="truncate text-[10px] text-slate-500">
          {entry.hands_played.toLocaleString('en-US')} hands ·{' '}
          {entry.hands_won.toLocaleString('en-US')} won
        </div>
      </div>
      <div className={`mitr-bold shrink-0 text-base tabular-nums ${valueColor}`}>
        {v.text}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-cyan-500/15 bg-[#0b1a2c] px-2 py-2 text-center">
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div className="mitr-bold mt-1 text-sm tabular-nums text-white">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// --- leaderboard -----------------------------------------------------------

/** Subset of GET /api/poker/top-players we render. Matches PokerTopPlayerRow. */
interface LeaderboardEntry {
  rank: number;
  address: string;
  display_name: string | null;
  profile_image_url: string | null;
  net_chips: string;
  biggest_pot: string;
  hands_played: number;
  hands_won: number;
}

interface LeaderboardData {
  category: LbCategory;
  rows: LeaderboardEntry[];
  requester: LeaderboardEntry | null;
}

/** Pull the headline value for an entry given the active leaderboard category. */
function leaderboardValue(e: LeaderboardEntry, cat: LbCategory): {
  text: string;
  positive: boolean;
} {
  if (cat === 'hands_played') {
    return { text: e.hands_played.toLocaleString('en-US'), positive: true };
  }
  const raw = cat === 'net_chips' ? e.net_chips : e.biggest_pot;
  return formatSignedChips(raw);
}

/** Short on-screen label for a leaderboard row's identity. */
function entryLabel(e: LeaderboardEntry): string {
  if (e.display_name && e.display_name.trim().length > 0) return e.display_name;
  if (e.address && e.address.length >= 10) {
    return `${e.address.slice(0, 6)}…${e.address.slice(-4)}`;
  }
  return 'Anonymous';
}

/** Crown / medal accent for top-3 ranks; null otherwise. */
function rankAccent(rank: number): { color: string; label: string } | null {
  if (rank === 1) return { color: 'text-amber-300', label: '1st' };
  if (rank === 2) return { color: 'text-slate-300', label: '2nd' };
  if (rank === 3) return { color: 'text-orange-300', label: '3rd' };
  return null;
}

// --- my hands --------------------------------------------------------------

/** One row from POST /api/telegram/miniapp/my-hands — a completed hand the
 *  linked player participated in. `verifiable=false` means the server seed
 *  hasn't been revealed (the player folded pre-showdown and no other path
 *  forced reveal); the verify page handles that case gracefully. */
interface MyHand {
  handId: string;
  handNumber: number;
  potAmount: string;
  completedAt: string | null;
  tournamentId: string | null;
  verifiable: boolean;
  won: boolean;
  wonAmount: string;
  contributed: string;
  netAmount: string;
  folded: boolean;
  foldedStreet: string | null;
  sawShowdown: boolean;
  handName: string | null;
}

/** A short label for the hand's outcome: "Won", "Folded turn", "Lost", … */
function handOutcomeLabel(h: MyHand): string {
  if (h.won) return 'Won';
  if (h.folded) {
    if (h.foldedStreet === 'preflop') return 'Folded preflop';
    if (h.foldedStreet === 'flop') return 'Folded flop';
    if (h.foldedStreet === 'turn') return 'Folded turn';
    if (h.foldedStreet === 'river') return 'Folded river';
    return 'Folded';
  }
  if (h.sawShowdown) return 'Lost at showdown';
  return 'Lost';
}

/** "5m ago" / "2h ago" / "3d ago" / fallback to a short date. */
function timeAgo(iso: string | null, nowMs: number): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, nowMs - t);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// --- poker lobby -----------------------------------------------------------

/** Subset of the backend's PokerTournamentSummary the lobby card renders. */
interface LobbyTournament {
  tournamentId: string;
  name: string;
  status: string;
  buyInAmount: string;
  prizePool: string;
  registeredCount: number;
  maxPlayers: number;
  startMode: string;
  scheduledStartAt: string | null;
}

/** Subset of the backend's PokerTableSummary the lobby card renders. */
interface LobbyTable {
  id: string;
  smallBlind: string;
  bigBlind: string;
  maxSeats: number;
  seatedCount: number;
  emptySeats: number;
  hasPin: boolean;
}

interface LobbyData {
  tournaments: LobbyTournament[];
  tables: LobbyTable[];
}

/** Derived counters rendered on the hub's "Live now" pulse card. */
interface LiveActivity {
  liveTournaments: number;
  openTournaments: number;
  seatedPlayers: number;
  openCashTables: number;
}

function deriveLiveActivity(data: LobbyData): LiveActivity {
  let liveTournaments = 0;
  let openTournaments = 0;
  for (const t of data.tournaments) {
    if (t.status === 'active') liveTournaments += 1;
    else if (t.status === 'registration' && t.registeredCount < t.maxPlayers) {
      openTournaments += 1;
    }
  }
  let seatedPlayers = 0;
  let openCashTables = 0;
  for (const c of data.tables) {
    seatedPlayers += c.seatedCount || 0;
    if (c.emptySeats > 0) openCashTables += 1;
  }
  return { liveTournaments, openTournaments, seatedPlayers, openCashTables };
}

/** True when a tournament has no buy-in (a freeroll). */
function isFreeBuyIn(raw: string): boolean {
  try {
    return BigInt(String(raw ?? '0').split('.')[0] || '0') === 0n;
  } catch {
    return false;
  }
}

/** Lobby card state: open for registration, closed/full, or in play. */
function tournamentState(t: LobbyTournament): 'open' | 'full' | 'live' {
  if (t.status === 'active') return 'live';
  if (t.status === 'registration' && t.registeredCount < t.maxPlayers) return 'open';
  return 'full';
}

/** Human start label. Within an hour we show a live "Starts in 14m" countdown;
 *  further out we fall back to "Today · 7:30 PM" / weekday + time. */
function startLabel(t: LobbyTournament, nowMs: number): string {
  if (t.startMode === 'fill') return 'Starts when full';
  if (t.scheduledStartAt) {
    const d = new Date(t.scheduledStartAt);
    const ts = d.getTime();
    if (!Number.isNaN(ts)) {
      const diffMs = ts - nowMs;
      if (diffMs > 0 && diffMs <= 60 * 60_000) {
        const mins = Math.max(1, Math.round(diffMs / 60_000));
        return `Starts in ${mins}m`;
      }
      if (diffMs <= 0 && diffMs > -10 * 60_000) {
        return 'Starting now';
      }
      const now = new Date(nowMs);
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const day =
        d.toDateString() === now.toDateString()
          ? 'Today'
          : d.toDateString() === tomorrow.toDateString()
            ? 'Tomorrow'
            : d.toLocaleDateString('en-US', { weekday: 'short' });
      const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `${day} · ${time}`;
    }
  }
  return 'Scheduled';
}

/** True when the countdown should pulse (within 5 minutes of start). */
function startLabelIsImminent(t: LobbyTournament, nowMs: number): boolean {
  if (t.startMode === 'fill' || !t.scheduledStartAt) return false;
  const ts = new Date(t.scheduledStartAt).getTime();
  if (Number.isNaN(ts)) return false;
  const diffMs = ts - nowMs;
  return diffMs > -10 * 60_000 && diffMs <= 5 * 60_000;
}

/** Assemble the create-tournament request body from a template + user inputs.
 *  Mirrors the website wizard's buildCreateParams — chip funding path only. */
function buildTournamentBody(tpl: MttTemplate, name: string, scheduledStartAtIso: string) {
  const isFreeroll = tpl.buyInMode === 'freeroll';
  const config = {
    ...POKER_TOURNAMENT_DEFAULT_CONFIG,
    startingStack: tpl.startingStack,
    minPlayers: 2,
    maxPlayers: tpl.maxPlayers,
    blindIncreaseMode: tpl.blindMode,
    ...(tpl.blindMode === 'by_time'
      ? { blindIntervalMinutes: tpl.blindIntervalMinutes }
      : {}),
    seatsPerTable: tpl.seatsPerTable,
  };
  return {
    name,
    buyInAmount: isFreeroll ? '0' : tpl.buyInChips,
    ...(isFreeroll ? { guaranteedPrizePool: tpl.guaranteedPool } : {}),
    prizeDistributionType: 'custom',
    prizePercentages: buildPrizePercents(tpl.prizePresetId, Math.min(10, tpl.maxPlayers)),
    config,
    isPrivate: false,
    scheduledStartAt: scheduledStartAtIso,
    creatorFeePercent: isFreeroll ? 0 : tpl.creatorFeePercent,
  };
}

/** Icon for a template card, keyed by template id. */
function templateIcon(id: string) {
  if (id === 'turbo_mtt') return <IconBolt size={18} aria-hidden />;
  if (id === 'freeroll_friday') return <IconGift size={18} aria-hidden />;
  return <IconTrophy size={18} aria-hidden />;
}

function LobbyTournamentCard({
  t,
  nowMs,
  onOpen,
}: {
  t: LobbyTournament;
  nowMs: number;
  onOpen: () => void;
}) {
  const state = tournamentState(t);
  const isLive = state === 'live';
  const free = isFreeBuyIn(t.buyInAmount);
  const imminent = !isLive && startLabelIsImminent(t, nowMs);
  const prize = (() => {
    try {
      return BigInt(String(t.prizePool ?? '0').split('.')[0] || '0');
    } catch {
      return 0n;
    }
  })();
  return (
    <div
      className={`rounded-2xl border bg-[#0b1a2c] p-3 ${
        isLive || imminent ? 'border-cyan-500/30' : 'border-cyan-500/15'
      }`}
      style={imminent ? { boxShadow: '0 0 0 1px rgba(34,211,238,0.18)' } : undefined}
    >
      <div className="text-sm font-semibold text-white">{t.name}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium ${
            imminent
              ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
              : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300'
          }`}
        >
          {isLive ? (
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" aria-hidden />
          ) : imminent ? (
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
            </span>
          ) : (
            <IconClock size={11} aria-hidden />
          )}
          {isLive ? 'In play' : startLabel(t, nowMs)}
        </span>
        {state === 'open' ? (
          <button
            type="button"
            onClick={onOpen}
            className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-white"
            style={{ background: GRAD_BTN, boxShadow: GLOW_BTN }}
          >
            Register now
          </button>
        ) : isLive ? (
          <button
            type="button"
            onClick={onOpen}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-1.5 text-[11px] font-bold text-cyan-400"
          >
            <IconEye size={12} aria-hidden />
            Watch
          </button>
        ) : (
          <span className="rounded-lg border border-slate-500/25 px-3 py-1.5 text-[11px] font-bold text-slate-500">
            Registration closed
          </span>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        {free ? (
          <span
            className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400"
            style={{ boxShadow: '0 0 10px rgba(52,211,153,0.3)' }}
          >
            Free entry
          </span>
        ) : (
          <span>{formatChips(t.buyInAmount)} buy-in</span>
        )}
        <span>
          {t.registeredCount} / {t.maxPlayers} players
        </span>
        {prize > 0n && (
          <span className="text-cyan-300">
            <span className="mitr-bold tabular-nums">{prize.toLocaleString('en-US')}</span> pool
          </span>
        )}
      </div>
    </div>
  );
}

function LobbyCashCard({ c, onOpen }: { c: LobbyTable; onOpen: () => void }) {
  const open = c.emptySeats > 0;
  return (
    <div className="rounded-2xl border border-cyan-500/15 bg-[#0b1a2c] p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="mitr-bold text-base text-cyan-400">
            {c.smallBlind} / {c.bigBlind}
          </div>
          <div className="text-[10px] text-slate-500">No-Limit Hold&apos;em</div>
        </div>
        {open ? (
          <button
            type="button"
            onClick={onOpen}
            className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-white"
            style={{ background: GRAD_BTN, boxShadow: GLOW_BTN }}
          >
            Play now
          </button>
        ) : (
          <span className="rounded-lg border border-slate-500/25 px-3 py-1.5 text-[11px] font-bold text-slate-500">
            Table full
          </span>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span>
          {c.seatedCount} / {c.maxSeats} seated
        </span>
        {c.hasPin && (
          <span className="flex items-center gap-1">
            <IconLock size={11} aria-hidden />
            Private
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function TelegramMiniAppPage() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [session, setSession] = useState<MiniAppSession | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [initData, setInitData] = useState('');
  const [webApp, setWebApp] = useState<TgWebApp | null>(null);

  const [view, setView] = useState<View>('hub');

  // Settings screen state
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifError, setNotifError] = useState('');
  const [unlinkArmed, setUnlinkArmed] = useState(false);
  const [unlinkBusy, setUnlinkBusy] = useState(false);

  // Fire Telegram's native haptic feedback when running inside the app. No-op
  // outside of Telegram so the page still works in a normal browser.
  const haptic = useCallback(
    (kind: 'tap' | 'success' | 'warn' | 'error' = 'tap') => {
      const hf = webApp?.HapticFeedback;
      if (!hf) return;
      try {
        if (kind === 'tap') hf.impactOccurred('light');
        else if (kind === 'success') hf.notificationOccurred('success');
        else if (kind === 'warn') hf.notificationOccurred('warning');
        else hf.notificationOccurred('error');
      } catch {
        /* haptics are best-effort */
      }
    },
    [webApp],
  );

  // Stats screen state
  const [scope, setScope] = useState<StatScope>('cash');
  const [stats, setStats] = useState<PokerStats | null>(null);
  const [statsState, setStatsState] = useState<FetchState>('idle');

  // Poker Lobby screen state
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [lobbyState, setLobbyState] = useState<FetchState>('idle');

  // Leaderboard screen state
  const [lbCategory, setLbCategory] = useState<LbCategory>('net_chips');
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [lbState, setLbState] = useState<FetchState>('idle');

  // My Hands screen state — the player's last completed poker hands.
  const [myHands, setMyHands] = useState<MyHand[] | null>(null);
  const [myHandsState, setMyHandsState] = useState<FetchState>('idle');

  // Hub "Live now" pulse card — same lobby endpoint, polled lightly.
  const [activity, setActivity] = useState<LiveActivity | null>(null);

  // Ticks every 30s while the Lobby or My Hands view is visible so cards can
  // render a live "Starts in X" countdown / "5m ago" without each row owning
  // its own timer.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (view !== 'lobby' && view !== 'myhands') return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [view]);

  // Create Tournament screen state
  const [tplId, setTplId] = useState<string>(MTT_TEMPLATES[0].id);
  const [tName, setTName] = useState('');
  const [tWhen, setTWhen] = useState('');
  const [createState, setCreateState] = useState<'idle' | 'creating' | 'created' | 'error'>(
    'idle',
  );
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const webApp = await loadTelegramSdk();
      if (cancelled) return;
      if (!webApp || !webApp.initData) {
        setLoadState('no-telegram');
        return;
      }
      setInitData(webApp.initData);
      setWebApp(webApp);
      try {
        webApp.ready();
        webApp.expand();
      } catch {
        /* non-fatal */
      }
      try {
        const res = await fetch('/api/telegram/miniapp/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: webApp.initData }),
        });
        const data = (await res.json()) as MiniAppSession & { error?: string };
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setErrorMsg(data?.error || 'Could not start your session.');
          setLoadState('error');
          return;
        }
        setSession(data);
        setLoadState('ready');
      } catch {
        if (cancelled) return;
        setErrorMsg('Could not reach MORBIUS. Check your connection and try again.');
        setLoadState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch poker stats when the Stats screen is open (and on scope change).
  useEffect(() => {
    if (view !== 'stats') return;
    const addr = session?.walletAddress;
    if (!addr) return;
    let cancelled = false;
    setStatsState('loading');
    (async () => {
      try {
        const res = await fetch(`/api/poker/player/${addr}/stats?scope=${scope}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatsState('error');
          return;
        }
        setStats(data as PokerStats);
        setStatsState('ready');
      } catch {
        if (!cancelled) setStatsState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, scope, session?.walletAddress]);

  // Fetch the poker lobby (tournaments + cash tables) when the Lobby is open.
  useEffect(() => {
    if (view !== 'lobby') return;
    let cancelled = false;
    setLobbyState('loading');
    (async () => {
      try {
        const res = await fetch('/api/telegram/miniapp/lobby');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setLobbyState('error');
          return;
        }
        setLobby({
          tournaments: Array.isArray(data.tournaments) ? data.tournaments : [],
          tables: Array.isArray(data.tables) ? data.tables : [],
        });
        setLobbyState('ready');
      } catch {
        if (!cancelled) setLobbyState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view]);

  // Fetch the leaderboard (top players) when the Leaderboard view is open.
  useEffect(() => {
    if (view !== 'leaderboard') return;
    let cancelled = false;
    setLbState('loading');
    (async () => {
      try {
        const qs = new URLSearchParams({ category: lbCategory, limit: '25' });
        if (session?.walletAddress) qs.set('address', session.walletAddress);
        const res = await fetch(`/api/poker/top-players?${qs.toString()}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLbState('error');
          return;
        }
        setLeaderboard({
          category: (data?.category as LbCategory) ?? lbCategory,
          rows: Array.isArray(data?.rows) ? (data.rows as LeaderboardEntry[]) : [],
          requester: (data?.requester as LeaderboardEntry | null) ?? null,
        });
        setLbState('ready');
      } catch {
        if (!cancelled) setLbState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, lbCategory, session?.walletAddress]);

  // Fetch the player's recent poker hands when the My Hands view is open.
  useEffect(() => {
    if (view !== 'myhands') return;
    if (!initData) return;
    let cancelled = false;
    setMyHandsState('loading');
    (async () => {
      try {
        const res = await fetch('/api/telegram/miniapp/my-hands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setMyHandsState('error');
          return;
        }
        setMyHands(Array.isArray(data.hands) ? (data.hands as MyHand[]) : []);
        setMyHandsState('ready');
      } catch {
        if (!cancelled) setMyHandsState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, initData]);

  // Poll the lobby endpoint while the hub is visible so the "Live now" card
  // reflects current activity. 30s cadence — light enough to be a non-issue
  // and slow enough to feel ambient rather than chatty.
  useEffect(() => {
    if (view !== 'hub' || !session?.linked) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch('/api/telegram/miniapp/lobby');
        const data = await res.json();
        if (cancelled || !res.ok || !data?.ok) return;
        setActivity(
          deriveLiveActivity({
            tournaments: Array.isArray(data.tournaments) ? data.tournaments : [],
            tables: Array.isArray(data.tables) ? data.tables : [],
          }),
        );
      } catch {
        /* best-effort — the card just falls back to its idle/empty state */
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [view, session?.linked]);

  const openSite = useCallback((path = '') => {
    window.open(`https://morbius.io${path}`, '_blank', 'noopener');
  }, []);

  // Open the public hand verifier. Inside Telegram we use openLink so it
  // appears in the in-app browser without leaving the Mini App; outside
  // Telegram we fall back to a normal new-tab open.
  const openVerify = useCallback(
    (handId: string) => {
      const url = `https://morbius.io/tg/verify/${encodeURIComponent(handId)}`;
      if (webApp?.openLink) {
        try {
          webApp.openLink(url);
          return;
        } catch {
          /* fall through to window.open */
        }
      }
      window.open(url, '_blank', 'noopener');
    },
    [webApp],
  );

  // Wire Telegram's native BackButton to the current view. On the hub it
  // disappears; on any sub-view it pops back to the previous screen (lobby
  // → createTournament has its own parent, everything else returns to the hub).
  useEffect(() => {
    const bb = webApp?.BackButton;
    if (!bb) return;
    if (view === 'hub') {
      bb.hide();
      return;
    }
    const goBack = () => {
      haptic('tap');
      if (view === 'createTournament') setView('lobby');
      else if (
        view === 'videopoker' ||
        view === 'limbo' ||
        view === 'mines' ||
        view === 'hilo' ||
        view === 'dice' ||
        view === 'baccarat' ||
        view === 'crash' ||
        view === 'roulette'
      )
        setView('arcade');
      else setView('hub');
    };
    bb.onClick(goBack);
    bb.show();
    return () => {
      bb.offClick(goBack);
      bb.hide();
    };
  }, [view, webApp, haptic]);

  // Toggle the notifications switch on the Settings screen.
  const submitNotificationToggle = useCallback(
    async (next: boolean) => {
      setNotifBusy(true);
      setNotifError('');
      try {
        const res = await fetch('/api/telegram/miniapp/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData, notificationsEnabled: next }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          haptic('error');
          setNotifError(data?.error || 'Could not update your preferences.');
          return;
        }
        haptic('success');
        setSession((prev) =>
          prev ? { ...prev, notificationsEnabled: data.notificationsEnabled === true } : prev,
        );
      } catch {
        haptic('error');
        setNotifError('Could not reach MORBIUS. Check your connection and try again.');
      } finally {
        setNotifBusy(false);
      }
    },
    [initData, haptic],
  );

  // Unlink the Telegram chat from its linked wallet, then return to the
  // onboarding (link wallet) view.
  const submitUnlink = useCallback(async () => {
    setUnlinkBusy(true);
    try {
      const res = await fetch('/api/telegram/miniapp/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        haptic('error');
        setNotifError(data?.error || 'Could not unlink your account.');
        setUnlinkBusy(false);
        return;
      }
      haptic('success');
      setUnlinkArmed(false);
      setSession((prev) => (prev ? { ...prev, linked: false } : prev));
      setView('hub');
    } catch {
      haptic('error');
      setNotifError('Could not reach MORBIUS. Check your connection and try again.');
    } finally {
      setUnlinkBusy(false);
    }
  }, [initData, haptic]);

  // Create a tournament from the picked template + name + start time.
  const submitCreateTournament = useCallback(async () => {
    const tpl = MTT_TEMPLATES.find((x) => x.id === tplId);
    if (!tpl) return;
    const name = tName.trim();
    if (name.length < 3) {
      setCreateError('Give the tournament a name of at least 3 characters.');
      setCreateState('error');
      return;
    }
    const when = new Date(tWhen);
    if (!tWhen || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setCreateError('Pick a start date and time in the future.');
      setCreateState('error');
      return;
    }
    setCreateState('creating');
    setCreateError('');
    try {
      const res = await fetch('/api/telegram/miniapp/tournament/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData,
          ...buildTournamentBody(tpl, name, when.toISOString()),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setCreateError(data?.error || 'Could not create the tournament.');
        setCreateState('error');
        return;
      }
      setCreateState('created');
    } catch {
      setCreateError('Could not reach MORBIUS. Check your connection and try again.');
      setCreateState('error');
    }
  }, [tplId, tName, tWhen, initData]);

  const pnl = formatSignedChips(stats?.profit_loss);

  return (
    <div className="min-h-screen text-white" style={{ background: SCREEN_BG }}>
      <div className="mx-auto w-full max-w-md px-4 py-6">
        {loadState === 'loading' && (
          <div className="mt-24 text-center">
            <div className="mitr-bold text-2xl tracking-[0.18em] text-cyan-400">MORBIUS</div>
            <p className="mt-3 text-sm text-slate-500">Loading your hub…</p>
          </div>
        )}

        {loadState === 'no-telegram' && (
          <div className="mt-20">
            <div className="mitr-bold mb-5 text-center text-2xl tracking-[0.18em] text-cyan-400">
              MORBIUS
            </div>
            <div className="rounded-2xl border border-cyan-500/20 bg-[#0b1a2c] p-6 text-center">
              <p className="text-sm leading-relaxed text-slate-400">
                This is the MORBIUS in-app hub — open it from inside Telegram, via the
                MORBIUS bot.
              </p>
            </div>
          </div>
        )}

        {loadState === 'error' && (
          <div className="mt-20">
            <div className="mitr-bold mb-5 text-center text-2xl tracking-[0.18em] text-cyan-400">
              MORBIUS
            </div>
            <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-6 text-center">
              <p className="text-sm text-red-200/90">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* ---- LINK WALLET (onboarding) ---- */}
        {loadState === 'ready' && session && !session.linked && (
          <div
            className="relative mt-8 overflow-hidden rounded-2xl border border-cyan-500/25 p-6"
            style={{ background: 'linear-gradient(135deg,#0c1929,#050a14)' }}
          >
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg,transparent,rgba(34,211,238,0.55),transparent)',
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 90% 12%,rgba(6,182,212,0.20),transparent 56%)',
              }}
              aria-hidden
            />
            <div className="relative">
              <div
                className="text-[11px] font-bold uppercase text-cyan-400"
                style={{ letterSpacing: '0.3em' }}
              >
                Getting started
              </div>
              <h1 className="mitr-bold mt-3 text-3xl leading-[0.98] text-white">
                Link up to your{' '}
                <span className="text-cyan-500" style={{ fontStyle: 'italic' }}>
                  first hand
                </span>
              </h1>
              <p className="mt-3 max-w-[260px] text-sm leading-relaxed text-slate-400">
                Connect your MORBIUS wallet to Telegram to unlock your hub — balances,
                stats, and the arcade.
              </p>

              <div className="mt-6 flex gap-1.5" aria-hidden>
                <div className="h-1.5 flex-1 rounded-full bg-cyan-500" />
                <div
                  className="h-1.5 flex-1 rounded-full"
                  style={{
                    background:
                      'linear-gradient(90deg,#06b6d4 52%,rgba(6,182,212,0.22) 52%)',
                  }}
                />
                <div className="h-1.5 flex-1 rounded-full bg-slate-500/20" />
              </div>
              <div className="mt-2 flex gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.1em]">
                <div className="flex-1 text-cyan-500">Connect</div>
                <div className="flex-1 text-white">Link</div>
                <div className="flex-1 text-slate-600">Play</div>
              </div>

              <button
                type="button"
                onClick={() => openSite('/settings')}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold text-white transition-transform active:scale-[0.99]"
                style={{ background: GRAD_BTN, boxShadow: GLOW_BTN }}
              >
                Link on morbius.io
                <IconArrowRight size={16} aria-hidden />
              </button>
              <p className="mt-3 text-center text-xs text-slate-500">
                On the site: connect your wallet → Settings → Notifications → Link Telegram.
              </p>
            </div>
          </div>
        )}

        {/* ---- HUB ---- */}
        {loadState === 'ready' && session && session.linked && view === 'hub' && (
          <>
            <div className="mb-5 flex items-center gap-3">
              <div
                className="h-[54px] w-[54px] shrink-0 rounded-full p-[2px]"
                style={{ background: 'linear-gradient(135deg,#22d3ee,#2563eb)' }}
              >
                <div className="mitr-bold flex h-full w-full items-center justify-center rounded-full bg-[#0a1a2b] text-xl text-cyan-400">
                  {initials(session)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-400">
                  Morbius hub
                </div>
                <div className="mitr-bold truncate text-xl text-white">
                  {session.displayName || session.telegramName || 'MORBIUS player'}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {session.telegramUsername ? `@${session.telegramUsername} · ` : ''}wallet linked
                </div>
              </div>
            </div>

            <div className="mb-2.5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-cyan-500/15 bg-[#0b1a2c] p-3">
                <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  MORBIUS
                </div>
                <div className="mitr-bold mt-1 text-xl tabular-nums text-cyan-400">
                  {formatMorbius(session.morbiusBalanceWei)}
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-500/15 bg-[#0b1a2c] p-3">
                <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Play balance
                </div>
                <div className="mitr-bold mt-1 text-xl tabular-nums text-white">
                  {formatChips(session.chipBalance)}
                </div>
              </div>
            </div>

            {activity &&
              (activity.liveTournaments > 0 ||
                activity.seatedPlayers > 0 ||
                activity.openTournaments > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    haptic('tap');
                    setView('lobby');
                  }}
                  aria-label="Open the poker lobby"
                  className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-cyan-500/30 bg-[#0f2238] px-3 py-2.5 text-left"
                  style={{ boxShadow: '0 0 0 1px rgba(34,211,238,0.08)' }}
                >
                  <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400">
                      Live now
                    </div>
                    <div className="truncate text-[12px] text-slate-300">
                      {activity.liveTournaments > 0 ? (
                        <>
                          <span className="mitr-bold text-white">
                            {activity.liveTournaments}
                          </span>{' '}
                          tournament{activity.liveTournaments === 1 ? '' : 's'} in play
                        </>
                      ) : activity.openTournaments > 0 ? (
                        <>
                          <span className="mitr-bold text-white">
                            {activity.openTournaments}
                          </span>{' '}
                          tournament{activity.openTournaments === 1 ? '' : 's'} open
                        </>
                      ) : (
                        <>
                          <span className="mitr-bold text-white">
                            {activity.openCashTables}
                          </span>{' '}
                          cash table{activity.openCashTables === 1 ? '' : 's'} open
                        </>
                      )}
                      {activity.seatedPlayers > 0 && (
                        <>
                          {' · '}
                          <span className="mitr-bold text-white">
                            {activity.seatedPlayers}
                          </span>{' '}
                          seated
                        </>
                      )}
                    </div>
                  </div>
                  <IconChevronRight size={16} className="shrink-0 text-cyan-400" aria-hidden />
                </button>
              )}

            <button
              type="button"
              onClick={() => openSite('/poker')}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-2.5 text-[13px] font-semibold text-cyan-400"
            >
              <IconArrowsExchange size={16} aria-hidden />
              Open poker on morbius.io
            </button>

            <MiniAppRecentWins />

            <div className="mt-4 flex flex-col gap-2.5">
              {(
                [
                  {
                    key: 'lobby',
                    icon: <IconTrophy size={20} aria-hidden />,
                    title: 'Poker Lobby',
                    sub: 'Tournaments & cash tables',
                    target: 'lobby',
                    featured: true,
                  },
                  {
                    key: 'arcade',
                    icon: <IconCards size={20} aria-hidden />,
                    title: 'MORBIUS Arcade',
                    sub: 'Video Poker · Limbo · Mines · Hi-Lo · Dice',
                    target: 'arcade',
                    featured: false,
                  },
                  {
                    key: 'stats',
                    icon: <IconChartBar size={20} aria-hidden />,
                    title: 'Your stats',
                    sub: 'Hands, wins, profit & loss',
                    target: 'stats',
                    featured: false,
                  },
                  {
                    key: 'leaderboard',
                    icon: <IconCrown size={20} aria-hidden />,
                    title: 'Leaderboard',
                    sub: 'Top MORBIUS poker players',
                    target: 'leaderboard',
                    featured: false,
                  },
                  {
                    key: 'myhands',
                    icon: <IconHistory size={20} aria-hidden />,
                    title: 'My recent hands',
                    sub: 'Replay & verify your last 20',
                    target: 'myhands',
                    featured: false,
                  },
                  {
                    key: 'profile',
                    icon: <IconUser size={20} aria-hidden />,
                    title: 'Profile & avatar',
                    sub: 'Edit your look and name',
                    target: 'profile',
                    featured: false,
                  },
                  {
                    key: 'settings',
                    icon: <IconSettings size={20} aria-hidden />,
                    title: 'Settings',
                    sub:
                      session.notificationsEnabled === false
                        ? 'Notifications off'
                        : 'Notifications & account',
                    target: 'settings',
                    featured: false,
                  },
                ] as {
                  key: string;
                  icon: ReactNode;
                  title: string;
                  sub: string;
                  target: View | null;
                  featured: boolean;
                }[]
              ).map((tile) => (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => {
                    if (tile.target) {
                      haptic('tap');
                      setView(tile.target);
                    }
                  }}
                  disabled={!tile.target}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${
                    tile.featured
                      ? 'border-cyan-500/30 bg-[#0f2238]'
                      : 'border-cyan-500/15 bg-[#0b1a2c]'
                  } ${tile.target ? 'hover:border-cyan-500/40' : 'cursor-default'}`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                    {tile.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white">{tile.title}</div>
                    <div className="text-xs text-slate-500">{tile.sub}</div>
                  </div>
                  {tile.target ? (
                    <IconChevronRight size={18} className="shrink-0 text-slate-500" aria-hidden />
                  ) : (
                    <span className="shrink-0 rounded-md border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-400">
                      Soon
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => openSite('')}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/20 px-4 py-3 text-sm font-medium text-slate-300"
            >
              <IconExternalLink size={15} aria-hidden />
              Open morbius.io
            </button>
          </>
        )}

        {/* ---- STATS ---- */}
        {loadState === 'ready' && session && session.linked && view === 'stats' && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView('hub')}
                aria-label="Back to hub"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/5 text-cyan-400"
              >
                <IconArrowLeft size={18} aria-hidden />
              </button>
              <h1 className="mitr-bold text-xl text-white">Your stats</h1>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-xl border border-cyan-500/15 bg-[#0b1a2c] p-1">
              {(
                [
                  ['cash', 'Cash'],
                  ['tournament', 'Tourneys'],
                  ['all', 'All'],
                ] as [StatScope, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScope(key)}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                    scope === key ? 'text-white' : 'text-slate-500'
                  }`}
                  style={scope === key ? { background: GRAD_BTN, boxShadow: GLOW_BTN } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>

            {statsState === 'loading' && (
              <p className="mt-10 text-center text-sm text-slate-500">Loading your stats…</p>
            )}

            {statsState === 'error' && (
              <div className="mt-8 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-center">
                <p className="text-sm text-red-200/90">Could not load your stats. Try again.</p>
              </div>
            )}

            {statsState === 'ready' && stats && stats.total_hands === 0 && (
              <div className="mt-8 rounded-2xl border border-cyan-500/15 bg-[#0b1a2c] p-6 text-center">
                <p className="text-sm text-slate-400">
                  No {scope === 'all' ? '' : `${scope} `}hands played yet. Sit down at a
                  table and your stats will show up here.
                </p>
              </div>
            )}

            {statsState === 'ready' && stats && stats.total_hands > 0 && (
              <>
                <div className="mb-3 flex items-center justify-between rounded-xl border border-cyan-500/15 bg-[#0b1a2c] px-3 py-2.5">
                  <span className="text-xs text-slate-500">Play style</span>
                  <span className="mitr-bold text-sm text-cyan-400">{archetypeName(stats)}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Hands played" value={stats.total_hands.toLocaleString('en-US')} />
                  <MetricCard label="Win rate" value={`${stats.win_rate.toFixed(1)}%`} />
                  <MetricCard
                    label="Net profit / loss"
                    value={pnl.text}
                    accent={pnl.positive ? 'text-cyan-400' : 'text-red-400'}
                  />
                  <MetricCard label="Best streak" value={`${stats.best_streak}`} />
                  <MetricCard label="Hands won" value={stats.hands_won.toLocaleString('en-US')} />
                  <MetricCard label="Biggest pot" value={formatChips(stats.biggest_pot_won)} />
                </div>

                <div className="mt-5 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                  Poker HUD
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="VPIP" value={`${stats.vpip_pct.toFixed(0)}%`} />
                  <MiniStat label="PFR" value={`${stats.pfr_pct.toFixed(0)}%`} />
                  <MiniStat label="3-Bet" value={`${stats.three_bet_pct.toFixed(0)}%`} />
                  <MiniStat label="WTSD" value={`${stats.wtsd_pct.toFixed(0)}%`} />
                  <MiniStat label="W$SD" value={`${stats.wsd_pct.toFixed(0)}%`} />
                  <MiniStat
                    label="Aggression"
                    value={stats.aggression_factor == null ? '—' : stats.aggression_factor.toFixed(1)}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => openSite('/poker')}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/20 px-4 py-3 text-sm font-medium text-slate-300"
                >
                  Full stats on morbius.io
                  <IconExternalLink size={15} aria-hidden />
                </button>
              </>
            )}
          </>
        )}

        {/* ---- PROFILE ---- */}
        {loadState === 'ready' &&
          session &&
          session.linked &&
          view === 'profile' &&
          session.walletAddress && (
            <MiniAppProfileEditor
              walletAddress={session.walletAddress}
              initData={initData}
              onBack={() => setView('hub')}
            />
          )}

        {/* ---- ARCADE MENU ---- */}
        {loadState === 'ready' && session && session.linked && view === 'arcade' && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView('hub')}
                aria-label="Back to hub"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/5 text-cyan-400"
              >
                <IconArrowLeft size={18} aria-hidden />
              </button>
              <h1 className="mitr-bold text-xl text-white">MORBIUS Arcade</h1>
            </div>

            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              Quick, single-player MORBIUS games. Provably fair — every round&apos;s
              seed is committed before the first reveal.
            </p>

            <div className="flex flex-col gap-2.5">
              {(
                [
                  {
                    key: 'videopoker',
                    icon: <IconCards size={20} aria-hidden />,
                    title: 'Video Poker',
                    sub: 'Jacks or Better · 9/6 paytable',
                    target: 'videopoker' as View,
                  },
                  {
                    key: 'limbo',
                    icon: <IconBolt size={20} aria-hidden />,
                    title: 'Limbo',
                    sub: 'Pick a target · roll higher to win',
                    target: 'limbo' as View,
                  },
                  {
                    key: 'mines',
                    icon: <IconBomb size={20} aria-hidden />,
                    title: 'Mines',
                    sub: 'Reveal gems · dodge bombs',
                    target: 'mines' as View,
                  },
                  {
                    key: 'hilo',
                    icon: <IconArrowsUpDown size={20} aria-hidden />,
                    title: 'Hi-Lo',
                    sub: 'Higher or lower · chain your multiplier',
                    target: 'hilo' as View,
                  },
                  {
                    key: 'dice',
                    icon: <IconDice5 size={20} aria-hidden />,
                    title: 'Dice',
                    sub: 'Roll under your target · instant payout',
                    target: 'dice' as View,
                  },
                  {
                    key: 'baccarat',
                    icon: <IconCards size={20} aria-hidden />,
                    title: 'Baccarat',
                    sub: 'Punto Banco · Player, Banker, or Tie',
                    target: 'baccarat' as View,
                  },
                  {
                    key: 'crash',
                    icon: <IconRocket size={20} aria-hidden />,
                    title: 'Crash',
                    sub: 'Set a target · cash out before it crashes',
                    target: 'crash' as View,
                  },
                  {
                    key: 'roulette',
                    icon: <IconCircleDot size={20} aria-hidden />,
                    title: 'Roulette',
                    sub: 'European · rolodex strip · 35:1 straight up',
                    target: 'roulette' as View,
                  },
                ]
              ).map((tile) => (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => setView(tile.target)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-cyan-500/15 bg-[#0b1a2c] px-3 py-3 text-left transition-colors hover:border-cyan-500/40"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                    {tile.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white">{tile.title}</div>
                    <div className="text-xs text-slate-500">{tile.sub}</div>
                  </div>
                  <IconChevronRight size={18} className="shrink-0 text-slate-500" aria-hidden />
                </button>
              ))}
            </div>
          </>
        )}

        {/* ---- ARCADE: VIDEO POKER ---- */}
        {loadState === 'ready' && session && session.linked && view === 'videopoker' && (
          <MiniAppVideoPoker
            initData={initData}
            initialChipBalance={session.chipBalance ?? '0'}
            onBack={() => setView('arcade')}
          />
        )}

        {/* ---- ARCADE: LIMBO ---- */}
        {loadState === 'ready' && session && session.linked && view === 'limbo' && (
          <MiniAppLimbo
            initData={initData}
            initialChipBalance={session.chipBalance ?? '0'}
            onBack={() => setView('arcade')}
          />
        )}

        {/* ---- ARCADE: MINES ---- */}
        {loadState === 'ready' && session && session.linked && view === 'mines' && (
          <MiniAppMines
            initData={initData}
            initialChipBalance={session.chipBalance ?? '0'}
            onBack={() => setView('arcade')}
          />
        )}

        {/* ---- ARCADE: HI-LO ---- */}
        {loadState === 'ready' && session && session.linked && view === 'hilo' && (
          <MiniAppHiLo
            initData={initData}
            initialChipBalance={session.chipBalance ?? '0'}
            onBack={() => setView('arcade')}
          />
        )}

        {/* ---- ARCADE: DICE ---- */}
        {loadState === 'ready' && session && session.linked && view === 'dice' && (
          <MiniAppDice
            initData={initData}
            initialChipBalance={session.chipBalance ?? '0'}
            onBack={() => setView('arcade')}
          />
        )}

        {/* ---- ARCADE: BACCARAT ---- */}
        {loadState === 'ready' && session && session.linked && view === 'baccarat' && (
          <MiniAppBaccarat
            initData={initData}
            initialChipBalance={session.chipBalance ?? '0'}
            onBack={() => setView('arcade')}
          />
        )}

        {/* ---- ARCADE: CRASH ---- */}
        {loadState === 'ready' && session && session.linked && view === 'crash' && (
          <MiniAppCrash
            initData={initData}
            initialChipBalance={session.chipBalance ?? '0'}
            onBack={() => setView('arcade')}
          />
        )}

        {/* ---- ARCADE: ROULETTE ---- */}
        {loadState === 'ready' && session && session.linked && view === 'roulette' && (
          <MiniAppRoulette
            initData={initData}
            initialChipBalance={session.chipBalance ?? '0'}
            onBack={() => setView('arcade')}
          />
        )}

        {/* ---- POKER LOBBY ---- */}
        {loadState === 'ready' && session && session.linked && view === 'lobby' && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView('hub')}
                aria-label="Back to hub"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/5 text-cyan-400"
              >
                <IconArrowLeft size={18} aria-hidden />
              </button>
              <h1 className="mitr-bold text-xl text-white">Poker Lobby</h1>
            </div>

            <button
              type="button"
              onClick={() => {
                setCreateState('idle');
                setCreateError('');
                setView('createTournament');
              }}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white"
              style={{ background: GRAD_BTN, boxShadow: GLOW_BTN }}
            >
              <IconPlus size={16} aria-hidden />
              Create a tournament
            </button>

            {lobbyState === 'loading' && (
              <p className="mt-10 text-center text-sm text-slate-500">Loading the lobby…</p>
            )}

            {lobbyState === 'error' && (
              <div className="mt-8 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-center">
                <p className="text-sm text-red-200/90">Could not load the lobby. Try again.</p>
              </div>
            )}

            {lobbyState === 'ready' && lobby && (
              <>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400">
                  Tournaments
                </div>
                {lobby.tournaments.length === 0 ? (
                  <p className="rounded-2xl border border-cyan-500/15 bg-[#0b1a2c] p-4 text-center text-sm text-slate-500">
                    No tournaments running right now.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {lobby.tournaments.map((t) => (
                      <LobbyTournamentCard
                        key={t.tournamentId}
                        t={t}
                        nowMs={nowMs}
                        onOpen={() => openSite('/poker?tab=tournaments')}
                      />
                    ))}
                  </div>
                )}

                <div className="mt-5 mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400">
                  Cash tables
                </div>
                {lobby.tables.length === 0 ? (
                  <p className="rounded-2xl border border-cyan-500/15 bg-[#0b1a2c] p-4 text-center text-sm text-slate-500">
                    No cash tables open right now.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {lobby.tables.map((c) => (
                      <LobbyCashCard
                        key={c.id}
                        c={c}
                        onOpen={() => openSite(`/poker/${c.id}?join=1`)}
                      />
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => openSite('/poker')}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/20 px-4 py-3 text-sm font-medium text-slate-300"
                >
                  Open the full lobby on morbius.io
                  <IconExternalLink size={15} aria-hidden />
                </button>
              </>
            )}
          </>
        )}

        {/* ---- CREATE TOURNAMENT ---- */}
        {loadState === 'ready' && session && session.linked && view === 'createTournament' && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView('lobby')}
                aria-label="Back to lobby"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/5 text-cyan-400"
              >
                <IconArrowLeft size={18} aria-hidden />
              </button>
              <h1 className="mitr-bold text-xl text-white">New Tournament</h1>
            </div>

            {createState === 'created' ? (
              <div className="mt-8 rounded-2xl border border-cyan-500/30 bg-[#0b1a2c] p-6 text-center">
                <div className="mitr-bold text-2xl text-cyan-400">Tournament created</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  It&apos;s live in the lobby now — players can register straight away.
                </p>
                <button
                  type="button"
                  onClick={() => setView('lobby')}
                  className="mt-5 w-full rounded-xl px-4 py-3 text-sm font-bold text-white"
                  style={{ background: GRAD_BTN, boxShadow: GLOW_BTN }}
                >
                  Back to the lobby
                </button>
              </div>
            ) : (
              <>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400">
                  1 · Pick a format
                </div>
                <div className="flex flex-col gap-2.5">
                  {MTT_TEMPLATES.map((tpl) => {
                    const selected = tpl.id === tplId;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setTplId(tpl.id)}
                        className={`flex items-center gap-3 rounded-2xl border p-3 text-left ${
                          selected
                            ? 'border-cyan-500 bg-[#0f2238]'
                            : 'border-cyan-500/15 bg-[#0b1a2c]'
                        }`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                          {templateIcon(tpl.id)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white">{tpl.label}</div>
                          <div className="text-[11px] text-slate-500">{tpl.tagline}</div>
                        </div>
                        {selected && (
                          <IconCheck size={16} className="shrink-0 text-cyan-400" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400">
                  2 · The details
                </div>
                <label htmlFor="tg-tourney-name" className="mb-1 block text-xs text-slate-500">
                  Tournament name
                </label>
                <input
                  id="tg-tourney-name"
                  type="text"
                  value={tName}
                  onChange={(e) => setTName(e.target.value)}
                  maxLength={48}
                  placeholder="Friday Night Showdown"
                  className="w-full rounded-xl border border-cyan-500/15 bg-[#0b1a2c] px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none"
                />
                <label htmlFor="tg-tourney-when" className="mt-3 mb-1 block text-xs text-slate-500">
                  Starts at
                </label>
                <input
                  id="tg-tourney-when"
                  type="datetime-local"
                  value={tWhen}
                  onChange={(e) => setTWhen(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                  className="w-full rounded-xl border border-cyan-500/15 bg-[#0b1a2c] px-3 py-2.5 text-sm text-white focus:border-cyan-500/50 focus:outline-none"
                />

                {createState === 'error' && (
                  <p className="mt-3 text-xs text-red-300/90">{createError}</p>
                )}

                <button
                  type="button"
                  disabled={createState === 'creating'}
                  onClick={submitCreateTournament}
                  className="mt-5 w-full rounded-xl px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: GRAD_BTN, boxShadow: GLOW_BTN }}
                >
                  {createState === 'creating' ? 'Creating…' : 'Create tournament'}
                </button>
                <p className="mt-3 text-center text-[11px] text-slate-600">
                  Tournament · runs entirely in MORBIUS · no wallet needed
                </p>
              </>
            )}
          </>
        )}

        {/* ---- LEADERBOARD ---- */}
        {loadState === 'ready' && session && session.linked && view === 'leaderboard' && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  haptic('tap');
                  setView('hub');
                }}
                aria-label="Back to hub"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/5 text-cyan-400"
              >
                <IconArrowLeft size={18} aria-hidden />
              </button>
              <h1 className="mitr-bold text-xl text-white">Leaderboard</h1>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-xl border border-cyan-500/15 bg-[#0b1a2c] p-1">
              {(
                [
                  ['net_chips', 'Net MORBIUS'],
                  ['biggest_pot', 'Biggest pot'],
                  ['hands_played', 'Hands'],
                ] as [LbCategory, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    haptic('tap');
                    setLbCategory(key);
                  }}
                  className={`rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors ${
                    lbCategory === key ? 'text-white' : 'text-slate-500'
                  }`}
                  style={
                    lbCategory === key ? { background: GRAD_BTN, boxShadow: GLOW_BTN } : undefined
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {lbState === 'loading' && (
              <p className="mt-10 text-center text-sm text-slate-500">
                Loading the leaderboard…
              </p>
            )}

            {lbState === 'error' && (
              <div className="mt-8 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-center">
                <p className="text-sm text-red-200/90">
                  Could not load the leaderboard. Try again.
                </p>
              </div>
            )}

            {lbState === 'ready' && leaderboard && leaderboard.rows.length === 0 && (
              <div className="mt-8 rounded-2xl border border-cyan-500/15 bg-[#0b1a2c] p-6 text-center">
                <p className="text-sm text-slate-400">
                  Nobody has finished any hands yet. Sit down at a table and the
                  leaderboard will start filling up.
                </p>
              </div>
            )}

            {lbState === 'ready' && leaderboard && leaderboard.rows.length > 0 && (
              <>
                <div className="flex flex-col gap-2">
                  {leaderboard.rows.map((entry) => (
                    <LeaderboardRow
                      key={entry.address}
                      entry={entry}
                      category={leaderboard.category}
                      isMe={
                        !!session.walletAddress &&
                        entry.address.toLowerCase() ===
                          session.walletAddress.toLowerCase()
                      }
                    />
                  ))}
                </div>

                {leaderboard.requester && (
                  <>
                    <div className="mt-5 mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400">
                      Your rank
                    </div>
                    <LeaderboardRow
                      entry={leaderboard.requester}
                      category={leaderboard.category}
                      isMe
                    />
                  </>
                )}

                <button
                  type="button"
                  onClick={() => openSite('/poker')}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/20 px-4 py-3 text-sm font-medium text-slate-300"
                >
                  Full leaderboard on morbius.io
                  <IconExternalLink size={15} aria-hidden />
                </button>
              </>
            )}
          </>
        )}

        {/* ---- MY HANDS ---- */}
        {loadState === 'ready' && session && session.linked && view === 'myhands' && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  haptic('tap');
                  setView('hub');
                }}
                aria-label="Back to hub"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/5 text-cyan-400"
              >
                <IconArrowLeft size={18} aria-hidden />
              </button>
              <h1 className="mitr-bold text-xl text-white">My recent hands</h1>
            </div>

            {myHandsState === 'loading' && (
              <p className="mt-10 text-center text-sm text-slate-500">Loading your hands…</p>
            )}

            {myHandsState === 'error' && (
              <div className="mt-8 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-center">
                <p className="text-sm text-red-200/90">
                  Could not load your hand history. Try again.
                </p>
              </div>
            )}

            {myHandsState === 'ready' && myHands && myHands.length === 0 && (
              <div className="mt-8 rounded-2xl border border-cyan-500/15 bg-[#0b1a2c] p-6 text-center">
                <p className="text-sm text-slate-400">
                  No completed hands yet. Sit down at a table and your last 20 will show
                  up here — tap any row to verify the deal was provably fair.
                </p>
              </div>
            )}

            {myHandsState === 'ready' && myHands && myHands.length > 0 && (
              <>
                <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
                  Tap any hand to open the provably-fair verifier — every shuffle is
                  committed before the deal and revealed at showdown.
                </p>
                <div className="flex flex-col gap-2">
                  {myHands.map((h) => {
                    const net = formatSignedChips(h.netAmount);
                    const isWin = h.won;
                    return (
                      <button
                        key={h.handId}
                        type="button"
                        onClick={() => {
                          haptic('tap');
                          openVerify(h.handId);
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                          isWin
                            ? 'border-cyan-500/30 bg-[#0f2238]'
                            : 'border-cyan-500/15 bg-[#0b1a2c]'
                        }`}
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                            isWin
                              ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-300'
                              : h.folded
                                ? 'border-slate-500/30 bg-slate-500/10 text-slate-400'
                                : 'border-red-400/30 bg-red-500/10 text-red-300'
                          }`}
                        >
                          <IconCards size={18} aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
                            <span className="truncate">{handOutcomeLabel(h)}</span>
                            {h.handName && (
                              <span className="truncate text-[11px] font-normal text-cyan-300">
                                · {h.handName}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                            <span>{formatChips(h.potAmount)} pot</span>
                            <span aria-hidden>·</span>
                            <span>{timeAgo(h.completedAt, nowMs)}</span>
                            {h.tournamentId && (
                              <>
                                <span aria-hidden>·</span>
                                <span className="text-cyan-400/80">MTT</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={`mitr-bold text-sm tabular-nums ${
                              net.positive && h.netAmount !== '0'
                                ? 'text-cyan-400'
                                : h.netAmount === '0'
                                  ? 'text-slate-400'
                                  : 'text-red-400'
                            }`}
                          >
                            {h.netAmount === '0' ? '0' : net.text}
                          </span>
                          {h.verifiable ? (
                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-cyan-300/80">
                              <IconShieldCheck size={11} aria-hidden />
                              Verify
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                              Pending
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => openSite('/poker')}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/20 px-4 py-3 text-sm font-medium text-slate-300"
                >
                  Full history on morbius.io
                  <IconExternalLink size={15} aria-hidden />
                </button>
              </>
            )}
          </>
        )}

        {/* ---- SETTINGS ---- */}
        {loadState === 'ready' && session && session.linked && view === 'settings' && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  haptic('tap');
                  setView('hub');
                }}
                aria-label="Back to hub"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/5 text-cyan-400"
              >
                <IconArrowLeft size={18} aria-hidden />
              </button>
              <h1 className="mitr-bold text-xl text-white">Settings</h1>
            </div>

            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400">
              Notifications
            </div>
            <div className="rounded-2xl border border-cyan-500/15 bg-[#0b1a2c] p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                  <IconBell size={20} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">Tournament pings</div>
                  <div className="text-xs text-slate-500">
                    Heads-up when your MORBIUS poker tournaments are about to start.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={session.notificationsEnabled === true}
                  aria-label="Toggle tournament notifications"
                  disabled={notifBusy}
                  onClick={() => submitNotificationToggle(session.notificationsEnabled !== true)}
                  className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-60 ${
                    session.notificationsEnabled
                      ? 'border-cyan-400/50 bg-cyan-500/40'
                      : 'border-slate-600/50 bg-slate-700/40'
                  }`}
                  style={
                    session.notificationsEnabled
                      ? { boxShadow: '0 0 10px rgba(34,211,238,0.35)' }
                      : undefined
                  }
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      session.notificationsEnabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                    aria-hidden
                  />
                </button>
              </div>
              {notifError && <p className="mt-3 text-xs text-red-300/90">{notifError}</p>}
            </div>

            <div className="mt-5 mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400">
              Linked account
            </div>
            <div className="rounded-2xl border border-cyan-500/15 bg-[#0b1a2c] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-xs text-slate-500">Telegram</span>
                <span className="text-sm font-semibold text-white">
                  {session.telegramUsername
                    ? `@${session.telegramUsername}`
                    : session.telegramName || 'Linked'}
                </span>
              </div>
              {session.walletAddress && (
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-xs text-slate-500">Wallet</span>
                  <span className="font-mono text-xs text-slate-300">
                    {`${session.walletAddress.slice(0, 6)}…${session.walletAddress.slice(-4)}`}
                  </span>
                </div>
              )}
            </div>

            {!unlinkArmed ? (
              <button
                type="button"
                onClick={() => {
                  haptic('warn');
                  setNotifError('');
                  setUnlinkArmed(true);
                }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm font-semibold text-red-300"
              >
                <IconLogout size={16} aria-hidden />
                Unlink this Telegram account
              </button>
            ) : (
              <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-sm text-red-100">
                  Unlink {session.telegramUsername ? `@${session.telegramUsername}` : 'this chat'}{' '}
                  from your wallet? You will stop getting notifications until you link again.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={unlinkBusy}
                    onClick={() => {
                      haptic('tap');
                      setUnlinkArmed(false);
                    }}
                    className="flex-1 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-3 py-2.5 text-sm font-semibold text-cyan-300 disabled:opacity-60"
                  >
                    Keep linked
                  </button>
                  <button
                    type="button"
                    disabled={unlinkBusy}
                    onClick={submitUnlink}
                    className="flex-1 rounded-xl border border-red-500/40 bg-red-500/20 px-3 py-2.5 text-sm font-bold text-red-100 disabled:opacity-60"
                  >
                    {unlinkBusy ? 'Unlinking…' : 'Unlink'}
                  </button>
                </div>
              </div>
            )}

            <p className="mt-4 text-center text-[11px] text-slate-600">
              Notifications and linking are also managed at morbius.io → Settings.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
