'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  usePokerTournament,
  type PokerTournamentSummary,
  type PokerBlindIncreaseMode,
  type CreatePokerTournamentParams,
} from '@/hooks/use-poker-tournament';
import { formatChips } from '@/lib/format-poker-chips';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { isAdminWallet } from '@/lib/admin';
import { PokerTournamentCreator } from './PokerTournamentCreator';
import { PokerTournamentRegistrantsModal } from './PokerTournamentRegistrantsModal';
import { ConfirmActionCard } from '@/components/shared/ConfirmActionCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

function formatDurationMs(diffMs: number): string {
  const s = Math.floor(diffMs / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function useCountdown(targetIso: string | null): string | null {
  const [display, setDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (!targetIso) {
      setDisplay(null);
      return;
    }
    const update = () => {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) {
        setDisplay('Starting now');
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const sec = Math.floor((diff % 60_000) / 1_000);
      if (h > 0) setDisplay(`${h}h ${m}m`);
      else if (m > 0) setDisplay(`${m}m ${sec}s`);
      else setDisplay(`${sec}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  return display;
}

function useElapsedSince(startIso: string): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const start = new Date(startIso).getTime();
    const tick = () => {
      const diff = Math.max(0, Date.now() - start);
      setLabel(formatDurationMs(diff));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startIso]);
  return label;
}

/** Column 2: only green + mono; same 1s tick behavior as legacy lobby timers. */
function TournamentTimeColumn({ scheduledStartAt }: { scheduledStartAt: string | null }) {
  if (!scheduledStartAt) {
    return <span className="text-sm font-mono tabular-nums text-emerald-500/50">—</span>;
  }
  const target = new Date(scheduledStartAt).getTime();
  const isFuture = target > Date.now();
  if (isFuture) {
    return <CountdownToStartCell scheduledStartAt={scheduledStartAt} />;
  }
  return <StartedElapsedCell scheduledStartAt={scheduledStartAt} />;
}

function CountdownToStartCell({ scheduledStartAt }: { scheduledStartAt: string }) {
  const countdown = useCountdown(scheduledStartAt);
  return (
    <span className="block text-sm font-mono tabular-nums text-emerald-400 leading-snug">
      {!countdown ? (
        '…'
      ) : countdown === 'Starting now' ? (
        'Starting now'
      ) : (
        <>
          Time until start
          <br />
          {countdown}
        </>
      )}
    </span>
  );
}

function StartedElapsedCell({ scheduledStartAt }: { scheduledStartAt: string }) {
  const elapsed = useElapsedSince(scheduledStartAt);
  return (
    <span className="block text-sm font-mono tabular-nums text-emerald-400 leading-snug">
      Time started
      <br />
      {elapsed ? `${elapsed} ago` : '…'}
    </span>
  );
}

function blindModeLabel(mode: PokerBlindIncreaseMode | undefined): string {
  return mode === 'by_hand' ? 'Scheduled' : 'Elimination';
}

function TournamentStatusBadge({ status, isFull }: { status: string; isFull: boolean }) {
  const s = status.toLowerCase();
  if (s === 'active') {
    return (
      <span className="inline-flex rounded-md border border-emerald-500/45 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-100">
        Live
      </span>
    );
  }
  if (s === 'completed' || s === 'cancelled') {
    return (
      <span className="inline-flex rounded-md border border-slate-600 bg-slate-900/80 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-slate-400">
        Done
      </span>
    );
  }
  if (isFull) {
    return (
      <span className="inline-flex rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-amber-100">
        Full
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md border border-slate-600 bg-slate-900/70 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white">
      Open
    </span>
  );
}

const TABLE_SHELL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
};

type JoinFlowState =
  | null
  | { phase: 'pin'; t: PokerTournamentSummary; pin: string }
  | { phase: 'confirm'; t: PokerTournamentSummary; pin?: string };

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
  const [joinFlow, setJoinFlow] = useState<JoinFlowState>(null);
  const [botsRowId, setBotsRowId] = useState<string | null>(null);
  const [botCount, setBotCount] = useState(2);
  const [botPin, setBotPin] = useState('');
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
      return (
        t.status === 'registration' ||
        (t.status === 'active' && (!t.tableId || myTableId !== t.tableId || myTournamentId !== t.tournamentId))
      );
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

  const handleCreate = async (
    params: CreatePokerTournamentParams,
    opts: { addBots: number },
  ): Promise<{ tournamentId: string; pinCode?: string | null } | null> => {
    setJoinError(null);
    try {
      const result = await createTournament(params);
      if (!result?.tournamentId) {
        const msg = 'Failed to create tournament';
        setJoinError(msg);
        toast.error(msg);
        return null;
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
          toast.success(`Started ${started} poker bot(s) for this tournament`);
        } catch (botErr) {
          const bmsg = (botErr as Error).message ?? 'Bots failed to start';
          setJoinError(bmsg);
          toast.error(`${bmsg} You can retry from Staff tools if needed.`);
        }
      }
      await refreshTournaments();
      return result;
    } catch (err) {
      const msg = (err as Error).message ?? 'Failed to create';
      setJoinError(msg);
      toast.error(msg);
      return null;
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

  const beginJoin = (t: PokerTournamentSummary) => {
    if (joiningId != null) return;
    setJoinError(null);
    if (t.isPrivate === true) {
      setJoinFlow({ phase: 'pin', t, pin: '' });
    } else {
      setJoinFlow({ phase: 'confirm', t });
    }
  };

  const toggleBotsRow = (tournamentId: string) => {
    setBotsRowId((cur) => {
      const next = cur === tournamentId ? null : tournamentId;
      if (next !== cur) setBotPin('');
      return next;
    });
  };

  const renderJoinConfirm = (t: PokerTournamentSummary, pin?: string) => {
    const isPrivate = t.isPrivate === true;
    const isFreeroll = isZeroBuyInWei(t.buyInAmount);
    const prizeDisplay = `${formatMorbius(t.prizePool)} MORBIUS`;
    const buyInDisplay = isFreeroll ? 'Free' : `${formatMorbius(t.buyInAmount)} MORBIUS`;
    const prizeDistLabel = t.prizeDistributionType?.replace(/_/g, ' ') ?? '—';
    const isScheduled = !!t.scheduledStartAt && new Date(t.scheduledStartAt) > new Date();
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
          ...(isScheduled && t.scheduledStartAt
            ? [
                {
                  label: 'Starts',
                  value: new Date(t.scheduledStartAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }),
                  accent: 'white' as const,
                },
              ]
            : []),
        ]}
        onBack={() => setJoinFlow(null)}
        onConfirm={() => {
          void handleJoin(t.tournamentId, pin);
          setJoinFlow(null);
        }}
        confirmLabel="Join"
        isLoading={joiningId === t.tournamentId}
      />
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-white">Poker Tournaments</h2>
        <div className="flex gap-1.5 shrink-0">
          <button
            type="button"
            onClick={refreshTournaments}
            className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded-md border border-slate-600/50 hover:border-slate-500/60 transition-colors"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-medium px-2.5 py-1 rounded-md transition-colors"
          >
            + Create SNG
          </button>
        </div>
      </div>

      {joinError && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-1.5">
          {joinError}
        </div>
      )}

      {joinSuccess && (
        <div className="rounded-md bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-3 py-1.5 flex items-start justify-between gap-2">
          <span>{joinSuccess}</span>
          <button
            type="button"
            onClick={() => setJoinSuccess(null)}
            className="text-green-400/60 hover:text-green-400 shrink-0 text-sm leading-none"
          >
            ×
          </button>
        </div>
      )}

      {waitingForTableAfterStart && !myTableId && (
        <div className="rounded-md bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 flex items-center justify-between gap-2 text-sm text-yellow-200/95">
          <span>Tournament start time reached — opening your table…</span>
          <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" aria-hidden />
        </div>
      )}

      {myTournamentId && myTableId && (
        <div className="rounded-md bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 flex items-center justify-between gap-2 text-sm">
          <span className="text-yellow-200">You are in an active tournament</span>
          <button
            type="button"
            onClick={() => onGoToTable?.(myTableId, myTournamentId)}
            className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-medium px-2 py-1 rounded-md transition-colors shrink-0"
          >
            Go to table
          </button>
        </div>
      )}

      {isLoadingTournaments ? (
        <div className="text-center text-slate-500 text-sm py-6">Loading tournaments…</div>
      ) : openTournaments.length === 0 ? (
        <div className="text-center text-slate-500 text-sm py-6">
          No open poker tournaments. <span className="text-slate-600">Create one to get started.</span>
        </div>
      ) : (
        <div className="rounded-xl border border-cyan-500/20 overflow-x-auto" style={TABLE_SHELL_STYLE}>
          <Table className="table-fixed w-full min-w-[960px] border-collapse text-sm text-white [&_th]:px-1 [&_th]:py-2 [&_th]:text-[11px] [&_th]:font-medium [&_th]:text-center [&_th]:text-white/50 [&_th]:uppercase [&_th]:tracking-wide [&_td]:px-1 [&_td]:py-2 [&_td]:text-center [&_td]:align-middle">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[11%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[6%]" />
              <col className="w-[10%]" />
            </colgroup>
            <TableHeader>
              <TableRow className="border-slate-600/50 hover:bg-transparent">
                <TableHead className="!text-left pl-2">Tournament</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Buy-in</TableHead>
                <TableHead>Blinds</TableHead>
                <TableHead>Blind mode</TableHead>
                <TableHead>Prize</TableHead>
                <TableHead>Table size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Private</TableHead>
                <TableHead>View</TableHead>
                <TableHead className="!text-right pr-2">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openTournaments.map((t) => {
                const spots = t.maxPlayers - t.registeredCount;
                const isFull = spots <= 0;
                const isActive = t.status === 'active';
                const isPrivate = t.isPrivate === true;
                const canJoin = !t.isRegistered && !isActive && !isFull && !!myAddress;
                const watchHref =
                  t.tableId != null && t.tableId.length > 0
                    ? `/poker/${t.tableId}?tournament=${encodeURIComponent(t.tournamentId)}`
                    : null;
                const isCreator = t.creatorAddress?.toLowerCase() === meLower;
                const showBotsToggle =
                  !!myAddress && isAdminWallet(myAddress) && t.status === 'registration' && !isActive;

                const buyLabel = isZeroBuyInWei(t.buyInAmount) ? 'Free' : formatMorbius(t.buyInAmount);
                const sb = t.smallBlind ?? 25;
                const bb = t.bigBlind ?? 50;
                const mode = t.blindIncreaseMode ?? 'knockout';

                return (
                  <React.Fragment key={t.tournamentId}>
                    <TableRow className="border-slate-600/40 hover:bg-white/[0.04]">
                      <TableCell className="!text-left pl-2 max-w-0">
                        <span className="block truncate font-medium text-white" title={t.name}>
                          {t.name}
                        </span>
                      </TableCell>
                      <TableCell className="align-top pt-2">
                        <TournamentTimeColumn scheduledStartAt={t.scheduledStartAt} />
                      </TableCell>
                      <TableCell className="tabular-nums text-white">{buyLabel}</TableCell>
                      <TableCell className="tabular-nums text-white whitespace-nowrap">
                        {formatChips(sb)} / {formatChips(bb)}
                      </TableCell>
                      <TableCell className="text-white text-[13px]">{blindModeLabel(mode)}</TableCell>
                      <TableCell className="tabular-nums text-white">{formatMorbius(t.prizePool)}</TableCell>
                      <TableCell className="tabular-nums text-white">
                        {t.registeredCount}/{t.maxPlayers}
                      </TableCell>
                      <TableCell>
                        <TournamentStatusBadge status={t.status} isFull={isFull} />
                      </TableCell>
                      <TableCell className="text-white">{isPrivate ? 'Yes' : '—'}</TableCell>
                      <TableCell>
                        {t.registeredCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => setRegistrantsModal({ tournamentId: t.tournamentId, name: t.name })}
                            className="text-xs font-medium text-white/80 underline underline-offset-2 hover:text-white"
                          >
                            List
                          </button>
                        ) : (
                          <span className="text-white/35">—</span>
                        )}
                      </TableCell>
                      <TableCell className="!text-right pr-2 whitespace-nowrap">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1">
                          {watchHref ? (
                            <Link
                              href={watchHref}
                              className="inline-flex items-center justify-center rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-white/10 transition-colors"
                            >
                              Watch
                            </Link>
                          ) : (
                            <span className="inline-flex items-center justify-center rounded border border-white/10 px-1.5 py-0.5 text-[11px] font-medium text-white/25 cursor-not-allowed">
                              Watch
                            </span>
                          )}
                          {canJoin && (
                            <button
                              type="button"
                              onClick={() => beginJoin(t)}
                              disabled={joiningId != null}
                              className="inline-flex items-center justify-center rounded border border-cyan-400/50 bg-cyan-500/20 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-cyan-500/30 disabled:opacity-50 transition-colors"
                            >
                              Join
                            </button>
                          )}
                          {t.isRegistered && !isActive && (
                            <span
                              className="inline-flex items-center justify-center rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-white"
                              title="Registered for this tournament"
                            >
                              Joined
                            </span>
                          )}
                          {isActive && !t.isRegistered && (
                            <span className="text-[11px] text-white/35">—</span>
                          )}
                          {isActive && t.isRegistered && (
                            <button
                              type="button"
                              onClick={() => t.tableId && onGoToTable?.(t.tableId, t.tournamentId)}
                              disabled={!t.tableId}
                              className="inline-flex items-center justify-center rounded border border-cyan-400/50 bg-cyan-500/20 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-cyan-500/30 disabled:opacity-40 transition-colors"
                            >
                              Table
                            </button>
                          )}
                          {t.isRegistered && !isActive && isCreator && t.status === 'registration' && (
                            <button
                              type="button"
                              onClick={() => handleCancel(t.tournamentId)}
                              disabled={cancellingId === t.tournamentId}
                              className="text-[11px] font-medium text-white/50 hover:text-white/80 disabled:opacity-50"
                            >
                              {cancellingId === t.tournamentId ? '…' : 'Cancel'}
                            </button>
                          )}
                          {showBotsToggle && (
                            <button
                              type="button"
                              onClick={() => toggleBotsRow(t.tournamentId)}
                              className="text-[11px] font-medium text-white/50 hover:text-white"
                            >
                              {botsRowId === t.tournamentId ? 'Bots−' : 'Bots+'}
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {botsRowId === t.tournamentId && (
                      <TableRow className="border-slate-600/40 hover:bg-white/[0.02] bg-black/15">
                        <TableCell colSpan={11} className="py-2">
                          <div className="rounded-lg border border-white/10 px-2 py-2 space-y-1.5 max-w-xl text-sm text-white">
                            <div className="text-xs font-medium text-white/90">Add bot players</div>
                            <p className="text-xs text-white/45 leading-snug">
                              Bots register from the game server and play like normal opponents.
                            </p>
                            <div className="flex flex-wrap gap-2 items-center">
                              <label className="text-xs text-white/50 flex items-center gap-1">
                                Count
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={botCount}
                                  onChange={(e) => setBotCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                                  className="w-12 rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-xs text-white"
                                />
                              </label>
                              {isPrivate && (
                                <input
                                  type="text"
                                  value={botPin}
                                  onChange={(e) => setBotPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                                  placeholder="PIN"
                                  className="min-w-[3.5rem] max-w-[6rem] rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-xs text-white placeholder:text-white/30"
                                />
                              )}
                              <button
                                type="button"
                                disabled={
                                  tournamentBotsBusyId === t.tournamentId || (isPrivate && botPin.length < 4)
                                }
                                onClick={() => handleAddTournamentBots(t.tournamentId, botCount, isPrivate ? botPin : undefined)}
                                className="rounded-md border border-cyan-400/40 bg-cyan-500/20 px-2 py-1 text-xs font-medium text-white hover:bg-cyan-500/30 disabled:opacity-40 transition-colors"
                              >
                                {tournamentBotsBusyId === t.tournamentId ? '…' : 'Add bots'}
                              </button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

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

      {joinFlow?.phase === 'pin' && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setJoinFlow(null)} />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-cyan-500/30 overflow-hidden shadow-2xl p-5 space-y-4"
            style={TABLE_SHELL_STYLE}
          >
            <h3 className="text-lg font-bold text-white text-center">Tournament PIN</h3>
            <p className="text-xs text-white/50 text-center">{joinFlow.t.name}</p>
            <input
              type="text"
              value={joinFlow.pin}
              onChange={(e) =>
                setJoinFlow({ ...joinFlow, pin: e.target.value.replace(/\D/g, '').slice(0, 12) })
              }
              placeholder="Enter PIN"
              className="w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500/35"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setJoinFlow(null)}
                className="flex-1 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                disabled={joinFlow.pin.length < 4}
                onClick={() => setJoinFlow({ phase: 'confirm', t: joinFlow.t, pin: joinFlow.pin })}
                className="flex-1 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {joinFlow?.phase === 'confirm' && renderJoinConfirm(joinFlow.t, joinFlow.pin)}
    </div>
  );
}
