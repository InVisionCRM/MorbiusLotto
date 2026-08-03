'use client';

/**
 * The four FX module surfaces, ported from the slot builder's sound tab.
 *
 * Each is a direct-manipulation control rather than a readout with sliders
 * beside it: drag the envelope handles, drag the spatial pad, drag across the
 * echo tunnel. Only the Stereograph is a pure monitor — there is nothing
 * meaningful to drag on a scope.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clamp,
  echoReadText,
  envReadText,
  loadBuffer,
  padReadText,
  registerEchoPulse,
  soundLiveTaps,
  waveformPeaks,
  type SoundFx,
} from '@/lib/blackjack-sound-fx';

// ── Envelope ───────────────────────────────────────────────────────────────
/**
 * Waveform with four draggable handles: attack, decay, sustain level and the
 * end trim. Handles are 0..1 fractions of the sample and stay monotonic, so a
 * drag can never produce an envelope the engine would have to clamp away.
 */
export function EnvelopeCanvas({
  fx,
  sourceUrl,
  onChange,
  onGestureStart,
}: {
  fx: SoundFx;
  sourceUrl: string | null;
  onChange: (patch: Partial<SoundFx>) => void;
  onGestureStart?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const dragging = useRef<'attack' | 'decay' | 'end' | 'sustain' | null>(null);
  const fxRef = useRef(fx);
  fxRef.current = fx;

  useEffect(() => {
    let alive = true;
    if (!sourceUrl) {
      setPeaks(null);
      return;
    }
    void loadBuffer(sourceUrl).then((buf) => {
      if (alive) setPeaks(buf ? waveformPeaks(buf, 150) : null);
    });
    return () => {
      alive = false;
    };
  }, [sourceUrl]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const w = cv.width;
    const h = cv.height;
    ctx.clearRect(0, 0, w, h);

    // waveform, or a flat line when the sample could not be decoded
    ctx.fillStyle = 'rgba(34,211,238,0.35)';
    if (peaks) {
      const cw = w / peaks.length;
      peaks.forEach((p, i) => {
        const ph = Math.max(1, p * (h * 0.78));
        ctx.fillRect(i * cw, (h - ph) / 2, Math.max(1, cw - 0.5), ph);
      });
    } else {
      ctx.fillRect(0, h / 2 - 0.5, w, 1);
    }

    const xA = clamp(fx.envAttack, 0, 1) * w;
    const xD = clamp(fx.envDecay, 0, 1) * w;
    const xE = clamp(fx.envEnd, 0, 1) * w;
    const ySus = h - clamp(fx.envSustain, 0, 1) * h;

    // trimmed tail dimmed out
    if (fx.envEnd < 0.999) {
      ctx.fillStyle = 'rgba(2,6,12,0.72)';
      ctx.fillRect(xE, 0, w - xE, h);
    }

    // envelope contour
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(xA, 0);
    ctx.lineTo(Math.max(xA, xD), ySus);
    ctx.lineTo(xE, ySus);
    ctx.lineTo(xE, h);
    ctx.stroke();

    // handles
    const dot = (x: number, y: number) => {
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#bff7ff';
      ctx.fill();
      ctx.strokeStyle = '#0e7490';
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    dot(xA, 0);
    dot(Math.max(xA, xD), ySus);
    dot(xE, ySus);
  }, [fx, peaks]);

  const pick = useCallback((px: number, py: number, w: number, h: number) => {
    const f = fxRef.current;
    const xA = clamp(f.envAttack, 0, 1) * w;
    const xD = clamp(f.envDecay, 0, 1) * w;
    const xE = clamp(f.envEnd, 0, 1) * w;
    const ySus = h - clamp(f.envSustain, 0, 1) * h;
    const cands: Array<[typeof dragging.current, number]> = [
      ['attack', Math.hypot(px - xA, py - 0)],
      ['decay', Math.hypot(px - Math.max(xA, xD), py - ySus)],
      ['end', Math.hypot(px - xE, py - ySus)],
    ];
    cands.sort((a, b) => a[1] - b[1]);
    // Far from every handle: treat a vertical drag as the sustain level, which
    // is what people reach for when they grab the middle of the contour.
    return cands[0][1] < 18 ? cands[0][0] : 'sustain';
  }, []);

  const apply = useCallback(
    (e: React.PointerEvent) => {
      const cv = ref.current;
      if (!cv || !dragging.current) return;
      const r = cv.getBoundingClientRect();
      const fx01 = clamp((e.clientX - r.left) / r.width, 0, 1);
      const fy01 = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
      const f = fxRef.current;
      switch (dragging.current) {
        case 'attack': {
          // Decay rides along rather than blocking the drag: the engine clamps
          // decay up to attack anyway, so pinning attack behind a decay still
          // sitting at its 0 default would make the handle immovable.
          const a = Math.min(fx01, f.envEnd);
          onChange({ envAttack: a, envDecay: Math.max(f.envDecay, a) });
          break;
        }
        case 'decay':
          onChange({ envDecay: clamp(fx01, f.envAttack, f.envEnd), envSustain: fy01 });
          break;
        case 'end':
          onChange({ envEnd: Math.max(fx01, f.envDecay) });
          break;
        case 'sustain':
          onChange({ envSustain: fy01 });
          break;
      }
    },
    [onChange],
  );

  return (
    <>
      <canvas
        ref={ref}
        className="bjsnd-env-cv"
        width={300}
        height={104}
        onPointerDown={(e) => {
          const cv = ref.current;
          if (!cv) return;
          e.preventDefault();
          cv.setPointerCapture(e.pointerId);
          const r = cv.getBoundingClientRect();
          onGestureStart?.();
          dragging.current = pick(
            ((e.clientX - r.left) / r.width) * 300,
            ((e.clientY - r.top) / r.height) * 104,
            300,
            104,
          );
          apply(e);
        }}
        onPointerMove={apply}
        onPointerUp={() => (dragging.current = null)}
        onPointerCancel={() => (dragging.current = null)}
      />
      <div className="bjsnd-read">{envReadText(fx)}</div>
    </>
  );
}

// ── Spatial pad ────────────────────────────────────────────────────────────
/** X is pan, Y is distance (reverb mix) — near the bottom is close and dry. */
export function SpatialPad({
  fx,
  onChange,
  onGestureStart,
}: {
  fx: SoundFx;
  onChange: (patch: Partial<SoundFx>) => void;
  onGestureStart?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const apply = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el || !dragging.current) return;
      const r = el.getBoundingClientRect();
      onChange({
        pan: clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1),
        reverbMix: clamp(1 - (e.clientY - r.top) / r.height, 0, 1),
      });
    },
    [onChange],
  );

  const left = ((clamp(fx.pan, -1, 1) + 1) / 2) * 100;
  const top = (1 - clamp(fx.reverbMix, 0, 1)) * 100;

  return (
    <>
      <div
        ref={ref}
        className="bjsnd-pad"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          onGestureStart?.();
          dragging.current = true;
          apply(e);
        }}
        onPointerMove={apply}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <div className="bjsnd-pad-ring r1" />
        <div className="bjsnd-pad-ring r2" />
        <div className="bjsnd-pad-hline" />
        <div className="bjsnd-pad-vline" />
        <span className="bjsnd-axis ax-x">PAN</span>
        <span className="bjsnd-axis ax-y">DISTANCE</span>
        <div className="bjsnd-pad-dot" style={{ left: `${left}%`, top: `${top}%` }} />
      </div>
      <div className="bjsnd-read">{padReadText(fx)}</div>
    </>
  );
}

