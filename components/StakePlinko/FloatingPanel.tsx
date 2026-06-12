'use client'

/**
 * FloatingPanel — a draggable, collapsible floating card for /plinko2's
 * session chart (desktop only; the parent renders children inline on mobile).
 *
 * Plain pointer events — no drag library:
 *   • Drag by the header (buttons excluded), with pointer capture so fast
 *     drags don't escape the handle.
 *   • Position clamps to the viewport on drag AND on window resize.
 *   • {x, y, open} persists to localStorage so the panel stays where the
 *     player left it across visits.
 *
 * z-index sits below the dialogs (z-50) so modals always win.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const PANEL_W = 380
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

function clampPos(x: number, y: number, height: number): { x: number; y: number } {
  const maxX = window.innerWidth - PANEL_W - MARGIN
  const maxY = window.innerHeight - Math.min(height, 120) - MARGIN
  return {
    x: Math.min(Math.max(x, MARGIN), Math.max(maxX, MARGIN)),
    y: Math.min(Math.max(y, MARGIN), Math.max(maxY, MARGIN)),
  }
}

export function FloatingPanel({ title, storageKey, children }: FloatingPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const [pos, setPos] = useState<PanelPos | null>(null)

  // Mount: restore the saved spot, or default to the bottom-right corner.
  useEffect(() => {
    let initial: PanelPos | null = null
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) initial = JSON.parse(raw) as PanelPos
    } catch {
      /* fall through to default */
    }
    if (!initial || !Number.isFinite(initial.x) || !Number.isFinite(initial.y)) {
      initial = {
        x: window.innerWidth - PANEL_W - 24,
        y: Math.max(96, window.innerHeight - 420),
        open: true,
      }
    }
    const c = clampPos(initial.x, initial.y, rootRef.current?.offsetHeight ?? 320)
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

  // Keep the panel on-screen when the window shrinks.
  useEffect(() => {
    const onResize = () => {
      setPos((p) => {
        if (!p) return p
        const c = clampPos(p.x, p.y, rootRef.current?.offsetHeight ?? 320)
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

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    setPos((p) => {
      if (!p) return p
      const c = clampPos(e.clientX - d.dx, e.clientY - d.dy, rootRef.current?.offsetHeight ?? 320)
      return { ...p, ...c }
    })
  }, [])

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
      style={{ left: pos.x, top: pos.y, width: PANEL_W }}
    >
      <div className="arc-panel overflow-hidden rounded-xl shadow-[0_18px_50px_-18px_rgba(0,0,0,0.9)]">
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="flex cursor-grab select-none items-center gap-2 border-b border-cyan-950/70 bg-[#081420]/80 px-3 py-2 active:cursor-grabbing"
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
