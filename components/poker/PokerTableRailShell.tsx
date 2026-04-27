'use client';

import React from 'react';
import { usePokerTableEffect } from '@/hooks/use-poker-table-effect';

/**
 * Same CSS ring stack as `PokerTable` (outer + cushion + inner + felt + sheen), without beams or logo.
 * Use only inside `PokerTableEffectProvider` so `feltGradient` / `railStyle` match production.
 * Overlays (pot, seats) sit as siblings in the same `relative` wrapper like `PokerTable`.
 */
export function PokerTableRailShell() {
  const { feltGradient, railStyle } = usePokerTableEffect();

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: '3%',
        top: '5%',
        width: '94%',
        height: '88%',
        borderRadius: '9999px',
        background: '#07090f',
        padding: '7px',
        display: 'flex',
        boxShadow: '0 32px 100px rgba(0,0,0,0.95), 0 10px 40px rgba(0,0,0,0.8)',
      }}
    >
      <div
        style={{
          flex: 1,
          borderRadius: '9999px',
          display: 'flex',
          padding: '8px',
          background: railStyle.outerRing,
          boxShadow: railStyle.outerGlow,
        }}
      >
        <div
          style={{
            flex: 1,
            borderRadius: '9999px',
            display: 'flex',
            padding: '20px',
            background: railStyle.cushion,
            boxShadow: 'inset 0 4px 16px rgba(0,0,0,0.85), inset 0 -2px 8px rgba(0,0,0,0.6)',
          }}
        >
          <div
            style={{
              flex: 1,
              borderRadius: '9999px',
              display: 'flex',
              padding: '6px',
              background: railStyle.innerRing,
              boxShadow: railStyle.innerGlow,
            }}
          >
            <div
              style={{
                flex: 1,
                borderRadius: '9999px',
                position: 'relative',
                overflow: 'hidden',
                background: feltGradient,
                boxShadow: 'inset 0 8px 40px rgba(0,0,0,0.55), inset 0 -4px 20px rgba(0,0,0,0.4)',
                outline: '1px dashed rgba(255,255,255,0.08)',
                outlineOffset: '-10px',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(ellipse at 50% 18%, rgba(255,255,255,0.05) 0%, transparent 55%)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  boxShadow: 'inset 0 8px 40px rgba(0,0,0,0.45), inset 0 -4px 20px rgba(0,0,0,0.35)',
                  borderRadius: '9999px',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
