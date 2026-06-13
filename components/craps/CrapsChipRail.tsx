'use client';

// Denomination selector for the controls rail. Each chip is rendered with the
// canonical BetChip primitive — same as poker / blackjack / keno — so tier color
// comes for free. The selected chip rises and gets a cyan ring to match the
// arcade2 "Deep-Sea Neon" theme (keno2 parity).

import { BetChip, formatChipLabel } from '@/components/ui/BetChip';
import { cn } from '@/lib/utils';
import { CRAPS_CHIP_LADDER } from '@/lib/craps-types';
import { crapsChipTier } from '@/lib/craps-chip-tiers';

interface Props {
  activeChip: number;
  onSelect: (amount: number) => void;
}

export function CrapsChipRail({ activeChip, onSelect }: Props) {
  return (
    <div className="flex justify-center gap-6 flex-wrap py-2">
      {CRAPS_CHIP_LADDER.map((amount) => {
        const active = activeChip === amount;
        return (
          <button
            key={amount}
            onClick={() => onSelect(amount)}
            aria-label={`Select ${amount} chip`}
            className={cn(
              'group relative flex items-center justify-center transform transition-all duration-300 cursor-pointer bg-transparent border-0 p-0',
              active ? '-translate-y-2 scale-110 z-10' : 'hover:-translate-y-1 z-0',
            )}
          >
            <span
              className={cn(
                'absolute border-2 rounded-full inset-[-5px] transition-all duration-300 pointer-events-none',
                active
                  ? 'border-cyan-400 opacity-100 shadow-[0_0_18px_rgba(34,211,238,0.6)]'
                  : 'border-transparent opacity-0',
              )}
            />
            <BetChip label={formatChipLabel(amount)} amount={amount} tier={crapsChipTier(amount)} size={48} />
            <span
              className={cn(
                'absolute transition-all duration-300 text-[10px] uppercase font-semibold whitespace-nowrap arc-mono tracking-widest',
                active ? '-bottom-6 text-cyan-300' : '-bottom-5 text-slate-500',
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
