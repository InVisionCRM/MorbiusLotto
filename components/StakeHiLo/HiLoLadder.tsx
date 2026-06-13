'use client'

/**
 * HiLoLadder — the round's pick trail: every card dealt so far as a small
 * CSS card with the running multiplier (and the player's call) under it.
 * Newest card is highlighted and animates in; the losing reveal is flagged
 * BUST. Horizontally scrollable, auto-scrolled to the newest card.
 */

import { useEffect, useRef } from 'react'
import { HiLoCard } from './HiLoCard'
import {
  formatMultiplier,
  type HiLoCard as HiLoCardData,
  type HiLoDirection,
} from '@/lib/hilo-client'

interface HiLoLadderProps {
  cards: HiLoCardData[]
  picks: HiLoDirection[]
  /** ×100 multiplier AFTER each pick — multWalkX100[i] follows picks[i]. */
  multWalkX100: number[]
  /** True when the final pick lost (last card is the losing reveal). */
  busted: boolean
}

export function HiLoLadder({ cards, picks, multWalkX100, busted }: HiLoLadderProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep the newest card in view as the trail grows.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
  }, [cards.length])

  if (cards.length === 0) return null

  return (
    <div
      ref={scrollRef}
      aria-label="Pick trail"
      className="flex items-start gap-2 overflow-x-auto pb-1 pt-2"
    >
      {cards.map((card, i) => {
        const newest = i === cards.length - 1
        const isBustCard = busted && newest && i > 0
        return (
          <div
            key={`${i}-${card.index}`}
            className={[
              'flex shrink-0 flex-col items-center gap-1',
              newest ? 'arc-banner-in' : '',
            ].join(' ')}
          >
            <HiLoCard
              card={card}
              size="sm"
              busted={isBustCard}
              dimmed={!newest && !isBustCard}
              className={newest && !isBustCard ? 'ring-2 ring-cyan-400/70' : ''}
            />
            {i === 0 ? (
              <span className="arc-mono text-[10px] tabular-nums text-slate-500">
                {formatMultiplier(100)}
              </span>
            ) : isBustCard ? (
              <span className="arc-mono text-[10px] font-bold uppercase text-rose-400">Bust</span>
            ) : (
              <span className="arc-mono text-[10px] tabular-nums text-cyan-300">
                {picks[i - 1] === 'hi' ? '▲' : '▼'}{' '}
                {multWalkX100[i - 1] != null ? formatMultiplier(multWalkX100[i - 1]) : '—'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
