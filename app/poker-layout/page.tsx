'use client';

/**
 * Poker anchor editor — drag every seat element where you want it, per seat.
 *
 * Everything the table positions is a list of {fx,fy} fractions in
 * lib/poker-seat-layout.ts (one entry per seat, indexed by the 10-vertex ring).
 * This page renders a draggable handle for each one over a 1300×570 reference
 * felt, autosaves to localStorage, can Save a scratch JSON to the repo (dev),
 * and exports the rings as ready-to-paste TypeScript.
 *
 * Replaces the old read-only "layout mock table" reference page.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SEAT_ANCHOR_RING,
  PLAYER_TAG_ANCHOR_RING,
  BET_CHIP_ANCHOR_RING,
  DEALER_BUTTON_RING,
  CARD_ANCHOR_RING,
  WINNING_POT_CHIP_ANCHOR_RING,
  POKER_POT_ANCHOR,
  type SeatAnchor,
} from '@/lib/poker-seat-layout';
import { POKER_TABLE_REF_W, POKER_TABLE_REF_H } from '@/app/poker/[tableId]/PokerMobileZoomLock';

const W = POKER_TABLE_REF_W; // 1300
const H = POKER_TABLE_REF_H; // 570
const STORAGE_KEY = 'poker-anchor-editor-v1';
const SEAT_COUNT = 10;

type LayerKey = 'seat' | 'tag' | 'bet' | 'dealer' | 'card' | 'winner';
type Rings = Record<LayerKey, SeatAnchor[]>;

const LAYER_META: { key: LayerKey; label: string; color: string; tsName: string }[] = [
  { key: 'seat', label: 'Avatar (seat)', color: '#22d3ee', tsName: 'SEAT_ANCHOR_RING' },
  { key: 'tag', label: 'Name plate', color: '#f59e0b', tsName: 'PLAYER_TAG_ANCHOR_RING' },
  { key: 'bet', label: 'Bet chips', color: '#a3e635', tsName: 'BET_CHIP_ANCHOR_RING' },
  { key: 'dealer', label: 'Dealer coin', color: '#fcd34d', tsName: 'DEALER_BUTTON_RING' },
  { key: 'card', label: 'Cards', color: '#60a5fa', tsName: 'CARD_ANCHOR_RING' },
  { key: 'winner', label: 'Winner chip', color: '#fb7185', tsName: 'WINNING_POT_CHIP_ANCHOR_RING' },
];

const clone = (ring: ReadonlyArray<SeatAnchor>): SeatAnchor[] => ring.map((a) => ({ fx: a.fx, fy: a.fy }));

function defaultRings(): Rings {
  return {
    seat: clone(SEAT_ANCHOR_RING),
    tag: clone(PLAYER_TAG_ANCHOR_RING),
    bet: clone(BET_CHIP_ANCHOR_RING),
    dealer: DEALER_BUTTON_RING.map((a) => ({ fx: a.fx, fy: a.fy })),
    card: clone(CARD_ANCHOR_RING),
    winner: clone(WINNING_POT_CHIP_ANCHOR_RING),
  };
}

const r3 = (n: number) => Number(n.toFixed(4));

function ringsToTs(rings: Rings): string {
  const block = (name: string, ring: SeatAnchor[]) =>
    `export const ${name}: SeatAnchor[] = [\n` +
    ring.map((a, i) => `  { fx: ${r3(a.fx)}, fy: ${r3(a.fy)} },${i === 0 ? ' // 0 — hero' : ''}`).join('\n') +
    `\n];`;
  return LAYER_META.map((l) => block(l.tsName, rings[l.key])).join('\n\n');
}

const MOCK = [
  { n: 'You', s: '12,450' },
  { n: 'Vega', s: '8,800' },
  { n: 'Nyx', s: '16,200' },
  { n: 'Hex', s: '5,400' },
  { n: 'Mako', s: '21,300' },
  { n: 'Rook', s: '9,700' },
  { n: 'Lux', s: '15,250' },
  { n: 'Echo', s: '6,800' },
  { n: 'Ash', s: '11,100' },
  { n: 'Zero', s: '19,000' },
];

export default function PokerAnchorEditorPage() {
  const [rings, setRings] = useState<Rings>(defaultRings);
  const [activeLayer, setActiveLayer] = useState<LayerKey>('seat');
  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
    seat: true, tag: true, bet: true, dealer: true, card: true, winner: false,
  });
  const [snap, setSnap] = useState(false);
  const [snapStep, setSnapStep] = useState(0.005);
  const [selected, setSelected] = useState<{ layer: LayerKey; idx: number } | null>(null);
  const [scale, setScale] = useState(0.7);
  const [saveMsg, setSaveMsg] = useState('');
  const [showTs, setShowTs] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ layer: LayerKey; idx: number } | null>(null);

  // ── load saved (localStorage first, then dev scratch file) ──
  useEffect(() => {
    let applied = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { setRings(JSON.parse(raw)); applied = true; }
    } catch { /* ignore */ }
    if (!applied) {
      fetch('/api/poker-layout-anchors')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (j && j.seat) setRings(j); })
        .catch(() => {});
    }
  }, []);

  // ── autosave to localStorage ──
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rings)); } catch { /* ignore */ }
  }, [rings]);

  // ── responsive scale to fit width ──
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const avail = el.clientWidth - 4;
      setScale(Math.max(0.4, Math.min(avail / W, 1)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setAnchor = useCallback((layer: LayerKey, idx: number, fx: number, fy: number) => {
    const snapVal = (v: number) => (snap ? Math.round(v / snapStep) * snapStep : v);
    const cfx = Math.min(1, Math.max(0, snapVal(fx)));
    const cfy = Math.min(1, Math.max(0, snapVal(fy)));
    setRings((prev) => {
      const next = { ...prev, [layer]: prev[layer].map((a) => ({ ...a })) };
      next[layer][idx] = { fx: r3(cfx), fy: r3(cfy) };
      return next;
    });
  }, [snap, snapStep]);

  const pointerToFrac = useCallback((clientX: number, clientY: number) => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { fx: (clientX - rect.left) / rect.width, fy: (clientY - rect.top) / rect.height };
  }, []);

  const onLayerPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const f = pointerToFrac(e.clientX, e.clientY);
    if (f) setAnchor(d.layer, d.idx, f.fx, f.fy);
  }, [pointerToFrac, setAnchor]);

  useEffect(() => {
    const up = () => { dragRef.current = null; };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  // ── keyboard nudge for the selected token ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected) return;
      const step = e.shiftKey ? 0.02 : 0.002;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;
      e.preventDefault();
      const cur = rings[selected.layer][selected.idx];
      setAnchor(selected.layer, selected.idx, cur.fx + dx, cur.fy + dy);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, rings, setAnchor]);

  const startDrag = (layer: LayerKey, idx: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = { layer, idx };
    setSelected({ layer, idx });
    setActiveLayer(layer);
  };

  const tsExport = useMemo(() => ringsToTs(rings), [rings]);

  const saveToRepo = async () => {
    setSaveMsg('Saving…');
    try {
      const res = await fetch('/api/poker-layout-anchors', { method: 'POST', body: JSON.stringify(rings) });
      const j = await res.json();
      setSaveMsg(res.ok ? `Saved → ${j.file}` : `Error: ${j.error}`);
    } catch (err) {
      setSaveMsg(`Error: ${(err as Error).message}`);
    }
    setTimeout(() => setSaveMsg(''), 4000);
  };

  const copyTs = async () => {
    try { await navigator.clipboard.writeText(tsExport); setSaveMsg('Copied TypeScript to clipboard'); }
    catch { setShowTs(true); setSaveMsg('Clipboard blocked — showing text to copy'); }
    setTimeout(() => setSaveMsg(''), 4000);
  };

  const dealerSeat = 3, sbSeat = 1, bbSeat = 2, actingSeat = 0; // mock state for context

  return (
    <div className="min-h-screen bg-[#0a0c12] p-4 text-slate-100 md:p-6">
      <div className="mx-auto flex max-w-[1640px] flex-col gap-4 lg:flex-row">
        {/* ── Canvas ── */}
        <div className="flex-1">
          <header className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-400/80">Dev tool</p>
              <h1 className="text-xl font-semibold md:text-2xl">Poker anchor editor</h1>
              <p className="mt-1 max-w-2xl text-xs text-slate-400">
                Drag any handle to move that element for that seat. Seat 0 is the hero (bottom center). Autosaves as you go.
                Arrow keys nudge the selected handle (Shift = bigger steps).
              </p>
            </div>
            <Link href="/poker" className="text-sm text-cyan-400 hover:underline">Back to poker</Link>
          </header>

          <div ref={wrapRef} className="rounded-xl border border-cyan-500/15 bg-black/30 p-1">
            <div style={{ width: W * scale, height: H * scale, position: 'relative', margin: '0 auto' }}>
              <div
                ref={layerRef}
                onPointerMove={onLayerPointerMove}
                style={{
                  position: 'absolute', top: 0, left: 0, width: W, height: H,
                  transform: `scale(${scale})`, transformOrigin: 'top left',
                  touchAction: 'none', userSelect: 'none',
                }}
              >
                {/* felt reference (mirrors PokerTable proportions) */}
                <div style={{ position: 'absolute', left: '3%', top: '5%', width: '94%', height: '88%', borderRadius: 9999, background: '#07090f', boxShadow: '0 0 0 10px #241a10' }} />
                <div style={{ position: 'absolute', left: '6%', top: '12%', width: '88%', height: '74%', borderRadius: 9999, background: 'radial-gradient(80% 82% at 50% 38%, #1d7a4c, #125c38 46%, #0a3a22 100%)', boxShadow: 'inset 0 8px 40px rgba(0,0,0,.5), inset 0 0 0 2px rgba(212,175,55,.2)' }} />
                {/* community + pot reference */}
                <div style={{ position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%,-50%)', display: 'flex', gap: 6 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ width: 38, height: 54, borderRadius: 5, background: 'rgba(255,255,255,.10)', border: '1px dashed rgba(255,255,255,.25)' }} />
                  ))}
                </div>
                <div style={{ position: 'absolute', left: `${POKER_POT_ANCHOR.fx * 100}%`, top: `${POKER_POT_ANCHOR.fy * 100}%`, transform: 'translate(-50%,-50%)', color: '#ffe9a8', fontSize: 13, fontWeight: 700, background: 'rgba(0,0,0,.45)', padding: '3px 12px', borderRadius: 999, border: '1px solid rgba(212,175,55,.4)' }}>POT</div>

                {/* tokens, drawn per layer */}
                {LAYER_META.map((l) =>
                  visible[l.key]
                    ? rings[l.key].map((a, idx) => (
                        <Token
                          key={`${l.key}-${idx}`}
                          layer={l.key}
                          color={l.color}
                          idx={idx}
                          a={a}
                          active={activeLayer === l.key}
                          selected={selected?.layer === l.key && selected?.idx === idx}
                          name={MOCK[idx]?.n ?? `S${idx}`}
                          stack={MOCK[idx]?.s ?? '0'}
                          isDealer={l.key === 'dealer' && idx === dealerSeat}
                          blind={idx === sbSeat ? 'SB' : idx === bbSeat ? 'BB' : null}
                          acting={idx === actingSeat}
                          onPointerDown={startDrag(l.key, idx)}
                        />
                      ))
                    : null,
                )}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Editing the 10-vertex rings directly (seat index = ring index at a full table). Smaller tables subsample these via <code className="text-slate-400">ringIndexForDisplaySlot</code>.
          </p>
        </div>

        {/* ── Controls ── */}
        <aside className="w-full shrink-0 space-y-4 lg:w-[300px]">
          <Panel title="Layers — click to edit, eye to show/hide">
            {LAYER_META.map((l) => (
              <div key={l.key} className="flex items-center gap-2 py-0.5">
                <button
                  onClick={() => setVisible((v) => ({ ...v, [l.key]: !v[l.key] }))}
                  className="w-6 text-center text-sm"
                  title="Show / hide"
                >{visible[l.key] ? '👁' : '–'}</button>
                <button
                  onClick={() => { setActiveLayer(l.key); setVisible((v) => ({ ...v, [l.key]: true })); }}
                  className={`flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${activeLayer === l.key ? 'bg-white/10 font-semibold' : 'hover:bg-white/5'}`}
                >
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: l.color, display: 'inline-block' }} />
                  {l.label}
                </button>
              </div>
            ))}
          </Panel>

          <Panel title="Selected handle">
            {selected ? (
              <div className="space-y-1 text-sm">
                <div className="text-slate-300">
                  Seat <b>{selected.idx}</b>{selected.idx === 0 ? ' (hero)' : ''} · {LAYER_META.find((l) => l.key === selected.layer)?.label}
                </div>
                <div className="font-mono text-xs text-cyan-300">
                  fx {rings[selected.layer][selected.idx].fx.toFixed(3)} · fy {rings[selected.layer][selected.idx].fy.toFixed(3)}
                </div>
                <div className="text-[11px] text-slate-500">Arrow keys nudge · Shift = ×10</div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Click a handle to select it.</p>
            )}
          </Panel>

          <Panel title="Snap">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
              Snap to grid
            </label>
            {snap && (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                step
                <input type="number" value={snapStep} step={0.005} min={0.001} max={0.05}
                  onChange={(e) => setSnapStep(Number(e.target.value) || 0.005)}
                  className="w-20 rounded bg-black/40 px-2 py-1 text-slate-100" />
              </label>
            )}
          </Panel>

          <Panel title="Save / export">
            <div className="space-y-2">
              <button onClick={saveToRepo} className="w-full rounded-md bg-cyan-500/90 px-3 py-2 text-sm font-semibold text-black hover:bg-cyan-400">Save to repo (dev)</button>
              <button onClick={copyTs} className="w-full rounded-md bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15">Copy as TypeScript</button>
              <button onClick={() => setShowTs((s) => !s)} className="w-full rounded-md bg-white/5 px-3 py-2 text-xs hover:bg-white/10">{showTs ? 'Hide' : 'Show'} TS</button>
              <button onClick={() => { if (confirm('Reset all anchors to the values in source?')) setRings(defaultRings()); }} className="w-full rounded-md bg-red-500/15 px-3 py-2 text-xs text-red-300 hover:bg-red-500/25">Reset to source defaults</button>
              {saveMsg && <p className="text-[11px] text-emerald-300">{saveMsg}</p>}
            </div>
          </Panel>

          {showTs && (
            <Panel title="Paste into lib/poker-seat-layout.ts">
              <textarea readOnly value={tsExport} className="h-64 w-full rounded bg-black/50 p-2 font-mono text-[10px] leading-snug text-slate-200" />
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function Token({
  layer, color, idx, a, active, selected, name, stack, isDealer, blind, acting, onPointerDown,
}: {
  layer: LayerKey; color: string; idx: number; a: SeatAnchor;
  active: boolean; selected: boolean; name: string; stack: string;
  isDealer: boolean; blind: 'SB' | 'BB' | null; acting: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const common: React.CSSProperties = {
    position: 'absolute',
    left: `${a.fx * 100}%`,
    top: `${a.fy * 100}%`,
    transform: 'translate(-50%,-50%)',
    pointerEvents: active ? 'auto' : 'none',
    opacity: active ? 1 : 0.4,
    cursor: 'grab',
    zIndex: selected ? 40 : active ? 30 : 10,
    outline: selected ? '2px solid #fff' : 'none',
    outlineOffset: 2,
  };
  const ringHi = active ? `0 0 0 2px ${color}` : 'none';

  let body: React.ReactNode = null;
  if (layer === 'seat') {
    body = (
      <div style={{ width: 128, height: 128, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #2b3344, #141a24)', border: `3px solid ${acting ? '#22d3ee' : 'rgba(255,255,255,.25)'}`, boxShadow: ringHi, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontWeight: 800, fontSize: 30, position: 'relative' }}>
        {name.slice(0, 2).toUpperCase()}
        {blind && <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', border: `5px solid ${blind === 'SB' ? '#3b82f6' : '#f59e0b'}` }} />}
      </div>
    );
  } else if (layer === 'tag') {
    body = (
      <div style={{ background: 'rgba(8,11,17,.95)', border: `1px solid ${color}`, borderRadius: 8, padding: '4px 11px', textAlign: 'center', boxShadow: ringHi, minWidth: 96 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#e8edf5', lineHeight: 1.1 }}>{name}</div>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#fbbf24', lineHeight: 1.1 }}>{stack}</div>
      </div>
    );
  } else if (layer === 'bet') {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: ringHi, borderRadius: 999 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #d9f99d, #65a30d)', border: '2px dashed rgba(255,255,255,.7)' }} />
      </div>
    );
  } else if (layer === 'dealer') {
    body = (
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: isDealer ? 'radial-gradient(circle at 35% 30%, #fffaf0, #d4af37)' : 'rgba(252,211,77,.35)', border: '1.5px solid #8a6a1f', color: '#1a1408', fontFamily: 'serif', fontWeight: 900, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: ringHi }}>D</div>
    );
  } else if (layer === 'card') {
    body = (
      <div style={{ display: 'flex', boxShadow: ringHi, borderRadius: 6 }}>
        <div style={{ width: 32, height: 46, borderRadius: 5, background: 'repeating-linear-gradient(45deg,#1b3a8a,#1b3a8a 4px,#16307a 4px,#16307a 8px)', border: '1.5px solid #2a4ba0', transform: 'rotate(-9deg)' }} />
        <div style={{ width: 32, height: 46, borderRadius: 5, background: 'repeating-linear-gradient(45deg,#1b3a8a,#1b3a8a 4px,#16307a 4px,#16307a 8px)', border: '1.5px solid #2a4ba0', transform: 'rotate(9deg)', marginLeft: -8 }} />
      </div>
    );
  } else {
    body = (
      <div style={{ width: 42, height: 30, borderRadius: '50% / 40%', background: 'radial-gradient(circle at 35% 30%, #fda4af, #be123c)', border: '2px solid rgba(255,255,255,.6)', boxShadow: ringHi }} />
    );
  }

  return (
    <div style={common} onPointerDown={onPointerDown}>
      {body}
      {active && (
        <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 800, color, background: 'rgba(0,0,0,.7)', padding: '0 5px', borderRadius: 4, whiteSpace: 'nowrap' }}>
          {idx}
        </div>
      )}
    </div>
  );
}
