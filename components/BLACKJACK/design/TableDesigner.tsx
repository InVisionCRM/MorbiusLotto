'use client';

/**
 * Blackjack table designer.
 *
 * Renders the real seat and dealer components against fixture state, inside a
 * BlackjackTableLayoutProvider driven by this editor. The editing model is
 * direct manipulation, same spirit as the slot builder: grab a seat or the
 * dealer and drag it, drag the tilt handle to rotate a seat, click the card
 * back to swap its art. The side panel is for fine-tuning, not the primary
 * way in.
 *
 * Like the Theme Studio, the chrome is styled with fixed inline colours rather
 * than app classes: it is a tool for judging the table, so it must not shift
 * when the table's own styling does.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlackjackMultiSeatGrid } from '@/components/BLACKJACK/multi/BlackjackMultiSeatGrid';
import { BlackjackMultiDealerArea } from '@/components/BLACKJACK/multi/BlackjackMultiDealerArea';
import { BlackjackTableLayoutProvider } from '@/components/BLACKJACK/BlackjackTableLayoutContext';
import {
  DEFAULT_BLACKJACK_TABLE_LAYOUT,
  mergeTableLayout,
  type BlackjackTableLayout,
} from '@/lib/blackjack-table-layout';
import { DESIGN_SCENARIOS } from '@/lib/blackjack-design-fixtures';
import {
  BLACKJACK_SOUND_EVENT_INFO,
  DEFAULT_BLACKJACK_SOUND_MAP,
  mergeSoundMap,
  pickSound,
  type BlackjackSoundEventKey,
  type BlackjackSoundOverrides,
} from '@/lib/blackjack-sounds';
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

const CANVAS_W = DEFAULT_BLACKJACK_TABLE_LAYOUT.canvas.width;
const CANVAS_H = DEFAULT_BLACKJACK_TABLE_LAYOUT.canvas.height;

type Selection =
  | { kind: 'seat'; index: number }
  | { kind: 'dealer' }
  | { kind: 'cards' }
  | { kind: 'motion' }
  | { kind: 'sounds' };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** One editable number, rendered as a slider plus a readout. */
