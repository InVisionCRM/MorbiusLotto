'use client';

// The felt — Place boxes (4-10), Don't Pass, Field, Any 7 / Any Craps, Pass Line.
// Deep-Sea Neon (arcade2) styling to match keno2: abyss panels, cyan accents,
// Chakra Petch (.arc-display) labels + JetBrains Mono (.arc-mono) numerals.
// Each zone shows its current bet as a BetChip (tier-colored by amount).
// Click a zone to drop the activeChip there; activeChip comes from the rail.

import { cn } from '@/lib/utils';
import { BetType, Phase } from '@/lib/craps-types';
import { BetChip, formatChipLabel } from '@/components/ui/BetChip';
import { crapsChipTier } from '@/lib/craps-chip-tiers';

/** What the rest of the table has riding on one zone. */
export interface RailZone {
  /** How many other players have chips here. */
  count: number;
  /** Their combined stake, in chips. */
  total: number;
}

interface Props {
  bets: Record<string, number>;
  point: number | null;
  phase: Phase;
  activeChip: number;
  placeBet: (type: BetType, amount: number) => void;
  isRolling: boolean;
  /**
   * Everyone else's action, per zone. Omitted by the solo game, which has no
   * rail — the felt is identical either way when this is absent.
   */
  railBets?: Partial<Record<BetType, RailZone>>;
  /** Open the per-seat breakdown for a zone. */
  onInspectZone?: (type: BetType) => void;
}

/**
 * The rail's action on a zone, tucked into its corner.
 *
 * Deliberately NOT drawn as chips. Eight players in the Field would be an
 * unreadable pile on a phone, and stacking them would fight the chip tiers,
 * which already use colour to mean amount. A count and a total says the same
 * thing in a corner, and the breakdown is a tap away for anyone who cares
 * which seat it was.
 *
 * It is its own click target: the zone itself drops a chip, so the badge has
 * to stop the event or reading the rail would cost you a bet.
 */
function RailBadge({
  info,
  onClick,
  variant = 'corner',
}: {
  info: RailZone | undefined;
  onClick?: () => void;
  /**
   * 'corner' suits the wide zones. The small ones — place boxes, Any 7, Any
   * Craps — have a numeral or a label dead centre and a chip on top of that,
   * so a corner badge lands on the very thing you are trying to read. There
   * the rail goes on its own line along the bottom edge instead.
   */
  variant?: 'corner' | 'strip';
}) {
  if (!info || info.count === 0 || info.total <= 0) return null;
  const title = `${info.count} other player${info.count === 1 ? '' : 's'} — ${info.total.toLocaleString()} chips`;

  if (variant === 'strip') {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        className="arc-mono absolute inset-x-0 bottom-0 z-20 truncate rounded-b-xl bg-amber-500/15 px-1 py-[1px] text-center text-[8px] font-bold leading-tight text-amber-200/90 transition-colors hover:bg-amber-500/30 sm:text-[9px]"
        title={title}
      >
        +{info.count} · {info.total.toLocaleString()}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="arc-mono absolute right-1 top-1 z-20 rounded-md border border-amber-400/30 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold leading-none text-amber-200 transition-colors hover:bg-amber-500/30 sm:text-[10px]"
      title={title}
    >
      +{info.count} · {info.total.toLocaleString()}
    </button>
  );
}

function ZoneChip({ amount }: { amount: number | undefined }) {
  if (!amount) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <BetChip label={formatChipLabel(amount)} amount={amount} tier={crapsChipTier(amount)} size={44} />
    </div>
  );
}

