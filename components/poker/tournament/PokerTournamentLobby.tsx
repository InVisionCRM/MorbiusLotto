'use client';

import React, { useState, useEffect } from 'react';
import {
  usePokerTournament,
  POKER_TOURNAMENT_DEFAULT_CONFIG,
  type PokerTournamentSummary,
  type CreatePokerTournamentParams,
} from '@/hooks/use-poker-tournament';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { isAdminWallet } from '@/lib/admin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MORBIUS_DECIMALS = 18n;

function parseMorbiusInput(val: string): bigint {
  try {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return 0n;
    return BigInt(Math.round(num)) * 10n ** MORBIUS_DECIMALS;
  } catch { return 0n; }
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// TournamentCard
// ---------------------------------------------------------------------------

function TournamentCard({
  t,
  myAddress,
  onJoin,
  onCancel,
  isJoining,
  isCancelling,
}: {
  t: PokerTournamentSummary;
  myAddress?: string;
  onJoin: (tournamentId: string, pinCode?: string) => void;
  onCancel: (tournamentId: string) => void;
  isJoining?: boolean;
  isCancelling?: boolean;
}) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const isPrivate = t.isPrivate === true;

  const spots = t.maxPlayers - t.registeredCount;
  const isFull = spots <= 0;
  const isActive = t.status === 'active';
  const isScheduled = !!t.scheduledStartAt && new Date(t.scheduledStartAt) > new Date();
  const countdown = useCountdown(isScheduled ? t.scheduledStartAt : null);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 transition-colors p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h4 className="font-semibold text-white truncate">{t.name}</h4>
            {isZeroBuyInWei(t.buyInAmount) && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-cyan-500/35 text-cyan-300/95 bg-cyan-500/10 shrink-0">
                Freeroll
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 mt-0.5">
            by {t.creatorAddress ? `${t.creatorAddress.slice(0, 6)}…${t.creatorAddress.slice(-4)}` : 'Unknown'}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${
          isActive
            ? 'bg-green-500/20 text-green-300 border-green-500/30'
            : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
        }`}>
          {isActive ? 'In Progress' : 'Open'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-wide">Buy-in</div>
          <div className="text-sm font-semibold text-white mt-0.5">
            {isZeroBuyInWei(t.buyInAmount) ? 'Free' : formatMorbius(t.buyInAmount)}
          </div>
          <div className="text-[10px] text-white/30">MORBIUS</div>
        </div>
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-wide">Players</div>
          <div className="text-sm font-semibold text-white mt-0.5">{t.registeredCount} / {t.maxPlayers}</div>
          <div className="text-[10px] text-white/30">
            {isFull ? 'Full' : `${spots} spot${spots === 1 ? '' : 's'} left`}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-wide">Prize Pool</div>
          <div className="text-sm font-semibold text-yellow-300 mt-0.5">{formatMorbius(t.prizePool)}</div>
          <div className="text-[10px] text-white/30">MORBIUS</div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-white/40">
        {isScheduled
          ? `Scheduled · Stack: ${t.startingStack.toLocaleString()} chips`
          : `SNG · Start: ${t.minPlayers} players · Stack: ${t.startingStack.toLocaleString()} chips`
        }
      </div>

      {isScheduled && countdown && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[10px] text-white/40 uppercase tracking-wide">Starts in</span>
          <span className="text-xs font-bold text-cyan-400 tabular-nums">{countdown}</span>
        </div>
      )}

      {/* Already registered */}
      {t.isRegistered && !isActive && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/30 px-3 py-2">
          <span className="text-green-400 text-xs font-semibold">✓ Registered</span>
          {isScheduled && countdown && (
            <span className="text-white/40 text-xs ml-1">Starts in {countdown}</span>
          )}
          {t.status === 'registration' && t.creatorAddress?.toLowerCase() === myAddress?.toLowerCase() && (
            <button
              onClick={() => onCancel(t.tournamentId)}
              disabled={isCancelling}
              className="ml-auto text-[11px] text-red-400/70 hover:text-red-400 disabled:opacity-40 border border-red-500/20 hover:border-red-500/40 rounded px-2 py-0.5 transition-colors"
            >
              {isCancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>
      )}

      {/* Join button — only show if not registered, not active, not full */}
      {!t.isRegistered && !isActive && !isFull && (
        <div className="mt-3">
          {showPin ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="Enter PIN"
                className="flex-1 rounded-lg bg-white/10 border border-white/20 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
              />
              <button
                onClick={() => { onJoin(t.tournamentId, pin); setShowPin(false); }}
                className="rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black font-semibold text-sm px-3 py-1.5 transition-colors"
              >
                Join
              </button>
            </div>
          ) : (
            <button
              onClick={() => onJoin(t.tournamentId)}
              disabled={isJoining}
              className="w-full rounded-lg bg-yellow-500 hover:bg-yellow-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-semibold text-sm py-2 transition-colors"
            >
              {isJoining ? 'Joining…' : isScheduled ? 'Register' : 'Join Tournament'}
            </button>
          )}
        </div>
      )}

      {isActive && !t.isRegistered && (
        <div className="mt-3 text-center text-xs text-white/30 py-1">
          Tournament in progress
        </div>
      )}

      {isActive && t.isRegistered && (
        <div className="mt-3 text-center text-xs text-green-400/60 py-1">
          You are playing in this tournament
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateModal
// ---------------------------------------------------------------------------

function CreateModal({ creatorAddress, onClose, onCreate }: {
  creatorAddress?: string;
  onClose: () => void;
  onCreate: (params: CreatePokerTournamentParams) => Promise<void>;
}) {
  const [name, setName] = useState('My SNG');
  const [isFreeroll, setIsFreeroll] = useState(false);
  const [fundFromPromo, setFundFromPromo] = useState(false);
  const [buyIn, setBuyIn] = useState('1000');
  const [guaranteedPool, setGuaranteedPool] = useState('5000');
  const [prizeType, setPrizeType] = useState('winner_takes_all');
  const [startingStack, setStartingStack] = useState('5000');
  const [minPlayers, setMinPlayers] = useState('2');
  const [maxPlayers, setMaxPlayers] = useState('6');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scheduledStart, setScheduledStart] = useState(''); // ISO datetime-local string

  const showPromoOption = isFreeroll && isAdminWallet(creatorAddress);

  useEffect(() => {
    if (!isFreeroll) setFundFromPromo(false);
  }, [isFreeroll]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const buyWei = isFreeroll ? 0n : parseMorbiusInput(buyIn);
    const guaranteeWei = isFreeroll ? parseMorbiusInput(guaranteedPool) : 0n;
    if (!isFreeroll && buyWei <= 0n) return;
    if (isFreeroll && guaranteeWei <= 0n) return;
    setIsSubmitting(true);
    try {
      await onCreate({
        name:                  name.trim(),
        buyInAmount:           buyWei.toString(),
        ...(isFreeroll
          ? {
              guaranteedPrizePool: guaranteeWei.toString(),
              ...(fundFromPromo ? { guaranteedPrizePoolSource: 'platform_promo' as const } : {}),
            }
          : {}),
        prizeDistributionType: prizeType,
        config:                {
          ...POKER_TOURNAMENT_DEFAULT_CONFIG,
          startingStack: Math.max(100, parseInt(startingStack) || 5000),
          minPlayers:    Math.max(2, parseInt(minPlayers) || 2),
          maxPlayers:    Math.max(parseInt(minPlayers) || 2, parseInt(maxPlayers) || 6),
        },
        isPrivate,
        scheduledStartAt: scheduledStart ? new Date(scheduledStart).toISOString() : null,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Create Poker SNG</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Tournament Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              maxLength={40}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isFreeroll}
              onChange={(e) => {
                setIsFreeroll(e.target.checked);
                if (!e.target.checked) setFundFromPromo(false);
              }}
              className="rounded"
            />
            <span className="text-sm text-white/70">
              Freeroll (guaranteed prize pool at create)
            </span>
          </label>

          {isFreeroll && !fundFromPromo && (
            <p className="text-[11px] text-white/45 leading-snug -mt-1">
              Charged from your in-app MORBIUS balance when you tap Create (same balance as Plinko and other games).
            </p>
          )}

          {showPromoOption && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={fundFromPromo}
                onChange={(e) => setFundFromPromo(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-amber-200/85">
                Fund pool from platform promo wallet (admin)
              </span>
            </label>
          )}

          {isFreeroll && fundFromPromo && (
            <p className="text-[11px] text-amber-200/65 leading-snug -mt-1">
              Server debits <span className="font-mono text-[10px]">POKER_PROMO_GUARANTEED_POOL_WALLET</span> instead of your wallet. Refunds on cancel go back to that wallet.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">
                {isFreeroll ? 'Guaranteed pool (MORBIUS)' : 'Buy-in (MORBIUS)'}
              </label>
              <input
                type="number"
                min="1"
                value={isFreeroll ? guaranteedPool : buyIn}
                onChange={(e) => (isFreeroll ? setGuaranteedPool(e.target.value) : setBuyIn(e.target.value))}
                className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Starting Stack</label>
              <input
                type="number"
                min="100"
                step="100"
                value={startingStack}
                onChange={(e) => setStartingStack(e.target.value)}
                className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Min Players</label>
              <input
                type="number"
                min="2"
                max="10"
                value={minPlayers}
                onChange={(e) => setMinPlayers(e.target.value)}
                className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Max Players</label>
              <input
                type="number"
                min="2"
                max="10"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Prize Distribution</label>
            <select
              value={prizeType}
              onChange={(e) => setPrizeType(e.target.value)}
              className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
            >
              <option value="winner_takes_all">Winner Takes All</option>
              <option value="top_3">Top 3 (60 / 30 / 10%)</option>
              <option value="top_5">Top 5</option>
              <option value="top_10">Top 10</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">
              Scheduled Start <span className="normal-case text-white/30">(leave blank for SNG auto-start)</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledStart}
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
              onChange={(e) => setScheduledStart(e.target.value)}
              className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30 [color-scheme:dark]"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-white/70">Private (PIN-protected)</span>
          </label>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/15 text-white/60 text-sm py-2 hover:border-white/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={
              isSubmitting
              || !name.trim()
              || (!isFreeroll && parseMorbiusInput(buyIn) <= 0n)
              || (isFreeroll && parseMorbiusInput(guaranteedPool) <= 0n)
            }
            className="flex-1 rounded-lg bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold text-sm py-2 transition-colors"
          >
            {isSubmitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
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
  const [showCreate, setShowCreate] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { openTournaments, isLoadingTournaments, refreshTournaments, createTournament, joinTournament, cancelTournament, myTableId, myTournamentId } =
    usePokerTournament({
      wsClient,
      onTournamentStarted: (tournamentId, tableId) => {
        onGoToTable?.(tableId, tournamentId);
      },
    });

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

  const handleCreate = async (params: CreatePokerTournamentParams) => {
    setJoinError(null);
    try {
      await createTournament(params);
      refreshTournaments();
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
              isJoining={joiningId === t.tournamentId}
              isCancelling={cancellingId === t.tournamentId}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          creatorAddress={myAddress}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
