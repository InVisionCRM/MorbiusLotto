'use client'

/**
 * KenoHotNumbers — a tight strip of the most-drawn numbers across recent rounds,
 * meant to sit directly under the board. Each chip's tint/glow scales with how
 * often that number has come up (hottest = brightest). Global, read-only.
 */

import type { CSSProperties } from 'react'
import type { KenoHotNumber } from '@/lib/keno-client'

const MAX_CHIPS = 12

export function KenoHotNumbers({ hot }: { hot: KenoHotNumber[] }) {
  if (!hot || hot.length === 0) return null
  const top = hot.slice(0, MAX_CHIPS)
  const max = top[0]?.count || 1

  return (
    <section
      aria-label="Hot numbers"
      className="arc-panel flex w-full max-w-full items-center gap-2 overflow-hidden rounded-xl px-2.5 py-1.5"
    >
      <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300/90">
        <span aria-hidden>🔥</span> Hot
      </span>
      {/* min-w-0 lets this flex child shrink so it scrolls internally instead of
          forcing the panel (and the page) wider than the screen on mobile. */}
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {top.map((h) => {
          const intensity = Math.max(0, Math.min(1, h.count / max))
          const style: CSSProperties = {
            background: `rgba(34,211,238,${(0.06 + intensity * 0.22).toFixed(3)})`,
            boxShadow: intensity > 0.85 ? '0 0 10px -2px rgba(34,211,238,0.6)' : 'none',
            // ring-1 reads this var
            ['--tw-ring-color' as string]: `rgba(34,211,238,${(0.2 + intensity * 0.5).toFixed(3)})`,
          }
          return (
            <div
              key={h.n}
              title={`#${h.n} drawn ${h.count}×`}
              style={style}
              className="flex shrink-0 flex-col items-center rounded-md px-2 py-0.5 ring-1 leading-tight"
            >
              <span className="arc-mono text-sm font-bold tabular-nums text-cyan-100">{h.n}</span>
              <span className="arc-mono text-[9px] tabular-nums text-cyan-300/70">{h.count}×</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
