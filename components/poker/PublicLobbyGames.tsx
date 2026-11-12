'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAppKit } from '@reown/appkit/react';
import type { PublicGamesResponse, PublicTournament, PublicCashTable } from '@/app/api/poker/public-games/route';

/** Set before opening the wallet modal; consumed after connect by the lobby (tournament) or page (cash). */
export const POKER_PENDING_JOIN_KEY = 'morbius-poker-pending-join-v1';
export type PokerPendingJoin =
  | { kind: 'tournament'; tournamentId: string; at: number }
  | { kind: 'cash'; tableId: string; bigBlind: number; at: number };

export function readPendingJoin(): PokerPendingJoin | null {
  try {
    const raw = sessionStorage.getItem(POKER_PENDING_JOIN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PokerPendingJoin;
    if (!p || typeof p.at !== 'number' || Date.now() - p.at > 15 * 60_000) {
      sessionStorage.removeItem(POKER_PENDING_JOIN_KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}
export function clearPendingJoin() {
  try {
    sessionStorage.removeItem(POKER_PENDING_JOIN_KEY);
  } catch {
    /* ignore */
  }
}

const fmtNum = (s: string | number) => Number(s).toLocaleString('en-US');

function etTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
}
function etDay(iso: string, nowMs: number) {
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const d = new Date(iso).toLocaleDateString('en-CA', opts);
  const today = new Date(nowMs).toLocaleDateString('en-CA', opts);
  const tomorrow = new Date(nowMs + 86_400_000).toLocaleDateString('en-CA', opts);
  if (d === today) return 'Today';
  if (d === tomorrow) return 'Tomorrow';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}
function countdown(ms: number) {
  if (ms <= 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function PublicLobbyGames() {
  const { open } = useAppKit();
  const [data, setData] = useState<PublicGamesResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/poker/public-games', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as PublicGamesResponse);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 30_000);
    const tick = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const connectThen = (p: PokerPendingJoin) => {
    try {
      sessionStorage.setItem(POKER_PENDING_JOIN_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
    void open?.();
  };

  if (!data && !failed) {
    return <div className="py-6 text-center text-sm text-slate-400">Loading games…</div>;
  }
  if (!data) return null;
  const tournaments = data.tournaments;
  const cash = data.cash;
  if (tournaments.length === 0 && cash.length === 0) return null;

  return (
    <div className="space-y-3" data-testid="public-lobby-games">
      {tournaments.map((t) => (
        <TournamentCard key={t.tournamentId} t={t} nowMs={nowMs} onJoin={() => connectThen({ kind: 'tournament', tournamentId: t.tournamentId, at: Date.now() })} />
      ))}
      {cash.map((c) => (
        <CashCard key={c.tableId} c={c} onJoin={() => connectThen({ kind: 'cash', tableId: c.tableId, bigBlind: c.bigBlind, at: Date.now() })} />
      ))}
    </div>
  );
}

const btn =
  'inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 px-4 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition-opacity';

function TournamentCard({ t, nowMs, onJoin }: { t: PublicTournament; nowMs: number; onJoin: () => void }) {
  const startMs = Date.parse(t.startsAt);
  const started = t.status === 'active' || startMs <= nowMs;
  const lateMs = t.lateRegEndsAt ? Date.parse(t.lateRegEndsAt) - nowMs : 0;
  const full = t.seatsOpen === 0;
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-100">{t.name}</span>
            {t.freeEntry && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold tracking-wide text-emerald-300">FREE ENTRY</span>
            )}
            <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-300">
              {started ? 'Late registration' : 'Registration open'}
            </span>
          </div>
          <div className="mt-1 text-sm text-slate-300">
            {etDay(t.startsAt, nowMs)} · {etTime(t.startsAt)} ·{' '}
            {started ? (
              <span className="text-amber-300">In progress · late entry closes in {countdown(lateMs)}</span>
            ) : (
              <span className="tabular-nums text-cyan-200">Starts in {countdown(startMs - nowMs)}</span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {t.registered != null ? `${t.registered}/${t.maxPlayers} registered` : `${t.maxPlayers} seats`}
            {t.seatsOpen != null && ` · ${t.seatsOpen} open seat${t.seatsOpen === 1 ? '' : 's'}`}
            {t.prizePool && ` · Prize pool ${fmtNum(t.prizePool)} chips`}
            {!t.freeEntry && ` · Buy-in ${fmtNum(t.buyIn)} chips`}
          </div>
        </div>
        <button type="button" className={btn} onClick={onJoin} disabled={full}>
          {full ? 'Full' : t.freeEntry ? 'Connect wallet & join free' : 'Connect wallet & register'}
        </button>
      </div>
    </div>
  );
}

function CashCard({ c, onJoin }: { c: PublicCashTable; onJoin: () => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-100">House Cash Game</span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold tracking-wide text-emerald-300">OPEN 24/7</span>
          </div>
          <div className="mt-1 text-sm text-slate-300 tabular-nums">
            No-limit Hold&apos;em · {fmtNum(c.smallBlind)} / {fmtNum(c.bigBlind)} blinds
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {c.seated}/{c.maxSeats} seated · {c.seatsOpen} open seat{c.seatsOpen === 1 ? '' : 's'}
          </div>
        </div>
        <button type="button" className={btn} onClick={onJoin} disabled={c.seatsOpen === 0}>
          {c.seatsOpen === 0 ? 'Full' : 'Connect wallet & sit'}
        </button>
      </div>
    </div>
  );
}
