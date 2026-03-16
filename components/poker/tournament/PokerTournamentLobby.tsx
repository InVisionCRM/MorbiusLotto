'use client';

import React, { useState } from 'react';
import { formatEther } from 'viem';
import {
  usePokerTournament,
  POKER_TOURNAMENT_DEFAULT_CONFIG,
  type PokerTournamentSummary,
  type CreatePokerTournamentParams,
} from '@/hooks/use-poker-tournament';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';

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

function formatMorbius(wei: string | bigint): string {
  try {
    const n = Number(formatEther(typeof wei === 'bigint' ? wei : BigInt(wei)));
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } catch { return '0'; }
}

// ---------------------------------------------------------------------------
// TournamentCard
// ---------------------------------------------------------------------------

function TournamentCard({
  t,
  myAddress,
  onJoin,
}: {
  t: PokerTournamentSummary;
  myAddress?: string;
  onJoin: (tournamentId: string, pinCode?: string) => void;
}) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const isPrivate = !t.creatorAddress; // rough heuristic — the server doesn't expose is_private to summary yet

  const spots = t.maxPlayers - t.registeredCount;
  const isFull = spots <= 0;
  const isActive = t.status === 'active';

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 transition-colors p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-white truncate">{t.name}</h4>
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
          <div className="text-sm font-semibold text-white mt-0.5">{formatMorbius(t.buyInAmount)}</div>
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
        Start: {t.minPlayers} players · Stack: {t.startingStack.toLocaleString()} chips
      </div>

      {!isActive && !isFull && (
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
              className="w-full rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black font-semibold text-sm py-2 transition-colors"
            >
              Join Tournament
            </button>
          )}
        </div>
      )}

      {isActive && (
        <div className="mt-3 text-center text-xs text-white/30 py-1">
          Tournament in progress
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateModal
// ---------------------------------------------------------------------------

function CreateModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (params: CreatePokerTournamentParams) => Promise<void>;
}) {
  const [name, setName] = useState('My SNG');
  const [buyIn, setBuyIn] = useState('1000');
  const [prizeType, setPrizeType] = useState('winner_takes_all');
  const [startingStack, setStartingStack] = useState('5000');
  const [minPlayers, setMinPlayers] = useState('2');
  const [maxPlayers, setMaxPlayers] = useState('6');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreate({
        name:                  name.trim(),
        buyInAmount:           parseMorbiusInput(buyIn).toString(),
        prizeDistributionType: prizeType,
        config:                {
          ...POKER_TOURNAMENT_DEFAULT_CONFIG,
          startingStack: Math.max(100, parseInt(startingStack) || 5000),
          minPlayers:    Math.max(2, parseInt(minPlayers) || 2),
          maxPlayers:    Math.max(parseInt(minPlayers) || 2, parseInt(maxPlayers) || 6),
        },
        isPrivate,
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Buy-in (MORBIUS)</label>
              <input
                type="number"
                min="1"
                value={buyIn}
                onChange={(e) => setBuyIn(e.target.value)}
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
            disabled={isSubmitting || !name.trim()}
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

  const { openTournaments, isLoadingTournaments, refreshTournaments, createTournament, joinTournament, myTableId, myTournamentId } =
    usePokerTournament({
      wsClient,
      onTournamentStarted: (tournamentId, tableId) => {
        onGoToTable?.(tableId, tournamentId);
      },
    });

  const handleJoin = async (tournamentId: string, pinCode?: string) => {
    setJoinError(null);
    try {
      const result = await joinTournament(tournamentId, pinCode);
      if (result?.autoStarted && result.tableId) {
        onGoToTable?.(result.tableId, tournamentId);
      }
    } catch (err) {
      setJoinError((err as Error).message ?? 'Failed to join');
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
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
