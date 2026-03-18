'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Plus, Trash2 } from 'lucide-react';
import {
  type GradientDef,
  type GradientStop,
  serializeGradient,
  angleToSvgCoords,
  DEFAULT_GRADIENT,
} from '@/lib/gradient-utils';

interface GradientBuilderProps {
  value: string;
  onApply: (serialized: string) => void;
  label?: string;
}

function stopBg(stop: GradientStop) {
  const r = parseInt(stop.color.slice(1, 3), 16);
  const g = parseInt(stop.color.slice(3, 5), 16);
  const b = parseInt(stop.color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${stop.opacity})`;
}

function gradientCss(def: GradientDef) {
  return `linear-gradient(90deg, ${def.stops
    .slice().sort((a, b) => a.offset - b.offset)
    .map(s => `${stopBg(s)} ${Math.round(s.offset * 100)}%`).join(', ')})`;
}

function parseDef(value: string): GradientDef | null {
  if (!value.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed.type === 'linearGradient') return parsed as GradientDef;
  } catch { /* ignore */ }
  return null;
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

export default function GradientBuilder({ value, onApply }: GradientBuilderProps) {
  const def: GradientDef = parseDef(value) ?? DEFAULT_GRADIENT;

  const [activeIdx, setActiveIdx] = useState(0);
  const safeIdx = clamp(activeIdx, 0, def.stops.length - 1);
  const activeStop = def.stops[safeIdx];

  const railRef = useRef<HTMLDivElement>(null);
  const draggingIdx = useRef<number | null>(null);
  const svgCoords = angleToSvgCoords(def.angle);

  const emit = useCallback((next: GradientDef) => onApply(serializeGradient(next)), [onApply]);
  const updateDef = (patch: Partial<GradientDef>) => emit({ ...def, ...patch });
  const updateStop = (idx: number, patch: Partial<GradientStop>) =>
    emit({ ...def, stops: def.stops.map((s, i) => i === idx ? { ...s, ...patch } : s) });

  const offsetFromEvent = (clientX: number) => {
    if (!railRef.current) return 0;
    const rect = railRef.current.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };

  // Global drag tracking
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (draggingIdx.current === null) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const newOffset = offsetFromEvent(clientX);
      emit({ ...def, stops: def.stops.map((s, i) => i === draggingIdx.current ? { ...s, offset: newOffset } : s) });
    };
    const onUp = () => { draggingIdx.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [def, emit]);

  // Click empty area on bar = add stop at that position
  const handleBarClick = (e: React.MouseEvent) => {
    if (draggingIdx.current !== null) return;
    if (def.stops.length >= 5) return;
    const offset = offsetFromEvent(e.clientX);
    // Don't add if clicked within 4px of an existing handle
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tooClose = def.stops.some(s => Math.abs(s.offset - offset) * rect.width < 8);
    if (tooClose) return;
    // Interpolate color at clicked position
    const sorted = [...def.stops].sort((a, b) => a.offset - b.offset);
    let color = sorted[0].color;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (offset >= sorted[i].offset && offset <= sorted[i + 1].offset) {
        const t = (offset - sorted[i].offset) / (sorted[i + 1].offset - sorted[i].offset || 1);
        // simple lerp in hex
        const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
        const ca = sorted[i].color, cb = sorted[i + 1].color;
        const r = lerp(parseInt(ca.slice(1, 3), 16), parseInt(cb.slice(1, 3), 16));
        const g = lerp(parseInt(ca.slice(3, 5), 16), parseInt(cb.slice(3, 5), 16));
        const b2 = lerp(parseInt(ca.slice(5, 7), 16), parseInt(cb.slice(5, 7), 16));
        color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b2.toString(16).padStart(2, '0')}`;
        break;
      }
    }
    const newStops = [...def.stops, { color, offset, opacity: 1 }];
    emit({ ...def, stops: newStops });
    setActiveIdx(def.stops.length);
  };

  const removeStop = (idx: number) => {
    if (def.stops.length <= 2) return;
    emit({ ...def, stops: def.stops.filter((_, i) => i !== idx) });
    setActiveIdx(i => clamp(i, 0, def.stops.length - 2));
  };

  return (
    <div className="space-y-2.5">

      {/* ── Gradient bar + draggable handles ── */}
      <div className="select-none">
        {/* Bar */}
        <div
          ref={railRef}
          className="relative w-full h-8 rounded-lg cursor-crosshair"
          style={{ background: gradientCss(def) }}
          onClick={handleBarClick}
        >
          {/* checkerboard underlay for transparency */}
          <div className="absolute inset-0 rounded-lg -z-10"
            style={{ backgroundImage: 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%)', backgroundSize: '8px 8px' }} />
        </div>

        {/* Handle track */}
        <div className="relative w-full h-5 mt-0.5">
          {def.stops.map((stop, idx) => (
            <div
              key={idx}
              className="absolute top-0 -translate-x-1/2 flex flex-col items-center cursor-grab active:cursor-grabbing"
              style={{ left: `${stop.offset * 100}%` }}
              onMouseDown={e => { e.preventDefault(); draggingIdx.current = idx; setActiveIdx(idx); }}
              onTouchStart={e => { draggingIdx.current = idx; setActiveIdx(idx); }}
              onClick={e => { e.stopPropagation(); setActiveIdx(idx); }}
            >
              {/* Arrow pointing up */}
              <div className={`w-0 h-0 transition-all ${safeIdx === idx ? 'border-l-[5px] border-r-[5px] border-b-[6px] border-l-transparent border-r-transparent border-b-white' : 'border-l-[4px] border-r-[4px] border-b-[5px] border-l-transparent border-r-transparent border-b-zinc-400'}`} />
              {/* Color swatch handle */}
              <div className={`w-4 h-4 rounded-sm shadow-md transition-all ${safeIdx === idx ? 'ring-2 ring-white scale-110' : 'ring-1 ring-zinc-500 hover:ring-zinc-300'}`}
                style={{ backgroundColor: stop.color }} />
            </div>
          ))}
        </div>
        <p className="text-[9px] text-zinc-600 mt-0.5">Drag handles · click bar to add stop</p>
      </div>

      {/* ── Active stop editor ── */}
      <div className="bg-zinc-800/50 rounded-lg p-2 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {def.stops.map((stop, idx) => (
              <button key={idx} type="button" onClick={() => setActiveIdx(idx)}
                className={`w-5 h-5 rounded border-2 transition-all ${safeIdx === idx ? 'border-white scale-110' : 'border-zinc-600 hover:border-zinc-400'}`}
                style={{ backgroundColor: stop.color }}
                title={`Stop ${idx + 1}`}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => {
              if (def.stops.length >= 5) return;
              const sorted = [...def.stops].sort((a, b) => a.offset - b.offset);
              const last = sorted[sorted.length - 1];
              const prev = sorted[sorted.length - 2] ?? { offset: 0 };
              const offset = (last.offset + prev.offset) / 2;
              emit({ ...def, stops: [...def.stops, { color: '#ffffff', offset, opacity: 1 }] });
              setActiveIdx(def.stops.length);
            }} disabled={def.stops.length >= 5}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[9px] disabled:opacity-40 transition-colors">
              <Plus size={8} /> Add
            </button>
            <button type="button" onClick={() => removeStop(safeIdx)} disabled={def.stops.length <= 2}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-red-900 text-zinc-300 hover:text-red-300 text-[9px] disabled:opacity-40 transition-colors">
              <Trash2 size={8} /> Del
            </button>
          </div>
        </div>

        {/* Color picker row */}
        <div className="flex gap-2">
          <HexColorPicker color={activeStop.color} onChange={color => updateStop(safeIdx, { color })}
            style={{ width: '100%', height: '80px', flexShrink: 1 }} />
          <div className="flex flex-col gap-1.5 shrink-0 w-20">
            <div>
              <div className="text-[9px] text-zinc-500 mb-0.5 flex justify-between"><span>Opacity</span><span>{Math.round(activeStop.opacity * 100)}%</span></div>
              <input type="range" min="0" max="100" step="1"
                value={Math.round(activeStop.opacity * 100)}
                onChange={e => updateStop(safeIdx, { opacity: parseInt(e.target.value) / 100 })}
                className="w-full h-1 rounded appearance-none bg-zinc-700 accent-indigo-500 cursor-pointer" />
            </div>
            <div>
              <div className="text-[9px] text-zinc-500 mb-0.5">Hex</div>
              <input type="text" value={activeStop.color}
                onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) updateStop(safeIdx, { color: e.target.value }); }}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-white font-mono focus:outline-none focus:border-zinc-500"
                maxLength={7} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Angle ── */}
      <div>
        <div className="text-[9px] text-zinc-500 mb-0.5 flex justify-between"><span>Angle</span><span>{def.angle}°</span></div>
        <div className="flex items-center gap-1.5">
          <input type="range" min="0" max="359" step="1" value={def.angle}
            onChange={e => updateDef({ angle: parseInt(e.target.value) })}
            className="flex-1 h-1 rounded appearance-none bg-zinc-700 accent-indigo-500 cursor-pointer" />
          <div className="flex gap-0.5 shrink-0">
            {[0, 45, 90, 135, 180].map(a => (
              <button key={a} type="button" onClick={() => updateDef({ angle: a })}
                className={`w-7 h-5 rounded text-[8px] font-mono transition-colors ${def.angle === a ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}>
                {a}°
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG preview chip */}
      <div className="flex items-center gap-1.5">
        <svg width="18" height="18" viewBox="0 0 18 18" className="rounded shrink-0 ring-1 ring-white/10">
          <defs>
            <linearGradient id="gb_svg_preview" {...svgCoords}>
              {def.stops.slice().sort((a, b) => a.offset - b.offset).map((s, i) => (
                <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} stopOpacity={s.opacity} />
              ))}
            </linearGradient>
          </defs>
          <rect width="18" height="18" fill="url(#gb_svg_preview)" />
        </svg>
        <span className="text-[9px] text-zinc-600">SVG preview · live</span>
      </div>
    </div>
  );
}
