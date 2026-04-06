'use client';

import { formatEther } from 'viem';
import { UserPlus } from 'lucide-react';
import PlayingCard from '@/components/BLACKJACK/PlayingCard';
import { BetChip, formatChipLabel } from '@/components/ui/BetChip';
import type { BJMultiHandObj, BJMultiSeatState } from '@/lib/websocket-client';
import type { CardValue, Suit } from '@/app/BLACKJACK/types';

type SeatResultSummary = 'win' | 'loss' | 'push' | 'mixed' | 'none';

function indexToCard(idx: number) {
  const rank = (idx % 13) + 1;
  const suitIdx = Math.floor(idx / 13);
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  return { value: rank as CardValue, suit: suits[suitIdx] };
}

function formatMorbius(wei: string): string {
  try {
    const n = Number(formatEther(BigInt(wei)));
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } catch {
    return '0';
  }
}

/** Total MORBIUS (wei) shown as chips: pending bet in betting phase, else sum of per-hand bets after deal. */
function seatTableBetWei(seat: BJMultiSeatState): bigint {
  try {
    const pb = BigInt(seat.pendingBet || '0');
    if (pb > 0n) return pb;
    if (seat.hands?.length) {
      return seat.hands.reduce((a, h) => a + BigInt(h.betAmount || '0'), 0n);
    }
    return BigInt(seat.betAmount || '0');
  } catch {
    return 0n;
  }
}

function summarizeSeatHands(hands: BJMultiHandObj[]): SeatResultSummary {
  if (!hands.length) return 'none';
  const hasWin = hands.some((h) => h.result === 'win' || h.result === 'blackjack');
  const hasLoss = hands.some((h) => h.result === 'loss');
  const hasPush = hands.some((h) => h.result === 'push');
  if (hasWin && !hasLoss && !hasPush) return 'win';
  if (!hasWin && hasLoss && !hasPush) return 'loss';
  if (!hasWin && !hasLoss && hasPush) return 'push';
  return 'mixed';
}

function seatOutcomeLabelFromSummary(summary: SeatResultSummary, payoutWei: string) {
  if (summary === 'win') return { text: `WON +${formatMorbius(payoutWei || '0')}`, cls: 'text-emerald-300' };
  if (summary === 'loss') return { text: 'LOST', cls: 'text-red-300' };
  if (summary === 'push') return { text: 'PUSH', cls: 'text-yellow-300' };
  if (summary === 'mixed') return { text: 'MIXED', cls: 'text-cyan-200' };
  return null;
}

type BlackjackMultiSeatProps = {
  seat: BJMultiSeatState | null;
  position: number;
  isMe: boolean;
  isEmpty: boolean;
  isActing: boolean;
  phase: string;
  onTakeSeat: () => void;
  canTakeSeat: boolean;
  afkTimeoutsBeforeKick: number;
  balanceLabel?: string | null;
  onOpenProfile?: (address: string) => void;
  showOutcomeLabel?: boolean;
};

