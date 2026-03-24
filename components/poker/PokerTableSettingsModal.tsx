'use client';

import React from 'react';
import {
  usePokerTableEffect,
  TABLE_EFFECT_OPTIONS,
  FELT_COLOR_PRESETS,
  type TableEffectId,
} from '@/hooks/use-poker-table-effect';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function PokerTableSettingsModal({ isOpen, onClose }: Props) {
  const { effect, setEffect, feltColor, setFeltColor } = usePokerTableEffect();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Table settings"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
        style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-white/5"
          style={{ background: 'rgba(0,0,0,0.25)' }}
        >
          <div>
            <div className="text-[13px] font-extrabold tracking-wide uppercase" style={{ color: 'rgba(34,211,238,0.95)' }}>
              Table Appearance
            </div>
            <div className="text-[11px] text-white/50">
              <span className="hidden md:inline">Background effects &amp; felt color</span>
              <span className="md:hidden">Felt color</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl transition-all hover:bg-white/10 flex items-center justify-center"
            style={{ color: 'rgba(255,255,255,0.7)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-4">
          {/* Effect selector — hidden on mobile since effects are PC only */}
          <div className="hidden md:block">
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">
              Table Effect
            </div>
            <div className="flex flex-col gap-2">
              {TABLE_EFFECT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEffect(opt.id as TableEffectId)}
                  className="flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left"
                  style={{
                    background: effect === opt.id ? 'rgba(34,211,238,0.08)' : 'rgba(0,0,0,0.2)',
                    borderColor: effect === opt.id ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{
                      borderColor: effect === opt.id ? 'rgba(34,211,238,0.9)' : 'rgba(255,255,255,0.25)',
                    }}
                  >
                    {effect === opt.id && (
                      <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(34,211,238,0.9)' }} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold" style={{ color: effect === opt.id ? 'rgba(34,211,238,0.95)' : 'rgba(255,255,255,0.85)' }}>
                      {opt.label}
                    </div>
                    <div className="text-[11px] text-white/40">{opt.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Felt color */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">
              Felt Color
            </div>
            <div className="grid grid-cols-3 gap-2">
              {FELT_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setFeltColor(preset.id)}
                  className="flex items-center gap-2.5 p-2 rounded-lg border transition-all"
                  style={{
                    background: feltColor === preset.id ? 'rgba(34,211,238,0.08)' : 'rgba(0,0,0,0.2)',
                    borderColor: feltColor === preset.id ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-full shrink-0 border border-white/10"
                    style={{ background: preset.gradient }}
                  />
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: feltColor === preset.id ? 'rgba(34,211,238,0.95)' : 'rgba(255,255,255,0.7)' }}
                  >
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-white/5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-[12px] font-bold transition-all hover:brightness-125"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.75)' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
