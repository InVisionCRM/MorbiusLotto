'use client';

// Denomination selector at the bottom of the screen. Each chip is rendered with
// the canonical BetChip primitive — same as poker / blackjack / roulette — so
// tier color comes for free. The selected chip rises and gets a gold ring.

import { BetChip, formatChipLabel } from '@/components/ui/BetChip';
import { cn } from '@/lib/utils';
import { CRAPS_CHIP_LADDER } from '@/lib/craps-types';

interface Props {
  activeChip: number;
  onSelect: (amount: number) => void;
}

export function CrapsChipRail({ activeChip, onSelect }: Props) {
  return (
    <div className="flex-1 flex justify-center gap-8 flex-wrap mt-4 mb-4 md:my-0">
      {CRAPS_CHIP_LADDER.map((amount) => {
        const active = activeChip === amount;
        return (
          <button
            key={amount}
            onClick={() => onSelect(amount)}
            aria-label={`Select ${amount} chip`}
            className={cn(
              'group relative flex items-center justify-center transform transition-all duration-300 cursor-pointer bg-transparent border-0 p-0',
              active ? '-translate-y-3 scale-110 z-10' : 'hover:-translate-y-1 z-0',
            )}
          >
            <span
              className={cn(
                'absolute border-2 rounded-full inset-[-6px] transition-all duration-300 pointer-events-none',
                active
                  ? 'border-[#d4af37] opacity-100 shadow-[0_0_20px_rgba(212,175,55,0.55)]'
                  : 'border-transparent opacity-0',
              )}
            />
            <BetChip label={formatChipLabel(amount)} amount={amount} size={56} />
            <span
              className={cn(
                'absolute transition-all duration-300 text-[10px] uppercase font-black whitespace-nowrap drop-shadow-md craps-display tracking-widest',
                active ? '-bottom-10 text-[#d4af37]' : '-bottom-7 text-[#f4e8c1]/40',
              )}
            >
              {amount.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
