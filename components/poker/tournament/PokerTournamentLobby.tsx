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
  type ReclaimableCustomTokenTournament,
  type ClaimableCustomTokenTournament,
} from '@/hooks/use-poker-tournament';
import { formatChips } from '@/lib/format-poker-chips';
import { formatPrizePoolDisplay, formatPrizeTokenUnitLabel } from '@/lib/format-poker-tournament-prize-display';
import { formatUnits } from 'viem';
import { useWriteContract, usePublicClient } from 'wagmi';
import { TOURNAMENT_PRIZE_ESCROW_ADDRESS } from '@/lib/contracts';
import { tournamentPrizeEscrowV6Abi } from '@/abi/tournament-prize-escrow-v6';
import { tournamentIdToBytes32 } from '@/lib/tournament-id-bytes32';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { isAdminWallet } from '@/lib/admin';
import { PokerTournamentCreator } from './PokerTournamentCreator';
import { PokerTournamentRegistrantsModal } from './PokerTournamentRegistrantsModal';
import { PokerTournamentRulesModal } from './PokerTournamentRulesModal';
import { MyPokerTournamentsModal } from './MyPokerTournamentsModal';
import { PokerTournamentShareModal } from './PokerTournamentShareModal';
import { derivePokerShareSnapshotFromSummary } from '@/lib/poker-share-snapshot';
import { ConfirmActionCard } from '@/components/shared/ConfirmActionCard';
import { InsufficientBalanceDialog } from '@/components/shared/InsufficientBalanceDialog';
import { EscrowBuyInJoinPanel } from './EscrowBuyInJoinPanel';
import { Lock } from 'lucide-react';

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

/**
 * Render the prize pool with the right unit:
 *  - Chip / promo freerolls → "5,000 chips"
 *  - Custom-token freerolls → "1,234.56 HEX" (uses prize_token_decimals from server)
 *
 * Custom-token rows store `prizeTokenName` / `prizeTokenSymbol` from the picker; labels
 * never fall back to a shortened contract address.
 */
function formatPokerPrizePool(t: PokerTournamentSummary): string {
  return formatPrizePoolDisplay(t.prizePool, {
    prizeTokenAddress: t.prizeTokenAddress ?? null,
    prizeTokenDecimals: t.prizeTokenDecimals,
    prizeTokenSymbol: t.prizeTokenSymbol,
    prizeTokenName: t.prizeTokenName,
  });
}

function isZeroBuyInChips(amount: string): boolean {
  try {
    return BigInt(amount || '0') === 0n;
  } catch {
    return true;
  }
}

function isCustomTokenBuyIn(t: PokerTournamentSummary): boolean {
  return !isZeroBuyInChips(t.buyInAmount) && !!t.prizeTokenAddress;
}

function formatBuyInCell(t: PokerTournamentSummary): string {
  if (isZeroBuyInChips(t.buyInAmount)) return 'Freeroll';
  if (isCustomTokenBuyIn(t)) {
    const dec = t.prizeTokenDecimals != null ? t.prizeTokenDecimals : 18;
    let human: string;
    try {
      human = formatUnits(BigInt(t.buyInAmount), dec);
    } catch {
      human = t.buyInAmount;
    }
    const tick = formatPrizeTokenUnitLabel({
      prizeTokenAddress: t.prizeTokenAddress,
      prizeTokenSymbol: t.prizeTokenSymbol,
      prizeTokenName: t.prizeTokenName,
    });
    return `${human} ${tick}`;
  }
  return `${formatChips(t.buyInAmount)} chips`;
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
    return <span className="text-sm tabular-nums text-slate-500">—</span>;
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
  const line =
    !countdown ? '…' : countdown === 'Starting now' ? 'Starting now' : `Starts in ${countdown}`;
  return (
    <span className="text-sm tabular-nums text-emerald-400/90 whitespace-nowrap" title={line}>
      {line}
    </span>
  );
}

function StartedElapsedCell({ scheduledStartAt }: { scheduledStartAt: string }) {
  const elapsed = useElapsedSince(scheduledStartAt);
  const line = elapsed ? `Live · ${elapsed}` : '…';
  return (
    <span className="text-sm tabular-nums text-emerald-400/90 whitespace-nowrap" title={line}>
      {line}
    </span>
  );
}

function blindModeLabel(mode: PokerBlindIncreaseMode | undefined): string {
  if (mode === 'by_hand') return 'Scheduled';
  if (mode === 'by_time') return 'Timed';
  return 'Elimination';
}

function TournamentStatusBadge({ status, isFull }: { status: string; isFull: boolean }) {
  const s = status.toLowerCase();
  const badge =
    'inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold tracking-wide';
  if (s === 'active') {
    return (
      <span className={`${badge} border-emerald-400/55 bg-emerald-500/30 text-emerald-50`}>Live</span>
    );
  }
  if (s === 'completed' || s === 'cancelled') {
    return (
      <span className={`${badge} border-slate-600 bg-slate-900/80 text-slate-400`}>Done</span>
    );
  }
  if (isFull) {
    return (
      <span className={`${badge} border-amber-500/40 bg-amber-500/10 text-amber-100`}>Full</span>
    );
  }
  return (
    <span className={`${badge} border-slate-600 bg-slate-900/70 text-white`}>Open</span>
  );
}

