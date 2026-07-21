'use client';

/**
 * PlayingCard — a single felt card for Pai Gow Poker, faithful to the lab's
 * `.card` (cream face, red for hearts/diamonds, rank top + big suit glyph),
 * plus a face-down "back" (cyan ✦ on a deep-sea gradient) for the dealer's
 * sealed cards and an empty dashed "slot" for the low row.
 *
 * `cardIdx` is the shared 0..51 index; `faceDown` shows the back; `slot` shows
 * the dashed placeholder. `deal` applies the springy deal-in animation; `pick`
 * makes it tappable (arrange step); `win` rings the card in cyan. Sized smaller
 * than TCP so seven cards fit a row.
 */

import { cardRankLabel, cardSuitGlyph, cardIsRed } from '@/lib/pai-gow-poker-client';

interface PlayingCardProps {
  cardIdx?: number;
  faceDown?: boolean;
  slot?: boolean;
  deal?: boolean;
  pick?: boolean;
  win?: boolean;
  onClick?: () => void;
}

export function PlayingCard({ cardIdx, faceDown, slot, deal, pick, win, onClick }: PlayingCardProps) {
  const dealCls = deal ? 'pgw-card-deal' : '';
  const winCls = win ? 'ring-2 ring-cyan-400 shadow-[0_0_16px_-4px_rgba(34,211,238,0.9)]' : '';

  if (slot) {
    return (
      <div
        className="pgw-card rounded-md border-[1.5px] border-dashed border-cyan-500/30"
        style={{ background: 'rgba(34,211,238,.04)' }}
        aria-hidden
      />
    );
  }

  if (faceDown || cardIdx == null) {
    return (
      <div
        className={`pgw-card flex items-center justify-center rounded-md text-[17px] text-cyan-300 ${dealCls} ${winCls}`}
        style={{
          background: 'linear-gradient(135deg,#0c2a38,#06121b)',
          boxShadow: 'inset 0 0 0 1px rgba(34,211,238,.3),0 3px 8px -3px rgba(0,0,0,.6)',
        }}
        aria-hidden
      >
        ✦
      </div>
    );
  }

  const red = cardIsRed(cardIdx);
  const pickCls = pick ? 'pgw-card-pick cursor-pointer' : '';
  return (
    <div
      className={`pgw-card flex flex-col items-center justify-center rounded-md font-semibold ${dealCls} ${pickCls} ${winCls}`}
      style={{
        background: '#f2efe6',
        color: red ? '#b3261e' : '#1f2937',
        border: '0.5px solid rgba(0,0,0,.3)',
        boxShadow: '0 3px 8px -3px rgba(0,0,0,.6)',
      }}
      onClick={pick ? onClick : undefined}
      role={pick ? 'button' : undefined}
      tabIndex={pick ? 0 : undefined}
      onKeyDown={
        pick && onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <span className="leading-none" style={{ fontSize: 'clamp(12px,2.9vw,15px)' }}>
        {cardRankLabel(cardIdx)}
      </span>
      <span className="leading-[1.1]" style={{ fontSize: 'clamp(13px,3.6vw,19px)' }}>
        {cardSuitGlyph(cardIdx)}
      </span>
    </div>
  );
}
