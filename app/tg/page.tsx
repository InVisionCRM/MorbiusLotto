'use client';

/**
 * /tg — the MORBIUS Telegram Mini App.
 *
 * Phase 1: the foundation + home hub. Loads Telegram's WebApp SDK, verifies the
 * signed `initData` against the backend (POST /api/telegram/miniapp/session),
 * and renders the hub — profile, balances, and section tiles.
 *
 * This page deliberately uses no site chrome (no GlobalMainNav) — inside
 * Telegram it IS the app.
 */

import { useCallback, useEffect, useState } from 'react';
import { IconUser, IconChartBar, IconArrowsExchange, IconLink } from '@tabler/icons-react';

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

// ---------------------------------------------------------------------------

type LoadState = 'loading' | 'no-telegram' | 'error' | 'ready';

export default function TelegramMiniAppPage() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [session, setSession] = useState<MiniAppSession | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const webApp = await loadTelegramSdk();
      if (cancelled) return;
      if (!webApp || !webApp.initData) {
        setLoadState('no-telegram');
        return;
      }
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

  const openSite = useCallback((path = '') => {
    window.open(`https://morbius.io${path}`, '_blank', 'noopener');
  }, []);

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

        {loadState === 'ready' && session && session.linked && (
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
                { icon: <IconUser size={18} aria-hidden />, title: 'Profile & avatar', sub: 'Edit your look and name' },
                { icon: <IconChartBar size={18} aria-hidden />, title: 'Your stats', sub: 'Hands, wins, profit & loss' },
                { icon: <IconArrowsExchange size={18} aria-hidden />, title: 'Wallet & swap', sub: 'Move MORBIUS to chips and back' },
              ].map((tile) => (
                <div
                  key={tile.title}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300">
                    {tile.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{tile.title}</div>
                    <div className="text-xs text-white/45">{tile.sub}</div>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                    Soon
                  </span>
                </div>
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
      </div>
    </div>
  );
}
