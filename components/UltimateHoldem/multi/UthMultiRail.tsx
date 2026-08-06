'use client';

/**
 * The rail — every seat at the Hold'em table.
 *
 * Each seat shows its two cards, what it has committed, and where it stands on
 * this street. Other players' cards stay face down until showdown because the
 * SERVER withheld them; the felt simply renders what it was given, so there is
 * no way for a client bug to expose a hand.
 */

import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';
import { TableCard } from '@/components/shared/TableCard';
import type { TableCardBack } from '@/lib/table-card-backs';
import type { UthMultiSeat } from '@/lib/uth-multi-client';
import { uthSeatLabel } from '@/lib/uth-multi-client';

interface Props {
  seats: UthMultiSeat[];
  myAddress?: string | null;
  onTakeSeat?: (position: number) => void;
  busy?: boolean;
  back: TableCardBack;
  /** True once the hand is over, so results can show. */
  settled: boolean;
}

const CARD_W = 'clamp(30px, 7vw, 40px)';

function SeatCard({
  seat, isMe, onTakeSeat, busy, back, settled,
}: {
  seat: UthMultiSeat; isMe: boolean; onTakeSeat?: (p: number) => void;
  busy?: boolean; back: TableCardBack; settled: boolean;
}) {
  if (!seat.playerAddress) {
    return (
      <button
        type="button"
        disabled={!onTakeSeat || busy}
        onClick={() => onTakeSeat?.(seat.position)}
        className={cn(
          'flex h-[118px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-cyan-500/20 bg-[#081420]/40 transition-colors',
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

  const committed = seat.ante + seat.blind + seat.trips + seat.play;
  const net = seat.inRound && settled ? seat.totalPayout - committed : null;

  return (
    <div
      className={cn(
        'flex h-[118px] flex-col justify-between rounded-xl border px-2 py-1.5 transition-colors',
        seat.folded
          ? 'border-slate-800 bg-[#070d14]/70 opacity-60'
          : isMe
            ? 'border-cyan-400/50 bg-cyan-500/10'
            : 'border-cyan-500/15 bg-[#081420]/60',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            'arc-display truncate text-[11px] font-semibold',
            isMe ? 'text-cyan-200' : 'text-slate-300',
          )}
          title={seat.playerAddress}
        >
          {uthSeatLabel(seat)}
        </span>
        {/* Where this seat stands on the current street. */}
        {seat.inRound && !settled && (
          seat.folded ? (
            <X className="h-3.5 w-3.5 shrink-0 text-rose-400" aria-label="Folded" />
          ) : seat.play > 0 ? (
            <span className="arc-mono shrink-0 rounded bg-amber-500/20 px-1 text-[9px] font-bold text-amber-300">
              PLAY
            </span>
          ) : seat.acted ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-label="Checked" />
          ) : (
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-cyan-400" aria-label="Deciding" />
          )
        )}
      </div>

      <div className="flex justify-center gap-1">
        {seat.inRound ? (
          [0, 1].map((i) => (
            <TableCard
              key={i}
              width={CARD_W}
              cardIdx={seat.holeCards ? seat.holeCards[i] : undefined}
              faceDown={!seat.holeCards}
              back={back}
              dim={seat.folded}
            />
          ))
        ) : (
          [0, 1].map((i) => <TableCard key={i} placeholder width={CARD_W} />)
        )}
      </div>

      <div className="flex items-end justify-between gap-1 leading-tight">
        <span className="arc-mono text-[10px] text-slate-500">
          {seat.inRound ? committed.toLocaleString() : seat.pendingAnte > 0
            ? `${seat.pendingAnte.toLocaleString()} posted`
            : '—'}
        </span>
        {net !== null && (
          <span
            className={cn(
              'arc-mono text-[11px] font-bold',
              net > 0 ? 'text-amber-300' : net < 0 ? 'text-rose-400' : 'text-slate-500',
            )}
          >
            {net > 0 ? `+${net.toLocaleString()}` : net < 0 ? `−${Math.abs(net).toLocaleString()}` : '0'}
          </span>
        )}
      </div>
    </div>
  );
}

export function UthMultiRail({ seats, myAddress, onTakeSeat, busy, back, settled }: Props) {
  const mine = myAddress?.toLowerCase() ?? null;
  const alreadySeated = seats.some((s) => s.playerAddress && s.playerAddress === mine);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {seats.map((seat) => (
        <SeatCard
          key={seat.position}
          seat={seat}
          isMe={!!mine && seat.playerAddress === mine}
          onTakeSeat={alreadySeated ? undefined : onTakeSeat}
          busy={busy}
          back={back}
          settled={settled}
        />
      ))}
    </div>
  );
}
