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
  IconGift,
  IconPlus,
  IconCheck,
} from '@tabler/icons-react';
import MiniAppProfileEditor from '@/components/telegram/MiniAppProfileEditor';
import MiniAppVideoPoker from '@/components/telegram/MiniAppVideoPoker';
import {
  MTT_TEMPLATES,
  type MttTemplate,
} from '@/components/poker/tournament/mtt-creator/mtt-templates';
import { buildPrizePercents } from '@/lib/poker-tournament-prize-presets';
import { POKER_TOURNAMENT_DEFAULT_CONFIG } from '@/hooks/use-poker-tournament';

// ---------------------------------------------------------------------------

interface TgWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  colorScheme?: string;
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

type View = 'hub' | 'stats' | 'profile' | 'videopoker' | 'lobby' | 'createTournament';
type StatScope = 'cash' | 'tournament' | 'all';
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-cyan-500/15 bg-[#0b1a2c] px-2 py-2 text-center">
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div className="mitr-bold mt-1 text-sm tabular-nums text-white">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// --- poker lobby -----------------------------------------------------------

/** Subset of the backend's PokerTournamentSummary the lobby card renders. */
interface LobbyTournament {
  tournamentId: string;
  name: string;
  status: string;
  buyInAmount: string;
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

/** Human start label — a day + time for scheduled events, fill-based text otherwise. */
function startLabel(t: LobbyTournament): string {
  if (t.startMode === 'fill') return 'Starts when full';
  if (t.scheduledStartAt) {
    const d = new Date(t.scheduledStartAt);
    if (!Number.isNaN(d.getTime())) {
      const now = new Date();
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

function LobbyTournamentCard({ t, onOpen }: { t: LobbyTournament; onOpen: () => void }) {
  const state = tournamentState(t);
  const isLive = state === 'live';
  const free = isFreeBuyIn(t.buyInAmount);
  return (
    <div
      className={`rounded-2xl border bg-[#0b1a2c] p-3 ${
        isLive ? 'border-cyan-500/30' : 'border-cyan-500/15'
      }`}
    >
      <div className="text-sm font-semibold text-white">{t.name}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-300">
          {isLive ? (
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" aria-hidden />
          ) : (
            <IconClock size={11} aria-hidden />
          )}
          {isLive ? 'In play' : startLabel(t)}
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

  const [view, setView] = useState<View>('hub');

  // Stats screen state
  const [scope, setScope] = useState<StatScope>('cash');
  const [stats, setStats] = useState<PokerStats | null>(null);
  const [statsState, setStatsState] = useState<FetchState>('idle');

  // Poker Lobby screen state
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [lobbyState, setLobbyState] = useState<FetchState>('idle');

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

  const openSite = useCallback((path = '') => {
    window.open(`https://morbius.io${path}`, '_blank', 'noopener');
  }, []);

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
                  Poker chips
                </div>
                <div className="mitr-bold mt-1 text-xl tabular-nums text-white">
                  {formatChips(session.chipBalance)}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openSite('/poker')}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-2.5 text-[13px] font-semibold text-cyan-400"
            >
              <IconArrowsExchange size={16} aria-hidden />
              Swap MORBIUS ↔ chips
            </button>

            <div className="flex flex-col gap-2.5">
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
                    sub: 'Video Poker — Jacks or Better',
                    target: 'videopoker',
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
                    key: 'profile',
                    icon: <IconUser size={20} aria-hidden />,
                    title: 'Profile & avatar',
                    sub: 'Edit your look and name',
                    target: 'profile',
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
                    if (tile.target) setView(tile.target);
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

        {/* ---- ARCADE: VIDEO POKER ---- */}
        {loadState === 'ready' && session && session.linked && view === 'videopoker' && (
          <MiniAppVideoPoker
            initData={initData}
            initialChipBalance={session.chipBalance ?? '0'}
            onBack={() => setView('hub')}
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
                        onOpen={() => openSite('/poker')}
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
                      <LobbyCashCard key={c.id} c={c} onOpen={() => openSite('/poker')} />
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
                  Chip tournament · runs entirely in MORBIUS · no wallet needed
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