export function CrapsTable({
  bets, point, phase, activeChip, placeBet, isRolling, railBets, onInspectZone,
}: Props) {
  const click = (type: BetType) => {
    if (isRolling) return;
    placeBet(type, activeChip);
  };

  const PlaceBox = ({ num, label, type }: { num: number; label: string; type: BetType }) => (
    <div
      onClick={() => click(type)}
      className={cn(
        'h-14 sm:h-24 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-colors relative',
        point === num
          ? 'border-cyan-400 bg-cyan-500/15 shadow-[0_0_22px_-6px_rgba(34,211,238,0.65)]'
          : 'border-cyan-500/15 bg-[#081420]/60 hover:bg-cyan-500/10',
      )}
    >
      {point === num && (
        <span className="text-[10px] font-semibold text-cyan-300 hidden sm:block absolute top-2 uppercase tracking-[0.2em] arc-display">
          On
        </span>
      )}
      <span
        className={cn(
          'text-base sm:text-2xl arc-mono font-bold',
          point === num ? 'text-cyan-100' : 'text-slate-400',
        )}
      >
        {label}
      </span>
      <ZoneChip amount={bets[type]} />
      <RailBadge info={railBets?.[type]} onClick={() => onInspectZone?.(type)} variant="strip" />
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col gap-1.5 sm:gap-2 select-none text-slate-200 relative">

      {/* Upper Table: Place Bets 4 / 5 / SIX / 8 / NINE / 10 */}
      <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
        <PlaceBox num={4} label="4" type="PLACE_4" />
        <PlaceBox num={5} label="5" type="PLACE_5" />
        <PlaceBox num={6} label="SIX" type="PLACE_6" />
        <PlaceBox num={8} label="8" type="PLACE_8" />
        <PlaceBox num={9} label="NINE" type="PLACE_9" />
        <PlaceBox num={10} label="10" type="PLACE_10" />
      </div>

      {/* Center: Don't Pass + Field + Prop bets */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-1.5 sm:gap-2 mt-1 sm:mt-2">

        <div className="sm:col-span-8 flex flex-col gap-1.5 sm:gap-2">
          <div
            onClick={() => click('DONT_PASS')}
            className={cn(
              'flex-1 min-h-[42px] sm:min-h-[60px] bg-[#081420]/50 border border-dashed border-cyan-500/30 rounded-2xl flex items-center justify-center cursor-pointer hover:bg-cyan-500/10 transition-colors relative',
              phase === 'POINT' && 'opacity-50 cursor-not-allowed',
            )}
          >
            <h2 className="text-[11px] sm:text-3xl font-bold opacity-20 tracking-[0.3em] sm:tracking-[1em] arc-display text-cyan-300">
              DON&apos;T PASS
            </h2>
            <ZoneChip amount={bets['DONT_PASS']} />
            <RailBadge info={railBets?.['DONT_PASS']} onClick={() => onInspectZone?.('DONT_PASS')} />
          </div>

          <div
            onClick={() => click('FIELD')}
            className="h-16 sm:h-32 bg-[#081420]/40 border border-cyan-500/15 rounded-2xl p-2 sm:p-4 flex flex-col justify-between cursor-pointer hover:bg-cyan-500/10 transition-colors relative"
          >
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300 text-center sm:text-left arc-display">
              The Field
            </span>
            <div className="flex justify-between items-center px-2 sm:px-8 mt-1 sm:mt-0 arc-mono">
              <span className="text-base sm:text-xl font-bold text-slate-200">2</span>
              <span className="text-[11px] sm:text-xl font-medium opacity-60 text-slate-300">3 · 4 · 9 · 10 · 11</span>
              <span className="text-base sm:text-xl font-bold text-slate-200">12</span>
            </div>
            <ZoneChip amount={bets['FIELD']} />
            <RailBadge info={railBets?.['FIELD']} onClick={() => onInspectZone?.('FIELD')} />
          </div>
        </div>

        <div className="sm:col-span-4 bg-[#050E16]/70 border border-cyan-500/20 rounded-2xl p-1.5 sm:p-4 grid grid-cols-2 gap-1.5 sm:gap-2">
          <div
            onClick={() => click('ANY_7')}
            className="bg-[#081420]/60 rounded-lg flex flex-col items-center justify-center border border-cyan-500/15 cursor-pointer hover:bg-cyan-500/10 transition-colors relative min-h-[54px] pb-2.5 sm:min-h-[64px] sm:pb-3"
          >
            <div className="text-[9px] text-slate-500 mb-1 tracking-[0.2em] arc-display">ANY 7</div>
            <div className="text-sm sm:text-lg font-bold text-slate-200 arc-mono">4 to 1</div>
            <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 pointer-events-none opacity-25 text-cyan-400 font-bold text-3xl arc-mono">7</div>
            <ZoneChip amount={bets['ANY_7']} />
            <RailBadge info={railBets?.['ANY_7']} onClick={() => onInspectZone?.('ANY_7')} variant="strip" />
          </div>
          <div
            onClick={() => click('ANY_CRAPS')}
            className="bg-[#081420]/60 rounded-lg flex flex-col items-center justify-center border border-cyan-500/15 cursor-pointer hover:bg-cyan-500/10 transition-colors relative min-h-[54px] pb-2.5 sm:min-h-[64px] sm:pb-3"
          >
            <div className="text-[9px] text-slate-500 mb-1 tracking-[0.2em] arc-display">ANY CRAPS</div>
            <div className="text-sm sm:text-lg font-bold text-slate-200 arc-mono">7 to 1</div>
            <ZoneChip amount={bets['ANY_CRAPS']} />
            <RailBadge info={railBets?.['ANY_CRAPS']} onClick={() => onInspectZone?.('ANY_CRAPS')} variant="strip" />
          </div>
          <div className="col-span-2 bg-cyan-500/10 rounded-lg flex flex-col items-center justify-center border border-cyan-500/30 min-h-[26px] sm:min-h-[40px] relative mt-1 sm:mt-2">
            <span className="text-xs sm:text-sm font-semibold tracking-[0.3em] text-cyan-300 arc-display">PROPOSITIONS</span>
          </div>
        </div>
      </div>

      {/* Pass Line */}
      <div
        onClick={() => click('PASS')}
        className={cn(
          'mt-1 sm:mt-2 h-12 sm:h-20 bg-cyan-500/10 border-2 border-cyan-400 rounded-2xl flex items-center justify-center relative overflow-hidden cursor-pointer hover:bg-cyan-500/20 transition-colors shadow-[0_0_28px_-10px_rgba(34,211,238,0.7)]',
          phase === 'POINT' && 'opacity-50 cursor-not-allowed',
        )}
      >
        <div className="absolute inset-0 opacity-20 flex justify-around items-center arc-display">
          <span className="text-lg sm:text-4xl font-bold hidden sm:block text-cyan-300">PASS LINE</span>
          <span className="text-lg sm:text-4xl font-bold text-cyan-300">PASS LINE</span>
          <span className="text-lg sm:text-4xl font-bold hidden md:block text-cyan-300">PASS LINE</span>
        </div>
        <ZoneChip amount={bets['PASS']} />
            <RailBadge info={railBets?.['PASS']} onClick={() => onInspectZone?.('PASS')} />
      </div>
    </div>
  );
}
