'use client';

/**
 * PlayingCard — a single felt card, faithful to the lab's `.card` (cream face,
 * red for hearts/diamonds, rank top + big suit glyph), plus a face-down "back"
 * (cyan ✦ on a deep-sea gradient) for the dealer's sealed cards.
 *
 * `cardIdx` is the shared 0..51 index; `faceDown` shows the back. `deal`
 * applies the springy deal-in animation; `win` rings the card in cyan.
 */

import { cardRankLabel, cardSuitGlyph, cardIsRed } from '@/lib/three-card-poker-client';

interface PlayingCardProps {
  cardIdx?: number;
  faceDown?: boolean;
  deal?: boolean;
  win?: boolean;
}

export function PlayingCard({ cardIdx, faceDown, deal, win }: PlayingCardProps) {
  const dealCls = deal ? 'tcp-card-deal' : '';
  const winCls = win ? 'ring-2 ring-cyan-400 shadow-[0_0_18px_-4px_rgba(34,211,238,0.9)]' : '';

  if (faceDown || cardIdx == null) {
    return (
      <div
        className={`tcp-card flex items-center justify-center rounded-lg text-[22px] text-cyan-300 ${dealCls} ${winCls}`}
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
  return (
    <div
      className={`tcp-card flex flex-col items-center justify-center rounded-lg font-semibold ${dealCls} ${winCls}`}
      style={{
        background: '#f2efe6',
        color: red ? '#b3261e' : '#1f2937',
        border: '0.5px solid rgba(0,0,0,.3)',
        boxShadow: '0 3px 8px -3px rgba(0,0,0,.6)',
      }}
    >
      <span className="leading-none" style={{ fontSize: 'clamp(14px,3.6vw,18px)' }}>
        {cardRankLabel(cardIdx)}
      </span>
      <span className="leading-[1.1]" style={{ fontSize: 'clamp(17px,4.8vw,25px)' }}>
        {cardSuitGlyph(cardIdx)}
      </span>
    </div>
  );
}
