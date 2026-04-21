'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  usePokerTournament,
  type PokerTournamentSummary,
  type CreatePokerTournamentParams,
} from '@/hooks/use-poker-tournament';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { Trophy, Users, CalendarClock, Lock, Sparkles } from 'lucide-react';
import { PokerTournamentCreator } from './PokerTournamentCreator';
import { PokerTournamentRegistrantsModal } from './PokerTournamentRegistrantsModal';
import { ConfirmActionCard } from '@/components/shared/ConfirmActionCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tournamentFinishOrdinal(rank: number): string {
  const j = rank % 10;
  const k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}

function isZeroBuyInWei(wei: string): boolean {
  try {
    return BigInt(wei || '0') === 0n;
  } catch {
    return true;
  }
}

function formatMorbius(wei: string | bigint): string {
  try {
    return formatMorbiusFloor(wei, { compact: false });
  } catch {
    return '0';
  }
}

/** Registers bot wallets for a tournament (game server spawns `poker-bot` workers). */
async function requestTournamentBotBootstrap(
  tournamentId: string,
  numBots: number,
  walletAddress: string,
  pinCode?: string,
): Promise<{ numBots: number }> {
  const res = await fetch('/api/admin/poker/tournament-bots/bootstrap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-wallet': walletAddress,
    },
    body: JSON.stringify({
      tournamentId,
      numBots,
      ...(pinCode && pinCode.length > 0 ? { pinCode } : {}),
    }),
  });
  const raw = await res.text().catch(() => '');
  let data: { error?: string; numBots?: number } = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      /* ignore */
    }
  }
  if (!res.ok) {
    throw new Error(data.error || raw || `HTTP ${res.status}`);
  }
  return { numBots: typeof data.numBots === 'number' ? data.numBots : numBots };
}

