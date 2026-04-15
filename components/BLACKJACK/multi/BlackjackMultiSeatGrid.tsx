'use client';

import type { BJMultiSeatState } from '@/lib/websocket-client';
import { BlackjackMultiSeat } from '@/components/BLACKJACK/multi/BlackjackMultiSeat';

// ── Canvas coordinate system ─────────────────────────────────────────────────
// All coordinates are in the logical 800×450 canvas space.
// `cx`    — horizontal center of the seat in canvas px.
// `floorY` — Y position of the bottom edge of the name tag in canvas px.
//            Expressed as distance from the TOP of the canvas (same axis as CSS top).
// `angle` — rotation of the whole seat column in degrees (positive = clockwise).
//            The name tag counter-rotates by the same amount so text stays upright.

const SEATS = [
  { cx: 140, floorY: 415, angle: 18 },   // left
  { cx: 400, floorY: 428, angle: 0 },    // center (slightly lower = reads as closer)
  { cx: 660, floorY: 415, angle: -18 },  // right
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
  turnStartedAt: string | null;
  bettingStartedAt: string | null;
  onTakeSeat: (position: number) => void;
  onOpenProfile: (address: string) => void;
  onLeaveSeat?: () => void;
  onToggleSoundPanel?: () => void;
  onSendChatMessage?: (msg: string) => void;
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
  turnStartedAt,
  bettingStartedAt,
  onTakeSeat,
  onOpenProfile,
  onLeaveSeat,
  onToggleSoundPanel,
  onSendChatMessage,
}: BlackjackMultiSeatGridProps) {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
      {POSITIONS.map((pos) => {
        const seat = seats[pos];
        const isEmpty = !seat?.playerAddress;
        const isMe = seat?.playerAddress?.toLowerCase() === addressLower;
        const { cx, floorY, angle } = SEATS[pos];

        return (
          // Positioned by bottom-center of the name tag.
          // translateX(-50%) centers the flex column on cx.
          // translateY(-100%) makes the column hang upward from floorY
          // so the name tag's bottom edge lands exactly at floorY.
          <div
            key={pos}
            className="absolute"
            style={{
              left: cx,
              top: floorY,
              transform: 'translateX(-50%) translateY(-100%)',
              pointerEvents: 'auto',
            }}
          >
            <BlackjackMultiSeat
              seat={seat ?? null}
              position={pos}
              angle={angle}
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
              turnStartedAt={actingSeatPosition === pos && phase === 'playing' ? turnStartedAt : null}
              bettingStartedAt={phase === 'betting' && seat?.playerAddress ? bettingStartedAt : null}
              onLeaveSeat={isMe ? onLeaveSeat : undefined}
              onToggleSoundPanel={isMe ? onToggleSoundPanel : undefined}
              onSendChatMessage={isMe ? onSendChatMessage : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
