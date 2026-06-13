'use client';

/**
 * VideoPokerCard — a CSS-drawn playing card for /video-poker (no image assets).
 *
 * `card === null` renders the face-down deck back. During the hold phase the
 * card is a toggle: tap to HOLD it through the draw. Winning hands ring cyan;
 * freshly-drawn replacements flip in via the shared `hilo-flip-in` keyframes.
 */

import { vpRankLabel, vpSuitGlyph, vpCardIsRed } from '@/lib/video-poker-client';

interface VideoPokerCardProps {
  card: number | null;
  held?: boolean;
  /** Part of a winning hand — cyan ring + glow. */
  win?: boolean;
  /** Re-key + set true to replay the flip-in on a freshly drawn card. */
  flip?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}

export function VideoPokerCard({ card, held = false, win = false, flip = false, onToggle, disabled = true }: VideoPokerCardProps) {
  const frame = [
    'relative flex h-24 w-[4.2rem] shrink-0 flex-col rounded-lg sm:h-32 sm:w-[5.6rem]',
    flip ? 'hilo-flip-in' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const inner =
    card == null
      ? 'bg-gradient-to-br from-[#0B2533] to-[#081420] ring-1 ring-cyan-500/30'
      : `bg-gradient-to-br from-white via-slate-50 to-slate-200 ring-1 ${
          win ? 'ring-2 ring-cyan-400 shadow-[0_0_22px_-4px_rgba(34,211,238,0.8)]' : 'ring-slate-400/40'
        }`;

  const body = (
    <div className={`${frame} ${inner}`}>
      {card == null ? (
        <div className="flex h-full w-full items-center justify-center text-3xl text-cyan-400/40 sm:text-4xl">♠</div>
      ) : (
        <>
          <div className={`absolute left-1.5 top-1 leading-none ${vpCardIsRed(card) ? 'text-red-600' : 'text-slate-900'}`}>
            <div className="arc-mono text-base font-bold sm:text-xl">{vpRankLabel(card)}</div>
            <div className="text-xs sm:text-sm">{vpSuitGlyph(card)}</div>
          </div>
          <div className={`absolute inset-0 flex items-center justify-center text-3xl sm:text-5xl ${vpCardIsRed(card) ? 'text-red-600' : 'text-slate-900'}`}>
            {vpSuitGlyph(card)}
          </div>
          {held && (
            <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-cyan-500/90 py-0.5 text-center text-[10px] font-bold uppercase tracking-widest text-[#03121B]">
              Held
            </span>
          )}
        </>
      )}
    </div>
  );

  if (onToggle && !disabled) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={held}
        aria-label={card != null ? `${vpRankLabel(card)}${vpSuitGlyph(card)} — ${held ? 'held' : 'tap to hold'}` : 'card'}
        className="transition-transform hover:-translate-y-1 focus:outline-none focus-visible:-translate-y-1"
      >
        {body}
      </button>
    );
  }
  return body;
}
