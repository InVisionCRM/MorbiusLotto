'use client';

/**
 * StreakFlameBorder — the solo-blackjack win-streak chain, on the felt.
 *
 * V2 (owner feedback 2026-08-19): HOT ONLY. The cold/ice side is gone — a
 * player on a losing run sees a clean table, not a blue lecture. The rim now
 * tracks the SERVER's consecutive-win counter (the same one that pays the
 * chain bonus ladder: 2 wins → 5%, 3 → 7%, 4 → 15%, 5 → 25%, 6 → 37%,
 * 7+ → 50% of the bet), so what glows is exactly what pays.
 *
 * Rendering keeps the lab's continuous engine: the shown temperature eases
 * toward the target with a 1.1s exponential glide, colors are sampled
 * per-frame from one continuous 0..100 ramp (neutral slate → ember amber →
 * open-flame orange → white-hot), and a loss doesn't snap — the flame
 * gutters out over a couple of seconds. A handful of embers (cap 26) rise
 * from the frame at high streaks. First win = a faint warm hint; the rim
 * only really lives once the chain is paying.
 *
 * Drawn as a zero-layout overlay: a mask-composited 10px ring over the
 * table's outer edge, invisible near zero heat.
 */

import { useEffect, useRef } from 'react';

/** streak → target heat 0..100. 1 win whispers; 7+ is white-hot. */
export function heatForStreak(streak: number): number {
  if (streak <= 0) return 0;
  return Math.min(100, streak * 15);
}

/** Chain ladder — mirror of the server's STREAK_BONUS_LADDER. */
export const STREAK_CHAIN_LADDER: ReadonlyArray<{ wins: number; pct: number }> = [
  { wins: 2, pct: 5 },
  { wins: 3, pct: 7 },
  { wins: 4, pct: 15 },
  { wins: 5, pct: 25 },
  { wins: 6, pct: 37 },
  { wins: 7, pct: 50 },
];

export function chainPctForStreak(
  streak: number,
  ladder: ReadonlyArray<{ wins: number; pct: number }> = STREAK_CHAIN_LADDER,
): number {
  if (streak < ladder[0]?.wins) return 0;
  const capped = Math.min(streak, ladder[ladder.length - 1].wins);
  return ladder.find((r) => r.wins === capped)?.pct ?? 0;
}

/* ── Hot half of the lab's ramp (the cold stops are retired with V2). ── */
const RAMP: Array<{ at: number; c: [number, number, number]; c2: [number, number, number] }> = [
  { at: 0,   c: [148, 163, 184], c2: [203, 213, 225] },
  { at: 25,  c: [251, 191,  36], c2: [253, 230, 138] },
  { at: 60,  c: [249, 115,  22], c2: [253, 186, 116] },
  { at: 100, c: [255, 247, 237], c2: [251, 191,  36] },
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
  life: number; speed: number; r: number; drift: number;
}

export function StreakFlameBorder({ streak }: { streak: number }) {
  const rimRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetRef = useRef(heatForStreak(streak));
  const shownRef = useRef(heatForStreak(streak)); // first paint arrives settled
  targetRef.current = heatForStreak(streak);

  /* The drift + paint loop, straight from the lab (hot branch only). */
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

    const spawn = (w: number, h: number, k: number) => {
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
        vy: -(0.35 + Math.random() * 0.55),
        life: 0,
        speed: 0.006 + Math.random() * 0.006,
        r: 1 + Math.random() * 1.6,
        drift: Math.random() * Math.PI * 2,
      });
    };

    const loop = (ts: number) => {
      const dt = Math.min(100, ts - lastTs);
      lastTs = ts;
      let shown = shownRef.current;
      const target = targetRef.current;
      shown += (target - shown) * (1 - Math.exp(-dt / TAU_MS));
      if (Math.abs(target - shown) < 0.05) shown = target;
      shownRef.current = shown;

      const { c, c2 } = rampAt(shown);
      const t = Math.min(1, shown / 100);
      const k = t * 5;

      const S = rim.style;
      /* Below ~14% intensity the rim dissolves — no streak, clean table. */
      S.setProperty('--fl-alpha', String(Math.max(0, Math.min(1, (t - 0.14) / 0.1))));
      S.setProperty('--fl-a', rgba(c.map((v) => Math.round(v * 0.4)), 0.9));
      S.setProperty('--fl-b', rgba(c, 0.25 + t * 0.75));
      S.setProperty('--fl-c', rgba(c2, 0.2 + t * 0.7));
      S.setProperty('--fl-speed', `${15 - k * 2.4}s`);
      S.setProperty('--fl-blur', `${1 + k * 1.2}px`);
      S.setProperty('--fl-sat', `${1 + k * 0.14}`);

      const r = cv.getBoundingClientRect();
      const w = r.width, h = r.height;
      ctx.clearRect(0, 0, w, h);
      spawn(w, h, k);
      for (const p of parts) {
        p.drift += 0.025;
        p.x += p.vx + Math.sin(p.drift) * 0.12;
        p.y += p.vy;
        p.life += p.speed;
      }
      parts = parts.filter((p) => p.life < 1);
      for (const p of parts) {
        const env = Math.min(1, p.life * 4, (1 - p.life) * 2.2);
        ctx.globalAlpha = Math.max(0, env) * 0.6;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.6);
        g.addColorStop(0, rgba(c2, 1));
        g.addColorStop(0.4, rgba(c, 0.85));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.6, 0, Math.PI * 2);
        ctx.fill();
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

