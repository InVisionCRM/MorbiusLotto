'use client';

/**
 * /tg — the MORBIUS Telegram Mini App.
 *
 * Phase 1: foundation + home hub. Loads Telegram's WebApp SDK, verifies the
 * signed `initData` against the backend (POST /api/telegram/miniapp/session).
 *
 * Phase 2: the Stats screen and the Wallet screen.
 *   - Stats reads the public GET /api/poker/player/:address/stats endpoint
 *     using the linked wallet from the verified session.
 *   - Wallet shows MORBIUS + chip balances and deep-links to morbius.io for
 *     the actual swap (real-value moves stay behind the site's wallet auth).
 *
 * This page deliberately uses no site chrome (no GlobalMainNav) — inside
 * Telegram it IS the app.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  IconUser,
  IconChartBar,
  IconArrowsExchange,
  IconLink,
  IconArrowLeft,
  IconChevronRight,
  IconExternalLink,
  IconCards,
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

type View = 'hub' | 'stats' | 'wallet' | 'profile' | 'videopoker';
type StatScope = 'cash' | 'tournament' | 'all';
type LoadState = 'loading' | 'no-telegram' | 'error' | 'ready';
type FetchState = 'idle' | 'loading' | 'error' | 'ready';

const SDK_SRC = 'https://telegram.org/js/telegram-web-app.js';

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
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="text-xs text-white/50">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${accent ?? ''}`}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
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
    <div className="min-h-screen bg-[#0b0f1a] text-white">
      <div className="mx-auto w-full max-w-md px-4 py-6">
        <div className="mb-5 text-center text-sm font-semibold tracking-wide text-cyan-400">
          MORBIUS
        </div>

        {loadState === 'loading' && (
          <p className="mt-16 text-center text-sm text-white/50">Loading your hub…</p>
        )}

        {loadState === 'no-telegram' && (
          <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <p className="text-sm text-white/70">
              This is the MORBIUS in-app hub — open it from inside Telegram, via the
              MORBIUS bot.
            </p>
          </div>
        )}

        {loadState === 'error' && (
          <div className="mt-12 rounded-2xl border border-red-500/25 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-200/90">{errorMsg}</p>
          </div>
        )}

        {loadState === 'ready' && session && !session.linked && (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              <IconLink size={22} aria-hidden />
            </div>
            <h1 className="text-lg font-semibold">Link your wallet</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Connect your MORBIUS wallet to Telegram to use the hub — check balances,
              stats, and your profile right here.
            </p>
            <button
              type="button"
              onClick={() => openSite('/settings')}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white"
            >
              Link on morbius.io
            </button>
            <p className="mt-3 text-xs text-white/40">
              On the site: connect your wallet → Settings → Notifications → Link Telegram.
            </p>
          </div>
        )}

        {/* ---- HUB ---- */}
        {loadState === 'ready' && session && session.linked && view === 'hub' && (
          <>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-lg font-semibold text-cyan-300">
                {initials(session)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">
                  {session.displayName || session.telegramName || 'MORBIUS player'}
                </div>
                <div className="truncate text-xs text-white/45">
                  {session.telegramUsername ? `@${session.telegramUsername} · ` : ''}wallet linked
                </div>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <div className="text-xs text-white/50">MORBIUS</div>
                <div className="mt-0.5 text-xl font-semibold tabular-nums">
                  {formatMorbius(session.morbiusBalanceWei)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <div className="text-xs text-white/50">Poker chips</div>
                <div className="mt-0.5 text-xl font-semibold tabular-nums">
                  {formatChips(session.chipBalance)}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {[
                {
                  key: 'profile',
                  icon: <IconUser size={18} aria-hidden />,
                  title: 'Profile & avatar',
                  sub: 'Edit your look and name',
                  target: 'profile' as View | null,
                },
                {
                  key: 'stats',
                  icon: <IconChartBar size={18} aria-hidden />,
                  title: 'Your stats',
                  sub: 'Hands, wins, profit & loss',
                  target: 'stats' as View | null,
                },
                {
                  key: 'wallet',
                  icon: <IconArrowsExchange size={18} aria-hidden />,
                  title: 'Wallet & swap',
                  sub: 'Move MORBIUS to chips and back',
                  target: 'wallet' as View | null,
                },
                {
                  key: 'arcade',
                  icon: <IconCards size={18} aria-hidden />,
                  title: 'MORBIUS Arcade',
                  sub: 'Video Poker — Jacks or Better',
                  target: 'videopoker' as View | null,
                },
              ].map((tile) => (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => {
                    if (tile.target) setView(tile.target);
                  }}
                  disabled={!tile.target}
                  className={`flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition-colors ${
                    tile.target ? 'hover:border-cyan-500/30 hover:bg-white/[0.06]' : 'cursor-default'
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300">
                    {tile.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{tile.title}</div>
                    <div className="text-xs text-white/45">{tile.sub}</div>
                  </div>
                  {tile.target ? (
                    <IconChevronRight size={18} className="shrink-0 text-white/30" aria-hidden />
                  ) : (
                    <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                      Soon
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => openSite('')}
              className="mt-5 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-white/80"
            >
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70 hover:text-white"
              >
                <IconArrowLeft size={18} aria-hidden />
              </button>
              <h1 className="text-base font-semibold">Your stats</h1>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2">
              {(
                [
                  ['cash', 'Cash'],
                  ['tournament', 'Tournaments'],
                  ['all', 'All'],
                ] as [StatScope, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScope(key)}
                  className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                    scope === key
                      ? 'border border-cyan-500/30 bg-cyan-500/15 text-cyan-300'
                      : 'border border-white/10 bg-white/[0.03] text-white/55'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {statsState === 'loading' && (
              <p className="mt-10 text-center text-sm text-white/50">Loading your stats…</p>
            )}

            {statsState === 'error' && (
              <div className="mt-8 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-center">
                <p className="text-sm text-red-200/90">Could not load your stats. Try again.</p>
              </div>
            )}

            {statsState === 'ready' && stats && stats.total_hands === 0 && (
              <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
                <p className="text-sm text-white/60">
                  No {scope === 'all' ? '' : `${scope} `}hands played yet. Sit down at a
                  table and your stats will show up here.
                </p>
              </div>
            )}

            {statsState === 'ready' && stats && stats.total_hands > 0 && (
              <>
                <div className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <span className="text-xs text-white/50">Play style</span>
                  <span className="text-sm font-semibold text-cyan-300">{archetypeName(stats)}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Hands played" value={stats.total_hands.toLocaleString('en-US')} />
                  <MetricCard label="Win rate" value={`${stats.win_rate.toFixed(1)}%`} />
                  <MetricCard
                    label="Net profit / loss"
                    value={pnl.text}
                    accent={pnl.positive ? 'text-emerald-400' : 'text-red-400'}
                  />
                  <MetricCard label="Best streak" value={`${stats.best_streak}`} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <MetricCard label="Hands won" value={stats.hands_won.toLocaleString('en-US')} />
                  <MetricCard label="Biggest pot" value={formatChips(stats.biggest_pot_won)} />
                </div>

                <div className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
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
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-white/80"
                >
                  Full stats on morbius.io
                  <IconExternalLink size={15} aria-hidden />
                </button>
              </>
            )}
          </>
        )}

        {/* ---- WALLET ---- */}
        {loadState === 'ready' && session && session.linked && view === 'wallet' && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView('hub')}
                aria-label="Back to hub"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70 hover:text-white"
              >
                <IconArrowLeft size={18} aria-hidden />
              </button>
              <h1 className="text-base font-semibold">Wallet &amp; swap</h1>
            </div>

            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xs text-white/50">MORBIUS balance</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-cyan-300">
                  {formatMorbius(session.morbiusBalanceWei)}
                </div>
                <div className="mt-0.5 text-[11px] text-white/40">In-game play balance</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xs text-white/50">Poker chips</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatChips(session.chipBalance)}
                </div>
                <div className="mt-0.5 text-[11px] text-white/40">Used at poker tables</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <IconArrowsExchange size={17} className="text-cyan-300" aria-hidden />
                Swap MORBIUS ↔ chips
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-white/50">
                Swapping moves real value, so it happens on the secure site with your
                wallet. This opens morbius.io — your balances here refresh next time you
                open the hub.
              </p>
              <button
                type="button"
                onClick={() => openSite('/poker')}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white"
              >
                Swap on morbius.io
                <IconExternalLink size={15} aria-hidden />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setView('hub')}
              className="mt-4 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-white/80"
            >
              Back to hub
            </button>
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
