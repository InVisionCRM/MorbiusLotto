'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAddress, isAddress } from 'viem';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CopyButton } from '@/components/ui/copy-button';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { WS_MESSAGE_TYPES } from '@/lib/websocket-message-types';
import { formatChips } from '@/lib/format-poker-chips';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import type {
  PokerTournamentState,
  PokerBlindIncreaseMode,
  PokerTournamentSummary,
} from '@/hooks/use-poker-tournament';
import type { PokerTournamentRegistrantRow } from './PokerTournamentRegistrantsModal';

/** Server auto-fold watchdog default when DB `action_timer_seconds` is unset. */
const DEFAULT_TURN_SECONDS = 60;

type InfoTab = 'rules' | 'payouts' | 'players';

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

function statusLabel(status: PokerTournamentRegistrantRow['status']): string {
  if (status === 'playing') return 'Playing';
  if (status === 'completed') return 'Finished';
  return 'Eliminated';
}

function profileHref(addr: string): string | null {
  const t = addr?.trim() ?? '';
  if (!t || !isAddress(t)) return null;
  return `/player/${getAddress(t)}`;
}

export interface PokerTournamentInfoModalProps {
  open: boolean;
  onClose: () => void;
  wsClient: BlackjackWebSocketClient | null;
  /** Lobby summary — drives the always-visible header strip without waiting on a fetch. */
  tournament: PokerTournamentSummary | null;
  /** Pre-formatted buy-in label from the lobby (handles chips / freeroll / custom token). */
  entryLabel?: string;
  myAddress?: string;
}

/**
 * Consolidated tournament info card — replaces the separate "Rules" and "Roster"
 * lobby buttons with one "INFO" button. Centered modal with three tabs:
 *   • Rules    — blind levels, action clock, buy-ins/refunds, starting stack
 *   • Payouts  — prize split per rank with live MORBIUS estimates
 *   • Players  — registered roster with profile links
 */
