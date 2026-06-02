'use client';

/**
 * Portrait hero — faithful port of the poker-mobile-lab `.hero`. A centered bottom overlay
 * (NOT a ring seat): the two large hole cards rising from behind the dock, with a compact
 * "You" avatar + gold stack overlapping their base. Acting = cyan glow. Real avatar + card art.
 */

import { AvatarView } from '@/components/avatar';
import { formatChips } from '@/lib/format-poker-chips';
import type { PokerTableState } from '@/lib/websocket-client';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['C', 'D', 'H', 'S'];
const cardSrc = (i: number) => `/BlackJack/Cards/PNG/${RANKS[i % 13]}${SUITS[Math.floor(i / 13)]}.png`;

export interface PokerPortraitHeroProps {
  seat: PokerTableState['seats'][number] | null;
  holeCards?: number[] | null;
  isActing?: boolean;
}

export function PokerPortraitHero({ seat, holeCards, isActing }: PokerPortraitHeroProps) {
  if (!seat) return null;
  const cards = (holeCards ?? []).slice(0, 2);
  const stack = formatChips(seat.stack ?? '0');
  return (
    <div className={`pph${isActing ? ' acting' : ''}`} aria-hidden>
      {cards.length > 0 && (
        <div className="pph-cards">
          {cards.map((c, i) => <img key={i} className="pph-card" src={cardSrc(c)} alt="" />)}
        </div>
      )}
      <div className="pph-info">
        <div className="pph-ava">
          {seat.avatarConfig
            ? <AvatarView config={seat.avatarConfig} compact className="w-full h-full" />
            : <span>Y</span>}
        </div>
        <div className="pph-meta">
          <span className="pph-nm">You</span>
          <span className="pph-st">{stack}</span>
        </div>
      </div>
    </div>
  );
}