function useCountdown(targetIso: string | null): string | null {
  const [display, setDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (!targetIso) { setDisplay(null); return; }
    const update = () => {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) { setDisplay('Starting now'); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      if (h > 0) setDisplay(`${h}h ${m}m`);
      else if (m > 0) setDisplay(`${m}m ${s}s`);
      else setDisplay(`${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  return display;
}

const CARD_SURFACE: React.CSSProperties = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 4px 14px rgba(0, 0, 0, 0.45)',
  border: '1px solid rgba(60, 60, 60, 0.55)',
};

function InfoTag({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: 'orange' | 'teal' | 'sky' | 'emerald' | 'slate' | 'violet';
}) {
  const cls = {
    orange: 'bg-orange-500/18 text-orange-200/95 border-orange-400/35',
    teal: 'bg-teal-500/18 text-teal-200/95 border-teal-400/35',
    sky: 'bg-sky-500/18 text-sky-200/95 border-sky-400/35',
    emerald: 'bg-emerald-500/18 text-emerald-200/95 border-emerald-400/35',
    slate: 'bg-white/8 text-white/75 border-white/15',
    violet: 'bg-violet-500/18 text-violet-200/95 border-violet-400/35',
  }[variant];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TournamentCard
// ---------------------------------------------------------------------------

function TournamentCard({
  t,
  myAddress,
  onJoin,
  onCancel,
  onAddTournamentBots,
  onViewRegistrants,
  tournamentBotsBusy,
  isJoining,
  isCancelling,
}: {
  t: PokerTournamentSummary;
  myAddress?: string;
  onJoin: (tournamentId: string, pinCode?: string) => void;
  onCancel: (tournamentId: string) => void;
  onAddTournamentBots?: (tournamentId: string, numBots: number, pinCode?: string) => void;
  onViewRegistrants?: (tournamentId: string, name: string) => void;
  tournamentBotsBusy?: boolean;
  isJoining?: boolean;
  isCancelling?: boolean;
}) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingPin, setPendingPin] = useState<string | undefined>(undefined);
  const [botCount, setBotCount] = useState(2);
  const [botPin, setBotPin] = useState('');
  const isPrivate = t.isPrivate === true;

  const spots = t.maxPlayers - t.registeredCount;
  const isFull = spots <= 0;
  const isActive = t.status === 'active';
  const isScheduled = !!t.scheduledStartAt && new Date(t.scheduledStartAt) > new Date();
  const countdown = useCountdown(isScheduled ? t.scheduledStartAt : null);
  const neededToStart = Math.max(0, t.minPlayers - t.registeredCount);

  let lobbyStatusLine: string;
  if (isActive) {
    lobbyStatusLine = 'Table running';
  } else if (isFull) {
    lobbyStatusLine = 'Tournament full';
  } else if (neededToStart > 0) {
    lobbyStatusLine = `${neededToStart} more needed to start`;
  } else {
    lobbyStatusLine = `${spots} seat${spots === 1 ? '' : 's'} open`;
  }

  return (
    <div
      className="group relative overflow-hidden rounded-2xl p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5"
      style={CARD_SURFACE}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(ellipse_at_50%_0%,rgba(34,211,238,0.08),transparent_55%)]" />

      {/* Title + status */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug truncate">
            {t.name}
          </h4>
          <p className="mt-1 text-[11px] text-white/45">
            Host{' '}
            <span className="text-white/60 font-mono">
              {t.creatorAddress ? `${t.creatorAddress.slice(0, 6)}…${t.creatorAddress.slice(-4)}` : '—'}
            </span>
          </p>
        </div>
        <span
          className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
            isActive
              ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
              : 'border-cyan-500/35 bg-cyan-500/10 text-cyan-200/90'
          }`}
        >
          {isActive ? 'Live' : 'Open'}
        </span>
      </div>

      {/* Prize / buy-in / CTA — HiPoker-style band */}
      <div className="relative mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex flex-1 flex-wrap items-end gap-4 sm:gap-6 min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-400/25">
              <Trophy className="h-4 w-4 text-amber-300" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Prize pool</div>
              <div className="text-lg font-bold tabular-nums text-amber-200 leading-none mt-0.5">
                {formatMorbius(t.prizePool)}
              </div>
              <div className="text-[9px] text-amber-200/50 font-medium mt-0.5">MORBIUS</div>
            </div>
          </div>

          <div className="flex min-w-[5.5rem] flex-col items-start sm:items-center sm:mx-auto">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Buy-in</div>
            <div className="text-lg font-bold text-white tabular-nums leading-none mt-0.5">
              {isZeroBuyInWei(t.buyInAmount) ? 'Free' : formatMorbius(t.buyInAmount)}
            </div>
            <div className="text-[9px] text-white/35 mt-0.5">MORBIUS</div>
          </div>
        </div>

        {!t.isRegistered && !isActive && !isFull && (
          <div className="relative w-full sm:w-auto sm:min-w-[8.5rem] shrink-0">
            {showPin ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  placeholder="Tournament PIN"
                  className="w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500/35"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowPin(false); setPin(''); }}
                    className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPendingPin(pin); setShowPin(false); setShowConfirm(true); }}
                    disabled={isJoining}
                    className="min-w-0 flex-1 rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 py-2.5 text-sm font-bold text-emerald-950 shadow-[0_4px_14px_rgba(16,185,129,0.35)] hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-55 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => isPrivate ? setShowPin(true) : setShowConfirm(true)}
                disabled={isJoining}
                className="w-full rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-emerald-950 shadow-[0_4px_14px_rgba(16,185,129,0.35)] hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-55 disabled:cursor-not-allowed transition-all sm:py-3"
              >
                {isJoining ? 'Joining…' : 'Register'}
              </button>
            )}
          </div>
        )}

        {showConfirm && (() => {
          const isFreeroll = isZeroBuyInWei(t.buyInAmount);
          const prizeDisplay = `${formatMorbius(t.prizePool)} MORBIUS`;
          const buyInDisplay = isFreeroll ? 'Free' : `${formatMorbius(t.buyInAmount)} MORBIUS`;
          const prizeDistLabel = t.prizeDistributionType?.replace(/_/g, ' ') ?? '—';
          return (
            <ConfirmActionCard
              title="Register for Tournament"
              subtitle={t.name}
              rows={[
                { label: 'Buy-in', value: buyInDisplay, accent: 'yellow' },
                { label: 'Prize Pool', value: prizeDisplay, accent: 'yellow' },
                { label: 'Prize Distribution', value: prizeDistLabel, accent: 'cyan' },
                { label: 'Starting Stack', value: t.startingStack.toLocaleString(), accent: 'green' },
                { label: 'Players', value: `${t.registeredCount} / ${t.maxPlayers}`, accent: 'white' },
                { label: 'Private', value: isPrivate ? 'Yes' : 'No', accent: 'white' },
                ...(isScheduled && t.scheduledStartAt ? [{
                  label: 'Starts',
                  value: new Date(t.scheduledStartAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
                  accent: 'white' as const,
                }] : []),
              ]}
              onBack={() => { setShowConfirm(false); setPendingPin(undefined); }}
              onConfirm={() => { setShowConfirm(false); onJoin(t.tournamentId, pendingPin); setPendingPin(undefined); }}
              confirmLabel="Register"
              isLoading={isJoining}
            />
          );
        })()}
      </div>

      {/* Players row + tags */}
      <div className="relative mt-4 flex flex-col gap-2.5 border-t border-white/[0.07] pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => t.registeredCount > 0 && onViewRegistrants?.(t.tournamentId, t.name)}
            disabled={t.registeredCount === 0 || !onViewRegistrants}
            className={`inline-flex items-center gap-2 rounded-lg px-0 py-0 text-left transition-colors ${
              t.registeredCount > 0 && onViewRegistrants
                ? 'text-white/90 hover:text-cyan-200 cursor-pointer'
                : 'text-white/70 cursor-default'
            }`}
          >
            <Users className="h-4 w-4 text-cyan-400/80 shrink-0" aria-hidden />
            <span className="text-sm font-semibold tabular-nums">
              {t.registeredCount} <span className="text-white/35 font-normal">/</span> {t.maxPlayers}
            </span>
            <span className="text-[11px] text-white/40 hidden sm:inline">players</span>
          </button>
          <span className="text-[11px] text-white/50 font-medium">{lobbyStatusLine}</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <InfoTag variant="orange">NLHE</InfoTag>
          <InfoTag variant="teal">{t.maxPlayers}-max</InfoTag>
          <InfoTag variant="sky">Stack {t.startingStack.toLocaleString()}</InfoTag>
          {isPrivate && (
            <InfoTag variant="violet">
              <span className="inline-flex items-center gap-0.5">
                <Lock className="h-2.5 w-2.5" aria-hidden />
                Private
              </span>
            </InfoTag>
          )}
          {isZeroBuyInWei(t.buyInAmount) && (
            <InfoTag variant="emerald">
              <span className="inline-flex items-center gap-0.5">
                <Sparkles className="h-2.5 w-2.5" aria-hidden />
                Freeroll
              </span>
            </InfoTag>
          )}
          {t.scheduledStartAt && (
            <InfoTag variant="slate">
              <span className="inline-flex items-center gap-0.5 normal-case font-semibold">
                <CalendarClock className="h-2.5 w-2.5" aria-hidden />
                {isScheduled
                  ? new Date(t.scheduledStartAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : 'Started'}
              </span>
            </InfoTag>
          )}
        </div>

        {t.registeredCount > 0 && onViewRegistrants && (
          <button
            type="button"
            onClick={() => onViewRegistrants(t.tournamentId, t.name)}
            className="text-left text-[11px] font-semibold text-cyan-400/85 hover:text-cyan-300 transition-colors"
          >
            View registered players →
          </button>
        )}

        {isScheduled && countdown && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-white/40 uppercase tracking-wide font-semibold">Starts in</span>
            <span className="font-bold tabular-nums text-cyan-300">{countdown}</span>
          </div>
        )}
      </div>

      {/* Already registered */}
      {t.isRegistered && !isActive && (
        <div className="relative mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/[0.12] px-3 py-2.5">
          <span className="text-emerald-200 text-xs font-bold uppercase tracking-wide">Registered</span>
          {isScheduled && countdown && (
            <span className="text-white/45 text-xs">Starts in {countdown}</span>
          )}
          {t.status === 'registration' && t.creatorAddress?.toLowerCase() === myAddress?.toLowerCase() && (
            <button
              type="button"
              onClick={() => onCancel(t.tournamentId)}
              disabled={isCancelling}
              className="ml-auto text-[11px] font-semibold text-red-300/90 hover:text-red-200 disabled:opacity-40 border border-red-500/25 hover:border-red-400/45 rounded-lg px-2 py-1 transition-colors"
            >
              {isCancelling ? 'Cancelling…' : 'Cancel tourney'}
            </button>
          )}
        </div>
      )}

      {isActive && !t.isRegistered && (
        <div className="relative mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center text-xs text-white/45">
          Tournament in progress — registration closed
        </div>
      )}

      {isActive && t.isRegistered && (
        <div className="relative mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-center text-xs font-semibold text-emerald-200/90">
          You are seated in this tournament
        </div>
      )}

      {myAddress && t.status === 'registration' && !isActive && onAddTournamentBots && (
        <div
          className="mt-3 rounded-lg border border-cyan-500/25 p-3 space-y-2"
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.5), rgba(40, 40, 40, 0.35))',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div className="text-[11px] font-semibold text-cyan-200/90">Add bot players</div>
          <p className="text-[10px] text-white/45 leading-snug">
            Fills open seats with the same automated poker bots used elsewhere on the site. They register from the
            game server; during the tournament the server plays their turns (fold, call, raise) like normal opponents.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-[10px] text-white/50 flex items-center gap-1">
              Count
              <input
                type="number"
                min={1}
                max={10}
                value={botCount}
                onChange={(e) => setBotCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="w-14 rounded bg-white/10 border border-white/15 px-2 py-1 text-xs text-white"
              />
            </label>
            {isPrivate && (
              <input
                type="text"
                value={botPin}
                onChange={(e) => setBotPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="PIN"
                className="flex-1 min-w-[4rem] rounded-lg bg-white/10 border border-white/15 px-2 py-1 text-xs text-white placeholder:text-white/30"
              />
            )}
            <button
              type="button"
              disabled={tournamentBotsBusy || (isPrivate && botPin.length < 4)}
              onClick={() => onAddTournamentBots(t.tournamentId, botCount, isPrivate ? botPin : undefined)}
              className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-95 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 transition-opacity"
            >
              {tournamentBotsBusy ? 'Starting…' : 'Add bots'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Main Lobby
// ---------------------------------------------------------------------------

interface PokerTournamentLobbyProps {
  wsClient: BlackjackWebSocketClient | null;
  myAddress?: string;
  /** Called when a tournament's poker table is ready and player should navigate to it. */
  onGoToTable?: (tableId: string, tournamentId: string) => void;
}

export function PokerTournamentLobby({ wsClient, myAddress, onGoToTable }: PokerTournamentLobbyProps) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [registrantsModal, setRegistrantsModal] = useState<{ tournamentId: string; name: string } | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [tournamentBotsBusyId, setTournamentBotsBusyId] = useState<string | null>(null);
  const meLower = myAddress?.toLowerCase() ?? null;
  const refreshTournamentsRef = useRef<(() => Promise<void>) | null>(null);

  const tournamentHook = usePokerTournament({
    wsClient,
    onTournamentStarted: (tournamentId, tableId) => {
      onGoToTable?.(tableId, tournamentId);
    },
    onTournamentCompleted: (winners) => {
      const myWin = meLower ? winners.find((w) => w.address.toLowerCase() === meLower) : undefined;
      if (myWin) {
        const prizeWei = BigInt(myWin.prizeAmount || '0');
        if (prizeWei > 0n) {
          toast.success(
            `You finished ${tournamentFinishOrdinal(myWin.rank)} — ${formatMorbiusFloor(myWin.prizeAmount)} MORBIUS added to your balance.`,
          );
        } else {
          toast.info(`Tournament complete. You finished ${tournamentFinishOrdinal(myWin.rank)}.`);
        }
      } else if (meLower) {
        toast.info('Tournament complete. You did not cash this time — thanks for playing.');
      }
      void wsClient?.syncBalance().catch(() => {});
      if (meLower && meLower.length === 42) {
        queryClient.invalidateQueries({ queryKey: ['player-server-balance', meLower] });
      }
      void refreshTournamentsRef.current?.();
    },
  });

  refreshTournamentsRef.current = tournamentHook.refreshTournaments;

  const {
    openTournaments,
    isLoadingTournaments,
    refreshTournaments,
    createTournament,
    joinTournament,
    cancelTournament,
    myTableId,
    myTournamentId,
  } = tournamentHook;

  /** Start time has passed but we have not synced tableId yet (server scheduler / WS lag). */
  const waitingForTableAfterStart = useMemo(() => {
    if (!meLower) return false;
    return openTournaments.some((t) => {
      if (!t.isRegistered || !t.scheduledStartAt) return false;
      if (t.status === 'cancelled') return false;
      if (new Date(t.scheduledStartAt).getTime() > Date.now()) return false;
      if (t.status === 'active' && t.tableId && myTableId === t.tableId && myTournamentId === t.tournamentId) {
        return false;
      }
      return t.status === 'registration' || (t.status === 'active' && (!t.tableId || myTableId !== t.tableId || myTournamentId !== t.tournamentId));
    });
  }, [openTournaments, meLower, myTableId, myTournamentId]);

  const handleJoin = async (tournamentId: string, pinCode?: string) => {
    if (joiningId) return;
    setJoiningId(tournamentId);
    setJoinError(null);
    setJoinSuccess(null);
    try {
      const result = await joinTournament(tournamentId, pinCode);
      if (result?.autoStarted && result.tableId) {
        onGoToTable?.(result.tableId, tournamentId);
      } else if (result && !result.autoStarted) {
        setJoinSuccess("You're registered! Your seat will be assigned automatically when the tournament starts.");
        await refreshTournaments();
      }
    } catch (err) {
      setJoinError((err as Error).message ?? 'Failed to join');
    } finally {
      setJoiningId(null);
    }
  };

  const handleAddTournamentBots = async (tournamentId: string, numBots: number, pinCode?: string) => {
    if (!myAddress) {
      toast.error('Connect your wallet');
      return;
    }
    setTournamentBotsBusyId(tournamentId);
    setJoinError(null);
    try {
      const { numBots: started } = await requestTournamentBotBootstrap(tournamentId, numBots, myAddress, pinCode);
      toast.success(`Started ${started} poker bot(s) joining this tournament`);
      await refreshTournaments();
    } catch (err) {
      const msg = (err as Error).message ?? 'Failed to start tournament bots';
      setJoinError(msg);
      toast.error(msg);
    } finally {
      setTournamentBotsBusyId(null);
    }
  };

  const handleCreate = async (params: CreatePokerTournamentParams, opts: { addBots: number }) => {
    setJoinError(null);
    try {
      const result = await createTournament(params);
      if (!result?.tournamentId) {
        setJoinError('Failed to create tournament');
        return;
      }
      if (params.isPrivate && result.pinCode) {
        toast.message(`Private tournament PIN: ${result.pinCode}`, { duration: 14_000 });
      }
      if (opts.addBots > 0 && myAddress) {
        try {
          const pinForBots = params.isPrivate ? (result.pinCode ?? undefined) : undefined;
          const { numBots: started } = await requestTournamentBotBootstrap(
            result.tournamentId,
            opts.addBots,
            myAddress,
            pinForBots,
          );
          toast.success(`Tournament created — ${started} poker bot(s) are joining`);
        } catch (botErr) {
          const bmsg = (botErr as Error).message ?? 'Bots failed to start';
          setJoinError(bmsg);
          toast.error(`${bmsg} You can still use “Add bots” on the tournament card.`);
        }
      } else {
        toast.success('Tournament created');
      }
    } catch (err) {
      setJoinError((err as Error).message ?? 'Failed to create');
    }
  };

  const handleCancel = async (tournamentId: string) => {
    if (cancellingId) return;
    setCancellingId(tournamentId);
    setJoinError(null);
    try {
      await cancelTournament(tournamentId);
      await refreshTournaments();
    } catch (err) {
      setJoinError((err as Error).message ?? 'Failed to cancel');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Poker Tournaments</h2>
        <div className="flex gap-2">
          <button
            onClick={refreshTournaments}
            className="text-xs text-white/40 hover:text-white/70 transition-colors px-2 py-1 rounded-lg border border-white/10 hover:border-white/20"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            + Create SNG
          </button>
        </div>
      </div>

      {/* Error */}
      {joinError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2">
          {joinError}
        </div>
      )}

      {/* Registration success */}
      {joinSuccess && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-2 flex items-start justify-between gap-2">
          <span>{joinSuccess}</span>
          <button onClick={() => setJoinSuccess(null)} className="text-green-400/60 hover:text-green-400 shrink-0 text-base leading-none">×</button>
        </div>
      )}

      {/* Table opening right after scheduled start (before list/WS has tableId) */}
      {waitingForTableAfterStart && !myTableId && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-yellow-200/95 text-sm font-medium">
            Tournament start time reached — opening your table…
          </span>
          <span className="shrink-0 h-2 w-2 rounded-full bg-yellow-400 animate-pulse" aria-hidden />
        </div>
      )}

      {/* Go to active tournament */}
      {myTournamentId && myTableId && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-4 py-3 flex items-center justify-between">
          <span className="text-yellow-300 text-sm font-medium">You are in an active tournament</span>
          <button
            onClick={() => onGoToTable?.(myTableId, myTournamentId)}
            className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Go to Table →
          </button>
        </div>
      )}

      {/* Tournament list */}
      {isLoadingTournaments ? (
        <div className="text-center text-white/30 text-sm py-8">Loading tournaments…</div>
      ) : openTournaments.length === 0 ? (
        <div className="text-center text-white/30 text-sm py-8">
          No open poker tournaments.<br />
          <span className="text-xs">Create one to get started!</span>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {openTournaments.map((t) => (
            <TournamentCard
              key={t.tournamentId}
              t={t}
              myAddress={myAddress}
              onJoin={handleJoin}
              onCancel={handleCancel}
              onAddTournamentBots={handleAddTournamentBots}
              onViewRegistrants={(tournamentId, name) => setRegistrantsModal({ tournamentId, name })}
              tournamentBotsBusy={tournamentBotsBusyId === t.tournamentId}
              isJoining={joiningId === t.tournamentId}
              isCancelling={cancellingId === t.tournamentId}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <PokerTournamentCreator
          creatorAddress={myAddress}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}

      <PokerTournamentRegistrantsModal
        open={registrantsModal != null}
        onClose={() => setRegistrantsModal(null)}
        wsClient={wsClient}
        tournamentId={registrantsModal?.tournamentId ?? null}
        tournamentName={registrantsModal?.name ?? null}
        myAddress={myAddress}
      />
    </div>
  );
}
