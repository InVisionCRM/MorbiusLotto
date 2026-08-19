'use client';

/**
 * StreakFlameBorder — the Living Flame treatment from the Streak Heat Lab
 * (public/streak-heat-lab.html), ported faithfully onto the real felt. The lab
 * is the spec: this keeps its heat model, its continuous color engine, and its
 * calmed particles exactly.
 *
 * HOW IT READS: an animated conic rim hugs the table edge. Its color, speed,
 * blur and saturation all derive from a temperature that DRIFTS — a displayed
 * value eases toward the target with an exponential glide (tau 1.1s, a win
 * lands over 3-4s), and colors are sampled per-frame from one continuous ramp
 * spanning -100..+100 (glacial cyan through neutral slate to white-hot). No
 * visual ever steps; stage thresholds exist only in the lab's ladder.
 *
 * HOW IT MOVES: wins add ~14 heat plus a compounding streak bonus, losses
 * mirror it, pushes drift toward neutral. Heat and streak persist in
 * localStorage so a player's run survives a reload — closing the app cold
 * and coming back hot would break the story the border is telling.
 *
 * HOW IT'S DRAWN: unlike the lab (which pads a frame), this renders as a
 * zero-layout overlay: an absolutely-positioned rim over the table's outer
 * 10px, kept to a ring by the standard mask-composite gradient-border
 * technique, so the felt's own layout never shifts and nothing pokes outside
 * the panel's overflow-hidden. A canvas rides with it for the handful of
 * embers / frost crystals at the extremes (cap 26, spawn only above ~60%
 * intensity, smooth fade in and out) — like the lab, they live just inside
 * the frame edge. Near neutral the rim fades out entirely — a player running
 * even sees a clean table.
 */

import { useEffect, useRef } from 'react';

export interface StreakHeatEvent {
  result: 'win' | 'lose' | 'push';
  /** New key = new settled hand; the same key never applies twice. */
  key: string;
}

/* ── The lab's continuous color ramp, verbatim. ── */
const RAMP: Array<{ at: number; c: [number, number, number]; c2: [number, number, number] }> = [
  { at: -100, c: [125, 211, 252], c2: [224, 242, 254] },
  { at: -60,  c: [ 96, 165, 250], c2: [147, 197, 253] },
  { at: -25,  c: [129, 140, 248], c2: [165, 180, 252] },
  { at: 0,    c: [148, 163, 184], c2: [203, 213, 225] },
  { at: 25,   c: [251, 191,  36], c2: [253, 230, 138] },
  { at: 60,   c: [249, 115,  22], c2: [253, 186, 116] },
  { at: 100,  c: [255, 247, 237], c2: [251, 191,  36] },
];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function rampAt(h: number): { c: number[]; c2: number[] } {
  let lo = RAMP[0], hi = RAMP[RAMP.length - 1];
  for (let i = 0; i < RAMP.length - 1; i++) {
    if (h >= RAMP[i].at && h <= RAMP[i + 1].at) { lo = RAMP[i]; hi = RAMP[i + 1]; break; }
  }
  const t = hi.at === lo.at ? 0 : (h - lo.at) / (hi.at - lo.at);
  const mix = (a: number[], b: number[]) => [0, 1, 2].map((i) => Math.round(lerp(a[i], b[i], t)));
  return { c: mix(lo.c, hi.c), c2: mix(lo.c2, hi.c2) };
}
const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const TAU_MS = 1100;
const MAX_PARTS = 26;

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; speed: number; r: number; cold: boolean; drift: number;
}

/** The lab's heat model, verbatim. */
export function applyHeatResult(
  state: { heat: number; streak: number },
  r: StreakHeatEvent['result'],
): void {
  if (r === 'win') {
    state.streak = state.streak > 0 ? state.streak + 1 : 1;
    state.heat += 14 + Math.min(10, (state.streak - 1) * 3);
  } else if (r === 'lose') {
    state.streak = state.streak < 0 ? state.streak - 1 : -1;
    state.heat -= 14 + Math.min(10, (-state.streak - 1) * 3);
  } else {
    state.heat += state.heat > 0 ? -4 : state.heat < 0 ? 4 : 0;
  }
  state.heat = Math.max(-100, Math.min(100, state.heat));
}

