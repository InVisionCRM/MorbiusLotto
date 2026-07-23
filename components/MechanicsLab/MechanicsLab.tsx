'use client';

/**
 * Mechanics Lab — the interactive showcase shell around SlotEngine.
 * Left: category sidebar. Center: canvas stage + controls. Right: Mechanic
 * Inspector (live engine snapshot). Dark glass + neon, Deep-Sea Neon scope.
 * NOT a gambling game — no bets, wallet or payments; demo units only.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { SlotEngine, type Snapshot } from './engine';
import { MECHANICS, CATEGORIES, byCategory, type MechanicDef } from './mechanics';

export default function MechanicsLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SlotEngine | null>(null);
  const [mechId, setMechId] = useState('cascading');
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [auto, setAuto] = useState(false);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(CATEGORIES));
  const mech = useMemo(() => MECHANICS.find(m => m.id === mechId)!, [mechId]);
  const cats = useMemo(() => byCategory(), []);

  /* engine lifecycle — one engine per selected mechanic */
  useEffect(() => {
    const engine = new SlotEngine(mech.cfg, mech.id);
    engineRef.current = engine;
    engine.onChange = () => setSnap(engine.getSnapshot());
    if (canvasRef.current) engine.attach(canvasRef.current);
    setSnap(engine.getSnapshot());
    const iv = setInterval(() => setSnap(engine.getSnapshot()), 500); // keep meta/phase fresh
    (window as any).MechLab = {
      engine,
      select: (id: string) => setMechId(id),
      list: () => MECHANICS.map(m => m.id),
      spin: () => engine.spin(),
      snapshot: () => engine.getSnapshot(),
      launch: (k: string) => engine.launchOverlay(k as any),
      click: (fx: number, fy: number) => engine.overlayClick(fx, fy),
      upgrade: (s: string) => engine.upgrade(s as any),
    };
    return () => { clearInterval(iv); engine.detach(); };
  }, [mech]);

  /* auto-spin */
  useEffect(() => {
    if (!auto) return;
    const iv = setInterval(() => {
      const e = engineRef.current;
      if (e && (e.phase === 'idle' || e.phase === 'settled') && !e.overlay && !e.inFreeSpins) e.spin();
    }, 1200);
    return () => clearInterval(iv);
  }, [auto, mech]);

  const onCanvasClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const e = engineRef.current; if (!e) return;
    const r = (ev.target as HTMLCanvasElement).getBoundingClientRect();
    if (e.overlay) e.overlayClick((ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
    else e.spin();
  };

  const inspectorRows: [string, string][] = snap ? [
    ['Grid', `${snap.cols} × ${snap.rowsPerCol.join('/')}`],
    ['Win mode', snap.winMode],
    ['Ways / lines', snap.ways ? snap.ways.toLocaleString('en-US') : '—'],
    ['Phase', snap.phase],
    ['Chain', String(snap.chain)],
    ['Multiplier', `×${snap.multiplier}`],
    ['Spins', String(snap.spins)],
    ['Free spins', snap.freeSpins ? String(snap.freeSpins) : '—'],
    ['Overlay', snap.overlay ?? '—'],
  ] : [];

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-[560px] bg-[#04080d] text-slate-200 font-[var(--font-arc-display)]">
      {/* ── sidebar ── */}
      <aside className="w-64 shrink-0 overflow-y-auto border-r border-cyan-400/15 bg-[#060e17]/80 backdrop-blur-md">
        <div className="px-4 py-4 border-b border-cyan-400/15">
          <div className="text-sm font-bold tracking-[0.2em] text-slate-100">MECHANICS <span className="text-cyan-300">LAB</span></div>
          <div className="mt-1 text-[10px] font-mono text-slate-500">visual slot mechanics engine · not a gambling game</div>
        </div>
        {CATEGORIES.map(cat => (
          <div key={cat} className="border-b border-cyan-400/10">
            <button
              className="w-full px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 hover:text-cyan-300"
              onClick={() => setOpenCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; })}
              data-cat={cat}
            >
              {cat} <span className="float-right text-cyan-500/70">{openCats.has(cat) ? '▾' : '▸'}</span>
            </button>
            {openCats.has(cat) && (cats.get(cat) ?? []).map(m => (
              <button
                key={m.id}
                data-mech={m.id}
                onClick={() => setMechId(m.id)}
                className={`block w-full px-5 py-1.5 text-left text-[12.5px] transition-colors ${
                  m.id === mechId
                    ? 'bg-cyan-400/10 text-cyan-300 border-l-2 border-cyan-400'
                    : 'text-slate-400 hover:text-slate-200 border-l-2 border-transparent'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* ── stage ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-cyan-400/15 bg-[#060e17]/70 px-5 py-3 backdrop-blur-md">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold text-slate-100">{mech.name}</div>
            <div className="truncate text-[11px] text-slate-500">{mech.blurb}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              data-btn="spin"
              onClick={() => engineRef.current?.spin()}
              className="rounded-lg bg-cyan-400 px-5 py-2 text-[13px] font-bold uppercase tracking-[0.14em] text-[#04222b] shadow-[0_0_22px_-4px_#22d3ee] transition hover:brightness-110 active:scale-95"
            >
              Spin
            </button>
            <button
              data-btn="auto"
              onClick={() => setAuto(a => !a)}
              className={`rounded-lg border px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] transition ${
                auto ? 'border-cyan-300 bg-cyan-400/15 text-cyan-300' : 'border-cyan-400/30 text-slate-400 hover:text-cyan-300'
              }`}
            >
              Auto {auto ? 'On' : 'Off'}
            </button>
            {mech.featureButton && (
              <button
                data-btn="feature"
                onClick={() => engineRef.current?.launchOverlay(mech.featureButton!.overlay)}
                className="rounded-lg border border-fuchsia-400/50 bg-fuchsia-500/10 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-fuchsia-300 transition hover:bg-fuchsia-500/20"
              >
                {mech.featureButton.label}
              </button>
            )}
            {mech.cfg.meta === 'upgrade' && (['gem', 'star', 'crown'] as const).map(s => (
              <button
                key={s}
                data-btn={`upgrade-${s}`}
                onClick={() => engineRef.current?.upgrade(s)}
                className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold uppercase text-amber-300 transition hover:bg-amber-400/20"
              >
                Upgrade {s} (40)
              </button>
            ))}
            <button
              data-btn="reset"
              onClick={() => { engineRef.current?.reset(); }}
              className="rounded-lg border border-slate-500/40 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-400 transition hover:text-slate-200"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_-10%,rgba(34,211,238,0.08),transparent_55%)]">
          <canvas ref={canvasRef} data-stage className="h-full w-full" onClick={onCanvasClick} />
          {snap && snap.lastWin.total > 0 && snap.phase === 'settled' && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl border border-emerald-400/40 bg-[#04140d]/85 px-5 py-2 font-mono text-[15px] font-bold text-emerald-300 shadow-[0_0_28px_-8px_#2ee98f]" data-winbar>
              WIN +{snap.lastWin.total.toLocaleString('en-US')}
            </div>
          )}
        </div>
      </main>

      {/* ── Mechanic Inspector ── */}
      <aside className="w-72 shrink-0 overflow-y-auto border-l border-cyan-400/15 bg-[#060e17]/80 backdrop-blur-md" data-inspector>
        <div className="border-b border-cyan-400/15 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
          Mechanic Inspector
        </div>
        <div className="space-y-1.5 px-4 py-3">
          {inspectorRows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="uppercase tracking-[0.1em] text-slate-500">{k}</span>
              <span className="font-mono text-cyan-200" data-ins={k}>{v}</span>
            </div>
          ))}
        </div>
        {snap && snap.modifiers.length > 0 && (
          <div className="border-t border-cyan-400/10 px-4 py-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Active modifiers</div>
            <div className="flex flex-wrap gap-1.5">
              {snap.modifiers.map(m => (
                <span key={m} className="rounded-full border border-cyan-400/30 bg-cyan-400/8 px-2 py-0.5 text-[10px] font-mono text-cyan-300">{m}</span>
              ))}
            </div>
          </div>
        )}
        {snap && Object.keys(snap.meta).length > 0 && (
          <div className="border-t border-cyan-400/10 px-4 py-3" data-meta>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Meta state</div>
            {Object.entries(snap.meta).map(([k, v]) => (
              <div key={k} className="flex justify-between text-[12px]">
                <span className="text-slate-500">{k}</span>
                <span className="font-mono text-amber-300">{typeof v === 'number' ? v.toLocaleString('en-US') : v}</span>
              </div>
            ))}
          </div>
        )}
        {snap && snap.lastWin.breakdown.length > 0 && (
          <div className="border-t border-cyan-400/10 px-4 py-3" data-breakdown>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Win calculation</div>
            {snap.lastWin.breakdown.slice(-6).map((b, i) => (
              <div key={i} className="font-mono text-[11px] leading-5 text-emerald-300/90">{b}</div>
            ))}
          </div>
        )}
        {snap && (
          <div className="border-t border-cyan-400/10 px-4 py-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Event log</div>
            {snap.log.map((l, i) => (
              <div key={i} className="font-mono text-[10.5px] leading-5 text-slate-500">{l}</div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
