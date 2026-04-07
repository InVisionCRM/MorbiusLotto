'use client';

import type { BJMultiSeatState } from '@/lib/websocket-client';
import { BlackjackMultiSeat } from '@/components/BLACKJACK/multi/BlackjackMultiSeat';

// All coordinates are in the 800×450 canvas space.
// SEAT_ANCHORS is the top-left origin of each seat's absolute container.
// CARD_OFFSETS and TAG_OFFSETS are pixel offsets from that origin.
const SEAT_ANCHORS = [
  { x: 80,  y: 200 }, // left seat
  { x: 340, y: 260 }, // center seat
  { x: 600, y: 200 }, // right seat
] as const;

// Where the card stack appears relative to the seat anchor.
const CARD_OFFSETS = [
  { x: 0, y: 0 }, // left
  { x: 0, y: 0 }, // center
  { x: 0, y: 0 }, // right
] as const;

// Where the player name tag appears relative to the seat anchor.
const TAG_OFFSETS = [
  { x: -10, y: 180 }, // left
  { x: -10, y: 180 }, // center
  { x: -10, y: 180 }, // right
] as const;

// Where the bet chip appears relative to the seat anchor.
const CHIP_OFFSETS = [
  { x: 40, y: 60 }, // left
  { x: 40, y: 60 }, // center
  { x: 40, y: 60 }, // right
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
