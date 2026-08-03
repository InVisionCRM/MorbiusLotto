'use client';

/**
 * Rotary knob, ported from the slot builder's sound tab.
 *
 * A 270° arc starting at the 7-o'clock position, turned by vertical drag —
 * upward increases. These exist for the handful of parameters that have no
 * natural direct-manipulation surface (volume, pitch, reverb decay, delay mix);
 * everything else in the panel is dragged on its own widget instead.
 */

import { useCallback, useRef } from 'react';

const KNOB_R = 15.5;
const KNOB_CIRC = 2 * Math.PI * KNOB_R;
const KNOB_ARC = KNOB_CIRC * 0.75;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function SoundKnob({
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
  onGestureStart?: () => void;
}) {
  const drag = useRef<{ startY: number; startVal: number } | null>(null);
  const frac = clamp((value - min) / (max - min || 1), 0, 1);

  const quantize = useCallback(
    (v: number) => {
      const c = clamp(v, min, max);
      return Number((Math.round(c / step) * step).toFixed(3));
    },
    [min, max, step],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      onGestureStart?.();
      drag.current = { startY: e.clientY, startVal: value };
    },
    [value, onGestureStart],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      // 160px of travel spans the full range — enough resolution without
      // needing a modifier key for fine control.
      const delta = ((d.startY - e.clientY) / 160) * (max - min);
      onChange(quantize(d.startVal + delta));
    },
    [max, min, onChange, quantize],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const bump =
        e.key === 'ArrowUp' || e.key === 'ArrowRight'
          ? step
          : e.key === 'ArrowDown' || e.key === 'ArrowLeft'
            ? -step
            : 0;
      if (!bump) return;
      e.preventDefault();
      onGestureStart?.();
      onChange(quantize(value + bump));
    },
    [step, value, onChange, onGestureStart, quantize],
  );

  return (
    <div className="bjsnd-knob-ctl">
      <div
        className="bjsnd-knob"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
      >
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <circle
            className="knob-track"
            cx="20"
            cy="20"
            r={KNOB_R}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${KNOB_ARC} ${KNOB_CIRC}`}
            transform="rotate(135 20 20)"
          />
          <circle
            className="knob-fill"
            cx="20"
            cy="20"
            r={KNOB_R}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${KNOB_ARC * frac} ${KNOB_CIRC}`}
            transform="rotate(135 20 20)"
          />
          <g transform={`rotate(${135 + 270 * frac} 20 20)`}>
            <line
              className="knob-needle"
              x1="26"
              y1="20"
              x2="30.5"
              y2="20"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>
      <div className="bjsnd-knob-lbl">{label}</div>
      <div className="bjsnd-knob-val">
        {step < 1 ? value.toFixed(1) : Math.round(value)}
        {suffix}
      </div>
    </div>
  );
}
