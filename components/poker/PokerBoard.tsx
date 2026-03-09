'use client';

import React from 'react';
import { formatEther } from 'viem';
import { CardDisplay } from './CardDisplay';

export interface PokerBoardProps {
  communityCards: number[];
  pot: string;
}

function formatChips(wei: string): string {
  try {
    const num = Number(formatEther(BigInt(wei)));
    return Number.isInteger(num)
      ? num.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return wei;
  }
}

export function PokerBoard({ communityCards, pot }: PokerBoardProps) {
  const potNum = (() => { try { return Number(formatEther(BigInt(pot))); } catch { return 0; } })();

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-2">
      {potNum > 0 && (
        <div className="flex flex-col items-center">
          <span className="text-[var(--poker-danger)] text-[10px] tracking-[var(--poker-tracking)] uppercase">Total_Hash</span>
          <span className="text-[var(--poker-text)] text-xl sm:text-2xl font-bold tabular-nums drop-shadow-[0_0_10px_var(--poker-accent)]">
            {formatChips(pot)}
          </span>
        </div>
      )}
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <CardDisplay key={i} cardIndex={communityCards[i]} small />
        ))}
      </div>
    </div>
  );
}
