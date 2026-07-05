'use client'

/**
 * ReplayConfirmOverlay — the centered "Play" prompt shown on a game board when
 * the player taps Replay on a past round. The replay doesn't start until they
 * hit Play, giving them a beat to start a screen recording. Reused across games
 * (Plinko, Keno, Roulette, …) so the replay UX is identical everywhere.
 *
 * Drop it inside a `position: relative` board container; it fills that box.
 */

import { Play, X } from 'lucide-react'

export interface ReplayConfirmOverlayProps {
  /** Small eyebrow, e.g. "Replay round". */
  title?: string
  /** The headline stat, e.g. "13.4×" or "+1,240%". */
  headline: string
  /** Optional secondary line, e.g. "+6,200 MORBIUS". */
  sub?: string
  /** Fire the replay. */
  onPlay: () => void
  /** Dismiss without replaying (backdrop tap or ✕). */
  onCancel: () => void
}

export function ReplayConfirmOverlay({
  title = 'Replay',
  headline,
  sub,
  onPlay,
  onCancel,
}: ReplayConfirmOverlayProps) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-[#050E16]/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-label="Replay this round"
      onClick={onCancel}
    >
      <div
        className="relative mx-4 w-full max-w-xs rounded-2xl border border-cyan-500/30 bg-[#07131F]/95 p-5 text-center shadow-[0_0_40px_-8px_rgba(34,211,238,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel replay"
          className="absolute right-2 top-2 rounded p-1 text-slate-500 transition-colors hover:text-slate-200"
        >
          <X size={16} />
        </button>

        <div className="text-xs font-semibold uppercase tracking-widest text-cyan-300/70">{title}</div>
        <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-amber-300">{headline}</div>
        {sub && <div className="mt-1 font-mono text-sm tabular-nums text-slate-400">{sub}</div>}

        <button
          type="button"
          onClick={onPlay}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] transition-colors hover:bg-cyan-400"
        >
          <Play size={18} className="fill-current" /> Play
        </button>
        <p className="mt-2 text-[11px] text-slate-500">Start recording, then hit Play.</p>
      </div>
    </div>
  )
}
