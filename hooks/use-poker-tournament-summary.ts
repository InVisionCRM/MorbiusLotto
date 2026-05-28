'use client';

/**
 * Derives the small set of formatted strings shared by both the desktop
 * Tournament HUD sidebar and the mobile top bar:
 *
 *   - `blinds`           — "25/50" (short-form formatted blinds)
 *   - `levelCountdown`   — "MM:SS" until the next blind level, or null if
 *                          the tournament uses non-by-time progression
 *                          / there is no next level
 *   - `rank`             — 1-indexed rank of `myAddress` among active
 *                          players sorted by chips, or null if not playing
 *   - `playersLeft`      — count of players still playing
 *
 * Pure-ish: takes the same `tournamentHudState` shape PokerTournamentHUD
 * already consumes. Spins a 1Hz interval only when a by-time countdown
 * is actually needed.
 *
 * Why extracted: the mobile-landscape redesign hides the desktop HUD
 * sidebar but still needs to surface these values in the slim top bar.
 * Rather than duplicate the (subtle, edge-case-laden) derivation, both
 * surfaces can consume this hook.
 */

import { useEffect, useState } from 'react';
import type { PokerTournamentState } from '@/hooks/use-poker-tournament';

function formatBlindShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.floor(n / 1000)}K`;
  return String(n);
}

function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

export interface PokerTournamentSummary {
  blinds: string | null;
  levelCountdown: string | null;
  rank: number | null;
  playersLeft: number | null;
}

export function usePokerTournamentSummary(
  state: PokerTournamentState | null | undefined,
  myAddress: string | null | undefined,
): PokerTournamentSummary {
  // ── Blinds ────────────────────────────────────────────────────────────
  const blinds = state
    ? `${formatBlindShort(state.smallBlind)}/${formatBlindShort(state.bigBlind)}`
    : null;

  // ── Rank ──────────────────────────────────────────────────────────────
  // Memoization handled automatically by React Compiler.
  let rank: number | null = null;
  let playersLeft: number | null = null;
  if (state && myAddress) {
    const active = state.players.filter((p) => p.status === 'playing');
    const sorted = [...active].sort((a, b) => b.chipsRemaining - a.chipsRemaining);
    const idx = sorted.findIndex(
      (p) => p.playerAddress.toLowerCase() === myAddress.toLowerCase(),
    );
    rank = idx >= 0 ? idx + 1 : null;
    playersLeft = active.length;
  }

  // ── By-time blind countdown ──────────────────────────────────────────
  const isByTime = state?.pokerConfig?.blindIncreaseMode === 'by_time';
  const intervalMinutes = state?.pokerConfig?.blindIntervalMinutes ?? null;
  const schedule = state?.pokerConfig?.blindSchedule;
  const nextLevel =
    schedule?.find((lvl) => lvl.level === (state?.blindLevel ?? 0) + 1) ?? null;
  const startedAtRaw = state?.currentBlindLevelStartedAt;
  let levelStartedAtMs: number | null = null;
  if (isByTime && startedAtRaw) {
    const t = Date.parse(startedAtRaw);
    levelStartedAtMs = Number.isFinite(t) ? t : null;
  }

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isByTime || levelStartedAtMs == null || !intervalMinutes || !nextLevel) {
      return;
    }
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isByTime, levelStartedAtMs, intervalMinutes, nextLevel]);

  let levelCountdown: string | null = null;
  if (isByTime && levelStartedAtMs != null && intervalMinutes && nextLevel) {
    const intervalMs = intervalMinutes * 60 * 1000;
    const remainMs = Math.max(0, levelStartedAtMs + intervalMs - nowMs);
    levelCountdown = formatMmSs(remainMs / 1000);
  }

  return { blinds, levelCountdown, rank, playersLeft };
}
