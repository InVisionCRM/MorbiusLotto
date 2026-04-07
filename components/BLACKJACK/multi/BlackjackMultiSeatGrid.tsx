'use client';

import type { BJMultiSeatState } from '@/lib/websocket-client';
import { BlackjackMultiSeat } from '@/components/BLACKJACK/multi/BlackjackMultiSeat';

// All coordinates are in the 800×450 canvas space.
// SEAT_ANCHORS is the origin point for each seat — cards, tag, and chip are all offset from here.

const SEAT_ANCHORS = [
  { x: 100, y: 270 }, // left seat
  { x: 326, y: 310 }, // center seat
  { x: 555, y: 270 }, // right seat
] as const;

// Card stack offset from seat anchor. (0,0) = cards start exactly at anchor.
const CARD_OFFSETS = [
  { x: 0, y: -80 }, // left
  { x: 0, y: -80 }, // center
  { x: 0, y: -80 }, // right
] as const;

// Player name tag offset from seat anchor.
const TAG_OFFSETS = [
  { x: -10, y: 0 }, // left
  { x: -10, y: 0 }, // center
  { x: -10, y: 0 }, // right
] as const;

// Bet chip offset from seat anchor.
const CHIP_OFFSETS = [
  { x: 30, y: -50 }, // left
  { x: 30, y: -50 }, // center
  { x: 30, y: -50 }, // right
] as const;

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
  onTakeSeat,
  onOpenProfile,
}: BlackjackMultiSeatGridProps) {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
      {POSITIONS.map((pos) => {
        const seat = seats[pos];
        const isEmpty = !seat?.playerAddress;
        const isMe = seat?.playerAddress?.toLowerCase() === addressLower;
        const { x, y } = SEAT_ANCHORS[pos];
        return (
          <div
            key={pos}
            className="absolute"
            style={{ left: x, top: y, pointerEvents: 'auto' }}
          >
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
              cardOffset={CARD_OFFSETS[pos]}
              tagOffset={TAG_OFFSETS[pos]}
              chipOffset={CHIP_OFFSETS[pos]}
            />
          </div>
        );
      })}
    </div>
  );
}
