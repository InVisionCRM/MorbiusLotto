'use client';

/**
 * VideoPokerCard — CSS-drawn playing card for /video-poker (no image assets).
 *
 * flipMode controls the deal/draw animations:
 *   'deal'  — card arcs in from above-left as the hand is dealt.
 *   'draw'  — true 3D back→front flip revealing the replacement card.
 *   null    — static (held cards, idle state).
 *
 * flipDelay (ms) staggers the animation per card position.
 */

import { vpRankLabel, vpSuitGlyph, vpCardIsRed } from '@/lib/video-poker-client';

interface VideoPokerCardProps {
  card: number | null;
  held?: boolean;
  /** Part of a winning hand — cyan ring + glow pulse. */
  win?: boolean;
  /** 'deal' = arc-in on initial deal; 'draw' = true 3D back→front flip on draw. */
  flipMode?: 'deal' | 'draw' | null;
  /** Animation-delay in ms — stagger each card in the hand. */
  flipDelay?: number;
  /** This card is wild under the active variant (a deuce, or the Joker). */
  wild?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}

export function VideoPokerCard({
  card,
  held = false,
  win = false,
  flipMode = null,
  flipDelay = 0,
  wild = false,
  onToggle,
  disabled = true,
}: VideoPokerCardProps) {
  const sizeClasses = 'h-24 w-[4.2rem] shrink-0 sm:h-32 sm:w-[5.6rem]';
  const isRed = card != null && vpCardIsRed(card);
  const delayStyle = flipDelay > 0 ? { animationDelay: `${flipDelay}ms` } : undefined;

  /* ── Draw mode: true 3D back→front casino flip ── */
  if (flipMode === 'draw') {
    return (
      <div className={`${sizeClasses} rounded-lg vp-flip-perspective`}>
        <div className="vp-draw-flip-wrap" style={delayStyle}>
          {/* Back face — shown first while card rotates */}
          <div className="vp-card-face rounded-lg bg-gradient-to-br from-[#0B2533] to-[#081420] ring-1 ring-cyan-500/30">
            <div className="flex h-full w-full items-center justify-center text-3xl text-cyan-400/40 sm:text-4xl">♠</div>
          </div>
          {/* Front face — revealed once wrapper rotates past 90° */}
          <div
            className={[
              'vp-card-face vp-card-face--front rounded-lg bg-gradient-to-br from-white via-slate-50 to-slate-200 ring-1',
              win ? 'ring-2 ring-cyan-400 vp-win-pulse' : 'ring-slate-400/40',
            ].join(' ')}
          >
            {card != null && (
              <>
                <div className={`absolute left-1.5 top-1 leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
                  <div className="arc-mono text-base font-bold sm:text-xl">{vpRankLabel(card)}</div>
                  <div className="text-xs sm:text-sm">{vpSuitGlyph(card)}</div>
                </div>
                <div className={`absolute inset-0 flex items-center justify-center text-3xl sm:text-5xl ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
                  {vpSuitGlyph(card)}
                </div>
                {held ? (
                  <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-cyan-500/90 py-0.5 text-center text-[10px] font-bold uppercase tracking-widest text-[#03121B]">
                    Held
                  </span>
                ) : (
                  wild && (
                    <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-amber-400/90 py-0.5 text-center text-[10px] font-bold uppercase tracking-widest text-[#2b1a00]">
                      Wild
                    </span>
                  )
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Standard face (deal arc-in or static) ── */
  const bgClasses =
    card == null
      ? 'bg-gradient-to-br from-[#0B2533] to-[#081420] ring-1 ring-cyan-500/30'
      : `bg-gradient-to-br from-white via-slate-50 to-slate-200 ring-1 ${
          win ? 'ring-2 ring-cyan-400 vp-win-pulse' : 'ring-slate-400/40'
        }`;

  const body = (
    <div
      className={[
        'relative flex flex-col rounded-lg',
        sizeClasses,
        flipMode === 'deal' ? 'vp-card-deal' : '',
        bgClasses,
      ]
        .filter(Boolean)
        .join(' ')}
      style={flipMode === 'deal' ? delayStyle : undefined}
    >
      {card == null ? (
        <div className="flex h-full w-full items-center justify-center text-3xl text-cyan-400/40 sm:text-4xl">♠</div>
      ) : (
        <>
          <div className={`absolute left-1.5 top-1 leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
            <div className="arc-mono text-base font-bold sm:text-xl">{vpRankLabel(card)}</div>
            <div className="text-xs sm:text-sm">{vpSuitGlyph(card)}</div>
          </div>
          <div className={`absolute inset-0 flex items-center justify-center text-3xl sm:text-5xl ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
            {vpSuitGlyph(card)}
          </div>
          {held ? (
            <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-cyan-500/90 py-0.5 text-center text-[10px] font-bold uppercase tracking-widest text-[#03121B]">
              Held
            </span>
          ) : (
            wild && (
              <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-amber-400/90 py-0.5 text-center text-[10px] font-bold uppercase tracking-widest text-[#2b1a00]">
                Wild
              </span>
            )
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
        className={[
          'focus:outline-none',
          held ? 'vp-held-lift' : 'transition-transform hover:-translate-y-1 focus-visible:-translate-y-1',
        ].join(' ')}
      >
        {body}
      </button>
    );
  }
  return body;
}