const TABLE_SHELL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
};

const TH = 'py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-600/50';
const TD = 'py-2.5 px-3 align-middle border-b border-slate-600/35 text-sm text-slate-200';
const actionBtnPrimary =
  'inline-flex h-8 w-full min-w-[5.75rem] max-w-[7rem] items-center justify-center rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 text-xs font-semibold text-white shadow-sm hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40 transition-opacity';
const actionBtnSecondary =
  'inline-flex h-8 w-full min-w-[5.75rem] max-w-[7rem] items-center justify-center rounded-lg border border-slate-500/60 bg-black/30 text-xs font-semibold text-slate-200 hover:border-cyan-500/35 hover:bg-white/[0.04] transition-colors';
const actionBtnGhost =
  'inline-flex h-8 w-full min-w-[5.75rem] max-w-[7rem] items-center justify-center rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors disabled:opacity-40';

type JoinFlowState =
  | null
  | { phase: 'pin'; t: PokerTournamentSummary; pin: string }
  | { phase: 'confirm'; t: PokerTournamentSummary; pin?: string }
  | { phase: 'escrow_pay'; t: PokerTournamentSummary; pin?: string };

// ---------------------------------------------------------------------------
// Main Lobby
// ---------------------------------------------------------------------------

interface PokerTournamentLobbyProps {
  wsClient: BlackjackWebSocketClient | null;
  myAddress?: string;
  /** Called when a tournament's poker table is ready and player should navigate to it. */
  onGoToTable?: (tableId: string, tournamentId: string) => void;
  /** Controlled SNG create modal (e.g. hero “Create SNG”). */
  createModalOpen: boolean;
  onCreateModalOpenChange: (open: boolean) => void;
}

