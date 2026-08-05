'use client';

/**
 * TableCard — one felt card, shared by the house-banked poker games.
 *
 * Same visual language as the Three Card Poker / Pai Gow cards (cream face,
 * red pips for hearts and diamonds, rank above a big suit glyph, a cyan ✦ back
 * for sealed cards), but sized from a CSS custom property so a game can run a
 * five-card row narrower than a two-card one without forking the component.
 *
 * `cardIdx` is the shared 0..51 index; omit it (or pass `faceDown`) for a back.
 * `placeholder` draws the dashed empty seat used before a deal.
 */

import { cardRankLabel, cardSuitGlyph, cardIsRed } from '@/lib/playing-cards';

export interface TableCardProps {
  cardIdx?: number;
  faceDown?: boolean;
  /** Springy deal-in animation. */
  deal?: boolean;
  /** Ring the card as part of the winning side. */
  win?: boolean;
  /** Dim the card — used for board cards a street hasn't reached yet. */
  dim?: boolean;
  /** Dashed outline instead of a card, for an empty seat. */
  placeholder?: boolean;
  /** Card width. Defaults to the standard felt size. */
  width?: string;
}

const DEFAULT_WIDTH = 'clamp(44px, 12vw, 58px)';

export function TableCard({
  cardIdx,
  faceDown,
  deal,
  win,
  dim,
  placeholder,
  width = DEFAULT_WIDTH,
}: TableCardProps) {
  const box: React.CSSProperties = { width, aspectRatio: '5 / 7' };
  const dealCls = deal ? 'tbl-card-deal' : '';
  const winCls = win ? 'ring-2 ring-cyan-400 shadow-[0_0_18px_-4px_rgba(34,211,238,0.9)]' : '';
  const dimCls = dim ? 'opacity-45' : '';

  if (placeholder) {
    return (
      <div
        className="rounded-lg border border-dashed border-cyan-950/80"
        style={box}
        aria-hidden
      />
    );
  }

  if (faceDown || cardIdx == null) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg text-[22px] text-cyan-300 ${dealCls} ${winCls} ${dimCls}`}
        style={{
          ...box,
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
      className={`flex flex-col items-center justify-center rounded-lg font-semibold ${dealCls} ${winCls} ${dimCls}`}
      style={{
        ...box,
        background: '#f2efe6',
        color: red ? '#b3261e' : '#1f2937',
        border: '0.5px solid rgba(0,0,0,.3)',
        boxShadow: '0 3px 8px -3px rgba(0,0,0,.6)',
      }}
      aria-label={`${cardRankLabel(cardIdx)} ${cardSuitGlyph(cardIdx)}`}
    >
      <span className="leading-none" style={{ fontSize: 'clamp(13px,3.4vw,17px)' }}>
        {cardRankLabel(cardIdx)}
      </span>
      <span className="leading-[1.1]" style={{ fontSize: 'clamp(16px,4.6vw,24px)' }}>
        {cardSuitGlyph(cardIdx)}
      </span>
    </div>
  );
}

/**
 * The deal-in keyframes, mounted once per page by the game component. Kept
 * next to the card so a game only has to render <TableCardStyles /> to get it.
 */
export function TableCardStyles() {
  return (
    <style jsx global>{`
      .tbl-card-deal {
        animation: tbl-cardin 0.32s cubic-bezier(0.34, 1.4, 0.6, 1) both;
      }
      @keyframes tbl-cardin {
        0% {
          transform: translateY(-16px) scale(0.9);
          opacity: 0;
        }
        100% {
          transform: none;
          opacity: 1;
        }
      }
      .tbl-banner-in {
        animation: tbl-banner-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      @keyframes tbl-banner-in {
        0% {
          transform: scale(0.7);
          opacity: 0;
        }
        55% {
          transform: scale(1.06);
          opacity: 1;
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }
    `}</style>
  );
}
