'use client'

/**
 * GameHowTo — the uniform "How to play" surface shared across every game.
 *
 * One clean template: a compact gradient header tinted by the game's accent,
 * the blown-up homepage game art (the SVG scenes from home2/scenes), a row of
 * feature pills, then short scannable sections — steps, optional payouts, and
 * "good to know" notes. One accent colour, one font, no neon, no blockchain
 * claims. Callers pass truthful, concise content via props.
 *
 * It renders just the card content, so it drops into a Dialog, a tab panel, or
 * a page unchanged. SceneDefs is baked in so the game art's gradients resolve
 * wherever the guide is shown.
 */

import React from 'react'
import { SceneDefs } from '@/components/home2/scenes'

export interface HowToStep {
  title: string
  detail?: string
}
export interface HowToPayoutRow {
  label: string
  value: string
  /** Accent dot + value colour, e.g. "#34d399". Defaults to the game accent. */
  color?: string
}
export interface HowToNote {
  title: string
  body: string
}
export interface HowToPill {
  label: string
  /** Muted pills are game-specific / secondary. */
  muted?: boolean
}

export interface GameHowToProps {
  name: string
  tagline: string
  /** The homepage game art (an SVG <Scene /> element or an <img>). */
  art: React.ReactNode
  /** Accent hex; defaults to the app cyan. */
  accent?: string
  pills?: HowToPill[]
  steps: HowToStep[]
  payouts?: { heading?: string; rows: HowToPayoutRow[] }
  notes?: HowToNote[]
  className?: string
}

const DEFAULT_ACCENT = '#22d3ee'

export function GameHowTo({
  name,
  tagline,
  art,
  accent = DEFAULT_ACCENT,
  pills = [],
  steps,
  payouts,
  notes = [],
  className = '',
}: GameHowToProps) {
  const a = accent
  // Reused accent-tinted styles (color-mix keeps a single source of truth).
  const tint = (pct: number) => `color-mix(in srgb, ${a} ${pct}%, transparent)`

  return (
    <div
      className={`gh-root ${className}`}
      style={{ ['--gh-accent' as string]: a }}
    >
      {/* Bake in the scene gradient/filter defs so game art renders anywhere. */}
      <SceneDefs />

      <style>{`
        .gh-root{color:#e6eef8;font-family:var(--font-geist-sans),ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
        .gh-hd{position:relative;padding:22px 20px 16px;text-align:center;border-bottom:1px solid rgba(255,255,255,.08);
          background:radial-gradient(120% 130% at 50% -20%, ${tint(24)}, transparent 60%), linear-gradient(180deg, ${tint(9)}, transparent)}
        .gh-art{width:150px;height:104px;margin:0 auto 10px;display:block;filter:drop-shadow(0 10px 20px rgba(0,0,0,.5))}
        .gh-art svg{width:100%;height:100%;display:block}
        .gh-title{font-size:22px;font-weight:800;letter-spacing:.01em;margin:0;color:#f2f7fd}
        .gh-tag{font-size:12.5px;color:#8ea3ba;margin-top:3px}
        .gh-pills{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:13px}
        .gh-pill{font-size:10.5px;font-weight:600;letter-spacing:.02em;border-radius:99px;padding:4px 10px;color:#e6eef8;background:${tint(12)};border:1px solid ${tint(30)}}
        .gh-pill.mut{color:#8ea3ba;background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.08)}
        .gh-bd{padding:16px 20px 20px}
        .gh-sec{margin-bottom:16px}
        .gh-sec:last-child{margin-bottom:0}
        .gh-h3{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5f7488;margin:0 0 10px;font-weight:700}
        .gh-step{display:flex;gap:11px;align-items:flex-start;margin-bottom:11px}
        .gh-step:last-child{margin-bottom:0}
        .gh-n{flex:none;width:22px;height:22px;border-radius:7px;display:grid;place-items:center;font-size:11px;font-weight:800;color:var(--gh-accent);background:${tint(14)};border:1px solid ${tint(26)}}
        .gh-st{font-size:13px;font-weight:600;line-height:1.35;color:#e6eef8}
        .gh-st small{display:block;font-weight:400;color:#8ea3ba;font-size:11.5px;margin-top:1px}
        .gh-prow{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;margin-bottom:7px;background:rgba(255,255,255,.02)}
        .gh-prow:last-child{margin-bottom:0}
        .gh-pl{display:flex;align-items:center;gap:9px;font-size:12.5px;font-weight:600}
        .gh-dot{width:8px;height:8px;border-radius:50%}
        .gh-pv{font-size:12.5px;font-weight:800;font-variant-numeric:tabular-nums}
        .gh-note{display:flex;gap:9px;font-size:12px;color:#8ea3ba;line-height:1.45;margin-bottom:8px}
        .gh-note:last-child{margin-bottom:0}
        .gh-note b{color:#e6eef8;font-weight:600}
        .gh-mk{color:var(--gh-accent);flex:none;margin-top:1px}
      `}</style>

      <div className="gh-hd">
        {art ? <div className="gh-art">{art}</div> : null}
        <h2 className="gh-title">{name}</h2>
        <div className="gh-tag">{tagline}</div>
        {pills.length > 0 && (
          <div className="gh-pills">
            {pills.map((p, i) => (
              <span key={i} className={`gh-pill${p.muted ? ' mut' : ''}`}>{p.label}</span>
            ))}
          </div>
        )}
      </div>

      <div className="gh-bd">
        <section className="gh-sec">
          <h3 className="gh-h3">How to play</h3>
          {steps.map((s, i) => (
            <div key={i} className="gh-step">
              <div className="gh-n">{i + 1}</div>
              <div className="gh-st">
                {s.title}
                {s.detail ? <small>{s.detail}</small> : null}
              </div>
            </div>
          ))}
        </section>

        {payouts && payouts.rows.length > 0 && (
          <section className="gh-sec">
            <h3 className="gh-h3">{payouts.heading ?? 'Payouts'}</h3>
            {payouts.rows.map((r, i) => (
              <div key={i} className="gh-prow">
                <div className="gh-pl">
                  <span className="gh-dot" style={{ background: r.color ?? a }} />
                  {r.label}
                </div>
                <div className="gh-pv" style={{ color: r.color ?? a }}>{r.value}</div>
              </div>
            ))}
          </section>
        )}

        {notes.length > 0 && (
          <section className="gh-sec">
            <h3 className="gh-h3">Good to know</h3>
            {notes.map((n, i) => (
              <div key={i} className="gh-note">
                <span className="gh-mk">›</span>
                <div><b>{n.title}</b> {n.body}</div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