function Knob({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
  onGestureStart,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  onGestureStart: () => void;
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
        onPointerDown={onGestureStart}
        onKeyDown={onGestureStart}
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
  const [dragging, setDragging] = useState(false);

  // ── Sounds ────────────────────────────────────────────────────────────────
  // Sparse overrides on the default event map — same shape a saved table theme
  // will carry. Uploads are object URLs (local preview until themes persist).
  const [soundOverrides, setSoundOverrides] = useState<BlackjackSoundOverrides>({});
  const soundFileRef = useRef<HTMLInputElement>(null);
  const soundPickTarget = useRef<BlackjackSoundEventKey | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const previewSound = useCallback((event: BlackjackSoundEventKey) => {
    const path = pickSound(mergeSoundMap(DEFAULT_BLACKJACK_SOUND_MAP, soundOverrides), event);
    if (!path) return;
    previewRef.current?.pause();
    const audio = new Audio(path);
    audio.volume = 0.6;
    previewRef.current = audio;
    audio.play().catch(() => {});
  }, [soundOverrides]);

  const pickSoundFile = useCallback((file: File | null) => {
    const event = soundPickTarget.current;
    if (!file || !event) return;
    const url = URL.createObjectURL(file);
    setSoundOverrides((prev) => ({ ...prev, [event]: [url] }));
  }, []);

  // ── Undo / redo ────────────────────────────────────────────────────────────
  // A gesture (drag start, slider grab, first nudge of a burst) snapshots the
  // layout; undo walks back through snapshots. Kept in refs so pointer-move
  // storms never re-render for history bookkeeping.
  const past = useRef<BlackjackTableLayout[]>([]);
  const future = useRef<BlackjackTableLayout[]>([]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [historyVersion, setHistoryVersion] = useState(0);

  const beginGesture = useCallback(() => {
    past.current.push(layoutRef.current);
    if (past.current.length > 60) past.current.shift();
    future.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(layoutRef.current);
    setLayout(prev);
    setHistoryVersion((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(layoutRef.current);
    setLayout(next);
    setHistoryVersion((v) => v + 1);
  }, []);

  // ── Stage scaling ──────────────────────────────────────────────────────────
  // The logical canvas is 800×450; scale it to fill the available width so the
  // table is big enough to actually work on. Drag math divides by this scale.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [stageScale, setStageScale] = useState(1);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setStageScale(clamp(el.clientWidth / CANVAS_W, 0.4, 1.6));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Dragging ───────────────────────────────────────────────────────────────
  const dragRef = useRef<{ startX: number; startY: number; apply: (dx: number, dy: number) => void } | null>(null);

  const beginDrag = useCallback(
    (e: React.PointerEvent, apply: (dx: number, dy: number) => void) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      beginGesture();
      dragRef.current = { startX: e.clientX, startY: e.clientY, apply };
      setDragging(true);
    },
    [beginGesture],
  );

  const onDragMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      d.apply((e.clientX - d.startX) / stageScale, (e.clientY - d.startY) / stageScale);
    },
    [stageScale],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

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

  // ── Keyboard nudging ───────────────────────────────────────────────────────
  const lastNudge = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (!e.key.startsWith('Arrow')) return;
      const sel = selection;
      if (sel.kind !== 'seat' && sel.kind !== 'dealer') return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastNudge.current > 800) beginGesture();
      lastNudge.current = now;
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      if (sel.kind === 'seat') {
        const s = layoutRef.current.seats[sel.index];
        setSeat(sel.index, 'cx', clamp(s.cx + dx, 0, CANVAS_W));
        setSeat(sel.index, 'floorY', clamp(s.floorY + dy, 0, CANVAS_H));
      } else {
        patch((p) => ({
          ...p,
          dealer: {
            cx: clamp(p.dealer.cx + dx, 0, CANVAS_W),
            top: clamp(p.dealer.top + dy, 0, CANVAS_H),
          },
        }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, setSeat, patch, beginGesture, undo, redo]);

  // ── Card back picker ───────────────────────────────────────────────────────
  const backFileRef = useRef<HTMLInputElement>(null);
  const pickCardBack = useCallback(
    (file: File | null) => {
      if (!file) return;
      const url = URL.createObjectURL(file);
      beginGesture();
      patch((p) => ({ ...p, cards: { ...p.cards, backImage: url } }));
    },
    [beginGesture, patch],
  );

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

  /** Only the fields that differ from the shipped defaults — what a table theme would store. */
  const diff = useMemo(() => {
    const base = DEFAULT_BLACKJACK_TABLE_LAYOUT;
    const out: Record<string, unknown> = {};
    if (JSON.stringify(layout.seats) !== JSON.stringify(base.seats)) out.seats = layout.seats;
    if (JSON.stringify(layout.dealer) !== JSON.stringify(base.dealer)) out.dealer = layout.dealer;
    if (JSON.stringify(layout.cards) !== JSON.stringify(base.cards)) out.cards = layout.cards;
    if (JSON.stringify(layout.motion) !== JSON.stringify(base.motion)) out.motion = layout.motion;
    if (JSON.stringify(layout.emotes) !== JSON.stringify(base.emotes)) out.emotes = layout.emotes;
    if (Object.keys(soundOverrides).length > 0) out.sounds = soundOverrides;
    return out;
  }, [layout, soundOverrides]);

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

  const selectedSeat = selection.kind === 'seat' ? layout.seats[selection.index] : null;

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
      <div style={{ flex: 1, padding: 20, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Blackjack table designer</h1>
          <span style={{ fontSize: 12, color: UI.dim }}>
            Drag pieces to move them · drag the ⟳ handle to tilt a seat · arrow keys nudge (⇧ = ×10) · Ctrl+Z undoes
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: UI.dim, marginLeft: 4 }}>
            <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
            Guides
          </label>
        </div>

        {/* Scaled stage. The wrapper reserves the scaled height so the page flows. */}
        <div ref={wrapRef} style={{ width: '100%' }}>
          <div style={{ width: CANVAS_W * stageScale, height: CANVAS_H * stageScale, position: 'relative' }}>
            <BlackjackTableLayoutProvider layout={layout}>
              <div
                className="blackjack-table"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: CANVAS_W,
                  height: CANVAS_H,
                  transform: `scale(${stageScale})`,
                  transformOrigin: 'top left',
                  background: 'radial-gradient(ellipse at 50% 35%, #12331f 0%, #0a1f13 60%, #06120b 100%)',
                  border: `1px solid ${UI.border}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {showGuides && (
                  <svg
                    width={CANVAS_W}
                    height={CANVAS_H}
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40 }}
                  >
                    <line
                      x1={CANVAS_W / 2}
                      y1={0}
                      x2={CANVAS_W / 2}
                      y2={CANVAS_H}
                      stroke="rgba(255,255,255,0.12)"
                      strokeDasharray="4 6"
                    />
                    {selectedSeat && (
                      <text
                        x={selectedSeat.cx}
                        y={clamp(selectedSeat.floorY + 22, 14, CANVAS_H - 4)}
                        textAnchor="middle"
                        fill={UI.selected}
                        fontSize={11}
                        fontFamily="ui-monospace, monospace"
                      >
                        {Math.round(selectedSeat.cx)}, {Math.round(selectedSeat.floorY)} · {Math.round(selectedSeat.angle)}°
                      </text>
                    )}
                    {selection.kind === 'dealer' && (
                      <text
                        x={layout.dealer.cx}
                        y={clamp(layout.dealer.top - 8, 14, CANVAS_H - 4)}
                        textAnchor="middle"
                        fill={UI.selected}
                        fontSize={11}
                        fontFamily="ui-monospace, monospace"
                      >
                        {Math.round(layout.dealer.cx)}, {Math.round(layout.dealer.top)}
                      </text>
                    )}
                  </svg>
                )}

                {/* Dealer — same placement rule as the live table; draggable here. */}
                <div
                  style={{
                    position: 'absolute',
                    left: layout.dealer.cx,
                    top: layout.dealer.top,
                    transform: 'translateX(-50%)',
                    outline:
                      selection.kind === 'dealer'
                        ? `2px solid ${UI.selected}`
                        : '1px dashed rgba(255,255,255,0.12)',
                    outlineOffset: 6,
                    borderRadius: 6,
                    cursor: dragging ? 'grabbing' : 'grab',
                    touchAction: 'none',
                  }}
                  onPointerDown={(e) => {
                    setSelection({ kind: 'dealer' });
                    const orig = { ...layoutRef.current.dealer };
                    beginDrag(e, (dx, dy) =>
                      patch((p) => ({
                        ...p,
                        dealer: {
                          cx: clamp(Math.round(orig.cx + dx), 0, CANVAS_W),
                          top: clamp(Math.round(orig.top + dy), 0, CANVAS_H),
                        },
                      })),
                    );
                  }}
                  onPointerMove={onDragMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <BlackjackMultiDealerArea tableViewState={state} visibleDealerCards={state.dealerCards.length} />
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

                {/* Seat grab surfaces — cover the whole seat column, above the seats. */}
                {layout.seats.map((s, i) => (
                  <div
                    key={i}
                    role="button"
                    aria-label={`Select seat ${i + 1}`}
                    onPointerDown={(e) => {
                      setSelection({ kind: 'seat', index: i });
                      const orig = { ...layoutRef.current.seats[i] };
                      beginDrag(e, (dx, dy) => {
                        setSeat(i, 'cx', clamp(Math.round(orig.cx + dx), 0, CANVAS_W));
                        setSeat(i, 'floorY', clamp(Math.round(orig.floorY + dy), 0, CANVAS_H));
                      });
                    }}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    style={{
                      position: 'absolute',
                      left: s.cx - 65,
                      top: s.floorY - 155,
                      width: 130,
                      height: 165,
                      borderRadius: 10,
                      border: isSel({ kind: 'seat', index: i })
                        ? `2px solid ${UI.selected}`
                        : '1px dashed rgba(255,255,255,0.12)',
                      cursor: dragging ? 'grabbing' : 'grab',
                      touchAction: 'none',
                      zIndex: 45,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: -20,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: 10,
                        fontWeight: 700,
                        color: isSel({ kind: 'seat', index: i }) ? UI.selected : 'rgba(255,255,255,0.45)',
                        background: 'rgba(0,0,0,0.55)',
                        padding: '2px 8px',
                        borderRadius: 999,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Seat {i + 1}
                    </span>
                  </div>
                ))}

                {/* Tilt handle for the selected seat — drag sideways to rotate. */}
                {selectedSeat && (
                  <div
                    title="Drag sideways to tilt the seat"
                    onPointerDown={(e) => {
                      const sel = selection as { kind: 'seat'; index: number };
                      const origAngle = layoutRef.current.seats[sel.index].angle;
                      beginDrag(e, (dx) =>
                        setSeat(sel.index, 'angle', clamp(Math.round(origAngle + dx * 0.4), -45, 45)),
                      );
                    }}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    style={{
                      position: 'absolute',
                      left: selectedSeat.cx - 14,
                      top: selectedSeat.floorY - 195,
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: UI.selected,
                      color: '#1a1200',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      fontWeight: 800,
                      cursor: 'ew-resize',
                      touchAction: 'none',
                      zIndex: 46,
                      boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                      userSelect: 'none',
                    }}
                  >
                    ⟳
                  </div>
                )}
              </div>
            </BlackjackTableLayoutProvider>
          </div>
        </div>
      </div>

      {/* ── Panel — fine-tuning; the stage is the primary editor ─────────── */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <strong style={{ fontSize: 13 }}>Fine-tune</strong>
          <span style={{ fontSize: 11, color: UI.dim }}>
            {changeCount ? `${changeCount} group${changeCount === 1 ? '' : 's'} changed` : 'default'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }} data-history-version={historyVersion}>
            <button
              type="button"
              onClick={undo}
              disabled={past.current.length === 0}
              title="Undo (Ctrl+Z)"
              style={{
                background: 'transparent',
                border: `1px solid ${UI.border}`,
                color: past.current.length ? UI.text : UI.border,
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 11,
                cursor: past.current.length ? 'pointer' : 'default',
              }}
            >
              ↩ Undo
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={future.current.length === 0}
              title="Redo (Ctrl+Shift+Z)"
              style={{
                background: 'transparent',
                border: `1px solid ${UI.border}`,
                color: future.current.length ? UI.text : UI.border,
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 11,
                cursor: future.current.length ? 'pointer' : 'default',
              }}
            >
              ↪
            </button>
            <button
              type="button"
              onClick={() => {
                beginGesture();
                setLayout(DEFAULT_BLACKJACK_TABLE_LAYOUT);
              }}
              style={{
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
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
          {([
            { label: 'Seat 1', sel: { kind: 'seat', index: 0 } as Selection },
            { label: 'Seat 2', sel: { kind: 'seat', index: 1 } as Selection },
            { label: 'Seat 3', sel: { kind: 'seat', index: 2 } as Selection },
            { label: 'Dealer', sel: { kind: 'dealer' } as Selection },
            { label: 'Cards', sel: { kind: 'cards' } as Selection },
            { label: 'Sounds', sel: { kind: 'sounds' } as Selection },
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
          <Section title={`Seat ${selection.index + 1} — or just drag it on the table`}>
            <Knob
              label="Across"
              value={layout.seats[selection.index].cx}
              min={0}
              max={CANVAS_W}
              onGestureStart={beginGesture}
              onChange={(v) => setSeat(selection.index, 'cx', v)}
            />
            <Knob
              label="Down"
              value={layout.seats[selection.index].floorY}
              min={0}
              max={CANVAS_H}
              onGestureStart={beginGesture}
              onChange={(v) => setSeat(selection.index, 'floorY', v)}
            />
            <Knob
              label="Tilt"
              value={layout.seats[selection.index].angle}
              min={-45}
              max={45}
              suffix="°"
              onGestureStart={beginGesture}
              onChange={(v) => setSeat(selection.index, 'angle', v)}
            />
          </Section>
        )}

        {selection.kind === 'dealer' && (
          <Section title="Dealer — or just drag it on the table">
            <Knob
              label="Across"
              value={layout.dealer.cx}
              min={0}
              max={CANVAS_W}
              onGestureStart={beginGesture}
              onChange={(v) => patch((p) => ({ ...p, dealer: { ...p.dealer, cx: v } }))}
            />
            <Knob
              label="Down"
              value={layout.dealer.top}
              min={0}
              max={CANVAS_H}
              onGestureStart={beginGesture}
              onChange={(v) => patch((p) => ({ ...p, dealer: { ...p.dealer, top: v } }))}
            />
          </Section>
        )}

        {selection.kind === 'cards' && (
          <>
            <Section title="Card back">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                { }
                <img
                  src={layout.cards.backImage}
                  alt="Card back"
                  width={44}
                  height={62}
                  style={{
                    borderRadius: 6,
                    objectFit: 'cover',
                    border: `1px solid ${UI.border}`,
                    background: '#0a2540',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => backFileRef.current?.click()}
                    style={{
                      background: UI.raised,
                      border: `1px solid ${UI.border}`,
                      color: UI.text,
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Choose image…
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      beginGesture();
                      patch((p) => ({
                        ...p,
                        cards: { ...p.cards, backImage: DEFAULT_BLACKJACK_TABLE_LAYOUT.cards.backImage },
                      }));
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: UI.dim,
                      fontSize: 10,
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: 0,
                    }}
                  >
                    reset to default
                  </button>
                </div>
                <input
                  ref={backFileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => pickCardBack(e.target.files?.[0] ?? null)}
                />
              </div>
              <p style={{ fontSize: 10, color: UI.dim, marginTop: 6, lineHeight: 1.5 }}>
                Local preview only for now — a picked image lives in this tab until saved themes land
                (that&apos;s when it gets uploaded and shared).
              </p>
            </Section>
            <Section title="Stacking">
              <Knob
                label="Dealer"
                value={layout.cards.overlap.dealer}
                min={-60}
                max={20}
                suffix="px"
                onGestureStart={beginGesture}
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
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({ ...p, cards: { ...p.cards, overlap: { ...p.cards.overlap, player: v } } }))
                }
              />
            </Section>
            <Section title="Card size (dealer)">
              <Knob
                label="Width"
                value={layout.cards.sizes.normal.w}
                min={40}
                max={160}
                suffix="px"
                onGestureStart={beginGesture}
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
                onGestureStart={beginGesture}
                onChange={(v) =>
                  patch((p) => ({
                    ...p,
                    cards: { ...p.cards, sizes: { ...p.cards.sizes, normal: { ...p.cards.sizes.normal, h: v } } },
                  }))
                }
              />
            </Section>
            <Section title="Card size (seats)">
              <Knob
                label="Width"
                value={layout.cards.sizes.small.w}
                min={32}
                max={120}
                suffix="px"
                onGestureStart={beginGesture}
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
                onGestureStart={beginGesture}
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

        {selection.kind === 'sounds' && (
          <>
            <Section title="Table sounds — tap ▶ to hear, swap in your own">
              <input
                ref={soundFileRef}
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  pickSoundFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
              {BLACKJACK_SOUND_EVENT_INFO.map((info) => {
                const override = soundOverrides[info.key];
                const isCustom = Array.isArray(override) && override.length > 0;
                const isMuted = Array.isArray(override) && override.length === 0;
                const defaultPool = DEFAULT_BLACKJACK_SOUND_MAP[info.key];
                return (
                  <div
                    key={info.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 0',
                      borderBottom: `1px solid ${UI.border}`,
                    }}
                  >
                    <button
                      type="button"
                      title="Preview"
                      onClick={() => previewSound(info.key)}
                      disabled={isMuted}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        border: `1px solid ${UI.border}`,
                        background: UI.raised,
                        color: isMuted ? UI.border : UI.text,
                        cursor: isMuted ? 'default' : 'pointer',
                        fontSize: 10,
                        flexShrink: 0,
                      }}
                    >
                      ▶
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: isMuted ? UI.dim : UI.text }}>
                        {info.label}
                        {isCustom && <span style={{ color: UI.selected, marginLeft: 5, fontSize: 9 }}>custom</span>}
                        {isMuted && <span style={{ color: UI.dim, marginLeft: 5, fontSize: 9 }}>muted</span>}
                      </div>
                      <div style={{ fontSize: 9, color: UI.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {isCustom ? 'your upload' : isMuted ? info.hint : `${info.hint}${defaultPool.length > 1 ? ` · ${defaultPool.length} variations` : ''}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      title="Swap in your own sound"
                      onClick={() => {
                        soundPickTarget.current = info.key;
                        soundFileRef.current?.click();
                      }}
                      style={{
                        background: UI.raised,
                        border: `1px solid ${UI.border}`,
                        color: UI.text,
                        borderRadius: 5,
                        padding: '2px 7px',
                        fontSize: 10,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Swap
                    </button>
                    <button
                      type="button"
                      title={isMuted ? 'Unmute' : 'Mute this sound'}
                      onClick={() =>
                        setSoundOverrides((prev) => {
                          const next = { ...prev };
                          if (isMuted) delete next[info.key];
                          else next[info.key] = [];
                          return next;
                        })
                      }
                      style={{
                        background: 'transparent',
                        border: `1px solid ${UI.border}`,
                        color: isMuted ? UI.selected : UI.dim,
                        borderRadius: 5,
                        padding: '2px 6px',
                        fontSize: 10,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {isMuted ? '🔇' : '🔊'}
                    </button>
                    {(isCustom || isMuted) && (
                      <button
                        type="button"
                        title="Back to default"
                        onClick={() =>
                          setSoundOverrides((prev) => {
                            const next = { ...prev };
                            delete next[info.key];
                            return next;
                          })
                        }
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: UI.dim,
                          fontSize: 10,
                          cursor: 'pointer',
                          padding: 0,
                          flexShrink: 0,
                        }}
                      >
                        ↺
                      </button>
                    )}
                  </div>
                );
              })}
            </Section>
            <p style={{ fontSize: 10, color: UI.dim, lineHeight: 1.5 }}>
              Swapped sounds are local previews until saved themes land — that&apos;s when uploads get
              stored and heard by everyone at the table.
            </p>
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
                onGestureStart={beginGesture}
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
                onGestureStart={beginGesture}
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
                onGestureStart={beginGesture}
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
                onGestureStart={beginGesture}
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
                onGestureStart={beginGesture}
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
                onGestureStart={beginGesture}
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
                onGestureStart={beginGesture}
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
                onGestureStart={beginGesture}
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
              maxHeight: 200,
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
