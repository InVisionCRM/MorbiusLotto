'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { formatChips } from '@/lib/format-poker-chips';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import type { PokerTournamentState, PokerBlindIncreaseMode } from '@/hooks/use-poker-tournament';

/** Must match server `POKER_AFK_CONSECUTIVE_TIMEOUT_KICK` in `poker-game.service.ts`. */
const AFK_MISSED_TURNS_IN_A_ROW = 3;

/** Server auto-fold watchdog uses 60s when DB `action_timer_seconds` is unset. */
const DEFAULT_TURN_SECONDS = 60;

function blindModeExplain(mode: PokerBlindIncreaseMode | undefined, intervalMinutes?: number): string {
  if (mode === 'by_hand') {
    return (
      'Scheduled blind increases: the small and big blind amounts follow the schedule below. ' +
      'After each level, blinds stay the same for the number of completed hands shown in the last column, then move to the next row.'
    );
  }
  if (mode === 'by_time') {
    const mins = intervalMinutes && intervalMinutes > 0 ? intervalMinutes : null;
    const label = mins ? `${mins} minutes` : 'a fixed interval';
    return (
      `Timed blind increases: each level lasts ${label} of real time, then blinds bump to the next row in the schedule below ` +
      'regardless of how many hands have been played.'
    );
  }
  return (
    'Elimination blind increases: blinds jump along the schedule when players are knocked out of the tournament ' +
    '(not on a fixed hand count).'
  );
}

function prizeTypeLabel(type: string): string {
  return type.replace(/_/g, ' ');
}

function rankOrdinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

function estimatePayoutWei(poolWei: bigint, percent: number): string {
  if (percent <= 0) return '0';
  try {
    return ((poolWei * BigInt(percent)) / 100n).toString();
  } catch {
    return '0';
  }
}

export interface PokerTournamentRulesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wsClient: BlackjackWebSocketClient | null;
  tournamentId: string;
  tournamentName: string;
}

