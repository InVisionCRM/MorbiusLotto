'use client';

import type { BJMultiSeatState } from '@/lib/websocket-client';
import { BlackjackMultiSeat } from '@/components/BLACKJACK/multi/BlackjackMultiSeat';

const POSITIONS = [0, 1, 2] as const;

type BlackjackMultiSeatGridProps = {
  seats: [BJMultiSeatState | null, BJMultiSeatState | null, BJMultiSeatState | null];
  addressLower?: string;
  phase: string;
  actingSeatPosition: number | null;
  myPosition: number | null;
  wsConnected: boolean;
  afkTimeoutsBeforeKick: number;
  myBalanceLabel: string;
  showOutcomeLabel: boolean;
  nudgeScale?: number;
  /** When true, collapses the outward nudge so seats pull inward toward center */
  fullscreen?: boolean;
  onTakeSeat: (position: number) => void;
  onOpenProfile: (address: string) => void;
};

export function BlackjackMultiSeatGrid({
  seats,
  addressLower,
  phase,
  actingSeatPosition,
  myPosition,
  wsConnected,
  afkTimeoutsBeforeKick,
  myBalanceLabel,
  showOutcomeLabel,
  nudgeScale = 1,
  fullscreen = false,
  onTakeSeat,
  onOpenProfile,
}: BlackjackMultiSeatGridProps) {
  // In fullscreen, pull seats inward (positive X nudge toward center, smaller Y).
  // In normal mode, push side seats outward to frame the table edges.
  const clampedScale = Math.max(0.72, Math.min(1, nudgeScale));
  const sideNudgeX = fullscreen ? -60 : Math.round(42 * clampedScale);
  // Strong negative Y lifts left/right seats — previous values sat too low vs the table.
  const sideNudgeY = fullscreen ? Math.round(56 * clampedScale) : Math.round(118 * clampedScale);

  return (
    <div
      className="grid w-full max-w-4xl grid-cols-3 gap-2 sm:gap-3 md:gap-4 mx-auto"
      style={{ padding: fullscreen ? '0 12%' : '0 4%' }}
    >
      {POSITIONS.map((pos) => {
        const seat = seats[pos];
        const isEmpty = !seat?.playerAddress;
        const isMe = seat?.playerAddress?.toLowerCase() === addressLower;
        const align =
          pos === 0
            ? 'flex justify-start items-start'
            : pos === 2
              ? 'flex justify-end items-start'
              : 'flex justify-center';
        // Normal: side seats pushed outward. Fullscreen: side seats pulled inward (negative sideNudgeX = toward center).
        const seatNudge =
          pos === 0 ? { transform: `translate(${fullscreen ? sideNudgeX : -sideNudgeX}px, -${sideNudgeY}px)` } :
          pos === 2 ? { transform: `translate(${fullscreen ? -sideNudgeX : sideNudgeX}px, -${sideNudgeY}px)` } : {};
        return (
          <div key={pos} className={`min-w-0 ${align}`} style={seatNudge}>
            <BlackjackMultiSeat
              seat={seat ?? null}
              position={pos}
              isMe={!!isMe}
              isEmpty={isEmpty}
              isActing={actingSeatPosition === pos && phase === 'playing'}
              phase={phase}
              onTakeSeat={() => onTakeSeat(pos)}
              canTakeSeat={!!addressLower && myPosition === null && isEmpty && wsConnected}
              afkTimeoutsBeforeKick={afkTimeoutsBeforeKick}
              balanceLabel={isMe ? myBalanceLabel : null}
              onOpenProfile={onOpenProfile}
              showOutcomeLabel={showOutcomeLabel}
            />
          </div>
        );
      })}
    </div>
  );
}

