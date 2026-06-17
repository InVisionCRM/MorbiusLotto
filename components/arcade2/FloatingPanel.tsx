'use client'

/**
 * FloatingPanel — shared arcade2 draggable, collapsible floating card.
 *
 * Renders on both desktop and mobile (parents no longer need a separate inline
 * copy). On phones it shrinks to a "mini" width and defaults to the top-right
 * corner; on desktop it keeps the full 380px width near the bottom-right.
 *
 * Plain pointer events — no drag library:
 *   • Drag by the header (buttons excluded), with pointer capture so fast
 *     drags don't escape the handle. `touch-none` on the handle keeps a touch
 *     drag from scrolling the page underneath.
 *   • Position clamps to the viewport on drag AND on window resize, and stays
 *     clear of the fixed mobile action bar at the bottom.
 *   • {x, y, open} persists to localStorage (per `storageKey`).
 *
 * z-index sits below the dialogs (z-50) so modals always win.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const DESKTOP_W = 380
const MOBILE_MAX_W = 184
const MARGIN = 8

interface PanelPos {
  x: number
  y: number
  open: boolean
}

interface FloatingPanelProps {
  title: string
  /** localStorage key for the persisted position. */
  storageKey: string
  children: ReactNode
}

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 1024
}

/** Mini on phones, full-size on desktop. */
function computeWidth(): number {
  if (isMobileViewport()) return Math.min(window.innerWidth - MARGIN * 2, MOBILE_MAX_W)
  return DESKTOP_W
}

/** Reserve room at the bottom for the fixed mobile action bar so the chart never covers Deal/Step. */
function bottomInset(): number {
  return isMobileViewport() ? 132 : MARGIN
}

function clampPos(x: number, y: number, height: number, width: number): { x: number; y: number } {
  const maxX = window.innerWidth - width - MARGIN
  const maxY = window.innerHeight - Math.min(height, 120) - bottomInset()
  return {
    x: Math.min(Math.max(x, MARGIN), Math.max(maxX, MARGIN)),
    y: Math.min(Math.max(y, MARGIN), Math.max(maxY, MARGIN)),
  }
}

export function FloatingPanel({ title, storageKey, children }: FloatingPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const [pos, setPos] = useState<PanelPos | null>(null)
  const [width, setWidth] = useState<number>(DESKTOP_W)

  // Mount: pick a width for this viewport, then restore the saved spot or pick a default corner.
  useEffect(() => {
    const w = computeWidth()
    setWidth(w)
    let initial: PanelPos | null = null
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) initial = JSON.parse(raw) as PanelPos
    } catch {
      /* fall through to default */
    }
    if (!initial || !Number.isFinite(initial.x) || !Number.isFinite(initial.y)) {
      initial = isMobileViewport()
        ? { x: window.innerWidth - w - MARGIN, y: 76, open: true }
        : { x: window.innerWidth - w - 24, y: Math.max(96, window.innerHeight - 420), open: true }
    }
    const c = clampPos(initial.x, initial.y, rootRef.current?.offsetHeight ?? 200, w)
    setPos({ ...initial, ...c })
  }, [storageKey])

  const persist = useCallback(
    (p: PanelPos) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(p))
      } catch {
        /* private mode etc. — position just won't stick */
      }
    },
    [storageKey],
  )

  // Keep the panel on-screen (and the right size) when the viewport changes.
  useEffect(() => {
    const onResize = () => {
      const w = computeWidth()
      setWidth(w)
      setPos((p) => {
        if (!p) return p
        const c = clampPos(p.x, p.y, rootRef.current?.offsetHeight ?? 200, w)
        const next = { ...p, ...c }
        persist(next)
        return next
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [persist])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pos) return
      // Buttons inside the header (collapse) shouldn't start a drag.
      if ((e.target as HTMLElement).closest('button')) return
      dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [pos],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d) return
      setPos((p) => {
        if (!p) return p
        const c = clampPos(e.clientX - d.dx, e.clientY - d.dy, rootRef.current?.offsetHeight ?? 200, width)
        return { ...p, ...c }
      })
    },
    [width],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return
      dragRef.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
      setPos((p) => {
        if (p) persist(p)
        return p
      })
    },
    [persist],
  )

  const toggleOpen = useCallback(() => {
    setPos((p) => {
      if (!p) return p
      const next = { ...p, open: !p.open }
      persist(next)
      return next
    })
  }, [persist])

  if (!pos) return null

  return (
    <div
      ref={rootRef}
      className="arcade2-scope fixed z-40"
      style={{ left: pos.x, top: pos.y, width }}
    >
      <div className="arc-panel overflow-hidden rounded-xl shadow-[0_18px_50px_-18px_rgba(0,0,0,0.9)]">
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="flex touch-none cursor-grab select-none items-center gap-2 border-b border-cyan-950/70 bg-[#081420]/80 px-3 py-2 active:cursor-grabbing"
        >
          <span aria-hidden className="text-[10px] tracking-[0.2em] text-slate-600">⠿</span>
          <span className="arc-display text-xs font-semibold uppercase tracking-wider text-slate-300">
            {title}
          </span>
          <button
            type="button"
            onClick={toggleOpen}
            aria-label={pos.open ? 'Collapse panel' : 'Expand panel'}
            className="ml-auto rounded px-1.5 py-0.5 text-xs text-slate-500 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300"
          >
            {pos.open ? '▾' : '▸'}
          </button>
        </div>
        {pos.open && <div className="p-2">{children}</div>}
      </div>
    </div>
  )
}