export function PokerTournamentLobby({
  wsClient,
  myAddress,
  onGoToTable,
  createModalOpen: showCreate,
  onCreateModalOpenChange: setShowCreate,
}: PokerTournamentLobbyProps) {
  const queryClient = useQueryClient();
  const [registrantsModal, setRegistrantsModal] = useState<{ tournamentId: string; name: string } | null>(null);
  const [rulesModal, setRulesModal] = useState<{ tournamentId: string; name: string } | null>(null);
  const [shareModalT, setShareModalT] = useState<PokerTournamentSummary | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [insufficientChipsInfo, setInsufficientChipsInfo] = useState<{ required?: string } | null>(null);
  const [showMyTournaments, setShowMyTournaments] = useState(false);
  const [forfeitConfirm, setForfeitConfirm] = useState<{ tournamentId: string; name: string } | null>(null);
  const [forfeitInFlight, setForfeitInFlight] = useState(false);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [tournamentBotsBusyId, setTournamentBotsBusyId] = useState<string | null>(null);
  const [joinFlow, setJoinFlow] = useState<JoinFlowState>(null);
  /** Same-chain deposit succeeded but WS registration failed — retry without sending another deposit. */
  const escrowJoinTxRetryRef = useRef<`0x${string}` | null>(null);
  const [leavingRegId, setLeavingRegId] = useState<string | null>(null);
  const [botsRowId, setBotsRowId] = useState<string | null>(null);
  const [botCount, setBotCount] = useState(2);
  const [botPin, setBotPin] = useState('');
  const meLower = myAddress?.toLowerCase() ?? null;
  const refreshTournamentsRef = useRef<(() => Promise<void>) | null>(null);

  const tournamentHook = usePokerTournament({
    wsClient,
    myAddress: meLower,
    onTournamentStarted: (tournamentId, tableId) => {
      onGoToTable?.(tableId, tournamentId);
    },
    onMyTableChanged: (newTableId, tournamentId) => {
      onGoToTable?.(newTableId, tournamentId);
    },
    onTournamentCompleted: (payload) => {
      const list = payload.standings;
      const myWin = meLower ? list.find((w) => w.address.toLowerCase() === meLower) : undefined;
      if (myWin) {
        const prizeBn = BigInt(myWin.prizeAmount || '0');
        if (prizeBn > 0n) {
          if (payload.prizeTokenAddress) {
            // Custom-token: amount is in token-wei; format with decimals + symbol.
            const dec = payload.prizeTokenDecimals ?? 18;
            const human = formatUnits(prizeBn, dec);
            const trimmed = human.includes('.') ? human.replace(/\.?0+$/, '') : human;
            const ticker = formatPrizeTokenUnitLabel({
              prizeTokenName: payload.prizeTokenName,
              prizeTokenSymbol: payload.prizeTokenSymbol,
              prizeTokenAddress: payload.prizeTokenAddress,
            });
            toast.success(
              `You finished ${tournamentFinishOrdinal(myWin.rank)} — ${trimmed} ${ticker} sent to your wallet.`,
            );
          } else {
            toast.success(
              `You finished ${tournamentFinishOrdinal(myWin.rank)} — ${formatChips(myWin.prizeAmount)} poker chips credited to your chip wallet.`,
            );
          }
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
    leaveTournamentRegistration,
    cancelTournament,
    forfeitTournament,
    fetchReclaimableTournaments,
    fetchClaimableTournaments,
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

  const handleJoin = async (
    tournamentId: string,
    pinCode?: string,
    joinEscrowTxHash?: `0x${string}`,
  ) => {
    if (joiningId) return;
    setJoiningId(tournamentId);
    setJoinError(null);
    setJoinSuccess(null);
    try {
      const result = await joinTournament(tournamentId, pinCode, joinEscrowTxHash);
      if (result?.autoStarted && result.tableId) {
        escrowJoinTxRetryRef.current = null;
        setJoinFlow(null);
        onGoToTable?.(result.tableId, tournamentId);
      } else if (result && !result.autoStarted) {
        escrowJoinTxRetryRef.current = null;
        setJoinFlow(null);
        setJoinSuccess("You're registered! Your seat will be assigned automatically when the tournament starts.");
        await refreshTournaments();
      }
    } catch (err) {
      const msg = (err as Error).message ?? 'Failed to join';
      const t = openTournaments.find((x) => x.tournamentId === tournamentId);
      const tokenBuyIn = t != null && isCustomTokenBuyIn(t);
      if (/insufficient|not enough|balance/i.test(msg) && !tokenBuyIn) {
        const required =
          t && !isZeroBuyInChips(t.buyInAmount) ? `${formatChips(t.buyInAmount)} chips` : undefined;
        setInsufficientChipsInfo({ required });
      } else {
        setJoinError(msg);
      }
    } finally {
      setJoiningId(null);
    }
  };

  const handleLeaveRegistration = async (tournamentId: string) => {
    if (leavingRegId) return;
    setLeavingRegId(tournamentId);
    setJoinError(null);
    try {
      const ok = await leaveTournamentRegistration(tournamentId);
      if (ok) {
        toast.success('You left the tournament. Any on-chain buy-in refund is handled by the server.');
        await refreshTournaments();
      } else {
        toast.error('Could not leave registration.');
      }
    } finally {
      setLeavingRegId(null);
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

  const beginForfeit = (tournamentId: string) => {
    if (forfeitInFlight) return;
    const t = openTournaments.find((x) => x.tournamentId === tournamentId);
    setForfeitConfirm({ tournamentId, name: t?.name ?? 'this tournament' });
  };

  const handleConfirmForfeit = async () => {
    if (!forfeitConfirm || forfeitInFlight) return;
    setForfeitInFlight(true);
    try {
      const ok = await forfeitTournament(forfeitConfirm.tournamentId);
      if (ok) {
        toast.success('You have been eliminated from the tournament.');
        await refreshTournaments();
      } else {
        toast.error('Failed to forfeit tournament');
      }
    } finally {
      setForfeitInFlight(false);
      setForfeitConfirm(null);
    }
  };

  const beginJoin = (t: PokerTournamentSummary) => {
    if (joiningId != null) return;
    setJoinError(null);
    escrowJoinTxRetryRef.current = null;
    if (t.isPrivate === true) {
      setJoinFlow({ phase: 'pin', t, pin: '' });
    } else if (isCustomTokenBuyIn(t)) {
      setJoinFlow({ phase: 'escrow_pay', t });
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
    const prizeDisplay = formatPokerPrizePool(t);
    const buyInDisplay = formatBuyInCell(t);
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
    <div className="flex w-full flex-col gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={refreshTournaments}
          className="h-8 px-3 rounded-lg border border-slate-600/55 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500/70 transition-colors"
        >
          Refresh
        </button>
      </div>

      {joinError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2">
          {joinError}
        </div>
      )}

      <ReclaimableEscrowBanner
        myAddress={myAddress}
        fetchReclaimable={fetchReclaimableTournaments}
      />

      <ClaimableEscrowBanner
        myAddress={myAddress}
        fetchClaimable={fetchClaimableTournaments}
      />

      {joinSuccess && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-3 py-2 flex items-start justify-between gap-2">
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
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 flex items-center justify-between gap-2 text-sm text-yellow-200/95">
          <span>Tournament start time reached — opening your table…</span>
          <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" aria-hidden />
        </div>
      )}

      {myTournamentId && myTableId && (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-yellow-200">You are in an active tournament</span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowMyTournaments(true)}
              className="h-8 px-3 rounded-lg border border-yellow-400/40 text-xs font-semibold text-yellow-100 hover:bg-yellow-500/20 transition-colors"
            >
              My Tournaments
            </button>
            <button
              type="button"
              onClick={() => beginForfeit(myTournamentId)}
              className="h-8 px-3 rounded-lg bg-red-600/85 hover:bg-red-500 text-xs font-semibold text-white transition-colors"
            >
              Forfeit
            </button>
            <button
              type="button"
              onClick={() => onGoToTable?.(myTableId, myTournamentId)}
              className="h-8 shrink-0 px-3 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-xs font-semibold text-black transition-colors"
            >
              Go to table
            </button>
          </div>
        </div>
      )}

      {!myTournamentId && openTournaments.some((t) => t.isRegistered) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowMyTournaments(true)}
            className="h-8 px-3 rounded-lg border border-cyan-500/35 text-xs font-semibold text-cyan-200/95 hover:bg-cyan-500/15 transition-colors"
          >
            My Tournaments
          </button>
        </div>
      )}

      {isLoadingTournaments ? (
        <div className="text-center text-slate-500 text-sm py-8">Loading tournaments…</div>
      ) : openTournaments.length === 0 ? (
        <div className="text-center text-slate-500 text-sm py-8">
          No open poker tournaments. <span className="text-slate-600">Create one to get started.</span>
        </div>
      ) : (
        <div
          className="rounded-xl border border-cyan-500/20 overflow-x-auto lg:overflow-x-visible"
          style={TABLE_SHELL_STYLE}
        >
          <table className="w-full border-collapse text-sm text-slate-200 min-w-0">
            <thead>
              <tr>
                <th className={`${TH} w-[22%] max-w-[14rem]`}>Tournament</th>
                <th className={`${TH} whitespace-nowrap`}>Schedule</th>
                <th className={TH}>Entry</th>
                <th className={`${TH} whitespace-nowrap`}>Blinds</th>
                <th className={`${TH} whitespace-nowrap`}>Seats</th>
                <th className={`${TH} whitespace-nowrap`}>Prize</th>
                <th className={TH}>State</th>
                <th className={`${TH} text-right w-[7.5rem]`}>Actions</th>
              </tr>
            </thead>
            <tbody>
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

                const sb = t.smallBlind ?? 25;
                const bb = t.bigBlind ?? 50;
                const mode = t.blindIncreaseMode ?? 'knockout';

                return (
                  <React.Fragment key={t.tournamentId}>
                    <tr className="hover:bg-white/[0.03]">
                      <td className={`${TD} max-w-0`}>
                        <div className="font-medium text-white truncate" title={t.name}>
                          {t.name}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <button
                            type="button"
                            onClick={() => setRulesModal({ tournamentId: t.tournamentId, name: t.name })}
                            className="text-xs font-semibold text-cyan-400/90 hover:text-cyan-300"
                          >
                            Rules
                          </button>
                          {t.registeredCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => setRegistrantsModal({ tournamentId: t.tournamentId, name: t.name })}
                              className="text-xs font-semibold text-slate-400 hover:text-slate-200"
                            >
                              Roster
                            </button>
                          ) : (
                            <span className="text-xs text-slate-600">Roster</span>
                          )}
                        </div>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <TournamentTimeColumn scheduledStartAt={t.scheduledStartAt} />
                      </td>
                      <td className={TD}>
                        <div className="font-medium tabular-nums text-slate-100">{formatBuyInCell(t)}</div>
                      </td>
                      <td className={`${TD} whitespace-nowrap tabular-nums text-slate-300`}>
                        {formatChips(sb)} / {formatChips(bb)} · {blindModeLabel(mode)}
                      </td>
                      <td className={`${TD} tabular-nums font-medium text-slate-100 whitespace-nowrap`}>
                        {t.registeredCount}/{t.maxPlayers}
                      </td>
                      <td className={`${TD} tabular-nums font-medium text-slate-100 whitespace-nowrap`}>
                        {formatPokerPrizePool(t)}
                      </td>
                      <td className={TD}>
                        <div className="flex flex-col items-start gap-1.5">
                          <TournamentStatusBadge status={t.status} isFull={isFull} />
                          {isPrivate && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400/90">
                              <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />
                              Private
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`${TD} text-right`}>
                        <div className="inline-flex flex-col gap-1.5 items-end">
                          {watchHref ? (
                            <Link href={watchHref} className={actionBtnSecondary}>
                              Watch
                            </Link>
                          ) : (
                            <span
                              className={`${actionBtnSecondary} cursor-not-allowed opacity-40 pointer-events-none`}
                              aria-disabled
                            >
                              Watch
                            </span>
                          )}
                          {t.status === 'registration' && !isActive && (
                            <button
                              type="button"
                              onClick={() => setShareModalT(t)}
                              className={actionBtnSecondary}
                              title="Generate a share image for this tournament"
                            >
                              Share
                            </button>
                          )}
                          {canJoin && (
                            <button
                              type="button"
                              onClick={() => beginJoin(t)}
                              disabled={joiningId != null}
                              className={actionBtnPrimary}
                            >
                              Join
                            </button>
                          )}
                          {t.isRegistered && !isActive && (
                            <span
                              className={`${actionBtnSecondary} border-emerald-500/35 bg-emerald-500/10 text-emerald-100 cursor-default`}
                              title="Registered for this tournament"
                            >
                              Joined
                            </span>
                          )}
                          {t.isRegistered &&
                            !isActive &&
                            t.status === 'registration' &&
                            isCustomTokenBuyIn(t) && (
                              <button
                                type="button"
                                onClick={() => void handleLeaveRegistration(t.tournamentId)}
                                disabled={leavingRegId === t.tournamentId}
                                className={actionBtnGhost}
                              >
                                {leavingRegId === t.tournamentId ? '…' : 'Leave'}
                              </button>
                            )}
                          {isActive && t.isRegistered && (
                            <button
                              type="button"
                              onClick={() => t.tableId && onGoToTable?.(t.tableId, t.tournamentId)}
                              disabled={!t.tableId}
                              className={actionBtnPrimary}
                            >
                              Table
                            </button>
                          )}
                          {/*
                           * Creator can cancel their own tournament during registration without
                           * being registered as a player — required for custom-token freerolls
                           * where the creator never joins as a player (their stake is on-chain,
                           * not chip-denominated).
                           */}
                          {!isActive && isCreator && t.status === 'registration' && (
                            <button
                              type="button"
                              onClick={() => handleCancel(t.tournamentId)}
                              disabled={cancellingId === t.tournamentId}
                              className={actionBtnGhost}
                            >
                              {cancellingId === t.tournamentId ? '…' : 'Cancel'}
                            </button>
                          )}
                          {showBotsToggle && (
                            <button
                              type="button"
                              onClick={() => toggleBotsRow(t.tournamentId)}
                              className={actionBtnGhost}
                            >
                              {botsRowId === t.tournamentId ? 'Hide bots' : 'Add bots'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {botsRowId === t.tournamentId && (
                      <tr className="bg-black/20">
                        <td colSpan={8} className="px-3 py-3 border-b border-slate-600/35">
                          <div className="rounded-lg border border-white/10 px-3 py-3 space-y-2 max-w-xl">
                            <div className="text-xs font-semibold text-white">Add bot players</div>
                            <p className="text-xs text-slate-500 leading-relaxed">
                              Bots register from the game server and play like normal opponents.
                            </p>
                            <div className="flex flex-wrap gap-2 items-center">
                              <label className="text-xs text-slate-500 flex items-center gap-2">
                                Count
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={botCount}
                                  onChange={(e) => setBotCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                                  className="w-12 h-8 rounded-lg border border-slate-600/60 bg-black/30 px-2 text-sm text-white"
                                />
                              </label>
                              {isPrivate && (
                                <input
                                  type="text"
                                  value={botPin}
                                  onChange={(e) => setBotPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                                  placeholder="PIN"
                                  className="h-8 min-w-[4rem] max-w-[6rem] rounded-lg border border-slate-600/60 bg-black/30 px-2 text-sm text-white placeholder:text-slate-600"
                                />
                              )}
                              <button
                                type="button"
                                disabled={
                                  tournamentBotsBusyId === t.tournamentId || (isPrivate && botPin.length < 4)
                                }
                                onClick={() => handleAddTournamentBots(t.tournamentId, botCount, isPrivate ? botPin : undefined)}
                                className="h-8 px-3 rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40 transition-colors"
                              >
                                {tournamentBotsBusyId === t.tournamentId ? '…' : 'Run'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
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

      <PokerTournamentRulesModal
        open={rulesModal != null}
        onOpenChange={(o) => {
          if (!o) setRulesModal(null);
        }}
        wsClient={wsClient}
        tournamentId={rulesModal?.tournamentId ?? ''}
        tournamentName={rulesModal?.name ?? ''}
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
                onClick={() =>
                  setJoinFlow(
                    isCustomTokenBuyIn(joinFlow.t)
                      ? { phase: 'escrow_pay', t: joinFlow.t, pin: joinFlow.pin }
                      : { phase: 'confirm', t: joinFlow.t, pin: joinFlow.pin },
                  )
                }
                className="flex-1 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {joinFlow?.phase === 'confirm' && renderJoinConfirm(joinFlow.t, joinFlow.pin)}

      {joinFlow?.phase === 'escrow_pay' &&
        joinFlow.t.prizeTokenAddress &&
        (() => {
          const t = joinFlow.t;
          let buyInWei: bigint;
          try {
            buyInWei = BigInt(t.buyInAmount);
          } catch {
            return (
              <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setJoinFlow(null)} />
                <div className="relative rounded-2xl border border-red-500/40 bg-slate-900 p-4 text-sm text-red-200">
                  Invalid buy-in amount for this tournament.
                </div>
              </div>
            );
          }
          const tokenAddr = t.prizeTokenAddress as `0x${string}`;
          const dec = t.prizeTokenDecimals ?? 18;
          return (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setJoinFlow(null)} />
              <div
                className="relative w-full max-w-md rounded-2xl border border-cyan-500/30 overflow-hidden shadow-2xl p-5 space-y-4"
                style={TABLE_SHELL_STYLE}
              >
                <h3 className="text-lg font-bold text-white text-center">Pay buy-in</h3>
                <p className="text-xs text-white/50 text-center">{t.name}</p>
                <EscrowBuyInJoinPanel
                  tournamentId={t.tournamentId}
                  tokenAddress={tokenAddr}
                  tokenDecimals={dec}
                  tokenSymbol={t.prizeTokenSymbol ?? null}
                  tokenName={t.prizeTokenName ?? null}
                  buyInWei={buyInWei}
                  creatorFeePercent={t.creatorFeePercent}
                  disabled={joiningId === t.tournamentId}
                  onCancel={() => setJoinFlow(null)}
                  onSuccess={async (hash) => {
                    escrowJoinTxRetryRef.current = hash;
                    await handleJoin(t.tournamentId, t.isPrivate === true ? joinFlow.pin : undefined, hash);
                  }}
                />
                {joinError && escrowJoinTxRetryRef.current && (
                  <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 space-y-2">
                    <p className="text-[11px] text-amber-100/90">{joinError}</p>
                    <button
                      type="button"
                      disabled={joiningId === t.tournamentId}
                      onClick={() =>
                        void handleJoin(
                          t.tournamentId,
                          t.isPrivate === true ? joinFlow.pin : undefined,
                          escrowJoinTxRetryRef.current ?? undefined,
                        )
                      }
                      className="w-full rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Retry registration (same deposit)
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      <MyPokerTournamentsModal
        open={showMyTournaments}
        onClose={() => setShowMyTournaments(false)}
        tournaments={openTournaments}
        myTableId={myTableId ?? null}
        myTournamentId={myTournamentId ?? null}
        onGoToTable={(tableId, tournamentId) => onGoToTable?.(tableId, tournamentId)}
        onForfeit={(tournamentId) => {
          setShowMyTournaments(false);
          beginForfeit(tournamentId);
        }}
      />

      {forfeitConfirm && (
        <ConfirmActionCard
          title="Forfeit tournament?"
          subtitle={forfeitConfirm.name}
          rows={[
            { label: 'Result', value: 'You will be eliminated', accent: 'yellow' },
            { label: 'Refund', value: 'None — buy-in stays in the prize pool', accent: 'white' },
          ]}
          onBack={() => setForfeitConfirm(null)}
          onConfirm={() => { void handleConfirmForfeit(); }}
          confirmLabel="Forfeit"
          isLoading={forfeitInFlight}
          warning="This is the same as busting out. The action cannot be undone."
        />
      )}

      <InsufficientBalanceDialog
        isOpen={insufficientChipsInfo != null}
        onClose={() => setInsufficientChipsInfo(null)}
        title="Not Enough Poker Chips"
        message="Your poker chip balance isn't enough to register for this tournament. Open the chip exchange to convert MORBIUS into chips."
        required={insufficientChipsInfo?.required}
        actionLabel="Open Chip Exchange"
        onOpenExchange={() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('sophie:open_poker_chip_exchange'));
          }
        }}
      />

      <ShareModalForLobby tournament={shareModalT} onClose={() => setShareModalT(null)} />
    </div>
  );
}

/**
 * Lobby-side wrapper that memoizes share-snapshot derivation per tournament.
 * Splitting it into its own component keeps the snapshot computation off the
 * lobby's render path until a row's "Share" button is actually clicked.
 */
function ShareModalForLobby({
  tournament,
  onClose,
}: {
  tournament: PokerTournamentSummary | null;
  onClose: () => void;
}) {
  const snapshot = useMemo(
    () => (tournament ? derivePokerShareSnapshotFromSummary(tournament) : null),
    [tournament],
  );
  if (!tournament || !snapshot) return null;
  return (
    <PokerTournamentShareModal
      open
      onClose={onClose}
      tournamentName={snapshot.tournamentName}
      isFreeroll={snapshot.isFreeroll}
      scheduleLine={snapshot.scheduleLine}
      prizeLine={snapshot.prizeLine}
      payoutLine={snapshot.payoutLine}
      shareTokenSymbol={snapshot.shareTokenSymbol}
      shareTokenLogoUrl={snapshot.shareTokenLogoUrl}
    />
  );
}

/**
 * Surfaces cancelled custom-token poker freerolls created by the connected wallet
 * that still have funds parked in the escrow contract. One row per tournament with
 * a "Reclaim" button that calls `creatorReclaim(bytes32)` on the escrow.
 *
 * Server returns the candidate set (cheap DB read); client confirms reclaimability
 * on-chain (`getPool`) before showing each row to avoid surfacing already-reclaimed
 * tournaments. Returns null when nothing to reclaim, so the lobby has no extra noise.
 */
function ReclaimableEscrowBanner({
  myAddress,
  fetchReclaimable,
}: {
  myAddress: string;
  fetchReclaimable: () => Promise<ReclaimableCustomTokenTournament[]>;
}) {
  const [candidates, setCandidates] = useState<ReclaimableCustomTokenTournament[]>([]);
  /** On-chain confirmed reclaimable subset, keyed by tournamentId. */
  const [reclaimable, setReclaimable] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  // Fetch candidates whenever the connected wallet changes.
  useEffect(() => {
    if (!myAddress) {
      setCandidates([]);
      setReclaimable(new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      const list = await fetchReclaimable();
      if (cancelled) return;
      setCandidates(list);
    })();
    return () => { cancelled = true; };
  }, [myAddress, fetchReclaimable]);

  // For each candidate, confirm on-chain reclaimability so we don't show stale rows.
  useEffect(() => {
    if (candidates.length === 0 || !publicClient) {
      setReclaimable(new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      const ok = new Set<string>();
      await Promise.all(candidates.map(async (c) => {
        try {
          const idBytes32 = c.escrowTournamentIdBytes32 ?? tournamentIdToBytes32(c.tournamentId);
          const result = await publicClient.readContract({
            address: TOURNAMENT_PRIZE_ESCROW_ADDRESS,
            abi: tournamentPrizeEscrowV6Abi,
            functionName: 'getPool',
            args: [idBytes32 as `0x${string}`],
          });
          // V4 returns 6 fields: [token, depositor, totalDeposited, amountPaidOut, depositedAt, cancelled].
          // No `active` flag — derive from the math.
          const [, , totalDeposited, amountPaidOut, , isCancelled] = result as readonly [
            `0x${string}`, `0x${string}`, bigint, bigint, bigint, boolean,
          ];
          if (isCancelled && totalDeposited > amountPaidOut) ok.add(c.tournamentId);
        } catch {
          // RPC failure: skip silently. The row stays out of the banner this render.
        }
      }));
      if (!cancelled) setReclaimable(ok);
    })();
    return () => { cancelled = true; };
  }, [candidates, publicClient]);

  const visible = useMemo(
    () => candidates.filter((c) => reclaimable.has(c.tournamentId)),
    [candidates, reclaimable],
  );

  if (visible.length === 0) return null;

  const handleReclaim = async (c: ReclaimableCustomTokenTournament) => {
    setBusyId(c.tournamentId);
    setErrorById((prev) => { const next = { ...prev }; delete next[c.tournamentId]; return next; });
    try {
      const idBytes32 = c.escrowTournamentIdBytes32 ?? tournamentIdToBytes32(c.tournamentId);
      const hash = await writeContractAsync({
        address: TOURNAMENT_PRIZE_ESCROW_ADDRESS,
        abi: tournamentPrizeEscrowV6Abi,
        functionName: 'creatorReclaim',
        args: [idBytes32 as `0x${string}`],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      // On success drop the row from `reclaimable`; the next mount-fetch can re-confirm.
      setReclaimable((prev) => {
        const next = new Set(prev);
        next.delete(c.tournamentId);
        return next;
      });
    } catch (err) {
      setErrorById((prev) => ({ ...prev, [c.tournamentId]: (err as Error).message ?? 'Reclaim failed' }));
    } finally {
      setBusyId(null);
    }
  };

  const formatTokenAmount = (c: ReclaimableCustomTokenTournament) => {
    let human: string;
    try { human = formatUnits(BigInt(c.prizePool || '0'), c.prizeTokenDecimals); }
    catch { human = '0'; }
    const trimmed = human.includes('.') ? human.replace(/\.?0+$/, '') : human;
    const ticker = formatPrizeTokenUnitLabel({
      prizeTokenName: c.prizeTokenName,
      prizeTokenSymbol: c.prizeTokenSymbol,
      prizeTokenAddress: c.prizeTokenAddress,
    });
    return `${trimmed} ${ticker}`;
  };

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold tracking-wide uppercase text-amber-200/90">
          Reclaim deposit ({visible.length})
        </h3>
        <span className="text-[11px] text-amber-200/60">
          Cancelled freerolls you funded — pull your tokens back from escrow.
        </span>
      </div>
      <ul className="space-y-1.5">
        {visible.map((c) => {
          const err = errorById[c.tournamentId];
          const isBusy = busyId === c.tournamentId;
          return (
            <li key={c.tournamentId} className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white truncate">{c.name || 'Untitled'}</div>
                <div className="text-[11px] text-amber-200/80 tabular-nums">{formatTokenAmount(c)}</div>
                {err && <div className="text-[11px] text-red-300 mt-1 break-words">{err}</div>}
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleReclaim(c)}
                className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:pointer-events-none text-black text-xs font-semibold px-3 py-1.5"
              >
                {isBusy ? 'Reclaiming…' : 'Reclaim'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Surfaces completed custom-token poker freerolls where the connected wallet has unpaid
 * winnings — the on-chain push payout failed (or hasn't fired) but `setUnclaimedShares`
 * recorded the amount on-chain. One row per tournament with a Claim button that calls
 * `claim(bytes32)` to pull the prize from the escrow.
 *
 * Server returns the candidate set (winners with no `prize_payout_tx_hash`); client
 * confirms each via on-chain `unclaimedOf(bytes32, me)` so we never show a button for
 * an already-claimed/never-set tournament.
 */
function ClaimableEscrowBanner({
  myAddress,
  fetchClaimable,
}: {
  myAddress: string;
  fetchClaimable: () => Promise<ClaimableCustomTokenTournament[]>;
}) {
  const [candidates, setCandidates] = useState<ClaimableCustomTokenTournament[]>([]);
  /** Keyed by tournamentId. Only entries with a confirmed positive on-chain unclaimed get a button. */
  const [onChainAmount, setOnChainAmount] = useState<Map<string, bigint>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  // Fetch candidates whenever the connected wallet changes.
  useEffect(() => {
    if (!myAddress) {
      setCandidates([]);
      setOnChainAmount(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const list = await fetchClaimable();
      if (cancelled) return;
      setCandidates(list);
    })();
    return () => { cancelled = true; };
  }, [myAddress, fetchClaimable]);

  // Confirm each candidate on-chain. We trust unclaimedOf as the source of truth — the
  // server's DB row is just a hint that there COULD be something; the contract decides.
  useEffect(() => {
    if (candidates.length === 0 || !publicClient || !myAddress) {
      setOnChainAmount(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const map = new Map<string, bigint>();
      await Promise.all(candidates.map(async (c) => {
        try {
          const idBytes32 = c.escrowTournamentIdBytes32 ?? tournamentIdToBytes32(c.tournamentId);
          const amount = (await publicClient.readContract({
            address: TOURNAMENT_PRIZE_ESCROW_ADDRESS,
            abi: tournamentPrizeEscrowV6Abi,
            functionName: 'unclaimedOf',
            args: [idBytes32 as `0x${string}`, myAddress as `0x${string}`],
          })) as bigint;
          if (amount > 0n) map.set(c.tournamentId, amount);
        } catch {
          // RPC blip; skip silently.
        }
      }));
      if (!cancelled) setOnChainAmount(map);
    })();
    return () => { cancelled = true; };
  }, [candidates, publicClient, myAddress]);

  const visible = useMemo(
    () => candidates.filter((c) => onChainAmount.has(c.tournamentId)),
    [candidates, onChainAmount],
  );

  if (visible.length === 0) return null;

  const handleClaim = async (c: ClaimableCustomTokenTournament) => {
    setBusyId(c.tournamentId);
    setErrorById((prev) => { const next = { ...prev }; delete next[c.tournamentId]; return next; });
    try {
      const idBytes32 = c.escrowTournamentIdBytes32 ?? tournamentIdToBytes32(c.tournamentId);
      const hash = await writeContractAsync({
        address: TOURNAMENT_PRIZE_ESCROW_ADDRESS,
        abi: tournamentPrizeEscrowV6Abi,
        functionName: 'claim',
        args: [idBytes32 as `0x${string}`],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      // Drop the row immediately — next mount-fetch will re-confirm there's nothing left.
      setOnChainAmount((prev) => {
        const next = new Map(prev);
        next.delete(c.tournamentId);
        return next;
      });
    } catch (err) {
      setErrorById((prev) => ({ ...prev, [c.tournamentId]: (err as Error).message ?? 'Claim failed' }));
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Show on-chain unclaimed amount when present (it's the truth — the server's DB
   * row may differ if the server-recorded share was overwritten). Falls back to
   * `prizeWon` from the DB if the on-chain value is unexpectedly missing.
   */
  const formatTokenAmount = (c: ClaimableCustomTokenTournament): string => {
    const onChain = onChainAmount.get(c.tournamentId);
    const wei = onChain ?? (() => {
      try { return BigInt(c.prizeWon || '0'); } catch { return 0n; }
    })();
    let human: string;
    try { human = formatUnits(wei, c.prizeTokenDecimals); }
    catch { human = '0'; }
    const trimmed = human.includes('.') ? human.replace(/\.?0+$/, '') : human;
    const ticker = formatPrizeTokenUnitLabel({
      prizeTokenName: c.prizeTokenName,
      prizeTokenSymbol: c.prizeTokenSymbol,
      prizeTokenAddress: c.prizeTokenAddress,
    });
    return `${trimmed} ${ticker}`;
  };

  return (
    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold tracking-wide uppercase text-emerald-200/90">
          Unclaimed prizes ({visible.length})
        </h3>
        <span className="text-[11px] text-emerald-200/60">
          Tournaments where your prize is sitting on-chain — pull it to your wallet.
        </span>
      </div>
      <ul className="space-y-1.5">
        {visible.map((c) => {
          const err = errorById[c.tournamentId];
          const isBusy = busyId === c.tournamentId;
          return (
            <li key={c.tournamentId} className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white truncate">{c.name || 'Untitled'}</div>
                <div className="text-[11px] text-emerald-200/80 tabular-nums">{formatTokenAmount(c)}</div>
                {err && <div className="text-[11px] text-red-300 mt-1 break-words">{err}</div>}
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleClaim(c)}
                className="shrink-0 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:pointer-events-none text-black text-xs font-semibold px-3 py-1.5"
              >
                {isBusy ? 'Claiming…' : 'Claim'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
