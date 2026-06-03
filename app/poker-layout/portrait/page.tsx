'use client';

/**
 * Portrait seat-anchor editor (mobile poker port).
 *
 * Tunes `PORTRAIT_SEAT_ANCHORS` in lib/poker-seat-layout.ts — the per-seat-count
 * avatar positions for the new mobile portrait layout. Only seats are dragged;
 * the nameplate / bet chip / dealer coin are DERIVED from each seat (via
 * portraitDeriveAnchor) and previewed live, so what you tune is what the real
 * table renders. Autosaves to localStorage; exports ready-to-paste TypeScript.
 *
 * Open on a phone at /poker-layout/portrait to tune against a real portrait felt.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  authoredSeatAnchors,
  portraitDeriveAnchor,
  type SeatAnchor,
} from '@/lib/poker-seat-layout';

// Reference table-area (the felt above the dock) — a portrait phone aspect.
const W = 412;
const H = 720;
const STORAGE_KEY = 'poker-portrait-anchors-v1';
const SEAT_COUNTS = [4, 5, 6, 9, 10];
const DEMO_DEALER_SLOT = 1; // illustrate the inward dealer coin on one side seat

const MOCK_NAMES = ['You', 'Vega', 'Nyx', 'Hex', 'Mako', 'Rook', 'Lux', 'Echo', 'Ash', 'Zero'];
const r3 = (n: number) => Number(n.toFixed(4));
const clone = (ring: ReadonlyArray<SeatAnchor>): SeatAnchor[] => ring.map((a) => ({ fx: a.fx, fy: a.fy }));

type Rings = Record<number, SeatAnchor[]>;

function defaultRings(): Rings {
  const out: Rings = {};
  for (const c of SEAT_COUNTS) out[c] = clone(authoredSeatAnchors(c, 'portrait'));
  return out;
}

function ringsToTs(rings: Rings): string {
  const counts = Object.keys(rings).map(Number).sort((a, b) => a - b);
  const lines = counts.map((c) => {
    const arr = rings[c].map((a) => `{ fx: ${r3(a.fx)}, fy: ${r3(a.fy)} }`).join(', ');
    return `  ${c}: [ ${arr} ],`;
  });
  return `export const PORTRAIT_SEAT_ANCHORS: Record<number, SeatAnchor[]> = {\n${lines.join('\n')}\n};`;
}

export default function PortraitSeatEditorPage() {
  const [rings, setRings] = useState<Rings>(defaultRings);
  const [seatCount, setSeatCount] = useState(10);
  const [selected, setSelected] = useState<number | null>(null);
  const [snap, setSnap] = useState(false);
  const [snapStep, setSnapStep] = useState(0.005);
  const [scale, setScale] = useState(0.7);
  const [msg, setMsg] = useState('');
  const [showTs, setShowTs] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<number | null>(null);

  const seats = rings[seatCount] ?? clone(authoredSeatAnchors(seatCount, 'portrait'));

  // ── load / autosave ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Rings;
        setRings((prev) => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rings)); } catch { /* ignore */ }
  }, [rings]);

  // ── fit the portrait felt into the available space ──
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const availW = el.clientWidth - 4;
      const availH = (typeof window !== 'undefined' ? window.innerHeight : H) * 0.82;
      setScale(Math.max(0.3, Math.min(availW / W, availH / H, 1.2)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  const setSeat = useCallback((idx: number, fx: number, fy: number) => {
    const sv = (v: number) => (snap ? Math.round(v / snapStep) * snapStep : v);
    const cfx = Math.min(1, Math.max(0, sv(fx)));
    const cfy = Math.min(1, Math.max(0, sv(fy)));
    setRings((prev) => {
      const cur = prev[seatCount] ?? clone(authoredSeatAnchors(seatCount, 'portrait'));
      const next = cur.map((a) => ({ ...a }));
      next[idx] = { fx: r3(cfx), fy: r3(cfy) };
      return { ...prev, [seatCount]: next };
    });
  }, [snap, snapStep, seatCount]);

  const pointerToFrac = useCallback((clientX: number, clientY: number) => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { fx: (clientX - rect.left) / rect.width, fy: (clientY - rect.top) / rect.height };
  }, []);

  const onLayerPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragRef.current == null) return;
    const f = pointerToFrac(e.clientX, e.clientY);
    if (f) setSeat(dragRef.current, f.fx, f.fy);
  }, [pointerToFrac, setSeat]);

  useEffect(() => {
    const up = () => { dragRef.current = null; };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  // arrow-key nudge for the selected seat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected == null) return;
      const step = e.shiftKey ? 0.02 : 0.002;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;
      e.preventDefault();
      const cur = seats[selected];
      if (cur) setSeat(selected, cur.fx + dx, cur.fy + dy);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, seats, setSeat]);

  const startDrag = (idx: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = idx;
    setSelected(idx);
  };

  const tsExport = useMemo(() => ringsToTs(rings), [rings]);
  const copyTs = async () => {
    try { await navigator.clipboard.writeText(tsExport); setMsg('Copied TypeScript to clipboard'); }
    catch { setShowTs(true); setMsg('Clipboard blocked — showing text to copy'); }
    setTimeout(() => setMsg(''), 4000);
  };

  return (
    <div className="min-h-screen bg-[#0a0c12] p-3 text-slate-100 md:p-6">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-4 lg:flex-row">
        {/* ── Canvas ── */}
        <div className="flex-1">
          <header className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-400/80">Dev tool</p>
              <h1 className="text-xl font-semibold md:text-2xl">Portrait seat editor</h1>
              <p className="mt-1 max-w-xl text-xs text-slate-400">
                Drag seats. Seat 0 is you (bottom). The nameplate, bet chip and dealer coin are
                derived from each seat, so they follow as you drag. Autosaves. Arrow keys nudge (Shift = bigger).
              </p>
            </div>
            <Link href="/poker-layout" className="whitespace-nowrap text-sm text-cyan-400 hover:underline">Default editor →</Link>
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
                {/* portrait felt (vertical oval, cyan) — mirrors the mockup */}
                <div style={{ position: 'absolute', inset: '2% 5%', borderRadius: 9999, background: '#06090e', boxShadow: '0 0 0 9px #1c1410' }} />
                <div style={{ position: 'absolute', inset: '4% 8%', borderRadius: 9999, background: 'radial-gradient(120% 90% at 50% 38%, #0f7387, #0a505e 64%, #062f38)', boxShadow: 'inset 0 8px 40px rgba(0,0,0,.5), inset 0 0 0 2px rgba(34,211,238,.14)' }} />
                {/* community + pot reference */}
                <div style={{ position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%,-50%)', display: 'flex', gap: 5 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ width: 30, height: 44, borderRadius: 4, background: 'rgba(255,255,255,.08)', border: '1px dashed rgba(255,255,255,.22)' }} />
                  ))}
                </div>
                <div style={{ position: 'absolute', left: '50%', top: '30%', transform: 'translate(-50%,-50%)', color: '#ffe9a8', fontSize: 13, fontWeight: 800, background: 'rgba(0,0,0,.5)', padding: '3px 12px', borderRadius: 999, border: '1px solid rgba(212,175,55,.35)' }}>POT</div>

                {/* derived element previews (faint, non-draggable) */}
                {seats.slice(0, seatCount).map((s, idx) => {
                  const tag = portraitDeriveAnchor(s, 'tag');
                  const bet = portraitDeriveAnchor(s, 'bet');
                  const dealer = portraitDeriveAnchor(s, 'dealer');
                  return (
                    <div key={`d-${idx}`} style={{ pointerEvents: 'none' }}>
                      <div style={{ position: 'absolute', left: `${bet.fx * 100}%`, top: `${bet.fy * 100}%`, transform: 'translate(-50%,-50%)', width: 26, height: 26, borderRadius: '50%', background: 'rgba(163,230,53,.18)', border: '1px dashed rgba(163,230,53,.5)' }} />
                      <div style={{ position: 'absolute', left: `${tag.fx * 100}%`, top: `${tag.fy * 100}%`, transform: 'translate(-50%,-50%)', minWidth: 70, textAlign: 'center', background: 'rgba(8,11,17,.7)', border: '1px solid rgba(245,158,11,.4)', borderRadius: 7, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#cfd8e3' }}>{MOCK_NAMES[idx] ?? `P${idx}`}<span style={{ color: '#fbbf24', marginLeft: 5 }}>9,200</span></div>
                      {idx === DEMO_DEALER_SLOT && (
                        <div style={{ position: 'absolute', left: `${dealer.fx * 100}%`, top: `${dealer.fy * 100}%`, transform: 'translate(-50%,-50%)', width: 24, height: 24, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #fffaf0, #d4af37)', border: '1.5px solid #8a6a1f', color: '#1a1408', fontWeight: 900, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>D</div>
                      )}
                    </div>
                  );
                })}

                {/* draggable seat tokens */}
                {seats.slice(0, seatCount).map((s, idx) => (
                  <div
                    key={`s-${idx}`}
                    onPointerDown={startDrag(idx)}
                    style={{
                      position: 'absolute', left: `${s.fx * 100}%`, top: `${s.fy * 100}%`,
                      transform: 'translate(-50%,-50%)', width: 54, height: 54, borderRadius: '50%',
                      background: idx === 0 ? 'radial-gradient(circle at 35% 30%, #2f7d6b, #16463b)' : 'radial-gradient(circle at 35% 30%, #2b3344, #141a24)',
                      border: `3px solid ${selected === idx ? '#fff' : 'rgba(34,211,238,.7)'}`,
                      cursor: 'grab', zIndex: selected === idx ? 40 : 30,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#e2e8f0', fontWeight: 800, fontSize: 15,
                      boxShadow: '0 2px 8px rgba(0,0,0,.5)',
                    }}
                  >
                    {(MOCK_NAMES[idx] ?? `P${idx}`).slice(0, idx === 0 ? 3 : 2)}
                    <span style={{ position: 'absolute', top: -15, fontSize: 10, fontWeight: 800, color: '#67e8f9', background: 'rgba(0,0,0,.7)', padding: '0 5px', borderRadius: 4 }}>{idx}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Controls ── */}
        <aside className="w-full shrink-0 space-y-4 lg:w-[280px]">
          <Panel title="Seat count">
            <div className="flex gap-1.5">
              {SEAT_COUNTS.map((c) => (
                <button
                  key={c}
                  onClick={() => { setSeatCount(c); setSelected(null); }}
                  className={`flex-1 rounded-md px-2 py-1.5 text-sm font-semibold transition ${seatCount === c ? 'bg-cyan-500/90 text-black' : 'bg-white/5 hover:bg-white/10'}`}
                >{c}</button>
              ))}
            </div>
          </Panel>

          <Panel title="Selected seat">
            {selected != null && seats[selected] ? (
              <div className="space-y-1 text-sm">
                <div className="text-slate-300">Seat <b>{selected}</b>{selected === 0 ? ' (you)' : ''}</div>
                <div className="font-mono text-xs text-cyan-300">fx {seats[selected].fx.toFixed(3)} · fy {seats[selected].fy.toFixed(3)}</div>
                <div className="text-[11px] text-slate-500">Arrow keys nudge · Shift = ×10</div>
              </div>
            ) : <p className="text-xs text-slate-500">Tap a seat to select it.</p>}
          </Panel>

          <Panel title="Snap">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap to grid
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

          <Panel title="Export">
            <div className="space-y-2">
              <button onClick={copyTs} className="w-full rounded-md bg-cyan-500/90 px-3 py-2 text-sm font-semibold text-black hover:bg-cyan-400">Copy as TypeScript</button>
              <button onClick={() => setShowTs((s) => !s)} className="w-full rounded-md bg-white/5 px-3 py-2 text-xs hover:bg-white/10">{showTs ? 'Hide' : 'Show'} TS</button>
              <button onClick={() => { if (confirm('Reset all seat counts to source defaults?')) setRings(defaultRings()); }} className="w-full rounded-md bg-red-500/15 px-3 py-2 text-xs text-red-300 hover:bg-red-500/25">Reset to defaults</button>
              {msg && <p className="text-[11px] text-emerald-300">{msg}</p>}
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
