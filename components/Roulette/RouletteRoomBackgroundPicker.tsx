'use client'

import { ROULETTE_ROOM_BACKGROUNDS, type RouletteRoomBgId } from '@/lib/roulette-room-backgrounds'
import { cn } from '@/lib/utils'

/** Matches `.morb-roulette-table-rail` framing (inset grey + charcoal gradient family). */
const RAIL_BORDER = 'rgba(60, 60, 60, 0.55)'
const RAIL_RING = 'rgba(110, 118, 132, 0.92)'
const RAIL_GLOW = '0 2px 14px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(75, 82, 94, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.1)'

export function RouletteRoomBackgroundPicker({
  activeId,
  onSelect,
}: {
  activeId: RouletteRoomBgId
  onSelect: (id: RouletteRoomBgId) => void
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5"
      style={{
        borderColor: RAIL_BORDER,
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
        boxShadow:
          'inset 0 3px 6px rgba(0, 0, 0, 0.75), inset 0 -2px 5px rgba(255, 255, 255, 0.06), 0 2px 10px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(75, 82, 94, 0.35)',
      }}
      role="group"
      aria-label="Room atmosphere"
    >
      <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40 shrink-0">
        Room
      </span>
      {ROULETTE_ROOM_BACKGROUNDS.map((p) => {
        const selected = p.id === activeId
        return (
          <button
            key={p.id}
            type="button"
            title={p.label}
            aria-label={`${p.label} room`}
            aria-pressed={selected}
            onClick={() => onSelect(p.id)}
            className={cn(
              'relative h-8 w-8 shrink-0 rounded-md border-2 transition-transform duration-150',
              selected
                ? 'scale-105'
                : 'border-white/15 opacity-85 hover:opacity-100 hover:border-white/30 active:scale-95'
            )}
            style={
              selected
                ? { backgroundColor: p.swatch, borderColor: RAIL_RING, boxShadow: RAIL_GLOW }
                : { backgroundColor: p.swatch }
            }
          />
        )
      })}
    </div>
  )
}
