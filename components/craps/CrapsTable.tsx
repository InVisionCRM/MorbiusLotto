'use client';

// The felt — Place boxes (4-10), Don't Pass, Field, Any 7 / Any Craps, Pass Line.
// Each zone shows its current bet as a BetChip (tier-colored by amount).
// Click a zone to drop the activeChip there; activeChip comes from the rail.

import { cn } from '@/lib/utils';
import { BetType, Phase } from '@/lib/craps-types';
import { BetChip, formatChipLabel } from '@/components/ui/BetChip';

interface Props {
  bets: Record<string, number>;
  point: number | null;
  phase: Phase;
  activeChip: number;
  placeBet: (type: BetType, amount: number) => void;
  isRolling: boolean;
}

function ZoneChip({ amount }: { amount: number | undefined }) {
  if (!amount) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <BetChip label={formatChipLabel(amount)} amount={amount} size={44} />
    </div>
  );
}

export function CrapsTable({ bets, point, phase, activeChip, placeBet, isRolling }: Props) {
  const click = (type: BetType) => {
    if (isRolling) return;
    placeBet(type, activeChip);
  };

  const PlaceBox = ({ num, label, type }: { num: number; label: string; type: BetType }) => (
    <div
      onClick={() => click(type)}
      className={cn(
        'h-16 sm:h-24 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-colors relative',
        point === num
          ? 'border-[#d4af37] bg-[#d4af37]/12'
          : 'border-[#d4af37]/15 bg-black/20 hover:bg-[#d4af37]/8',
      )}
    >
      {point === num && (
        <span className="text-[10px] font-bold text-[#d4af37] hidden sm:block absolute top-2 uppercase tracking-widest">
          On
        </span>
      )}
      <span
        className={cn(
          'text-xl sm:text-2xl font-black craps-display',
          point === num ? 'text-[#f4e8c1]' : 'text-[#f4e8c1]/35',
        )}
      >
        {label}
      </span>
      <ZoneChip amount={bets[type]} />
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col gap-2 font-bold select-none text-[#f4e8c1] relative">

      {/* Upper Table: Place Bets 4 / 5 / SIX / 8 / NINE / 10 */}
      <div className="grid grid-cols-6 gap-2">
        <PlaceBox num={4} label="4" type="PLACE_4" />
        <PlaceBox num={5} label="5" type="PLACE_5" />
        <PlaceBox num={6} label="SIX" type="PLACE_6" />
        <PlaceBox num={8} label="8" type="PLACE_8" />
        <PlaceBox num={9} label="NINE" type="PLACE_9" />
        <PlaceBox num={10} label="10" type="PLACE_10" />
      </div>

      {/* Center: Don't Pass + Field + Prop bets */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2 mt-2">

        <div className="sm:col-span-8 flex flex-col gap-2">
          <div
            onClick={() => click('DONT_PASS')}
            className={cn(
              'flex-1 min-h-[60px] bg-black/20 border border-dashed border-[#d4af37]/30 rounded-2xl flex items-center justify-center cursor-pointer hover:bg-[#d4af37]/8 transition-colors relative',
              phase === 'POINT' && 'opacity-50 cursor-not-allowed',
            )}
          >
            <h2 className="text-xl sm:text-3xl font-black opacity-15 tracking-[0.5em] sm:tracking-[1em] craps-display text-[#d4af37]">
              DON&apos;T PASS
            </h2>
            <ZoneChip amount={bets['DONT_PASS']} />
          </div>

          <div
            onClick={() => click('FIELD')}
            className="h-24 sm:h-32 bg-black/15 border border-[#d4af37]/20 rounded-2xl p-2 sm:p-4 flex flex-col justify-between cursor-pointer hover:bg-[#d4af37]/8 transition-colors relative"
          >
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#d4af37] text-center sm:text-left craps-display">
              The Field
            </span>
            <div className="flex justify-between items-center px-4 sm:px-8 mt-2 sm:mt-0 craps-display">
              <span className="text-xl font-bold text-[#f4e8c1]">2</span>
              <span className="text-sm sm:text-xl font-bold opacity-50 italic text-[#f4e8c1]">3 · 4 · 9 · 10 · 11</span>
              <span className="text-xl font-bold text-[#f4e8c1]">12</span>
            </div>
            <ZoneChip amount={bets['FIELD']} />
          </div>
        </div>

        <div className="sm:col-span-4 bg-black/30 border border-[#d4af37]/25 rounded-2xl p-2 sm:p-4 grid grid-cols-2 gap-2">
          <div
            onClick={() => click('ANY_7')}
            className="bg-black/30 rounded-lg flex flex-col items-center justify-center border border-[#d4af37]/15 cursor-pointer hover:bg-[#d4af37]/8 transition-colors relative min-h-[60px]"
          >
            <div className="text-[9px] text-[#f4e8c1]/50 mb-1 tracking-widest">ANY 7</div>
            <div className="text-sm sm:text-lg font-bold text-[#f4e8c1] craps-display">4 to 1</div>
            <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 pointer-events-none opacity-30 text-[#d4af37] font-bold text-3xl craps-display">7</div>
            <ZoneChip amount={bets['ANY_7']} />
          </div>
          <div
            onClick={() => click('ANY_CRAPS')}
            className="bg-black/30 rounded-lg flex flex-col items-center justify-center border border-[#d4af37]/15 cursor-pointer hover:bg-[#d4af37]/8 transition-colors relative min-h-[60px]"
          >
            <div className="text-[9px] text-[#f4e8c1]/50 mb-1 tracking-widest">ANY CRAPS</div>
            <div className="text-sm sm:text-lg font-bold text-[#f4e8c1] craps-display">7 to 1</div>
            <ZoneChip amount={bets['ANY_CRAPS']} />
          </div>
          <div className="col-span-2 bg-[#d4af37]/12 rounded-lg flex flex-col items-center justify-center border border-[#d4af37]/40 min-h-[40px] relative mt-2">
            <span className="text-xs sm:text-sm font-black tracking-[0.3em] text-[#d4af37] craps-display">PROPOSITIONS</span>
          </div>
        </div>
      </div>

      {/* Pass Line */}
      <div
        onClick={() => click('PASS')}
        className={cn(
          'mt-2 h-16 sm:h-20 bg-[#d4af37]/12 border-2 border-[#d4af37] rounded-2xl flex items-center justify-center relative overflow-hidden cursor-pointer hover:bg-[#d4af37]/20 transition-colors',
          phase === 'POINT' && 'opacity-50 cursor-not-allowed',
        )}
      >
        <div className="absolute inset-0 opacity-15 flex justify-around items-center craps-display">
          <span className="text-2xl sm:text-4xl font-black hidden sm:block text-[#d4af37]">PASS LINE</span>
          <span className="text-2xl sm:text-4xl font-black text-[#d4af37]">PASS LINE</span>
          <span className="text-2xl sm:text-4xl font-black hidden md:block text-[#d4af37]">PASS LINE</span>
        </div>
        <ZoneChip amount={bets['PASS']} />
      </div>
    </div>
  );
}
