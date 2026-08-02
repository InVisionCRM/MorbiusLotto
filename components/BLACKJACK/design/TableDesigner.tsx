'use client';

/**
 * Blackjack table designer.
 *
 * Renders the real seat and dealer components against fixture state, inside a
 * BlackjackTableLayoutProvider driven by the panel. Click a seat or the dealer
 * to select it, then drag its knobs and watch the actual table move — no
 * wallet, no socket, no waiting for a round.
 *
 * Like the Theme Studio, the panel is styled with fixed inline colours rather
 * than app classes: it is a tool for judging the table, so it must not shift
 * when the table's own styling does.
 */

import { useCallback, useMemo, useState } from 'react';
import { BlackjackMultiSeatGrid } from '@/components/BLACKJACK/multi/BlackjackMultiSeatGrid';
import { BlackjackMultiDealerArea } from '@/components/BLACKJACK/multi/BlackjackMultiDealerArea';
import { BlackjackTableLayoutProvider } from '@/components/BLACKJACK/BlackjackTableLayoutContext';
import {
  DEFAULT_BLACKJACK_TABLE_LAYOUT,
  mergeTableLayout,
  type BlackjackTableLayout,
} from '@/lib/blackjack-table-layout';
import { DESIGN_SCENARIOS } from '@/lib/blackjack-design-fixtures';
import type { BJMultiSeatState } from '@/lib/websocket-client';

const UI = {
  bg: '#0b0f14',
  panel: '#0f151c',
  border: '#1f2933',
  raised: '#161e27',
  text: '#e6edf3',
  dim: '#8b98a5',
  accent: '#4493f8',
  selected: '#f0b429',
} as const;

type Selection =
  | { kind: 'seat'; index: number }
  | { kind: 'dealer' }
  | { kind: 'cards' }
  | { kind: 'motion' };

/** One editable number, rendered as a slider plus a readout. */
function Knob({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <label style={{ width: 78, fontSize: 11, color: UI.dim }}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: UI.accent, height: 16 }}
      />
      <span
        style={{
          width: 52,
          textAlign: 'right',
          fontSize: 10,
          fontVariantNumeric: 'tabular-nums',
          color: UI.text,
        }}
      >
        {Math.round(value * 100) / 100}
        {suffix}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: UI.text }}>{title}</div>
      {children}
    </div>
  );
}