export function PokerTournamentRulesModal({
  open,
  onOpenChange,
  wsClient,
  tournamentId,
  tournamentName,
}: PokerTournamentRulesModalProps) {
  const [state, setState] = useState<PokerTournamentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wsClient?.isConnected()) {
      setLoadError('Connect to the game server (open the poker page with your wallet) to load rules.');
      setState(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = (await wsClient.sendRequest('poker_tournament_get_state', {
        tournamentId,
      })) as PokerTournamentState | null;
      setState(res);
      if (!res) setLoadError('Could not load tournament details.');
    } catch (e) {
      setState(null);
      setLoadError((e as Error)?.message ?? 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, [wsClient, tournamentId]);

  useEffect(() => {
    if (!open) {
      setState(null);
      setLoadError(null);
      return;
    }
    void load();
  }, [open, load]);

  const cfg = state?.pokerConfig;
  const mode = cfg?.blindIncreaseMode ?? 'knockout';
  const schedule = cfg?.blindSchedule ?? [];
  const turnSeconds = state?.actionTimerSeconds ?? DEFAULT_TURN_SECONDS;
  const splits = state?.prizeSplitPercentages ?? [];
  const poolWei = (() => {
    try {
      return BigInt(state?.prizePool ?? '0');
    } catch {
      return 0n;
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg w-[calc(100%-2rem)] max-h-[min(90vh,720px)] overflow-y-auto border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-2xl p-0 gap-0"
        style={{
          boxShadow:
            '0 4px 24px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <DialogHeader className="p-4 pb-2 border-b border-cyan-500/20 shrink-0">
          <DialogTitle className="text-lg font-semibold text-white pr-6">
            Tournament rules
          </DialogTitle>
          <p className="text-sm text-white/70 font-normal mt-1">{tournamentName}</p>
        </DialogHeader>

        <div className="p-4 pt-3 space-y-5 text-sm text-white/90">
          {loading && (
            <p className="text-white/60 text-center py-4">Loading…</p>
          )}
          {!loading && loadError && (
            <div className="rounded-lg border border-red-500/35 bg-red-950/40 text-red-200/95 px-3 py-2 text-sm">
              {loadError}
            </div>
          )}
          {!loading && state && (
            <>
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-300/90">
                  Blind levels
                </h3>
                <p className="text-white/75 leading-relaxed">{blindModeExplain(mode, cfg?.blindIntervalMinutes)}</p>
                <div
                  className="rounded-lg overflow-hidden border border-cyan-500/20 text-xs"
                  style={{
                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.85), rgba(40, 40, 40, 0.55))',
                    boxShadow:
                      'inset 0 2px 4px rgba(0,0,0,0.75), inset 0 -2px 4px rgba(255,255,255,0.06)',
                  }}
                >
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-white/50 border-b border-white/10">
                        <th className="py-2 px-2 font-medium">Level</th>
                        <th className="py-2 px-2 font-medium">Small</th>
                        <th className="py-2 px-2 font-medium">Big</th>
                        {mode === 'by_hand' && (
                          <th className="py-2 px-2 font-medium">Hands / level</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((row) => (
                        <tr key={row.level} className="border-b border-white/5 last:border-0">
                          <td className="py-1.5 px-2 tabular-nums">{row.level}</td>
                          <td className="py-1.5 px-2 tabular-nums">{formatChips(row.smallBlind)}</td>
                          <td className="py-1.5 px-2 tabular-nums">{formatChips(row.bigBlind)}</td>
                          {mode === 'by_hand' && (
                            <td className="py-1.5 px-2 tabular-nums text-white/85">
                              {row.handsPerLevel >= 900 ? 'Until next bump' : row.handsPerLevel}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-300/90">
                  Action clock
                </h3>
                <p className="text-white/75 leading-relaxed">
                  When it is your turn to act, you have{' '}
                  <span className="text-white font-medium">{turnSeconds} seconds</span> before the table
                  automatically checks or folds for you (check if you can check for free; otherwise fold).
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-300/90">
                  AFK — missing your turn
                </h3>
                <p className="text-white/75 leading-relaxed">
                  If the action clock runs out on your turn{' '}
                  <span className="text-white font-medium">{AFK_MISSED_TURNS_IN_A_ROW} times in a row</span>, you
                  are eliminated from the tournament (same as busting out; no refund). In cash games the seat may be
                  closed and your stack returned.{' '}
                  <span className="text-white">
                    As soon as you take any real action yourself, the miss-count goes back to zero
                  </span>
                  — the three misses must be three timeouts in a row with no voluntary play between them.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-300/90">
                  Payouts ({prizeTypeLabel(state.prizeDistributionType)})
                </h3>
                <p className="text-white/75 leading-relaxed">
                  Prizes are paid from the tournament prize pool using these shares. Dollar amounts are estimates
                  from the current pool; the final pool can change until registration closes.
                </p>
                <ul className="space-y-1.5 text-white/85">
                  {splits.map((pct, i) => (
                    <li key={i} className="flex justify-between gap-3 border-b border-white/5 pb-1 last:border-0">
                      <span>{rankOrdinal(i + 1)} place</span>
                      <span className="tabular-nums text-right shrink-0">
                        {pct}%
                        {poolWei > 0n && pct > 0 ? (
                          <span className="text-white/55 ml-2">
                            (~{formatMorbiusFloor(estimatePayoutWei(poolWei, pct))} MORBIUS)
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-300/90">
                  Buy-ins & refunds
                </h3>
                <p className="text-white/75 leading-relaxed">
                  <span className="text-white">There are no refunds</span> after you have bought in, once the
                  tournament is running, or if you leave the table on purpose. If the house cancels a tournament
                  before it starts, buy-ins are handled according to the cancellation notice at that time.
                </p>
              </section>

              <section className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/55">
                Starting stack: {cfg?.startingStack?.toLocaleString() ?? '—'} chips · Table size:{' '}
                {cfg?.minPlayers ?? '—'}–{cfg?.maxPlayers ?? '—'} players
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
