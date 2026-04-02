'use client';

import React from 'react';
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
  onTakeSeat,
  onOpenProfile,
}: BlackjackMultiSeatGridProps) {
  // Keep side-seat framing stable across viewport sizes.
  const clampedScale = Math.max(0.72, Math.min(1, nudgeScale));
  const sideNudgeX = Math.round(42 * clampedScale);
  const sideNudgeY = Math.round(66 * clampedScale);

  return (
    <div
      className="grid w-full max-w-4xl grid-cols-3 gap-2 sm:gap-3 md:gap-4 mx-auto"
      style={{ transform: 'translateY(6px)', padding: '0 4%' }}
    >
      {POSITIONS.map((pos) => {
        const seat = seats[pos];
        const isEmpty = !seat?.playerAddress;
        const isMe = seat?.playerAddress?.toLowerCase() === addressLower;
        const align =
          pos === 0 ? 'flex justify-start' : pos === 2 ? 'flex justify-end' : 'flex justify-center';
        const seatNudge =
          pos === 0 ? { transform: `translate(-${sideNudgeX}px, -${sideNudgeY}px)` } :
          pos === 2 ? { transform: `translate(${sideNudgeX}px, -${sideNudgeY}px)` } : {};
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

