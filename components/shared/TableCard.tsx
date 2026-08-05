'use client';

/**
 * TableCard — one felt card, shared by the house-banked poker games.
 *
 * Same visual language as the Three Card Poker / Pai Gow cards (cream face,
 * red pips for hearts and diamonds, rank above a big suit glyph), but sized
 * from a CSS custom property so a game can run a five-card row narrower than a
 * two-card one without forking the component.
 *
 * `cardIdx` is the shared 0..51 index; omit it (or pass `faceDown`) for a back.
 * `placeholder` draws the dashed empty seat used before a deal.
 *
 * REVEALS. A dealer turning a card is the moment these games are built around,
 * so it is a real flip: the card is two faces on one rotating element, not a
 * back swapped out for a face. That means `faceDown` can change at any time and
 * the card turns rather than popping — which in turn means a game only has to
 * tell the truth about what is hidden, and the animation follows.
 */

import {
  cardRankLabel,
  cardSuitGlyph,
  cardIsRed,
  type CardEncoding,
} from '@/lib/playing-cards';
import { DEFAULT_CARD_BACK, type TableCardBack } from '@/lib/table-card-backs';

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
  /**
   * Which rank reading applies to `cardIdx`. The poker and blackjack families
   * disagree about index 0 (a Two versus an Ace), so a blackjack felt must say
   * so or every card renders one rank off. See lib/playing-cards.ts.
   */
  encoding?: CardEncoding;
  /** The player's chosen back. Defaults to Abyss. */
  back?: TableCardBack;
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
  encoding = 'poker',
  back = DEFAULT_CARD_BACK,
}: TableCardProps) {
  const hidden = faceDown || cardIdx == null;

  // No "has it flipped before" bookkeeping: CSS transitions don't run on the
  // first paint, so a card dealt face-up simply appears face-up, while one that
  // was hidden and then turned over transitions because its transform changed.
  // (An earlier version tracked this in state and was wrong — the state update
  // landed in an effect, i.e. after the transform had already changed, so the
  // transition was disabled at exactly the moment it needed to run.)
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

  const red = cardIdx != null && cardIsRed(cardIdx);
  const label =
    cardIdx != null ? `${cardRankLabel(cardIdx, encoding)} ${cardSuitGlyph(cardIdx)}` : undefined;

  return (
    <div
      className={`tbl-card-scene ${dealCls} ${winCls} ${dimCls}`}
      style={box}
      aria-label={hidden ? undefined : label}
      aria-hidden={hidden || undefined}
      role={hidden ? undefined : 'img'}
    >
      <div className={`tbl-card-inner ${hidden ? '' : 'tbl-card-faceup'}`}>
        {/* Back */}
        <div
          className="tbl-card-face tbl-card-back"
          style={{ background: back.background, boxShadow: back.boxShadow, color: back.glyphColor }}
        >
          {back.glyph}
        </div>

        {/* Face. Rendered even while hidden so the flip has something to turn
            to — it is rotated out of view, not absent. */}
        <div
          className="tbl-card-face tbl-card-front"
          style={{
            background: '#f2efe6',
            color: red ? '#b3261e' : '#1f2937',
            border: '0.5px solid rgba(0,0,0,.3)',
            boxShadow: '0 3px 8px -3px rgba(0,0,0,.6)',
          }}
        >
          {cardIdx != null && (
            <>
              <span className="leading-none" style={{ fontSize: 'clamp(13px,3.4vw,17px)' }}>
                {cardRankLabel(cardIdx, encoding)}
              </span>
              <span className="leading-[1.1]" style={{ fontSize: 'clamp(16px,4.6vw,24px)' }}>
                {cardSuitGlyph(cardIdx)}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The card keyframes, mounted once per page by the game component. Kept next to
 * the card so a game only has to render <TableCardStyles /> to get them.
 */
export function TableCardStyles() {
  return (
    <style jsx global>{`
      .tbl-card-scene {
        perspective: 700px;
      }
      .tbl-card-inner {
        position: relative;
        width: 100%;
        height: 100%;
        transform-style: preserve-3d;
        transition: transform 0.42s cubic-bezier(0.4, 0.1, 0.25, 1);
      }
      /* Face-up = turned half way round, so the front is toward the viewer. */
      .tbl-card-inner.tbl-card-faceup {
        transform: rotateY(180deg);
      }
      .tbl-card-face {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border-radius: 0.5rem;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        font-weight: 600;
      }
      .tbl-card-back {
        font-size: 22px;
      }
      .tbl-card-front {
        transform: rotateY(180deg);
      }

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

      /* Someone who has asked the OS for less motion gets the card without the
         spin — the state still changes, it just doesn't travel. */
      @media (prefers-reduced-motion: reduce) {
        .tbl-card-inner,
        .tbl-card-deal,
        .tbl-banner-in {
          transition: none !important;
          animation: none !important;
        }
      }
    `}</style>
  );
}
