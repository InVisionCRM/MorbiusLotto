'use client'

/**
 * BigWinToast — the small, non-blocking prompt that appears on a big win.
 *
 * Replaces the old behavior of popping the full share card immediately. It sits
 * at the bottom of the screen (clear of the mobile action bar), doesn't block
 * play, and offers a one-tap "Share" (which opens the full BigWinModal) or a
 * dismiss. Rendered by BigWinProvider.
 */

import { Share2, X } from 'lucide-react'

interface BigWinToastProps {
  game: string
  multiplier: number
  onShare: () => void
  onClose: () => void
}

export function BigWinToast({ game, multiplier, onShare, onClose }: BigWinToastProps) {
  const multLabel = multiplier >= 100 ? `${Math.round(multiplier)}×` : `${multiplier.toFixed(1)}×`

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[9999] flex justify-center px-3 sm:bottom-6">
      <div className="arc-banner-in pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl border border-cyan-500/30 bg-[#07131F]/95 py-2.5 pl-3.5 pr-2 shadow-[0_0_40px_-8px_rgba(34,211,238,0.55)] backdrop-blur">
        <div className="shrink-0 text-2xl leading-none" aria-hidden>🎉</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-white">Quick Share</div>
          <div className="truncate text-[11px] text-cyan-300/70">
            Nice {game} win! <span className="font-mono text-amber-300">{multLabel}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onShare}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-cyan-500 px-3.5 py-2 text-sm font-bold uppercase tracking-wide text-[#03121B] shadow-[0_0_20px_-6px_rgba(34,211,238,0.8)] transition-colors hover:bg-cyan-400"
        >
          <Share2 size={15} /> Share
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:text-slate-200"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
