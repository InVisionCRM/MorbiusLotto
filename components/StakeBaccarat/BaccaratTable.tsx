'use client'

/**
 * BaccaratTable — the felt stage for /baccarat.
 *
 * Two card areas (PLAYER cyan / BANKER amber) fed one card at a time by the
 * parent's reveal timeline: each card mounts with a slide-in from the shoe
 * (top-right) and a 3D flip to its face (.bacc-* keyframes in globals.css).
 * Mod-10 total badges track the revealed cards live; the bottom banner zone
 * shows PLAYER WINS / BANKER WINS / TIE with the net chips, a NATURAL pill
 * for two-card 8/9 finishes, and PAIR pills when a side paired up.
 *
 * Purely presentational — the parent owns the timeline, sounds and money.
 */

import { Volume2, VolumeX } from 'lucide-react'
import {
  baccCardIsRed,
  baccCardRankLabel,
  baccaratHandTotal,
  BACC_SUIT_GLYPHS,
  baccCardSuit,
  type BaccaratResult,
} from '@/lib/baccarat-client'

export interface BaccaratBannerInfo {
  result: BaccaratResult
  /** totalPayout − totalBet for the settled hand. */
  net: number
  natural: boolean
  playerPair: boolean
  bankerPair: boolean
}

interface BaccaratTableProps {
  phase: 'idle' | 'dealing' | 'settled'
  /** Increments per hand so card slots remount and replay their animations. */
  handKey: number
  playerCards: number[]
  bankerCards: number[]
  banner: BaccaratBannerInfo | null
  muted: boolean
  onToggleMute: () => void
}

