'use client';

import { motion } from 'framer-motion';
import type { BJMultiSeatState } from '@/lib/websocket-client';
import type { Emotion } from '@/components/avatar';
import { BlackjackMultiSeat } from '@/components/BLACKJACK/multi/BlackjackMultiSeat';
import { POKER_DIRECTED_EMOTES, POKER_DIRECTED_EMOTE_FLY_MS, type PokerDirectedEmoteKind } from '@/lib/poker-directed-emotes';
import { useBlackjackTableLayout } from '@/components/BLACKJACK/BlackjackTableLayoutContext';

// Seat placement lives in the table layout (lib/blackjack-table-layout.ts) so a
// table theme can move seats without touching this component. Coordinates are
// in the layout's logical canvas space; see SeatPlacement for what each means.

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
  cardsExiting?: boolean;
  newPlayerCardByHandKey?: Record<string, Set<number>>;
  /** Per-player-address avatar emotion broadcast to the table (directed-emote reactions). */
  broadcastEmotionByAddress?: Record<string, Emotion>;
  /** In-flight directed emotes; each animates a bubble from the sender's seat to the target's. */
  directedEmotes?: Array<{ id: string; fromAddress: string; toAddress: string; kind: PokerDirectedEmoteKind }>;
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
  cardsExiting = false,
  newPlayerCardByHandKey,
  broadcastEmotionByAddress,
  directedEmotes,
}: BlackjackMultiSeatGridProps) {
  const layout = useBlackjackTableLayout();
  const SEATS = layout.seats;

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
              broadcastEmotion={seat?.playerAddress ? broadcastEmotionByAddress?.[seat.playerAddress.toLowerCase()] : undefined}
              cardsExiting={cardsExiting}
              newPlayerCardByHandKey={newPlayerCardByHandKey}
            />
          </div>
        );
      })}

      {/* Directed emotes — bubble pops above the sender, then arcs across to the target's seat. */}
      {directedEmotes?.map((de) => {
        const fromPos = seats.findIndex((s) => s?.playerAddress?.toLowerCase() === de.fromAddress.toLowerCase());
        const toPos = seats.findIndex((s) => s?.playerAddress?.toLowerCase() === de.toAddress.toLowerCase());
        const def = POKER_DIRECTED_EMOTES[de.kind];
        if (fromPos < 0 || toPos < 0 || !def) return null;
        const RAISE = layout.emotes.raise; // above the name-tag floor → roughly above the head
        const fromX = SEATS[fromPos].cx;
        const fromY = SEATS[fromPos].floorY - RAISE;
        const dx = SEATS[toPos].cx - fromX;
        const dy = (SEATS[toPos].floorY - RAISE) - fromY;
        const apexY = Math.min(0, dy) - layout.emotes.arcApex; // arc up and over
        return (
          <div
            key={de.id}
            className="absolute"
            style={{ left: fromX, top: fromY, transform: 'translate(-50%, -50%)', zIndex: 50, pointerEvents: 'none' }}
          >
            <motion.div
              initial={{ x: 0, y: 0, scale: 0.2, opacity: 0 }}
              animate={{
                x: [0, 0, dx * 0.5, dx, dx],
                y: [0, 0, apexY, dy, dy],
                scale: [0.2, 1.08, 1, 1.18, 0.55],
                opacity: [0, 1, 1, 1, 0],
              }}
              transition={{ duration: POKER_DIRECTED_EMOTE_FLY_MS / 1000, times: [0, 0.14, 0.5, 0.88, 1], ease: 'easeInOut' }}
            >
              <div
                style={{
                  position: 'relative', display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 14, whiteSpace: 'nowrap', fontWeight: 800,
                  background: 'linear-gradient(180deg, #ffffff, #e7f5ff)', color: '#0b3a52',
                  boxShadow: '0 10px 26px rgba(0,0,0,0.55), 0 0 0 1px rgba(56,189,248,0.5)',
                  fontSize: 14, letterSpacing: '0.3px',
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>{def.glyph}</span>
                {def.label ? <span>{def.label}</span> : null}
                <span
                  style={{
                    position: 'absolute', left: 16, bottom: -4, width: 9, height: 9,
                    background: '#e7f5ff', transform: 'rotate(45deg)', boxShadow: '1px 1px 0 rgba(56,189,248,0.3)',
                  }}
                />
              </div>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