export function PokerTournamentInfoModal({
  open,
  onClose,
  wsClient,
  tournament,
  entryLabel,
  myAddress,
}: PokerTournamentInfoModalProps) {
  const [tab, setTab] = useState<InfoTab>('rules');
  const [state, setState] = useState<PokerTournamentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [registrants, setRegistrants] = useState<PokerTournamentRegistrantRow[]>([]);
  const [registrantsLoading, setRegistrantsLoading] = useState(false);
  const [registrantsError, setRegistrantsError] = useState<string | null>(null);

  const tournamentId = tournament?.tournamentId ?? '';
  const tournamentName = tournament?.name ?? '';
  const me = myAddress?.toLowerCase() ?? null;

  const loadState = useCallback(async () => {
    if (!wsClient?.isConnected()) {
      setLoadError('Connect to the game server (open the poker page with your wallet) to load details.');
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
      setLoadError((e as Error)?.message ?? 'Failed to load details');
    } finally {
      setLoading(false);
    }
  }, [wsClient, tournamentId]);

  const loadRegistrants = useCallback(async () => {
    if (!wsClient?.isConnected() || !tournamentId) {
      setRegistrants([]);
      return;
    }
    setRegistrantsLoading(true);
    setRegistrantsError(null);
    try {
      const payload = (await wsClient.sendRequest(WS_MESSAGE_TYPES.pokerTournamentRegistrants, {
        tournamentId,
      })) as { registrants?: PokerTournamentRegistrantRow[] };
      setRegistrants(Array.isArray(payload?.registrants) ? payload.registrants : []);
    } catch (e) {
      setRegistrants([]);
      setRegistrantsError((e as Error)?.message ?? 'Failed to load players');
    } finally {
      setRegistrantsLoading(false);
    }
  }, [wsClient, tournamentId]);

  useEffect(() => {
    if (!open) {
      setState(null);
      setLoadError(null);
      setRegistrants([]);
      setRegistrantsError(null);
      setTab('rules');
      return;
    }
    void loadState();
    void loadRegistrants();
  }, [open, loadState, loadRegistrants]);

  const cfg = state?.pokerConfig;
  const mode = cfg?.blindIncreaseMode ?? tournament?.blindIncreaseMode ?? 'knockout';
  const schedule = cfg?.blindSchedule ?? [];
  const turnSeconds = state?.actionTimerSeconds ?? DEFAULT_TURN_SECONDS;
  const splits = state?.prizeSplitPercentages ?? [];
  const poolWei = (() => {
    try {
      return BigInt(state?.prizePool ?? tournament?.prizePool ?? '0');
    } catch {
      return 0n;
    }
  })();

  const registeredCount = tournament?.registeredCount ?? registrants.length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-lg w-[calc(100%-2rem)] max-h-[min(90vh,760px)] overflow-hidden border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-2xl p-0 gap-0 flex flex-col"
        style={{
          boxShadow: '0 4px 24px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <DialogHeader className="p-4 pb-3 border-b border-cyan-500/20 shrink-0 text-left">
          <DialogTitle className="text-lg font-semibold text-white pr-6">
            Tournament info
          </DialogTitle>
          <p className="text-sm text-white/70 font-normal mt-0.5 truncate">{tournamentName}</p>

          {/* Summary strip — always visible, sourced from the lobby summary. */}
          {tournament && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <SummaryStat label="Entry" value={entryLabel ?? summaryEntry(tournament)} />
              <SummaryStat
                label="Blinds"
                value={`${formatChips(tournament.smallBlind ?? schedule[0]?.smallBlind ?? 25)} / ${formatChips(
                  tournament.bigBlind ?? schedule[0]?.bigBlind ?? 50,
                )}`}
              />
              <SummaryStat label="Seats" value={`${registeredCount}/${tournament.maxPlayers}`} />
              <SummaryStat label="Clock" value={`${turnSeconds}s`} />
            </div>
          )}
        </DialogHeader>

        {/* Tab bar */}
        <div className="shrink-0 flex gap-1 px-3 pt-3 border-b border-white/10">
          {(['rules', 'payouts', 'players'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`relative px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                tab === t ? 'text-cyan-300' : 'text-white/55 hover:text-white/80'
              }`}
            >
              {t === 'players' ? `Players${registeredCount ? ` (${registeredCount})` : ''}` : t}
              {tab === t && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-cyan-400" aria-hidden />
              )}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm text-white/90">
          {/* ── RULES ── */}
          {tab === 'rules' && (
            <>
              {loading && <p className="text-white/60 text-center py-6">Loading…</p>}
              {!loading && loadError && (
                <div className="rounded-lg border border-red-500/35 bg-red-950/40 text-red-200/95 px-3 py-2 text-sm">
                  {loadError}
                </div>
              )}
              {!loading && state && (
                <div className="space-y-5">
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-300/90">Blind levels</h3>
                    <p className="text-white/75 leading-relaxed">
                      {blindModeExplain(mode, cfg?.blindIntervalMinutes)}
                    </p>
                    <div
                      className="rounded-lg overflow-hidden border border-cyan-500/20 text-xs"
                      style={{
                        background: 'linear-gradient(325deg, rgba(20,20,20,0.85), rgba(40,40,40,0.55))',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.75), inset 0 -2px 4px rgba(255,255,255,0.06)',
                      }}
                    >
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="text-white/50 border-b border-white/10">
                            <th className="py-2 px-2 font-medium">Level</th>
                            <th className="py-2 px-2 font-medium">Small</th>
                            <th className="py-2 px-2 font-medium">Big</th>
                            {mode === 'by_hand' && <th className="py-2 px-2 font-medium">Hands / level</th>}
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
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-300/90">Action clock</h3>
                    <p className="text-white/75 leading-relaxed">
                      When it is your turn to act, you have{' '}
                      <span className="text-white font-medium">{turnSeconds} seconds</span> before the table
                      automatically checks or folds for you (check if you can check for free; otherwise fold). This
                      applies every time the clock runs out; you are not removed from the table or tournament for
                      missing the timer.
                    </p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-300/90">Buy-ins &amp; refunds</h3>
                    <p className="text-white/75 leading-relaxed">
                      <span className="text-white">There are no refunds</span> after you have bought in, once the
                      tournament is running, or if you leave the table on purpose. If the house cancels a tournament
                      before it starts, buy-ins are handled according to the cancellation notice at that time.
                    </p>
                  </section>

                  {cfg?.lateRegMinutes && cfg.lateRegMinutes > 0 ? (
                    <section className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-300/90">Late registration</h3>
                      <p className="text-white/75 leading-relaxed">
                        Players can still buy in for{' '}
                        <span className="text-white font-medium">{cfg.lateRegMinutes} minutes</span> after the
                        tournament starts. Late entrants are seated at a live table with a full starting stack and
                        dealt in on the next hand.
                      </p>
                    </section>
                  ) : null}

                  <section className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/55">
                    Starting stack: {cfg?.startingStack?.toLocaleString() ?? '—'} chips · Table size:{' '}
                    {cfg?.minPlayers ?? '—'}–{cfg?.maxPlayers ?? '—'} players
                  </section>
                </div>
              )}
            </>
          )}

          {/* ── PAYOUTS ── */}
          {tab === 'payouts' && (
            <>
              {loading && <p className="text-white/60 text-center py-6">Loading…</p>}
              {!loading && loadError && (
                <div className="rounded-lg border border-red-500/35 bg-red-950/40 text-red-200/95 px-3 py-2 text-sm">
                  {loadError}
                </div>
              )}
              {!loading && state && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-300/90">
                    Payouts ({prizeTypeLabel(state.prizeDistributionType)})
                  </h3>
                  <p className="text-white/75 leading-relaxed">
                    Prizes are paid from the tournament prize pool using these shares. Amounts are estimates from the
                    current pool; the final pool can change until registration closes.
                  </p>
                  {splits.length === 0 ? (
                    <p className="text-white/45 text-center py-4">No payout structure available.</p>
                  ) : (
                    <ul className="space-y-1.5 text-white/85">
                      {splits.map((pct, i) => (
                        <li
                          key={i}
                          className="flex justify-between gap-3 border-b border-white/5 pb-1 last:border-0"
                        >
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
                  )}
                </section>
              )}
            </>
          )}

          {/* ── PLAYERS ── */}
          {tab === 'players' && (
            <>
              {registrantsLoading && <p className="text-white/60 text-center py-6">Loading…</p>}
              {!registrantsLoading && registrantsError && (
                <div className="rounded-lg border border-red-500/35 bg-red-950/40 text-red-200/95 px-3 py-2 text-sm">
                  {registrantsError}
                </div>
              )}
              {!registrantsLoading && !registrantsError && registrants.length === 0 && (
                <div className="text-center text-white/45 text-sm py-8">No registrants yet.</div>
              )}
              {!registrantsLoading && !registrantsError && registrants.length > 0 && (
                <ul className="space-y-2">
                  {registrants.map((r) => {
                    const isMe = me && r.playerAddress.toLowerCase() === me;
                    const profilePath = profileHref(r.playerAddress);
                    return (
                      <li
                        key={`${r.playerAddress}-${r.registeredAt ?? ''}`}
                        className={`rounded-xl px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border ${
                          isMe ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/10 bg-white/[0.04]'
                        }`}
                      >
                        <div className="min-w-0 flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="text-sm font-semibold text-white truncate">
                              {r.displayName?.trim() ? (
                                r.displayName.trim()
                              ) : (
                                <span className="text-white/45 font-normal">No username set</span>
                              )}
                            </span>
                            {isMe && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-400/40 text-cyan-200/90 shrink-0">
                                You
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className="font-mono text-xs text-cyan-200/85 break-all min-w-0" title={r.playerAddress}>
                              {r.playerAddress.slice(0, 6)}…{r.playerAddress.slice(-4)}
                            </span>
                            <CopyButton
                              content={r.playerAddress}
                              copyToast="Address copied"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-white/55 hover:text-cyan-300"
                              title="Copy address"
                              aria-label="Copy address"
                            />
                            {profilePath ? (
                              <Link
                                href={profilePath}
                                className="shrink-0 rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200/95 hover:bg-cyan-500/20 hover:border-cyan-400/45 transition-colors"
                              >
                                Profile
                              </Link>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-xs">
                          <span
                            className={`px-2 py-0.5 rounded-full border ${
                              r.status === 'playing'
                                ? 'border-green-500/35 text-green-300/95 bg-green-500/10'
                                : r.status === 'completed'
                                  ? 'border-blue-500/35 text-blue-200/90 bg-blue-500/10'
                                  : 'border-white/20 text-white/55 bg-white/5'
                            }`}
                          >
                            {statusLabel(r.status)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-white/45 font-semibold">{label}</div>
      <div className="text-sm font-semibold text-white tabular-nums truncate" title={value}>
        {value}
      </div>
    </div>
  );
}

function summaryEntry(t: PokerTournamentSummary): string {
  try {
    if (BigInt(t.buyInAmount ?? '0') === 0n) return 'Freeroll';
  } catch {
    /* fall through */
  }
  if (t.prizeTokenAddress && t.prizeTokenSymbol) {
    return `${t.buyInAmount} ${t.prizeTokenSymbol}`;
  }
  try {
    return `${formatChips(BigInt(t.buyInAmount).toString())} chips`;
  } catch {
    return `${t.buyInAmount} chips`;
  }
}