/** One styled CSS card: white rounded face (rank + suit glyph), cyan back. */
function PlayingCard({ card }: { card: number }) {
  const red = baccCardIsRed(card)
  const glyph = BACC_SUIT_GLYPHS[baccCardSuit(card)]
  const rank = baccCardRankLabel(card)
  const ink = red ? 'text-red-600' : 'text-slate-900'
  return (
    <div className="bacc-deal-in">
      <div className="bacc-flip h-[4.4rem] w-12 sm:h-24 sm:w-16">
        <div className="bacc-flip-inner">
          {/* Face */}
          <div className="bacc-face flex flex-col overflow-hidden rounded-md bg-slate-100 p-1 shadow-[0_8px_18px_-6px_rgba(0,0,0,0.8)] ring-1 ring-slate-400/60 sm:p-1.5">
            <span className={`text-xs font-bold leading-none sm:text-sm ${ink}`}>{rank}</span>
            <span className={`text-[10px] leading-tight sm:text-xs ${ink}`}>{glyph}</span>
            <span className={`m-auto text-xl leading-none sm:text-3xl ${ink}`}>{glyph}</span>
            <span className={`self-end text-[10px] leading-tight sm:text-xs ${ink}`}>{glyph}</span>
          </div>
          {/* Back */}
          <div className="bacc-face bacc-face-back overflow-hidden rounded-md bg-gradient-to-br from-[#0E3A4D] to-[#081E2B] ring-1 ring-cyan-600/50">
            <div className="flex h-full w-full items-center justify-center rounded-md bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.28),transparent_62%)]">
              <span className="text-base text-cyan-400/80 sm:text-xl">◈</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Mod-10 hand value badge — pops every time a new card lands on its side. */
function TotalBadge({
  cards,
  tone,
}: {
  cards: number[]
  tone: 'player' | 'banker'
}) {
  const has = cards.length > 0
  const ring =
    tone === 'player'
      ? 'ring-cyan-500/60 text-cyan-300 shadow-[0_0_14px_-4px_rgba(34,211,238,0.7)]'
      : 'ring-amber-500/60 text-amber-300 shadow-[0_0_14px_-4px_rgba(245,158,11,0.7)]'
  return (
    <span
      key={cards.length}
      className={[
        'bacc-total-pop arc-mono inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#081420] text-sm font-bold tabular-nums ring-1 sm:h-8 sm:w-8 sm:text-base',
        has ? ring : 'text-slate-600 ring-cyan-950',
      ].join(' ')}
      aria-label={has ? `total ${baccaratHandTotal(cards)}` : 'no cards yet'}
    >
      {has ? baccaratHandTotal(cards) : '·'}
    </span>
  )
}

/** Three card-back slivers stacked in the top-right corner — the shoe. */
function Shoe({ dealing }: { dealing: boolean }) {
  return (
    <div
      aria-hidden
      className="absolute right-3 top-3 hidden sm:block"
      title="Shoe"
    >
      <div className="relative h-12 w-9">
        {[2, 1, 0].map((i) => (
          <div
            key={i}
            className={[
              'absolute h-11 w-8 rounded bg-gradient-to-br from-[#0E3A4D] to-[#081E2B] ring-1 ring-cyan-700/50',
              dealing && i === 0 ? 'shadow-[0_0_14px_-2px_rgba(34,211,238,0.7)]' : '',
            ].join(' ')}
            style={{ right: i * 3, top: i * 2, transform: `rotate(${4 - i * 2}deg)` }}
          />
        ))}
      </div>
      <div className="mt-1 text-center text-[9px] uppercase tracking-[0.25em] text-slate-600">
        Shoe
      </div>
    </div>
  )
}

function PairPill({ tone }: { tone: 'player' | 'banker' }) {
  return (
    <span
      className={[
        'arc-banner-in arc-mono rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1',
        tone === 'player'
          ? 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/40'
          : 'bg-amber-500/15 text-amber-300 ring-amber-500/40',
      ].join(' ')}
    >
      Pair
    </span>
  )
}

const RESULT_LABEL: Record<BaccaratResult, string> = {
  player: 'Player wins',
  banker: 'Banker wins',
  tie: 'Tie',
}

const RESULT_CLASS: Record<BaccaratResult, string> = {
  player: 'text-cyan-300 drop-shadow-[0_0_20px_rgba(34,211,238,0.6)]',
  banker: 'text-amber-300 drop-shadow-[0_0_20px_rgba(245,158,11,0.55)]',
  tie: 'text-[#A78BFA] drop-shadow-[0_0_20px_rgba(167,139,250,0.6)]',
}

export function BaccaratTable({
  phase,
  handKey,
  playerCards,
  bankerCards,
  banner,
  muted,
  onToggleMute,
}: BaccaratTableProps) {
  const settled = phase === 'settled' && banner != null
  const playerWon = settled && banner.result === 'player'
  const bankerWon = settled && banner.result === 'banker'

  const sideClass = (won: boolean) =>
    [
      'flex flex-col items-center gap-2 rounded-xl px-2 py-3 transition-all duration-500 sm:px-4',
      won
        ? 'bg-white/[0.045] ring-1 ring-cyan-400/40 shadow-[0_0_28px_-8px_rgba(34,211,238,0.55),inset_0_1px_0_rgba(255,255,255,0.07)]'
        : '',
    ].join(' ')

  return (
    <div className="relative overflow-hidden rounded-xl bg-[radial-gradient(ellipse_85%_70%_at_50%_0%,rgba(34,211,238,0.07),transparent_70%)] p-3 ring-1 ring-cyan-950/70 sm:p-5">
      {/* Mute toggle */}
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
        className="absolute left-3 top-3 z-10 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      <Shoe dealing={phase === 'dealing'} />

      {/* Hands */}
      <div className="mx-auto mt-6 grid max-w-2xl grid-cols-2 gap-2 sm:mt-4 sm:gap-6">
        {/* Player */}
        <div className={sideClass(playerWon)}>
          <div className="flex items-center gap-2">
            <span
              className={[
                'arc-display text-xs font-bold uppercase tracking-[0.2em] sm:text-sm',
                playerWon ? 'text-cyan-300' : 'text-cyan-400/70',
              ].join(' ')}
            >
              Player
            </span>
            {settled && banner.playerPair && <PairPill tone="player" />}
          </div>
          <div className="flex min-h-[4.6rem] items-center justify-center gap-1.5 sm:min-h-[6.2rem] sm:gap-2">
            {playerCards.map((c, i) => (
              <PlayingCard key={`${handKey}-p-${i}`} card={c} />
            ))}
            {playerCards.length === 0 && (
              <div className="h-[4.4rem] w-12 rounded-md border border-dashed border-cyan-950 sm:h-24 sm:w-16" />
            )}
          </div>
          <TotalBadge cards={playerCards} tone="player" />
        </div>

        {/* Banker */}
        <div className={sideClass(bankerWon)}>
          <div className="flex items-center gap-2">
            <span
              className={[
                'arc-display text-xs font-bold uppercase tracking-[0.2em] sm:text-sm',
                bankerWon ? 'text-amber-300' : 'text-amber-400/70',
              ].join(' ')}
            >
              Banker
            </span>
            {settled && banner.bankerPair && <PairPill tone="banker" />}
          </div>
          <div className="flex min-h-[4.6rem] items-center justify-center gap-1.5 sm:min-h-[6.2rem] sm:gap-2">
            {bankerCards.map((c, i) => (
              <PlayingCard key={`${handKey}-b-${i}`} card={c} />
            ))}
            {bankerCards.length === 0 && (
              <div className="h-[4.4rem] w-12 rounded-md border border-dashed border-cyan-950 sm:h-24 sm:w-16" />
            )}
          </div>
          <TotalBadge cards={bankerCards} tone="banker" />
        </div>
      </div>

      {/* Banner zone — reserved height so the felt never jumps. */}
      <div
        className="mt-3 flex min-h-[4.5rem] flex-col items-center justify-center text-center sm:mt-4"
        aria-live="polite"
      >
        {settled ? (
          <div key={handKey} className="arc-banner-in">
            <div className="flex items-center justify-center gap-2">
              <span
                className={`arc-display text-2xl font-bold uppercase tracking-[0.1em] sm:text-4xl ${RESULT_CLASS[banner.result]}`}
              >
                {RESULT_LABEL[banner.result]}
              </span>
              {banner.natural && (
                <span className="arc-mono rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-amber-300 ring-1 ring-amber-500/50">
                  Natural
                </span>
              )}
            </div>
            <div className="arc-mono mt-1 text-sm tabular-nums">
              {banner.net > 0 ? (
                <span className="text-amber-300">+{banner.net.toLocaleString()} chips</span>
              ) : banner.net === 0 ? (
                <span className="text-slate-400">push — stake returned</span>
              ) : (
                <span className="text-rose-400">{banner.net.toLocaleString()} chips</span>
              )}
            </div>
          </div>
        ) : phase === 'dealing' ? (
          <span className="arc-display text-sm uppercase tracking-[0.3em] text-slate-500">
            Dealing…
          </span>
        ) : (
          <span className="arc-display text-sm uppercase tracking-[0.3em] text-slate-600">
            Place your bets · Deal to play
          </span>
        )}
      </div>
    </div>
  )
}
