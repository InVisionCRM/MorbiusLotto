'use client'

/**
 * GameLimitsGrid — per-game bet limits with oversight.
 *
 * Collapsed: min → max as big editable numbers, plus a live "max available to
 * win" that recomputes as you type. Hover opens a drawer with the game's
 * performance, biggest win and recent limit changes.
 *
 * "Max available to win" uses the multiplier the game has ACTUALLY produced
 * (maxMultiplierSeen from the ledger), because only 1 of the 22 games declares a
 * payout cap in code — an observed maximum is honest where a theoretical one
 * would be invented. Games with no plays yet simply can't show it.
 */

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, Loader2, RotateCcw } from 'lucide-react'
import {
  useGameLimits,
  useResetGameLimit,
  useSaveGameLimits,
  type GameLimitRow,
} from '@/hooks/use-game-limits'
import type { DashWindow } from '@/hooks/use-admin-dashboard'
import { fmt, fmtCompact, isNegative, timeAgo } from './dashboard-ui'

/** Route per game so "Go to game" lands somewhere real. */
const HREF: Record<string, string> = {
  dice: '/dice', dicex2: '/dicex2', limbo: '/limbo', mines: '/mines', crash: '/crash',
  towers: '/towers', chicken: '/chicken', hilo: '/hilo', firewalk: '/firewalk',
  heist: '/heist', baccarat: '/baccarat', keno: '/keno', plinko: '/plinko',
  roulette: '/roulette', pachinko: '/pachinko', cascade: '/cascade', cipher: '/cipher',
  greed_dice: '/greed-dice', andar_bahar: '/andar-bahar', dragon_tiger: '/dragon-tiger',
  three_card_poker: '/three-card-poker', pai_gow_poker: '/pai-gow-poker',
}
const ICON: Record<string, string> = {
  dice: '🎲', dicex2: '🎯', limbo: '🚀', mines: '💣', crash: '📈', towers: '🗼',
  chicken: '🐔', hilo: '↕', firewalk: '🔥', heist: '🏦', baccarat: '🃏', keno: '🔢',
  plinko: '🔻', roulette: '🎡', pachinko: '🏮', cascade: '💧', cipher: '🔐',
  greed_dice: '🤑', andar_bahar: '🪭', dragon_tiger: '🐉', three_card_poker: '🂡',
  pai_gow_poker: '🀄',
}

type Draft = Record<string, { min: string; max: string }>