export function StreakFlameBorder({
  event,
  storageKey = 'bj-streak-heat',
}: {
  event: StreakHeatEvent | null;
  storageKey?: string;
}) {
  const rimRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ heat: 0, streak: 0, shown: 0 });
  const lastKeyRef = useRef<string | null>(null);

  /* Restore the run once — the border keeps telling yesterday's story. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw);
        if (Number.isFinite(s.heat)) stateRef.current.heat = Math.max(-100, Math.min(100, s.heat));
        if (Number.isFinite(s.streak)) stateRef.current.streak = s.streak;
        stateRef.current.shown = stateRef.current.heat; // arrive already settled
      }
    } catch { /* fresh run */ }
  }, [storageKey]);

  /* Apply each settled hand exactly once. */
  useEffect(() => {
    if (!event || event.key === lastKeyRef.current) return;
    lastKeyRef.current = event.key;
    applyHeatResult(stateRef.current, event.result);
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        heat: stateRef.current.heat,
        streak: stateRef.current.streak,
      }));
    } catch { /* storage full/blocked — cosmetic only */ }
  }, [event, storageKey]);

  /* The drift + paint loop, straight from the lab. */
  useEffect(() => {
    const rim = rimRef.current;
    const cv = canvasRef.current;
    if (!rim || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let parts: Particle[] = [];
    let raf = 0;
    let lastTs = performance.now();

    const resize = () => {
      const r = cv.getBoundingClientRect();
      cv.width = Math.round(r.width * devicePixelRatio);
      cv.height = Math.round(r.height * devicePixelRatio);
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const spawn = (w: number, h: number, k: number, hot: boolean) => {
      if (reduced || k < 3 || parts.length >= MAX_PARTS) return;
      if (Math.random() > 0.05 * (k - 2.6)) return;
      const edge = Math.random();
      let x: number, y: number;
      if (edge < 0.45) { x = 24 + Math.random() * (w - 48); y = h - 24 + Math.random() * 8; }
      else if (edge < 0.65) { x = 24 + Math.random() * (w - 48); y = 16 + Math.random() * 8; }
      else if (edge < 0.82) { x = 16 + Math.random() * 10; y = 24 + Math.random() * (h - 48); }
      else { x = w - 24 + Math.random() * 10; y = 24 + Math.random() * (h - 48); }
      parts.push({
        x, y,
        vx: (Math.random() - 0.5) * 0.25,
        vy: hot ? -(0.35 + Math.random() * 0.55) : (0.2 + Math.random() * 0.35),
        life: 0,
        speed: 0.006 + Math.random() * 0.006,
        r: 1 + Math.random() * 1.6,
        cold: !hot,
        drift: Math.random() * Math.PI * 2,
      });
    };

    const loop = (ts: number) => {
      const st = stateRef.current;
      const dt = Math.min(100, ts - lastTs);
      lastTs = ts;
      st.shown += (st.heat - st.shown) * (1 - Math.exp(-dt / TAU_MS));
      if (Math.abs(st.heat - st.shown) < 0.05) st.shown = st.heat;

      const { c, c2 } = rampAt(st.shown);
      const t = Math.min(1, Math.abs(st.shown) / 100);
      const k = t * 5;
      const hot = st.shown > 0;

      const S = rim.style;
      /* Below ~14% intensity the rim dissolves — an even table stays clean. */
      S.setProperty('--fl-alpha', String(Math.max(0, Math.min(1, (t - 0.14) / 0.1))));
      S.setProperty('--fl-a', rgba(c.map((v) => Math.round(v * 0.4)), 0.9));
      S.setProperty('--fl-b', rgba(c, 0.25 + t * 0.75));
      S.setProperty('--fl-c', rgba(c2, 0.2 + t * 0.7));
      S.setProperty('--fl-speed', `${hot ? 15 - k * 2.4 : 26 - k * 2}s`);
      S.setProperty('--fl-blur', `${1 + k * 1.2}px`);
      S.setProperty('--fl-sat', `${1 + k * 0.14}`);

      const r = cv.getBoundingClientRect();
      const w = r.width, h = r.height;
      ctx.clearRect(0, 0, w, h);
      spawn(w, h, k, hot);
      for (const p of parts) {
        p.drift += 0.025;
        p.x += p.vx + Math.sin(p.drift) * (p.cold ? 0.3 : 0.12);
        p.y += p.vy;
        p.life += p.speed;
      }
      parts = parts.filter((p) => p.life < 1);
      for (const p of parts) {
        const env = Math.min(1, p.life * 4, (1 - p.life) * 2.2);
        ctx.globalAlpha = Math.max(0, env) * 0.6;
        if (p.cold) {
          ctx.strokeStyle = rgba(c2, 1);
          ctx.lineWidth = 0.8;
          const s = p.r * 2;
          ctx.beginPath();
          for (let a = 0; a < 6; a++) {
            const th = (a / 6) * Math.PI * 2 + p.drift * 0.2;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + Math.cos(th) * s, p.y + Math.sin(th) * s);
          }
          ctx.stroke();
        } else {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.6);
          g.addColorStop(0, rgba(c2, 1));
          g.addColorStop(0.4, rgba(c, 0.85));
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <>
      <div ref={rimRef} className="bj-flame-rim" aria-hidden>
        <canvas ref={canvasRef} className="bj-flame-fx" />
      </div>
      <style jsx global>{`
        .bj-flame-rim {
          position: absolute;
          inset: 0;
          border-radius: 12px;
          pointer-events: none;
          z-index: 45;
          opacity: var(--fl-alpha, 0);
          transition: opacity 0.6s ease;
        }
        /* The rotating flame, kept to a 10px ring by mask-compositing the
           content-box out of the fill — zero effect on the felt's layout. */
        .bj-flame-rim::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 12px;
          padding: 10px;
          background: conic-gradient(from var(--fl-spin, 0deg),
            var(--fl-a, #223) 0%, var(--fl-b, #334) 18%, var(--fl-a, #223) 37%,
            var(--fl-c, #445) 52%, var(--fl-a, #223) 71%, var(--fl-b, #334) 86%, var(--fl-a, #223) 100%);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          filter: blur(var(--fl-blur, 1px)) saturate(var(--fl-sat, 1));
          animation: bjFlameSpin var(--fl-speed, 15s) linear infinite;
        }
        @property --fl-spin {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes bjFlameSpin {
          to { --fl-spin: 360deg; }
        }
        .bj-flame-fx {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .bj-flame-rim::before { animation: none; }
        }
      `}</style>
    </>
  );
}