export default function TableDesigner() {
  const [layout, setLayout] = useState<BlackjackTableLayout>(DEFAULT_BLACKJACK_TABLE_LAYOUT);
  const [scenarioId, setScenarioId] = useState(DESIGN_SCENARIOS[0].id);
  const [selection, setSelection] = useState<Selection>({ kind: 'seat', index: 1 });
  const [showGuides, setShowGuides] = useState(true);
  const [copied, setCopied] = useState(false);

  const scenario = DESIGN_SCENARIOS.find((s) => s.id === scenarioId) ?? DESIGN_SCENARIOS[0];
  const state = scenario.state;

  const seats = useMemo(
    () =>
      [0, 1, 2].map((p) => state.seats.find((s) => s.position === p) ?? null) as [
        BJMultiSeatState | null,
        BJMultiSeatState | null,
        BJMultiSeatState | null,
      ],
    [state],
  );

  const patch = useCallback((fn: (draft: BlackjackTableLayout) => BlackjackTableLayout) => {
    setLayout((prev) => fn(prev));
  }, []);

  const setSeat = useCallback(
    (index: number, key: 'cx' | 'floorY' | 'angle', value: number) => {
      patch((prev) => ({
        ...prev,
        seats: prev.seats.map((s, i) => (i === index ? { ...s, [key]: value } : s)),
      }));
    },
    [patch],
  );

  /** Only the fields that differ from the shipped defaults — what a table theme would store. */
  const diff = useMemo(() => {
    const base = DEFAULT_BLACKJACK_TABLE_LAYOUT;
    const out: Record<string, unknown> = {};
    if (JSON.stringify(layout.seats) !== JSON.stringify(base.seats)) out.seats = layout.seats;
    if (JSON.stringify(layout.dealer) !== JSON.stringify(base.dealer)) out.dealer = layout.dealer;
    if (JSON.stringify(layout.cards) !== JSON.stringify(base.cards)) out.cards = layout.cards;
    if (JSON.stringify(layout.motion) !== JSON.stringify(base.motion)) out.motion = layout.motion;
    if (JSON.stringify(layout.emotes) !== JSON.stringify(base.emotes)) out.emotes = layout.emotes;
    return out;
  }, [layout]);

  const changeCount = Object.keys(diff).length;

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diff, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the JSON is still visible below */
    }
  }, [diff]);

  const isSel = (s: Selection) =>
    s.kind === selection.kind && (s.kind !== 'seat' || s.index === (selection as { index: number }).index);

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: UI.bg,
        color: UI.text,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ── Stage ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: 24, minWidth: 0 }}>
        <div style={{ marginBottom: 12 }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Blackjack table designer</h1>
          <p style={{ fontSize: 12, color: UI.dim, margin: '4px 0 0' }}>
            The real table components against fixture state. Click a seat or the dealer to select it.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {DESIGN_SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.description}
              onClick={() => setScenarioId(s.id)}
              style={{
                background: s.id === scenarioId ? UI.accent : UI.raised,
                color: s.id === scenarioId ? '#fff' : UI.text,
                border: `1px solid ${s.id === scenarioId ? UI.accent : UI.border}`,
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {s.name}
            </button>
          ))}
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: UI.dim, marginLeft: 4 }}
          >
            <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
            Guides
          </label>
        </div>

        {/* The 800×450 canvas the real table uses, at 1:1 so canvas px are screen px. */}
        <BlackjackTableLayoutProvider layout={layout}>
          <div
            style={{
              position: 'relative',
              width: layout.canvas.width,
              height: layout.canvas.height,
              maxWidth: '100%',
              background: 'radial-gradient(ellipse at 50% 35%, #12331f 0%, #0a1f13 60%, #06120b 100%)',
              border: `1px solid ${UI.border}`,
              borderRadius: 12,
              overflow: 'hidden',
            }}
            className="blackjack-table"
          >
            {showGuides && (
              <svg
                width={layout.canvas.width}
                height={layout.canvas.height}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40 }}
              >
                <line
                  x1={layout.canvas.width / 2}
                  y1={0}
                  x2={layout.canvas.width / 2}
                  y2={layout.canvas.height}
                  stroke="rgba(255,255,255,0.12)"
                  strokeDasharray="4 6"
                />
                {layout.seats.map((s, i) => (
                  <g key={i}>
                    <line
                      x1={s.cx}
                      y1={s.floorY - 6}
                      x2={s.cx}
                      y2={s.floorY + 6}
                      stroke={isSel({ kind: 'seat', index: i }) ? UI.selected : 'rgba(255,255,255,0.35)'}
                      strokeWidth={2}
                    />
                    <circle
                      cx={s.cx}
                      cy={s.floorY}
                      r={3}
                      fill={isSel({ kind: 'seat', index: i }) ? UI.selected : 'rgba(255,255,255,0.35)'}
                    />
                  </g>
                ))}
                <circle
                  cx={layout.dealer.cx}
                  cy={layout.dealer.top}
                  r={3}
                  fill={selection.kind === 'dealer' ? UI.selected : 'rgba(255,255,255,0.35)'}
                />
              </svg>
            )}

            {/* Dealer — same placement rule as the live table. */}
            <div
              style={{
                position: 'absolute',
                left: layout.dealer.cx,
                top: layout.dealer.top,
                transform: 'translateX(-50%)',
                outline: selection.kind === 'dealer' ? `2px solid ${UI.selected}` : 'none',
                outlineOffset: 4,
                borderRadius: 6,
                cursor: 'pointer',
              }}
              onClick={() => setSelection({ kind: 'dealer' })}
            >
              <BlackjackMultiDealerArea
                tableViewState={state}
                visibleDealerCards={state.dealerCards.length}
              />
            </div>

            <BlackjackMultiSeatGrid
              seats={seats}
              addressLower={undefined}
              phase={state.phase}
              actingSeatPosition={state.actingSeatPosition}
              myPosition={null}
              wsConnected
              afkTimeoutsBeforeKick={3}
              myBalanceLabel=""
              showOutcomeLabel={false}
              turnStartedAt={null}
              bettingStartedAt={null}
              onTakeSeat={() => {}}
              onOpenProfile={() => {}}
            />

            {/* Click targets for seat selection, above the seats but visually empty. */}
            {layout.seats.map((s, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Select seat ${i + 1}`}
                onClick={() => setSelection({ kind: 'seat', index: i })}
                style={{
                  position: 'absolute',
                  left: s.cx - 60,
                  top: s.floorY - 40,
                  width: 120,
                  height: 44,
                  background: 'transparent',
                  border: isSel({ kind: 'seat', index: i }) ? `2px solid ${UI.selected}` : '1px dashed rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  zIndex: 45,
                }}
              />
            ))}
          </div>
        </BlackjackTableLayoutProvider>
      </div>

      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      <aside
        style={{
          width: 330,
          flexShrink: 0,
          background: UI.panel,
          borderLeft: `1px solid ${UI.border}`,
          padding: 16,
          overflowY: 'auto',
          maxHeight: '100vh',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: 13 }}>Layout</strong>
          <span style={{ marginLeft: 8, fontSize: 11, color: UI.dim }}>
            {changeCount ? `${changeCount} group${changeCount === 1 ? '' : 's'} changed` : 'default'}
          </span>
          <button
            type="button"
            onClick={() => setLayout(DEFAULT_BLACKJACK_TABLE_LAYOUT)}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: `1px solid ${UI.border}`,
              color: UI.dim,
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
          {([
            { label: 'Seat 1', sel: { kind: 'seat', index: 0 } as Selection },
            { label: 'Seat 2', sel: { kind: 'seat', index: 1 } as Selection },
            { label: 'Seat 3', sel: { kind: 'seat', index: 2 } as Selection },
            { label: 'Dealer', sel: { kind: 'dealer' } as Selection },
            { label: 'Cards', sel: { kind: 'cards' } as Selection },
            { label: 'Motion', sel: { kind: 'motion' } as Selection },
          ]).map(({ label, sel }) => (
            <button
              key={label}
              type="button"
              onClick={() => setSelection(sel)}
              style={{
                background: isSel(sel) ? UI.accent : 'transparent',
                color: isSel(sel) ? '#fff' : UI.dim,
                border: `1px solid ${isSel(sel) ? UI.accent : UI.border}`,
                borderRadius: 6,
                padding: '4px 9px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {selection.kind === 'seat' && (
          <Section title={`Seat ${selection.index + 1}`}>
            <Knob
              label="Across"
              value={layout.seats[selection.index].cx}
              min={0}
              max={layout.canvas.width}
              onChange={(v) => setSeat(selection.index, 'cx', v)}
            />
            <Knob
              label="Down"
              value={layout.seats[selection.index].floorY}
              min={0}
              max={layout.canvas.height}
              onChange={(v) => setSeat(selection.index, 'floorY', v)}
            />
            <Knob
              label="Angle"
              value={layout.seats[selection.index].angle}
              min={-45}
              max={45}
              suffix="°"
              onChange={(v) => setSeat(selection.index, 'angle', v)}
            />
          </Section>
        )}

        {selection.kind === 'dealer' && (
          <Section title="Dealer">
            <Knob
              label="Across"
              value={layout.dealer.cx}
              min={0}
              max={layout.canvas.width}
              onChange={(v) => patch((p) => ({ ...p, dealer: { ...p.dealer, cx: v } }))}
            />
            <Knob
              label="Down"
              value={layout.dealer.top}
              min={0}
              max={layout.canvas.height}
              onChange={(v) => patch((p) => ({ ...p, dealer: { ...p.dealer, top: v } }))}
            />
          </Section>
        )}

        {selection.kind === 'cards' && (
          <>
            <Section title="Stacking">
              <Knob
                label="Dealer"
                value={layout.cards.overlap.dealer}
                min={-60}
                max={20}
                suffix="px"
                onChange={(v) =>
                  patch((p) => ({ ...p, cards: { ...p.cards, overlap: { ...p.cards.overlap, dealer: v } } }))
                }
              />
              <Knob
                label="Player"
                value={layout.cards.overlap.player}
                min={-60}
                max={20}
                suffix="px"
                onChange={(v) =>
                  patch((p) => ({ ...p, cards: { ...p.cards, overlap: { ...p.cards.overlap, player: v } } }))
                }
              />
            </Section>
            <Section title="Card size (normal)">
              <Knob
                label="Width"
                value={layout.cards.sizes.normal.w}
                min={40}
                max={160}
                suffix="px"
                onChange={(v) =>
                  patch((p) => ({
                    ...p,
                    cards: { ...p.cards, sizes: { ...p.cards.sizes, normal: { ...p.cards.sizes.normal, w: v } } },
                  }))
                }
              />
              <Knob
                label="Height"
                value={layout.cards.sizes.normal.h}
                min={56}
                max={224}
                suffix="px"
                onChange={(v) =>
                  patch((p) => ({
                    ...p,
                    cards: { ...p.cards, sizes: { ...p.cards.sizes, normal: { ...p.cards.sizes.normal, h: v } } },
                  }))
                }
              />
            </Section>
            <Section title="Card size (small — seats)">
              <Knob
                label="Width"
                value={layout.cards.sizes.small.w}
                min={32}
                max={120}
                suffix="px"
                onChange={(v) =>
                  patch((p) => ({
                    ...p,
                    cards: { ...p.cards, sizes: { ...p.cards.sizes, small: { ...p.cards.sizes.small, w: v } } },
                  }))
                }
              />
              <Knob
                label="Height"
                value={layout.cards.sizes.small.h}
                min={44}
                max={168}
                suffix="px"
                onChange={(v) =>
                  patch((p) => ({
                    ...p,
                    cards: { ...p.cards, sizes: { ...p.cards.sizes, small: { ...p.cards.sizes.small, h: v } } },
                  }))
                }
              />
            </Section>
          </>
        )}

        {selection.kind === 'motion' && (
          <>
            <Section title="Deal in">
              <Knob
                label="From X"
                value={layout.motion.dealIn.fromX}
                min={-400}
                max={400}
                suffix="px"
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, dealIn: { ...p.motion.dealIn, fromX: v } } }))
                }
              />
              <Knob
                label="From Y"
                value={layout.motion.dealIn.fromY}
                min={-400}
                max={400}
                suffix="px"
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, dealIn: { ...p.motion.dealIn, fromY: v } } }))
                }
              />
              <Knob
                label="Duration"
                value={layout.motion.dealIn.durationMs}
                min={100}
                max={2000}
                step={25}
                suffix="ms"
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, dealIn: { ...p.motion.dealIn, durationMs: v } } }))
                }
              />
              <Knob
                label="Stagger"
                value={layout.motion.dealIn.staggerMs}
                min={0}
                max={800}
                step={10}
                suffix="ms"
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, dealIn: { ...p.motion.dealIn, staggerMs: v } } }))
                }
              />
            </Section>
            <Section title="Collect">
              <Knob
                label="To X"
                value={layout.motion.clearOut.toX}
                min={-400}
                max={400}
                suffix="px"
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, clearOut: { ...p.motion.clearOut, toX: v } } }))
                }
              />
              <Knob
                label="To Y"
                value={layout.motion.clearOut.toY}
                min={-400}
                max={400}
                suffix="px"
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, clearOut: { ...p.motion.clearOut, toY: v } } }))
                }
              />
              <Knob
                label="Scale"
                value={layout.motion.clearOut.scale}
                min={0}
                max={2}
                step={0.05}
                suffix="×"
                onChange={(v) =>
                  patch((p) => ({ ...p, motion: { ...p.motion, clearOut: { ...p.motion.clearOut, scale: v } } }))
                }
              />
              <Knob
                label="Duration"
                value={layout.motion.clearOut.durationMs}
                min={100}
                max={2000}
                step={25}
                suffix="ms"
                onChange={(v) =>
                  patch((p) => ({
                    ...p,
                    motion: { ...p.motion, clearOut: { ...p.motion.clearOut, durationMs: v } },
                  }))
                }
              />
            </Section>
            <p style={{ fontSize: 11, color: UI.dim, lineHeight: 1.5 }}>
              Motion is easier to judge on a live table — the fixtures here are static, so these
              values are applied but not animated.
            </p>
          </>
        )}

        <div style={{ borderTop: `1px solid ${UI.border}`, paddingTop: 12, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>Overrides</span>
            <button
              type="button"
              onClick={copyJson}
              style={{
                marginLeft: 'auto',
                background: UI.raised,
                border: `1px solid ${UI.border}`,
                color: UI.text,
                borderRadius: 6,
                padding: '3px 9px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
          <pre
            style={{
              background: UI.bg,
              border: `1px solid ${UI.border}`,
              borderRadius: 6,
              padding: 8,
              fontSize: 10,
              lineHeight: 1.45,
              maxHeight: 220,
              overflow: 'auto',
              margin: 0,
              color: UI.dim,
            }}
          >
            {changeCount ? JSON.stringify(diff, null, 2) : '// unchanged from defaults'}
          </pre>
          <p style={{ fontSize: 10, color: UI.dim, marginTop: 8, lineHeight: 1.5 }}>
            Only what differs from the shipped layout. This is the shape a saved table theme will
            carry once themes are persisted per table.
          </p>
        </div>
      </aside>
    </div>
  );
}

/** Exported for tests: applies overrides the way a stored theme eventually will. */
export function applyThemeOverrides(overrides: Parameters<typeof mergeTableLayout>[1]) {
  return mergeTableLayout(DEFAULT_BLACKJACK_TABLE_LAYOUT, overrides);
}
