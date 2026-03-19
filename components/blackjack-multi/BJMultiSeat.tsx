'use client';

import React, { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { CardValue, Suit } from '@/app/BLACKJACK/types';
import PlayingCard from '@/components/BLACKJACK/PlayingCard';
import AvatarPreview from '@/components/poker/avatar/AvatarPreview';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { BJMultiSeatState, BJMultiHandObj } from '@/lib/websocket-client';
import { UserPlus, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

function indexToCard(idx: number) {
  const rank = (idx % 13) + 1;
  const suitIdx = Math.floor(idx / 13);
  const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  return { value: rank as CardValue, suit: SUITS[suitIdx] };
}

function formatMorbius(wei: string): string {
  try {
    const n = Number(formatEther(BigInt(wei)));
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } catch { return '0'; }
}

interface Props {
  seat: BJMultiSeatState | null;
  position: number;
  isMe: boolean;
  isEmpty: boolean;
  isActing: boolean;
  phase: string;
  onTakeSeat: () => void;
  canTakeSeat: boolean;
  turnStartedAt: string | null;
}

/** Simple 30-second countdown from turnStartedAt */
function TurnTimer({ turnStartedAt }: { turnStartedAt: string }) {
  const [remaining, setRemaining] = useState(30);
  useEffect(() => {
    const start = new Date(turnStartedAt).getTime();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      setRemaining(Math.max(0, Math.round(30 - elapsed)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [turnStartedAt]);
  return (
    <div className="flex items-center gap-1 text-yellow-400 text-[10px]">
      <Clock className="w-3 h-3" />
      {remaining}s
    </div>
  );
}

export default function BJMultiSeat({ seat, position, isMe, isEmpty, isActing, phase, onTakeSeat, canTakeSeat, turnStartedAt }: Props) {
  const resultColor = (result: string | null | undefined) => {
    if (result === 'win' || result === 'blackjack') return 'text-green-400';
    if (result === 'loss') return 'text-red-400';
    if (result === 'push') return 'text-yellow-400';
    return '';
  };

  return (
    <div className={`rounded-xl p-3 min-h-[160px] flex flex-col items-center gap-2 transition-all backdrop-blur-sm ${
      isMe ? 'border border-cyan-400/60 bg-black/50 shadow-[0_0_16px_rgba(34,211,238,0.15)]' :
      isActing ? 'border border-yellow-400/70 bg-black/50 shadow-[0_0_20px_rgba(250,204,21,0.2)]' :
      isEmpty ? 'border border-white/10 bg-black/20' :
      'border border-white/20 bg-black/40'
    }`}>
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <p className="text-[10px] text-slate-600">Seat {position + 1}</p>
          {canTakeSeat && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onTakeSeat}
              className="text-[11px] text-slate-400 hover:text-cyan-400 h-7 gap-1"
            >
              <UserPlus className="w-3 h-3" /> Sit here
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-700 shrink-0">
            {seat?.avatarConfig ? (
              <AvatarPreview
                config={seat.avatarConfig as unknown as AvatarConfig}
                emotion="neutral"
                className="w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                {seat?.displayName?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
          </div>

          {/* Name */}
          <p className={`text-[11px] font-medium truncate max-w-full ${isMe ? 'text-cyan-300' : 'text-slate-300'}`}>
            {seat?.displayName ?? (seat?.playerAddress ? seat.playerAddress.slice(0, 6) + '…' : '—')}
            {isMe && <span className="text-[9px] text-slate-500 ml-1">(you)</span>}
          </p>

          {/* Pending bet badge */}
          {seat && BigInt(seat.pendingBet) > 0n && phase === 'betting' && (
            <span className="text-[10px] text-yellow-400 bg-yellow-900/30 px-1.5 py-0.5 rounded">
              {formatMorbius(seat.pendingBet)} bet
            </span>
          )}

          {/* Turn timer */}
          {isActing && turnStartedAt && <TurnTimer turnStartedAt={turnStartedAt} />}

          {/* Cards */}
          {seat && seat.hands.length > 0 && (
            <div className="flex flex-col gap-1 w-full">
              {seat.hands.map((hand, hi) => (
                <div key={hi} className="flex flex-col items-center gap-1">
                  <div className="flex gap-0.5 flex-wrap justify-center">
                    {hand.cards.map((c, ci) => (
                      <PlayingCard key={ci} card={indexToCard(c)} owner="player" className="w-9 h-12 drop-shadow-md" />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className={hand.isBust ? 'text-red-400' : hand.isBlackjack ? 'text-yellow-300' : 'text-slate-300'}>
                      {hand.isBust ? 'Bust' : hand.isBlackjack ? 'BJ!' : hand.total}
                    </span>
                    {hand.result && (
                      <span className={`font-semibold ${resultColor(hand.result)}`}>
                        {hand.result === 'blackjack' ? 'Blackjack!' :
                         hand.result === 'win' ? 'Won' :
                         hand.result === 'loss' ? 'Lost' : 'Push'}
                      </span>
                    )}
                    {hand.result && hand.payout !== '0' && (
                      <span className="text-slate-400">+{formatMorbius(hand.payout)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sitting out indicator */}
          {seat?.seatStatus === 'sitting_out' && (
            <span className="text-[9px] text-slate-600">sitting out</span>
          )}
        </>
      )}
    </div>
  );
}
