'use client'

/**
 * LiveBadge — "is anyone playing right now?" for the admin dashboard.
 *
 * Polls the live endpoint every 10s (independently of the heavy dashboard
 * query). Green and pulsing when there is betting activity in the window, muted
 * when the floor is quiet. Click to see exactly who is playing and on what.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useLiveNow } from '@/hooks/use-admin-dashboard'
import { WalletCell, fmt, timeAgo } from './dashboard-ui'

export default function LiveBadge({ enabled, minutes = 5 }: { enabled: boolean; minutes?: number }) {
  const { data } = useLiveNow(enabled, minutes)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close the popover on any outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const players = data?.players ?? 0
  const live = players > 0

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
          live
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15'
            : 'border-white/10 bg-white/[0.03] text-white/45 hover:text-white/70'
        }`}
        title={
          live
            ? `${players} player${players === 1 ? '' : 's'} betting in the last ${minutes} min`
            : `No bets in the last ${minutes} min`
        }
      >
        <span className="relative flex h-2 w-2">
          {live && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              live ? 'bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,.18)]' : 'bg-white/25'
            }`}
          />
        </span>
        {live ? (
          <>
            <span className="tabular-nums">{players}</span> playing now
          </>
        ) : (
          'Nobody playing'
        )}
        <ChevronDown className={`h-3 w-3 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f18] shadow-2xl sm:w-[380px]">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="text-sm font-bold text-white">
              {live ? `${players} playing right now` : 'Floor is quiet'}
            </div>
            <div className="mt-0.5 text-xs text-white/45">
              {live
                ? `${(data?.plays ?? 0).toLocaleString()} bets · ${fmt(data?.wagered)} MORBIUS wagered · last ${minutes} min`
                : `No bets in the last ${minutes} minutes`}
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {!data || data.active.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-white/35">
                {data?.lastPlayAt
                  ? `Last play ${timeAgo(data.lastPlayAt)}`
                  : 'Nothing yet.'}
              </div>
            ) : (
              data.active.map((p) => (
                <div
                  key={p.wallet}
                  className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-0 hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <WalletCell wallet={p.wallet} displayName={p.displayName} />
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-semibold text-white/70">{p.gameLabel}</div>
                    <div className="text-[10px] text-white/35">
                      {p.plays} bet{p.plays === 1 ? '' : 's'} · {fmt(p.wagered)}
                    </div>
                  </div>
                  <div className="w-12 shrink-0 text-right text-[10px] text-white/30">
                    {timeAgo(p.lastAt)}
                  </div>
                </div>
              ))
            )}
          </div>

          {live && data && data.players > data.active.length && (
            <div className="border-t border-white/10 px-4 py-2 text-[11px] text-white/35">
              Showing {data.active.length} of {data.players} active players.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
