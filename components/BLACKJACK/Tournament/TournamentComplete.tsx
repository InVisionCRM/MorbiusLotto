'use client';

import React from 'react';
import { formatEther } from 'viem';
import { TournamentState, TOURNAMENT_CONFIG } from '@/hooks/use-tournament';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Theme } from '@/lib/theme';

interface TournamentCompleteProps {
  isOpen: boolean;
  onClose: () => void;
  /** When completed: "Play Again". When busted: "Browse Tournaments" if provided */
  onPlayAgain?: () => void;
  /** When busted: opens tournament browser to join another. Falls back to onPlayAgain if not set */
  onBrowseTournaments?: () => void;
  state: TournamentState;
  tournamentName?: string;
  prizeWon?: bigint;
  /** Prize pool (wei string) for payout eligibility messaging */
  prizePool?: string;
}

export function TournamentComplete({
  isOpen,
  onClose,
  onPlayAgain,
  onBrowseTournaments,
  state,
  tournamentName,
  prizeWon = BigInt(0),
  prizePool,
}: TournamentCompleteProps) {
  const isBusted = state.status === 'busted';
  const chipChange = state.chips - state.startingChips;
  const prizeWonFormatted = Number(formatEther(prizeWon)).toLocaleString();
  const hasPrizePool = prizePool && BigInt(prizePool) > 0n;
  const isInPayoutRange = !isBusted && state.currentRank >= 1 && state.currentRank <= 10;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={`border-2 text-white max-w-md p-0 gap-0 overflow-hidden [&>button]:text-white/70 [&>button]:hover:text-white ${isBusted ? 'border-red-500/30' : 'border-cyan-500/30'}`} style={Theme.panel.base}>
        {/* Header */}
        <div className={`px-6 pt-6 pb-4 text-center ${
          isBusted
            ? 'bg-gradient-to-b from-red-900/40 to-transparent'
            : 'bg-gradient-to-b from-green-900/40 to-transparent'
        }`}>
          <DialogHeader className="space-y-2">
            {isBusted ? (
              <>
                <div className="text-5xl mb-1">&#x1F4A5;</div>
                <DialogTitle className="text-2xl font-bold text-red-400 text-center">
                  Busted Out!
                </DialogTitle>
                <DialogDescription className="text-gray-400 text-center">
                  You ran out of chips
                </DialogDescription>
              </>
            ) : (
              <>
                <div className="text-5xl mb-1">&#x1F3C6;</div>
                <DialogTitle className="text-2xl font-bold text-green-400 text-center">
                  Tournament Complete!
                </DialogTitle>
                <DialogDescription className="text-gray-400 text-center">
                  You played all {state.maxHands || TOURNAMENT_CONFIG.MAX_HANDS} hands
                </DialogDescription>
              </>
            )}
          </DialogHeader>

          {/* Event name */}
          {tournamentName && (
            <div className="mt-3 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 inline-block">
              <span className="text-xs text-gray-300 font-medium">{tournamentName}</span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="px-6 pb-4 space-y-3">
          {/* Rank (non-busted only) */}
          {!isBusted && state.currentRank > 0 && (
            <div className="text-center py-2">
              <p className="text-gray-500 text-[10px] uppercase tracking-widest">Final Rank</p>
              <p className={`text-4xl font-bold ${
                state.currentRank === 1 ? 'text-yellow-400' :
                state.currentRank === 2 ? 'text-gray-300' :
                state.currentRank === 3 ? 'text-orange-400' :
                state.currentRank <= 10 ? 'text-purple-400' :
                'text-gray-400'
              }`}>
                #{state.currentRank}
              </p>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="Hands Played"
              value={`${state.handsPlayed}`}
              sub={`of ${state.maxHands || TOURNAMENT_CONFIG.MAX_HANDS}`}
              color="text-cyan-400"
            />
            <StatCard
              label="Biggest Bet"
              value={state.biggestBet > 0 ? state.biggestBet.toLocaleString() : '—'}
              sub="chips"
              color="text-yellow-400"
            />
            <StatCard
              label="Biggest Win"
              value={state.biggestWin > 0 ? `+${state.biggestWin.toLocaleString()}` : '—'}
              sub="chips"
              color="text-green-400"
            />
            {isBusted ? (
              <StatCard
                label="Peak Chips"
                value={state.highestChips.toLocaleString()}
                sub={`started ${state.startingChips.toLocaleString()}`}
                color="text-purple-400"
              />
            ) : (
              <StatCard
                label="Final Chips"
                value={state.chips.toLocaleString()}
                sub={`${chipChange >= 0 ? '+' : ''}${chipChange.toLocaleString()} net`}
                color="text-yellow-400"
              />
            )}
          </div>

          {/* Prize Won */}
          {prizeWon > BigInt(0) && (
            <div className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 rounded-xl p-3 border border-yellow-500/30 text-center">
              <p className="text-yellow-400 text-[10px] uppercase tracking-widest">Prize Won</p>
              <p className="text-2xl font-bold text-yellow-300 mt-0.5">
                {prizeWonFormatted} MORBIUS
              </p>
            </div>
          )}

          {/* Next steps & payout eligibility */}
          <div className="rounded-xl p-3 border border-white/10 bg-white/5 space-y-2">
            <p className="text-gray-400 text-[10px] uppercase tracking-widest font-medium">What&apos;s next</p>
            {isBusted ? (
              <p className="text-sm text-gray-300">
                You ran out of chips and are out of this tournament. No payout. Browse the lobby to join another tournament or try a different game.
              </p>
            ) : (
              <>
                {isInPayoutRange && hasPrizePool ? (
                  <>
                    <p className="text-sm text-cyan-300 font-medium">
                      You&apos;re in the running for a payout!
                    </p>
                    <p className="text-xs text-gray-400">
                      Prizes are distributed when all players finish. Your estimated prize will be sent to your wallet once the tournament ends. Check back or view your balance.
                    </p>
                  </>
                ) : isInPayoutRange && !hasPrizePool ? (
                  <p className="text-sm text-gray-300">
                    You finished in the top 10. This was a freeroll with no prize pool. Join a buy-in tournament to compete for MORBIUS prizes.
                  </p>
                ) : (
                  <p className="text-sm text-gray-300">
                    You finished outside the top 10. No prize for this tournament. Join another to try again!
                  </p>
                )}
              </>
            )}
          </div>

        </div>

        {/* Actions */}
        <DialogFooter className="px-6 pb-6 pt-2 flex-row gap-3 sm:flex-row flex-wrap">
          <button
            onClick={onClose}
            className="flex-1 min-w-[120px] py-2.5 rounded-lg bg-gray-700/80 hover:bg-gray-600 text-white text-sm font-semibold transition-colors border border-white/10"
          >
            {isBusted ? 'Exit' : 'Exit Tournament'}
          </button>
          {(isBusted ? onBrowseTournaments : onPlayAgain) ? (
            <button
              onClick={isBusted ? onBrowseTournaments! : onPlayAgain!}
              className="flex-1 min-w-[120px] py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white text-sm font-bold transition-all shadow-lg shadow-cyan-500/20 border border-cyan-400/30"
            >
              {isBusted ? 'Browse Tournaments' : 'Play Again'}
            </button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-lg p-3 text-center border border-white/5" style={Theme.panel.base}>
      <p className="text-gray-500 text-[10px] uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold ${color} mt-0.5`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default TournamentComplete;
