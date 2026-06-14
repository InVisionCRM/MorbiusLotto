'use client'

/**
 * ArcadeOddsTab — the shared "Odds" panel for every arcade2 game's info tabs.
 *
 * Renders, in the Deep-Sea Neon system, a per-game odds breakdown: an optional
 * risk/mode pill selector, a house-edge / RTP summary, and a payout table in one
 * of two auto-selected layouts:
 *   • bar layout   — outcome · proportional chance bar · chance   (short-multiplier games)
 *   • table layout — outcome · middle · right (3 text columns)     (triggered when any
 *                    row supplies `extra`; for bet/hand tables with name+pays+odds)
 *
 * Mirrors ArcadeFAQ — dumb, data-driven, themeable via `accent`. Every number
 * lives in each game's `*Odds.ts` provider; this component only lays them out.
 */

import { useState, type CSSProperties } from 'react'

export interface OddsRow {
  /** left cell — outcome / bet / hand, rendered in the mono face */
  outcome: string
  /** middle-right cell (table layout) or right cell (bar layout) — already formatted */
  chance: string
  /** right cell in table layout (e.g. probability or house edge); presence selects table layout */
  extra?: string
  /** raw weight for the inline bar (bar layout); scaled to the variant's max */
  bar?: number
  /** emphasis for the outcome cell */
  tone?: 'amber' | 'cyan' | 'slate' | 'muted'
}

export interface OddsVariant {
  id: string
  /** pill label; also the section label when there is only one variant */
  label: string
  /** house edge %, e.g. 2.97 */
  edgePct: number
  /** return to player %, e.g. 97.03 */
  rtpPct: number
  rows: OddsRow[]
  /** column headers — [outcome, chance] for bar layout, [outcome, chance, extra] for table layout */
  headers?: [string, string] | [string, string, string]
  /** small caption rendered under the table */
  note?: string
}

export interface GameOdds {
  /** one line on how payouts are decided */
  blurb: string
  variants: OddsVariant[]
}

const TONE: Record<NonNullable<OddsRow['tone']>, string> = {
  amber: 'text-amber-300',
  cyan: 'text-cyan-300',
  slate: 'text-slate-300',
  muted: 'text-slate-500',
}

interface ArcadeOddsTabProps {
  odds: GameOdds
  accent?: string
}

export function ArcadeOddsTab({ odds, accent = '#22D3EE' }: ArcadeOddsTabProps) {
  const { blurb, variants } = odds
  const [activeId, setActiveId] = useState(variants[0]?.id)
  const variant = variants.find((v) => v.id === activeId) ?? variants[0]
  if (!variant) return null

  const tableLayout = variant.rows.some((r) => r.extra !== undefined)
  const [outCol, midCol, rightCol] = variant.headers ?? ['Payout', 'Hit chance']
  const maxBar = Math.max(0, ...variant.rows.map((r) => r.bar ?? 0))
  const rootStyle = { ['--odds-accent']: accent } as CSSProperties
  const gridCls = tableLayout
    ? 'grid grid-cols-[1fr_auto_auto] items-center gap-x-4'
    : 'grid grid-cols-[58px_1fr_84px] items-center gap-3'

  return (
    <div style={rootStyle} className="space-y-3">
      <p className="text-[13px] leading-relaxed text-slate-400">{blurb}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {variants.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {variants.map((v) => {
              const on = v.id === variant.id
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setActiveId(v.id)}
                  className={`arc-display rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                    on
                      ? 'text-[#06121c] shadow-[0_0_14px_rgba(34,211,238,0.35)]'
                      : 'text-slate-500 ring-1 ring-slate-500/20 hover:text-slate-300'
                  }`}
                  style={on ? { backgroundColor: 'var(--odds-accent)' } : undefined}
                >
                  {v.label}
                </button>
              )
            })}
          </div>
        ) : (
          <span className="arc-display text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {variant.label}
          </span>
        )}

        <div className="flex items-stretch gap-2.5">
          <Stat label="House edge" value={`${variant.edgePct.toFixed(2)}%`} color={accent} />
          <span className="w-px bg-cyan-500/15" />
          <Stat label="RTP" value={`${variant.rtpPct.toFixed(2)}%`} />
        </div>
      </div>

      <div>
        <div className={`${gridCls} px-0.5 pb-1`}>
          <span className="arc-display text-[9px] uppercase tracking-[0.12em] text-slate-600">{outCol}</span>
          {tableLayout ? (
            <span className="arc-display text-right text-[9px] uppercase tracking-[0.12em] text-slate-600">
              {midCol}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
          <span className="arc-display text-right text-[9px] uppercase tracking-[0.12em] text-slate-600">
            {tableLayout ? rightCol : midCol}
          </span>
        </div>
        <ul>
          {variant.rows.map((r, i) => (
            <li key={i} className={`${gridCls} border-t border-cyan-950/40 py-2`}>
              <span className={`arc-mono text-sm font-semibold tabular-nums ${TONE[r.tone ?? 'slate']}`}>
                {r.outcome}
              </span>
              {tableLayout ? (
                <span className="arc-mono text-right text-xs tabular-nums text-slate-300">{r.chance}</span>
              ) : maxBar > 0 ? (
                <span className="h-[7px] overflow-hidden rounded-full bg-slate-500/10">
                  <span
                    className="block h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${Math.max(3, ((r.bar ?? 0) / maxBar) * 100)}%`,
                      backgroundColor: r.tone === 'amber' ? '#FBBF24' : 'var(--odds-accent)',
                      opacity: r.bar ? 1 : 0,
                    }}
                  />
                </span>
              ) : (
                <span aria-hidden="true" />
              )}
              <span className="arc-mono text-right text-xs tabular-nums text-slate-400">
                {tableLayout ? r.extra : r.chance}
              </span>
            </li>
          ))}
        </ul>
        {variant.note ? (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{variant.note}</p>
        ) : null}
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-right">
      <div className="arc-display text-[9px] uppercase tracking-[0.1em] text-slate-600">{label}</div>
      <div
        className="arc-mono text-[15px] font-semibold tabular-nums text-slate-300"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  )
}
