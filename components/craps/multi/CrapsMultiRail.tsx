'use client';

/**
 * The rail — everyone standing at the table.
 *
 * This is the part a solo craps game can't have, so it earns its space: who is
 * here, who has the dice, what each of them has riding on this throw, and what
 * the last one did to them. Same Deep-Sea Neon language as the felt.
 */

import { cn } from '@/lib/utils';
import { Dices } from 'lucide-react';
import type { CrapsMultiSeat } from '@/lib/craps-multi-client';
import { crapsSeatLabel } from '@/lib/craps-multi-client';

interface Props {
  seats: CrapsMultiSeat[];
  /** The viewer's own wallet, so their seat reads as "you". */
  myAddress?: string | null;
  /** Called when an empty seat is clicked. Omit to make the rail read-only. */
  onTakeSeat?: (position: number) => void;
  /** True while a join request is in flight, so seats stop accepting clicks. */
  busy?: boolean;
}

function SeatCard({
  seat, isMe, onTakeSeat, busy,
}: {
  seat: CrapsMultiSeat;
  isMe: boolean;
  onTakeSeat?: (position: number) => void;
  busy?: boolean;
}) {
  const empty = !seat.playerAddress;

  if (empty) {
    return (
      <button
        type="button"
        disabled={!onTakeSeat || busy}
        onClick={() => onTakeSeat?.(seat.position)}
        className={cn(
          'h-[86px] rounded-xl border border-dashed border-cyan-500/20 bg-[#081420]/40',
          'flex flex-col items-center justify-center gap-1 transition-colors',
          onTakeSeat && !busy
            ? 'cursor-pointer hover:border-cyan-400/50 hover:bg-cyan-500/10'
            : 'cursor-default opacity-60',
        )}
      >
        <span className="arc-display text-[10px] uppercase tracking-[0.25em] text-slate-500">
          Seat {seat.position + 1}
        </span>
        {onTakeSeat && !busy && (
          <span className="arc-display text-[11px] font-semibold text-cyan-400">Sit down</span>
        )}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'h-[86px] rounded-xl border px-2 py-1.5 flex flex-col justify-between transition-colors relative',
        seat.isShooter
          ? 'border-amber-400/60 bg-amber-500/10 shadow-[0_0_22px_-8px_rgba(245,158,11,0.7)]'
          : isMe
            ? 'border-cyan-400/50 bg-cyan-500/10'
            : 'border-cyan-500/15 bg-[#081420]/60',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            'arc-display text-[11px] font-semibold truncate',
            seat.isShooter ? 'text-amber-200' : isMe ? 'text-cyan-200' : 'text-slate-300',
          )}
          title={seat.playerAddress ?? undefined}
        >
          {crapsSeatLabel(seat)}
        </span>
        {seat.isShooter && (
          <Dices className="w-3.5 h-3.5 shrink-0 text-amber-300" aria-label="Has the dice" />
        )}
      </div>

      {isMe && (
        <span className="absolute top-1.5 right-1.5 arc-display text-[8px] uppercase tracking-[0.2em] text-cyan-400/70">
          {seat.isShooter ? '' : 'You'}
        </span>
      )}

      <div className="flex items-end justify-between gap-1">
        <div className="flex flex-col leading-tight">
          <span className="arc-display text-[8px] uppercase tracking-[0.2em] text-slate-500">
            On the felt
          </span>
          <span className="arc-mono text-sm font-bold tabular-nums text-slate-200">
            {seat.atRisk.toLocaleString()}
          </span>
        </div>

        {/* The last throw's damage, from the seat's own row of the roll. */}
        {seat.lastWin > 0 ? (
          <span className="arc-mono text-xs font-bold text-amber-300">
            +{seat.lastWin.toLocaleString()}
          </span>
        ) : seat.lastLoss > 0 ? (
          <span className="arc-mono text-xs font-bold text-rose-400">
            −{seat.lastLoss.toLocaleString()}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function CrapsMultiRail({ seats, myAddress, onTakeSeat, busy }: Props) {
  const mine = myAddress?.toLowerCase() ?? null;
  // Once you're seated the empty chairs stop being buttons — you can't sit twice.
  const alreadySeated = seats.some((s) => s.playerAddress && s.playerAddress === mine);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {seats.map((seat) => (
        <SeatCard
          key={seat.position}
          seat={seat}
          isMe={!!mine && seat.playerAddress === mine}
          onTakeSeat={alreadySeated ? undefined : onTakeSeat}
          busy={busy}
        />
      ))}
    </div>
  );
}
