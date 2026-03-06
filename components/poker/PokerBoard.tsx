'use client';

import React, { useMemo } from 'react';
import { formatEther } from 'viem';
import { CardDisplay } from './CardDisplay';

export interface PokerBoardProps {
  communityCards: number[];
  pot: string;
}

function safePot(pot: string): bigint {
  try {
    const cleaned = pot.trim();
    if (!cleaned) return 0n;
    if (!/^[0-9]+$/.test(cleaned)) return 0n;
    return BigInt(cleaned);
  } catch {
    return 0n;
  }
}

export function PokerBoard({ communityCards, pot }: PokerBoardProps) {
  const potAmt = useMemo(() => safePot(pot), [pot]);

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-2">
      <div className="rounded-xl sm:rounded-2xl border border-white/10 bg-slate-950/35 backdrop-blur-md px-1.5 py-1 sm:px-3 sm:py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_50px_rgba(0,0,0,0.55)]">
        <div className="flex gap-0.5 sm:gap-1.5 flex-wrap justify-center">
          {[0, 1, 2, 3, 4].map((i) => (
            <CardDisplay key={i} cardIndex={communityCards[i]} small />
          ))}
        </div>
      </div>

      {potAmt > 0n && (
        <div className="flex items-center gap-1 sm:gap-2">
          <div
            className="h-4 w-4 sm:h-6 sm:w-6 rounded-full border border-amber-300/40 bg-gradient-to-br from-amber-200/20 to-amber-600/10 shadow-[0_10px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)]"
            aria-hidden
          />
          <div className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-[12px] font-semibold tracking-wide text-amber-100 shadow-[0_12px_30px_rgba(0,0,0,0.55)]">
            POT {Number(formatEther(potAmt)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      )}
    </div>
  );
}
