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
      className="fixed inset-x-0 top-0 z-50 flex justify-center pt-2 px-2 pointer-events-none"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="pointer-events-auto w-full max-w-sm rounded-xl overflow-hidden"
        style={{
          background: 'rgba(8,10,16,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(34,211,238,0.2)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <span className="text-[11px] font-extrabold tracking-wide uppercase" style={{ color: 'rgba(34,211,238,0.9)' }}>
            Table Appearance
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-lg transition-all hover:bg-white/10 flex items-center justify-center text-[10px]"
            style={{ color: 'rgba(255,255,255,0.6)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-3 flex flex-col gap-3">
          {/* Effect selector — hidden on mobile since effects are PC only */}
          <div className="hidden md:block">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/35 mb-1.5">Effect</div>
            <div className="flex gap-1.5">
              {TABLE_EFFECT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEffect(opt.id as TableEffectId)}
                  className="flex-1 px-2 py-1.5 rounded-lg border text-center transition-all"
                  style={{
                    background: effect === opt.id ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                    borderColor: effect === opt.id ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: effect === opt.id ? 'rgba(34,211,238,0.95)' : 'rgba(255,255,255,0.6)' }}
                  >
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Felt color */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/35 mb-1.5">Felt Color</div>
            <div className="grid grid-cols-6 gap-1.5">
              {FELT_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setFeltColor(preset.id)}
                  className="flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all"
                  style={{
                    background: feltColor === preset.id ? 'rgba(34,211,238,0.08)' : 'transparent',
                    borderColor: feltColor === preset.id ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full shrink-0 border"
                    style={{
                      background: preset.gradient,
                      borderColor: feltColor === preset.id ? 'rgba(34,211,238,0.6)' : 'rgba(255,255,255,0.1)',
                    }}
                  />
                  <span
                    className="text-[9px] font-bold leading-none"
                    style={{ color: feltColor === preset.id ? 'rgba(34,211,238,0.9)' : 'rgba(255,255,255,0.45)' }}
                  >
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
