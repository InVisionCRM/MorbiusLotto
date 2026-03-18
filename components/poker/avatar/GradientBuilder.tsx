'use client';

import React, { useState, useCallback } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import {
  type GradientDef,
  type GradientStop,
  serializeGradient,
  angleToSvgCoords,
  DEFAULT_GRADIENT,
} from '@/lib/gradient-utils';

interface GradientBuilderProps {
  /** Current value for this field (hex string or gradient JSON). Pass '' for no selection. */
  value: string;
  /** Called with the serialized gradient JSON when the user applies. */
  onApply: (serialized: string) => void;
  /** Label shown at the top, e.g. "Skin Gradient" */
  label?: string;
}

function stopBg(stop: GradientStop) {
  const r = parseInt(stop.color.slice(1, 3), 16);
  const g = parseInt(stop.color.slice(3, 5), 16);
  const b = parseInt(stop.color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${stop.opacity})`;
}

function gradientCss(def: GradientDef) {
  const stops = def.stops
    .slice()
    .sort((a, b) => a.offset - b.offset)
    .map(s => `${stopBg(s)} ${Math.round(s.offset * 100)}%`)
    .join(', ');
  return `linear-gradient(${def.angle}deg, ${stops})`;
}

export default function GradientBuilder({ value, onApply, label = 'Gradient' }: GradientBuilderProps) {
  const [def, setDef] = useState<GradientDef>(() => {
    if (value.startsWith('{')) {
      try {
        const parsed = JSON.parse(value);
        if (parsed.type === 'linearGradient') return parsed as GradientDef;
      } catch { /* ignore */ }
    }
    return DEFAULT_GRADIENT;
  });

  const [activeStopIdx, setActiveStopIdx] = useState(0);

  const updateDef = useCallback((patch: Partial<GradientDef>) => {
    setDef(prev => ({ ...prev, ...patch }));
  }, []);

  const updateStop = useCallback((idx: number, patch: Partial<GradientStop>) => {
    setDef(prev => {
      const stops = prev.stops.map((s, i) => i === idx ? { ...s, ...patch } : s);
      return { ...prev, stops };
    });
  }, []);

  const addStop = useCallback(() => {
    if (def.stops.length >= 5) return;
    const sorted = [...def.stops].sort((a, b) => a.offset - b.offset);
    // Insert midpoint between last two stops
    const last = sorted[sorted.length - 1];
    const secondLast = sorted[sorted.length - 2] ?? { offset: 0, color: last.color, opacity: 1 };
    const newOffset = (last.offset + secondLast.offset) / 2;
    const newStop: GradientStop = { color: '#ffffff', offset: newOffset, opacity: 1 };
    setDef(prev => ({ ...prev, stops: [...prev.stops, newStop] }));
    setActiveStopIdx(def.stops.length);
  }, [def.stops]);

  const removeStop = useCallback((idx: number) => {
    if (def.stops.length <= 2) return;
    setDef(prev => ({ ...prev, stops: prev.stops.filter((_, i) => i !== idx) }));
    setActiveStopIdx(i => Math.min(i, def.stops.length - 2));
  }, [def.stops.length]);

  const activeStop = def.stops[activeStopIdx] ?? def.stops[0];
  const svgCoords = angleToSvgCoords(def.angle);

  return (
    <div className="space-y-3">
      {/* Preview bar */}
      <div
        className="w-full h-12 rounded-xl shadow-inner border border-white/10"
        style={{ background: gradientCss(def) }}
      />

      {/* Stop rail */}
      <div className="relative h-8 rounded-lg border border-zinc-700 overflow-visible mx-1"
        style={{ background: gradientCss(def) }}
      >
        {def.stops.map((stop, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setActiveStopIdx(idx)}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-2 shadow transition-all ${
              activeStopIdx === idx ? 'border-white scale-125 z-10' : 'border-zinc-400 hover:border-white'
            }`}
            style={{
              left: `${stop.offset * 100}%`,
              backgroundColor: stop.color,
            }}
            aria-label={`Stop ${idx + 1}`}
          />
        ))}
      </div>

      {/* Stop offset slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wide">
          <span>Stop {activeStopIdx + 1} position</span>
          <span>{Math.round(activeStop.offset * 100)}%</span>
        </div>
        <input
          type="range" min="0" max="100" step="1"
          value={Math.round(activeStop.offset * 100)}
          onChange={e => updateStop(activeStopIdx, { offset: parseInt(e.target.value) / 100 })}
          className="w-full h-1.5 rounded-lg appearance-none bg-zinc-700 accent-indigo-500 cursor-pointer"
        />
      </div>

      {/* Color picker for active stop */}
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <HexColorPicker
            color={activeStop.color}
            onChange={color => updateStop(activeStopIdx, { color })}
            style={{ width: '100%', height: '120px' }}
          />
        </div>
        <div className="flex flex-col gap-2 shrink-0 w-28">
          {/* Opacity */}
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1 flex justify-between">
              <span>Opacity</span><span>{Math.round(activeStop.opacity * 100)}%</span>
            </div>
            <input
              type="range" min="0" max="100" step="1"
              value={Math.round(activeStop.opacity * 100)}
              onChange={e => updateStop(activeStopIdx, { opacity: parseInt(e.target.value) / 100 })}
              className="w-full h-1.5 rounded-lg appearance-none bg-zinc-700 accent-indigo-500 cursor-pointer"
            />
          </div>
          {/* Hex input */}
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Hex</div>
            <input
              type="text"
              value={activeStop.color}
              onChange={e => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{6}$/.test(v)) updateStop(activeStopIdx, { color: v });
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-zinc-500"
              maxLength={7}
            />
          </div>
          {/* Stop management */}
          <div className="flex gap-1 mt-auto">
            <button
              type="button"
              onClick={addStop}
              disabled={def.stops.length >= 5}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[10px] disabled:opacity-40 transition-colors"
              title="Add stop"
            >
              <Plus size={10} /> Add
            </button>
            <button
              type="button"
              onClick={() => removeStop(activeStopIdx)}
              disabled={def.stops.length <= 2}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-zinc-700 hover:bg-red-800 text-zinc-300 hover:text-red-300 text-[10px] disabled:opacity-40 transition-colors"
              title="Remove stop"
            >
              <Trash2 size={10} /> Del
            </button>
          </div>
        </div>
      </div>

      {/* Stop selector pills */}
      <div className="flex gap-1.5 flex-wrap">
        {def.stops.map((stop, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setActiveStopIdx(idx)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border transition-all ${
              activeStopIdx === idx
                ? 'border-white/40 bg-zinc-700 text-white'
                : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <span className="w-3 h-3 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: stop.color }} />
            Stop {idx + 1}
          </button>
        ))}
      </div>

      {/* Angle */}
      <div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1 flex justify-between">
          <span>Angle</span><span>{def.angle}°</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range" min="0" max="359" step="1"
            value={def.angle}
            onChange={e => updateDef({ angle: parseInt(e.target.value) })}
            className="flex-1 h-1.5 rounded-lg appearance-none bg-zinc-700 accent-indigo-500 cursor-pointer"
          />
          {/* Quick angle presets */}
          <div className="flex gap-1 shrink-0">
            {[0, 45, 90, 135, 180].map(a => (
              <button
                key={a}
                type="button"
                onClick={() => updateDef({ angle: a })}
                className={`w-7 h-7 rounded text-[9px] font-mono transition-colors ${
                  def.angle === a ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                {a}°
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG preview (small) */}
      <div className="flex items-center gap-2">
        <svg width="32" height="32" viewBox="0 0 32 32" className="rounded shrink-0 ring-1 ring-white/10">
          <defs>
            <linearGradient id="gb_preview" {...svgCoords}>
              {def.stops
                .slice()
                .sort((a, b) => a.offset - b.offset)
                .map((s, i) => (
                  <stop
                    key={i}
                    offset={`${s.offset * 100}%`}
                    stopColor={s.color}
                    stopOpacity={s.opacity}
                  />
                ))}
            </linearGradient>
          </defs>
          <rect width="32" height="32" fill="url(#gb_preview)" />
        </svg>
        <span className="text-[10px] text-zinc-500">SVG preview</span>
        <button
          type="button"
          onClick={() => onApply(serializeGradient(def))}
          className="ml-auto px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
        >
          Apply {label}
        </button>
      </div>
    </div>
  );
}