/**
 * StreakChainMeter — the pill that names the chain. Hidden until the first
 * win; from the second win it shows the active bonus and what the next win
 * pays; when a bonus lands it flashes the amount for a few seconds.
 */
export function StreakChainMeter({
  streak,
  ladder = STREAK_CHAIN_LADDER,
  bonusFx,
}: {
  streak: number;
  ladder?: ReadonlyArray<{ wins: number; pct: number }>;
  /** Set when a chain bonus just paid — flashes then yields to the meter line. */
  bonusFx?: { pct: number; amountMorbius: number; key: string } | null;
}) {
  const activePct = chainPctForStreak(streak, ladder);
  const nextPct = chainPctForStreak(streak + 1, ladder);
  if (streak < 1) return null;

  const heat = heatForStreak(streak);
  const { c } = rampAt(heat);
  const showBonus = !!bonusFx && bonusFx.amountMorbius > 0;

  return (
    <div className="bj-chain-meter" style={{ ['--chain-c' as string]: rgba(c, 1) }}>
      <span className="bj-chain-flame" aria-hidden>🔥</span>
      <span className="bj-chain-text">
        {showBonus ? (
          <span key={bonusFx!.key} className="bj-chain-bonus">
            CHAIN +{bonusFx!.pct}% · +{bonusFx!.amountMorbius.toLocaleString()} MORBIUS
          </span>
        ) : (
          <>
            <b>×{streak} STREAK</b>
            {activePct > 0 && <span className="bj-chain-sub"> · chain +{activePct}%</span>}
            {nextPct > 0 && <span className="bj-chain-sub"> · next win +{nextPct}%</span>}
          </>
        )}
      </span>
      <style jsx global>{`
        .bj-chain-meter {
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 40;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 999px;
          background: linear-gradient(145deg, rgba(12, 14, 18, 0.88), rgba(28, 24, 16, 0.82));
          border: 1px solid color-mix(in srgb, var(--chain-c, #f59e0b) 45%, transparent);
          box-shadow:
            0 2px 10px rgba(0, 0, 0, 0.55),
            0 0 14px color-mix(in srgb, var(--chain-c, #f59e0b) 30%, transparent);
          pointer-events: none;
          animation: bjChainIn 0.45s cubic-bezier(0.2, 1.4, 0.4, 1);
        }
        @keyframes bjChainIn {
          from { transform: translateX(-50%) translateY(-8px) scale(0.85); opacity: 0; }
          to   { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
        }
        .bj-chain-flame { font-size: 13px; line-height: 1; filter: drop-shadow(0 0 4px rgba(249, 115, 22, 0.6)); }
        .bj-chain-text {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #fde68a;
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
          white-space: nowrap;
        }
        .bj-chain-sub { color: #d6d3d1; font-weight: 600; }
        .bj-chain-bonus {
          color: #fbbf24;
          animation: bjChainBonusPulse 0.9s ease-in-out infinite alternate;
        }
        @keyframes bjChainBonusPulse {
          from { text-shadow: 0 0 6px rgba(251, 191, 36, 0.4); }
          to   { text-shadow: 0 0 14px rgba(251, 191, 36, 0.9); }
        }
      `}</style>
    </div>
  );
}