export default function GameLimitsGrid({
  enabled,
  window: win,
  bankroll,
}: {
  enabled: boolean
  window: DashWindow
  bankroll: number
}) {
  const { data, isLoading } = useGameLimits(enabled, win)
  const save = useSaveGameLimits()
  const reset = useResetGameLimit()
  const [draft, setDraft] = useState<Draft>({})
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const games = data?.games ?? []

  const valueOf = useCallback(
    (g: GameLimitRow, f: 'min' | 'max') => draft[g.gameKey]?.[f] ?? String(g[f]),
    [draft],
  )

  const dirty = useMemo(() => {
    const out: Array<{ gameKey: string; min: number; max: number }> = []
    for (const g of games) {
      const d = draft[g.gameKey]
      if (!d) continue
      const min = Number(d.min), max = Number(d.max)
      if (!Number.isFinite(min) || !Number.isFinite(max)) continue
      if (min !== g.min || max !== g.max) out.push({ gameKey: g.gameKey, min, max })
    }
    return out
  }, [draft, games])

  const edit = (key: string, f: 'min' | 'max', v: string, g: GameLimitRow) =>
    setDraft((d) => ({
      ...d,
      [key]: {
        min: f === 'min' ? v : (d[key]?.min ?? String(g.min)),
        max: f === 'max' ? v : (d[key]?.max ?? String(g.max)),
      },
    }))

  const onSave = async () => {
    setErr(null); setOk(null)
    try {
      const r = await save.mutateAsync(dirty)
      setDraft({})
      setOk(`Updated ${r.updated.length} game${r.updated.length === 1 ? '' : 's'}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    }
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    )
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-white/40">
          Limits apply immediately once saved. Max win uses each game&apos;s largest observed
          multiplier — games with no plays in this window can&apos;t show one.
        </p>
        {(err || ok) && (
          <span className={`text-xs font-semibold ${err ? 'text-rose-300' : 'text-emerald-300'}`}>
            {err ?? ok}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {games.map((g) => (
          <Card
            key={g.gameKey}
            g={g}
            bankroll={bankroll}
            minV={valueOf(g, 'min')}
            maxV={valueOf(g, 'max')}
            onEdit={(f, v) => edit(g.gameKey, f, v, g)}
            onReset={() => reset.mutate(g.gameKey)}
            history={data?.history.filter((h) => h.gameKey === g.gameKey).slice(0, 3) ?? []}
          />
        ))}
      </div>

      {dirty.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-[200] flex items-center justify-between gap-3 border-t border-white/10 bg-[#090c14]/95 px-5 py-3 backdrop-blur">
          <span className="text-sm font-bold text-amber-300">
            {dirty.length} unsaved limit change{dirty.length === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setDraft({}); setErr(null) }}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/60 hover:bg-white/5"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={onSave}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-black transition enabled:hover:bg-amber-300 disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save limits
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function Card({
  g, bankroll, minV, maxV, onEdit, onReset, history,
}: {
  g: GameLimitRow
  bankroll: number
  minV: string
  maxV: string
  onEdit: (f: 'min' | 'max', v: string) => void
  onReset: () => void
  history: Array<{ admin: string; oldMin: number | null; oldMax: number | null; newMin: number; newMax: number; at: string }>
}) {
  const s = g.stats
  const mult = s?.maxMultiplierSeen ?? null
  const maxNum = Number(maxV) || 0
  const maxWin = mult != null ? Math.round(maxNum * mult) : null
  const expo = maxWin != null && bankroll > 0 ? (maxWin / bankroll) * 100 : null
  const hot = expo != null && expo > 10
  const changed = Number(minV) !== g.min || Number(maxV) !== g.max
  const invalid = Number(maxV) < Number(minV) || Number(minV) < 1

  return (
    <div
      className={`group relative rounded-2xl border p-4 transition ${
        hot ? 'border-rose-400/40' : changed ? 'border-amber-400/45' : 'border-white/10'
      } bg-gradient-to-br from-white/[0.055] to-white/[0.012] hover:z-50 hover:rounded-b-none hover:border-cyan-400/45`}
    >
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.06] text-base">
          {ICON[g.gameKey] ?? '🎰'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold">{g.label}</div>
          {g.overridden && (
            <div className="text-[10px] font-semibold text-cyan-300/80">
              custom · default {fmt(g.defaultMin)}–{fmt(g.defaultMax)}
            </div>
          )}
        </div>
        {g.overridden && (
          <button
            type="button"
            onClick={onReset}
            title="Reset to the built-in default"
            className="rounded-lg p-1.5 text-white/35 transition hover:bg-white/5 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* min → max, big */}
      <div className="mt-3.5 flex items-end gap-2.5">
        <Field label="Min" value={minV} onChange={(v) => onEdit('min', v)} dirty={Number(minV) !== g.min} />
        <span className="pb-1.5 text-lg font-extrabold text-white/25">→</span>
        <Field
          label={g.gameKey === 'roulette' ? 'Max / zone' : 'Max'}
          value={maxV}
          onChange={(v) => onEdit('max', v)}
          dirty={Number(maxV) !== g.max}
        />
      </div>
      {invalid && (
        <div className="mt-1.5 text-[11px] font-semibold text-rose-300">Max must be ≥ min, min ≥ 1</div>
      )}

      {/* max win */}
      <div className="mt-3.5 border-t border-white/[0.08] pt-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/30">
          Max available to win
        </div>
        {maxWin != null ? (
          <>
            <div className={`mt-1 text-[32px] font-extrabold leading-none tracking-tight tabular-nums ${hot ? 'text-rose-300' : 'text-amber-300'}`}>
              {fmtCompact(String(maxWin))}
            </div>
            <div className="mt-1.5 text-[11px] text-white/30">
              at {mult?.toLocaleString()}× best observed
              {expo != null && <> · <b className={hot ? 'text-rose-300' : ''}>{expo.toFixed(1)}%</b> of bankroll</>}
            </div>
            <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className={`h-full rounded-full transition-all ${hot ? 'bg-gradient-to-r from-amber-400 to-rose-400' : 'bg-gradient-to-r from-cyan-400 to-violet-400'}`}
                style={{ width: `${Math.min(100, expo ?? 0)}%` }}
              />
            </div>
          </>
        ) : (
          <div className="mt-1.5 text-sm text-white/30">No plays yet in this window</div>
        )}
      </div>

      <div className="mt-2.5 text-center text-[9px] font-semibold uppercase tracking-[0.1em] text-white/25 transition group-hover:opacity-0">
        hover for detail
      </div>

      {/* drawer */}
      <div className="pointer-events-none absolute -inset-x-px top-full max-h-0 overflow-hidden rounded-b-2xl border border-t-0 border-cyan-400/45 bg-[#0b1018] opacity-0 shadow-2xl transition-all duration-200 group-hover:pointer-events-auto group-hover:max-h-[520px] group-hover:px-4 group-hover:pb-4 group-hover:opacity-100">
        {s ? (
          <>
            <div className="grid grid-cols-4 gap-1.5 pt-3">
              <Kv k="Wagered" v={fmtCompact(s.wagered)} />
              <Kv k="Won" v={fmtCompact(s.won)} />
              <Kv k="Hold" v={`${s.holdPct.toFixed(1)}%`} tone={isNegative(s.net) ? 'bad' : 'good'} />
              <Kv k="Players" v={String(s.players)} />
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2">
              <div>
                <div className="text-base font-extrabold tabular-nums text-amber-300">{fmt(s.biggestWin)}</div>
                <div className="text-[10.5px] text-white/45">
                  biggest win{s.biggestWinBy ? ` · ${s.biggestWinBy.slice(0, 6)}…${s.biggestWinBy.slice(-4)}` : ''}
                </div>
              </div>
              <div className="ml-auto text-[10px] text-white/30">{s.plays.toLocaleString()} plays</div>
            </div>
            {history.length > 0 && (
              <div className="mt-2">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.09em] text-white/30">
                  Recent limit changes
                </div>
                {history.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5 text-[10.5px] text-white/45">
                    <span className="tabular-nums">
                      {h.oldMin != null ? `${fmt(h.oldMin)}–${fmt(h.oldMax ?? 0)}` : 'default'} → {fmt(h.newMin)}–{fmt(h.newMax)}
                    </span>
                    <span className="ml-auto text-white/25">{timeAgo(h.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="py-5 text-center text-xs text-white/30">No activity in this window.</div>
        )}
        <div className="mt-2.5 flex items-center gap-2 border-t border-white/[0.07] pt-2.5">
          <span className="text-[10.5px] text-white/30">
            {s?.lastPlayAt ? `last play ${timeAgo(s.lastPlayAt)}` : 'idle'}
          </span>
          {hot && (
            <span className="inline-flex items-center gap-1 rounded-md border border-rose-400/30 bg-rose-400/10 px-1.5 py-0.5 text-[9.5px] font-bold text-rose-300">
              <AlertTriangle className="h-2.5 w-2.5" /> high exposure
            </span>
          )}
          <Link
            href={HREF[g.gameKey] ?? '/'}
            target="_blank"
            className="ml-auto rounded-lg border border-cyan-400/35 bg-cyan-400/12 px-3 py-1.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-400/20"
          >
            Go to game ↗
          </Link>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, dirty,
}: { label: string; value: string; onChange: (v: string) => void; dirty: boolean }) {
  return (
    <div className={`min-w-0 flex-1 rounded-xl border px-3 py-2 ${dirty ? 'border-amber-400/50 bg-amber-400/[0.09]' : 'border-white/[0.07] bg-black/25'}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.11em] text-white/30">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        inputMode="numeric"
        className={`mt-1 w-full border-0 bg-transparent p-0 text-[26px] font-extrabold leading-none tracking-tight tabular-nums focus:outline-none ${dirty ? 'text-amber-300' : 'text-white focus:text-cyan-300'}`}
      />
    </div>
  )
}

function Kv({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.03] px-2 py-1.5">
      <div className="text-[8.5px] font-bold uppercase tracking-[0.09em] text-white/30">{k}</div>
      <div className={`mt-0.5 text-[13px] font-extrabold tabular-nums ${tone === 'bad' ? 'text-rose-300' : tone === 'good' ? 'text-emerald-300' : 'text-white'}`}>
        {v}
      </div>
    </div>
  )
}