export function BlackjackMultiSeat({
  seat,
  position,
  isMe,
  isEmpty,
  isActing,
  phase,
  onTakeSeat,
  canTakeSeat,
  afkTimeoutsBeforeKick,
  balanceLabel,
  onOpenProfile,
  showOutcomeLabel,
}: BlackjackMultiSeatProps) {
  const seatRotation = position === 0 ? 45 : position === 2 ? -45 : 0;
  const canOpenProfile = !!seat?.playerAddress && !!onOpenProfile && !isMe;
  const seatOutcomeLabel = seat
    ? seatOutcomeLabelFromSummary(summarizeSeatHands(seat.hands), seat.payout || '0')
    : null;

  return (
    <div className="relative flex h-[248px] min-w-0 flex-col items-center justify-end gap-0 pb-[40px] transition-all duration-300">
      {isActing && (
        <div
          className="pointer-events-none absolute inset-0 rounded-xl border border-cyan-400/60 bg-cyan-900/10 shadow-[0_0_16px_rgba(34,211,238,0.22),inset_0_0_10px_rgba(34,211,238,0.08)]"
          aria-hidden
        />
      )}
      {/* Cards area — side seats tilt toward dealer */}
      <div
        style={{
          transform: seatRotation ? `rotate(${seatRotation}deg)` : undefined,
          transformOrigin: 'center bottom',
        }}
      >
        {isEmpty ? (
          <div
            className={`flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 transition-all ${
              canTakeSeat
                ? 'cursor-pointer border-cyan-400/70 bg-cyan-900/20 shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:scale-105 hover:border-cyan-300 hover:bg-cyan-800/30'
                : 'border-white/25 bg-white/[0.03]'
            }`}
            style={position === 1 ? { marginTop: 'auto', marginBottom: '25px' } : undefined}
            onClick={canTakeSeat ? onTakeSeat : undefined}
          >
            {canTakeSeat && (
              <>
                <UserPlus className="h-8 w-8 text-cyan-400/80" />
                <span className="text-xs font-semibold tracking-wide text-cyan-400/80">Seat {position + 1}</span>
              </>
            )}
            {!canTakeSeat && <span className="text-xs font-medium text-white/35">Seat {position + 1}</span>}
          </div>
        ) : (
          <>
            <div className="relative inline-flex max-w-full flex-col items-center">
              {/* Hands */}
              {seat && seat.hands.length > 0 ? (
                <div className={`flex min-h-[80px] justify-center items-start ${seat.hands.length > 1 ? 'flex-row gap-2' : 'flex-col items-center gap-1'}`}>
                  {seat.hands.map((hand, hi) => {
                    const hasSplit = seat.hands.length > 1;
                    const isActiveHand = hasSplit && isActing && seat.activeHandIndex === hi;
                    const isCompletedHand = hasSplit && isActing && (hand.isBust || hi < seat.activeHandIndex);
                    return (
                      <div
                        key={hi}
                        className={`flex flex-col items-center gap-1 ${hasSplit ? 'rounded-md px-1.5 py-1 transition-all duration-300' : ''}`}
                        style={
                          hasSplit
                            ? {
                                background: isActiveHand
                                  ? 'linear-gradient(145deg, rgba(6, 182, 212, 0.15), rgba(6, 182, 212, 0.05))'
                                  : isCompletedHand
                                    ? 'linear-gradient(145deg, rgba(100, 100, 100, 0.1), rgba(50, 50, 50, 0.05))'
                                    : 'transparent',
                                border: isActiveHand
                                  ? '2px solid rgba(6, 182, 212, 0.5)'
                                  : isCompletedHand
                                    ? '1px solid rgba(100, 100, 100, 0.3)'
                                    : '1px solid rgba(60, 60, 60, 0.35)',
                                boxShadow: isActiveHand
                                  ? '0 0 16px rgba(6, 182, 212, 0.28), inset 0 0 8px rgba(6, 182, 212, 0.08)'
                                  : 'none',
                                opacity: isCompletedHand ? 0.72 : 1,
                                transform: isActiveHand ? 'scale(1.02)' : 'scale(1)',
                              }
                            : undefined
                        }
                      >
                        {hasSplit && (
                          <div className="mb-0 flex items-center gap-1">
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider ${
                                isActiveHand ? 'text-cyan-400' : 'text-white/45'
                              }`}
                            >
                              Hand {hi + 1}
                            </span>
                            {isActiveHand && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" aria-hidden />}
                          </div>
                        )}
                        <div className="flex flex-col items-center">
                          {/* Score counter — above cards, matching single-player glass-counter style */}
                          {hand.cards.length > 0 && (
                            <div className={`flex items-center gap-2 transition-transform duration-300 ${
                              showOutcomeLabel && (hand.result === 'win' || hand.result === 'blackjack') ? 'card-counter-winner' : ''
                            }`} style={{ marginBottom: -10, zIndex: 0 }}>
                              <div className={`glass-counter relative flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300 ${
                                isActing && seat.activeHandIndex === hi ? 'card-counter-active' : ''
                              }`}>
                                <span className={`font-black relative z-10 transition-all duration-500 ${
                                  hand.isBust ? 'text-red-400' : hand.isBlackjack ? 'text-yellow-400' : showOutcomeLabel && (hand.result === 'win' || hand.result === 'blackjack') ? 'text-emerald-400' : isActiveHand ? 'text-white/90' : hasSplit ? 'text-white/50' : 'text-white/90'
                                } ${hand.hasAce && !hand.isBlackjack && !hand.isBust && hand.total <= 21 ? 'text-xl' : 'text-3xl'}`}>
                                  {hand.hasAce && !hand.isBlackjack && !hand.isBust && hand.total <= 21
                                    ? <>{hand.total - 10}<span className="text-white/40">/</span>{hand.total}</>
                                    : hand.total}
                                </span>
                              </div>
                              {hand.isBlackjack && <span className="text-sm font-black text-yellow-400">BJ!</span>}
                              {hand.isBust && <span className="text-sm font-black text-red-400">BUST</span>}
                            </div>
                          )}
                          <div className="relative flex">
                            {hand.cards.map((c, ci) => (
                              <div key={ci} className={ci > 0 ? 'card-overlap-player' : ''} style={{ zIndex: ci }}>
                                <PlayingCard card={indexToCard(c)} owner="player" className="" size="small" />
                              </div>
                            ))}
                            {/* BetChip — overlays top-right of 2nd hole card */}
                            {!hasSplit && seatTableBetWei(seat) > 0n && hand.cards.length >= 2 && (
                              <div className="absolute -top-2 -right-3" style={{ zIndex: 20 }}>
                                <BetChip
                                  label={formatChipLabel(Math.floor(Number(formatEther(seatTableBetWei(seat)))))}
                                  size="clamp(32px, 6vw, 40px)"
                                  chipSrc="/morbius/MorbiusChip.png"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        {hasSplit && phase !== 'betting' && BigInt(hand.betAmount || '0') > 0n && (
                          <span className="mt-0.5 text-[10px] font-bold text-white/70" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                            {formatMorbius(hand.betAmount)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Placeholder cards when seated but no hand yet */
                <div className="flex min-h-[80px] items-center justify-center gap-1">
                  {phase !== 'waiting' && phase !== 'betting' ? null : (
                    <>
                      <div className="h-2.5 w-2.5 rounded-full border border-dashed border-white/20 bg-white/[0.02]" />
                      <div className="h-2.5 w-2.5 rounded-full border border-dashed border-white/20 bg-white/[0.02]" />
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Player identity tag — separate from card stack so it stays stable across hand transitions */}
            <div
              className={`mt-1 pointer-events-auto w-[148px] sm:w-[168px] rounded-md border border-cyan-500/25 px-1.5 py-1 text-center ${
                canOpenProfile ? 'cursor-pointer' : ''
              }`}
              style={{
                background: 'rgba(0, 0, 0, 0.9)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 -4px 14px rgba(0,0,0,0.45)',
              }}
              onClick={() => {
                if (canOpenProfile && seat?.playerAddress) onOpenProfile(seat.playerAddress);
              }}
              onKeyDown={(e) => {
                if (canOpenProfile && (e.key === 'Enter' || e.key === ' ') && seat?.playerAddress) {
                  e.preventDefault();
                  onOpenProfile(seat.playerAddress);
                }
              }}
              role={canOpenProfile ? 'button' : undefined}
              tabIndex={canOpenProfile ? 0 : undefined}
            >
              <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-white/95 sm:text-[11px]">
                {seat?.displayName ?? (seat?.playerAddress ? `${seat.playerAddress.slice(0, 6)}…` : '—')}
                {isMe && <span className="ml-1 text-[9px] text-cyan-200/90">(you)</span>}
              </span>
              {balanceLabel != null && (
                <span className="mt-0.5 block text-[10px] tabular-nums text-white/85">{balanceLabel}</span>
              )}
              {seat && (seat.consecutiveTimeouts ?? 0) > 0 && (
                <span
                  className={`mt-0.5 inline-block max-w-full rounded px-1 py-0.5 text-[8px] font-semibold leading-tight ${
                    (seat.consecutiveTimeouts ?? 0) >= afkTimeoutsBeforeKick - 1
                      ? 'border border-orange-500/40 bg-orange-950/60 text-orange-100/95'
                      : 'border border-cyan-500/25 bg-slate-900/80 text-cyan-100/90'
                  }`}
                  title="Missed betting or turn timeouts. At 3 you are removed and chips refunded."
                >
                  {(seat.consecutiveTimeouts ?? 0)}/{afkTimeoutsBeforeKick} idle{isMe ? ' — act' : ''}
                </span>
              )}
              {showOutcomeLabel && seatOutcomeLabel && (
                <div className={`mt-0.5 text-[10px] font-bold leading-tight ${seatOutcomeLabel.cls}`}>
                  {seatOutcomeLabel.text}
                </div>
              )}
            </div>

            {/* BetChip for split hands — shown below cards */}
            {seat && seat.hands.length > 1 && seatTableBetWei(seat) > 0n && (
              <div className="mt-1 flex flex-col items-center">
                <BetChip
                  label={formatChipLabel(Math.floor(Number(formatEther(seatTableBetWei(seat)))))}
                  size="clamp(44px, 8vw, 56px)"
                  chipSrc="/morbius/MorbiusChip.png"
                />
              </div>
            )}

            {seat?.seatStatus === 'sitting_out' && (
              <span className="text-[9px] text-white/30">sitting out</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