// ── Echo tunnel ────────────────────────────────────────────────────────────
/**
 * Concentric rings standing in for delay repeats: ring spacing is delay time,
 * their persistence is feedback. Dragging across it sets both, and a play
 * fires a bright pulse that travels outward.
 */
export function EchoTunnel({
  id,
  fx,
  onChange,
  onGestureStart,
}: {
  id: string;
  fx: SoundFx;
  onChange: (patch: Partial<SoundFx>) => void;
  onGestureStart?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const pulseAt = useRef(0);
  const fxRef = useRef(fx);
  fxRef.current = fx;

  useEffect(() => {
    const unregister = registerEchoPulse(id, () => (pulseAt.current = Date.now()));
    return () => {
      unregister();
    };
  }, [id]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const draw = () => {
      const f = fxRef.current;
      const w = cv.width;
      const h = cv.height;
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      const time = clamp(f.delayTime, 0.02, 1);
      const fb = clamp(f.delayFeedback, 0, 0.85);
      const rings = 7;
      const maxR = Math.min(w, h) * 0.46;
      for (let i = 1; i <= rings; i++) {
        // spacing follows delay time; alpha falls off with feedback, so a low
        // feedback visibly dies out after a ring or two
        const t = (i / rings) * (0.35 + time * 0.65);
        const r = maxR * t;
        const alpha = Math.pow(fb || 0.06, i - 1) * 0.55 + 0.04;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34,211,238,${alpha.toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      const age = Date.now() - pulseAt.current;
      if (age < 900) {
        const p = age / 900;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * p, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(191,247,255,${(1 - p) * 0.9})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#bff7ff';
      ctx.fill();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const apply = useCallback(
    (e: React.PointerEvent) => {
      const cv = ref.current;
      if (!cv || !dragging.current) return;
      const r = cv.getBoundingClientRect();
      onChange({
        delayTime: clamp(0.02 + ((e.clientX - r.left) / r.width) * 0.98, 0.02, 1),
        delayFeedback: clamp((1 - (e.clientY - r.top) / r.height) * 0.85, 0, 0.85),
      });
    },
    [onChange],
  );

  return (
    <>
      <div className="bjsnd-echo-wrap">
        <canvas
          ref={ref}
          className="bjsnd-echo-cv"
          width={150}
          height={150}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            onGestureStart?.();
            dragging.current = true;
            apply(e);
          }}
          onPointerMove={apply}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        />
        <span className="bjsnd-axis ax-x">TIME</span>
        <span className="bjsnd-axis ax-y">FEEDBACK</span>
      </div>
      <div className="bjsnd-read">{echoReadText(fx)}</div>
    </>
  );
}

// ── Stereograph ────────────────────────────────────────────────────────────
/**
 * Post-pan L/R goniometer. Reads the analyser pair the engine registers on each
 * play; between plays it idles on a slow breathing ring so the module never
 * looks broken.
 */
export function Stereograph({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const L = new Float32Array(256);
    const R = new Float32Array(256);
    let raf = 0;
    const draw = () => {
      const w = cv.width;
      const h = cv.height;
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(148,163,184,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();

      const tap = soundLiveTaps[id];
      const live = tap && Date.now() < tap.endAt;
      if (live) {
        try {
          tap.analyserL.getFloatTimeDomainData(L);
          tap.analyserR.getFloatTimeDomainData(R);
          ctx.strokeStyle = 'rgba(34,211,238,0.85)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          for (let i = 0; i < L.length; i++) {
            // 45° rotation: mono lands on the vertical axis, out-of-phase on the horizontal
            const x = cx + ((L[i] - R[i]) / Math.SQRT2) * (w * 0.45);
            const y = cy - ((L[i] + R[i]) / Math.SQRT2) * (h * 0.45);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        } catch {
          /* analyser went away mid-frame — idle instead */
        }
      } else {
        const t = (Date.now() % 2600) / 2600;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(w, h) * 0.12 * (1 + Math.sin(t * Math.PI * 2) * 0.18), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(34,211,238,0.22)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [id]);

  return <canvas ref={ref} className="bjsnd-gonio-cv" width={150} height={150} />;
}
