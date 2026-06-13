'use client'

/**
 * HiLoCard — a CSS-drawn playing card for /hilo (no image assets).
 *
 * Two sizes: 'lg' is the main-stage card (corner indices + big center pip),
 * 'sm' is the trail/ladder card (rank over pip). `card === null` renders the
 * face-down deck back. New cards flip in via the global `hilo-flip-in`
 * keyframes (parents re-key the element per reveal so the animation replays);
 * a losing reveal adds `hilo-bust-flash` + a rose ring.
 */

import {
  hiLoRankLabel,
  hiLoSuitGlyph,
  hiLoSuitIsRed,
  type HiLoCard as HiLoCardData,
} from '@/lib/hilo-client'

interface HiLoCardProps {
  /** Card to render face up, or null for the face-down deck back. */
  card: HiLoCardData | null
  size?: 'lg' | 'sm'
  /** Play the 3D flip-in animation (re-key the element to replay it). */
  flip?: boolean
  /** Losing reveal: red flash + rose ring. */
  busted?: boolean
  dimmed?: boolean
  className?: string
}

const FRAME = {
  lg: 'h-44 w-32 rounded-xl sm:h-60 sm:w-[10.5rem]',
  sm: 'h-16 w-11 rounded-md',
} as const

export function HiLoCard({
  card,
  size = 'lg',
  flip = false,
  busted = false,
  dimmed = false,
  className = '',
}: HiLoCardProps) {
  const frame = [
    'relative shrink-0 select-none',
    FRAME[size],
    flip ? 'hilo-flip-in' : '',
    busted ? 'hilo-bust-flash' : '',
    dimmed ? 'opacity-50' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (!card) {
    // Face-down deck back: abyss-blue weave with a faint cyan spade watermark.
    return (
      <div
        aria-label="Face-down card"
        className={`${frame} bg-gradient-to-br from-[#0B2533] to-[#081420] ring-1 ring-cyan-500/30`}
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(34,211,238,0.07) 0 6px, transparent 6px 12px), ' +
            'linear-gradient(to bottom right, #0B2533, #081420)',
        }}
      >
        <div
          className={`absolute inset-1 flex items-center justify-center rounded-[inherit] border border-cyan-500/20 text-cyan-400/40 ${
            size === 'lg' ? 'text-5xl sm:text-6xl' : 'text-lg'
          }`}
        >
          ♠
        </div>
      </div>
    )
  }

  const rank = hiLoRankLabel(card.rank)
  const glyph = hiLoSuitGlyph(card.suit)
  const color = hiLoSuitIsRed(card.suit) ? 'text-red-600' : 'text-slate-900'
  const label = `${rank}${glyph}`

  if (size === 'sm') {
    return (
      <div
        aria-label={label}
        className={`${frame} flex flex-col items-center justify-center bg-gradient-to-br from-white to-slate-200 ring-1 ${
          busted ? 'ring-rose-500' : 'ring-slate-400/40'
        }`}
      >
        <span className={`arc-mono text-sm font-bold leading-none ${color}`}>{rank}</span>
        <span className={`mt-0.5 text-sm leading-none ${color}`}>{glyph}</span>
      </div>
    )
  }

  return (
    <div
      aria-label={label}
      className={`${frame} bg-gradient-to-br from-white via-slate-50 to-slate-200 shadow-[0_14px_36px_-14px_rgba(0,0,0,0.85)] ring-1 ${
        busted ? 'ring-2 ring-rose-500' : 'ring-slate-400/40'
      }`}
    >
      {/* Corner indices — bottom-right is the top-left rotated 180°. */}
      <div className={`absolute left-2 top-1.5 text-center leading-none sm:left-3 sm:top-2.5 ${color}`}>
        <div className="arc-mono text-xl font-bold sm:text-3xl">{rank}</div>
        <div className="text-base sm:text-xl">{glyph}</div>
      </div>
      <div
        className={`absolute bottom-1.5 right-2 rotate-180 text-center leading-none sm:bottom-2.5 sm:right-3 ${color}`}
      >
        <div className="arc-mono text-xl font-bold sm:text-3xl">{rank}</div>
        <div className="text-base sm:text-xl">{glyph}</div>
      </div>

      {/* Center pip */}
      <div
        className={`absolute inset-0 flex items-center justify-center text-6xl sm:text-8xl ${color}`}
      >
        {glyph}
      </div>
    </div>
  )
}
