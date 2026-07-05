'use client'

/**
 * BigWinModal — the "Nice win! Share it with the world 🌎" popup.
 *
 * Shows a live preview of the Abyssal Neon share card (rendered on a canvas)
 * and lets the player Share it (Web Share API with the PNG, where supported)
 * or Save it to their device. Rendered by BigWinProvider; not used directly.
 */

import { useEffect, useRef, useState } from 'react'
import { Share2, Download, X, Check } from 'lucide-react'
import { drawWinCard, renderWinCardBlob, WIN_CARD_ASPECT } from '@/lib/win-share-card'

interface BigWinModalProps {
  game: string
  roiPct: number
  multiplier: number
  onClose: () => void
}

const PREVIEW_W = 300

export function BigWinModal({ game, roiPct, multiplier, onClose }: BigWinModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  // Draw the preview at device resolution so it's crisp on retina screens.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const h = Math.round(PREVIEW_W / WIN_CARD_ASPECT)
    canvas.width = Math.round(PREVIEW_W * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${PREVIEW_W}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')
    if (ctx) drawWinCard(ctx, canvas.width, canvas.height, { game, roiPct })
  }, [game, roiPct])

  const filename = `morbius-${game.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-win.png`
  const shareText = `Nice win on ${game} at Morbius.io — +${Math.round(roiPct).toLocaleString('en-US')}% ROI! 🌎`

  async function handleShare() {
    setBusy(true)
    try {
      const blob = await renderWinCardBlob({ game, roiPct })
      if (!blob) throw new Error('render failed')
      const file = new File([blob], filename, { type: 'image/png' })
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean
        share?: (d: ShareData) => Promise<void>
      }
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text: shareText, title: 'Morbius.io' })
      } else {
        downloadBlob(blob, filename)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch {
      /* user dismissed the share sheet, or share unsupported — nothing to do */
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    setBusy(true)
    try {
      const blob = await renderWinCardBlob({ game, roiPct })
      if (blob) {
        downloadBlob(blob, filename)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Big win — share your card"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-cyan-500/30 bg-[#07131F] p-5 text-center shadow-[0_0_60px_-12px_rgba(34,211,238,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded p-1 text-slate-500 transition-colors hover:text-slate-200"
        >
          <X size={18} />
        </button>

        <h2 className="text-2xl font-extrabold tracking-tight text-white">Nice win! 🎉</h2>
        <p className="mt-1 text-sm text-cyan-300/80">Share it with the world 🌎</p>

        <div className="mt-4 flex justify-center">
          <canvas
            ref={canvasRef}
            className="rounded-xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)]"
            aria-label={`${game} win, plus ${Math.round(roiPct).toLocaleString('en-US')} percent return`}
          />
        </div>

        <div className="mt-3 font-mono text-xs uppercase tracking-widest text-slate-500">
          {multiplier >= 100
            ? `${Math.round(multiplier)}× win`
            : `${multiplier.toFixed(1)}× win`}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleShare}
            disabled={busy}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] transition-colors hover:bg-cyan-400 disabled:opacity-60"
          >
            <Share2 size={18} /> Share
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            aria-label="Save image"
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/30 text-cyan-300 transition-colors hover:bg-cyan-500/10 disabled:opacity-60"
          >
            {saved ? <Check size={18} className="text-emerald-400" /> : <Download size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
