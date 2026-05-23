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
} from '@tabler/icons-react';
import MiniAppProfileEditor from '@/components/telegram/MiniAppProfileEditor';
import MiniAppVideoPoker from '@/components/telegram/MiniAppVideoPoker';

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

type View = 'hub' | 'stats' | 'profile' | 'videopoker';
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

  const openSite = useCallback((path = '') => {
    window.open(`https://morbius.io${path}`, '_blank', 'noopener');
  }, []);

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
                    target: null,
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
      </div>
    </div>
  );
}
