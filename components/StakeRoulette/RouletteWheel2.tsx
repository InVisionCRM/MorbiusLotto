'use client';

/**
 * RouletteWheel2 — canvas European wheel for /roulette2 (Deep-Sea Neon).
 *
 * Renders the 37-pocket ring in the true European order with a cyan rim
 * glow, idles with a slow drift, and on spin runs a ~4.4s deterministic
 * animation: the wheel eases out over four turns while the ball orbits
 * counter-rotating, decays inward with a two-bounce drop, and ALWAYS settles
 * in the server's result pocket. After landing the ball rides the wheel.
 */

import { useEffect, useRef } from 'react';
import {
  ROULETTE2_WHEEL_ORDER,
  pocketColor,
} from '@/lib/roulette2-client';

const POCKETS = ROULETTE2_WHEEL_ORDER.length; // 37
const SEG = (Math.PI * 2) / POCKETS;
export const WHEEL_SPIN_MS = 4400;

const COLOR_BG = '#0B1A26';
const COLOR_RIM = '#133A4A';
const COLOR_ACCENT = '#22D3EE';
const COLOR_RED = '#B91C1C';
const COLOR_BLACK = '#18181B';
const COLOR_GREEN = '#15803D';
// Lighter green used for the green-pocket label in the hub (distinct from the
// cyan chrome accent — green stays the game's own pocket colour).
const COLOR_GREEN_TEXT = '#4ADE80';

interface SpinPlan {
  startMs: number;
  w0: number;
  wTotal: number;
  b0: number;
  bTotal: number;
  pocketLocal: number;
  landed: boolean;
}

interface RouletteWheel2Props {
  /** Pocket to land on; the animation starts whenever `spinSeq` increments. */
  result: number | null;
  spinSeq: number;
  /** Shown in the hub between spins. */
  lastResult: number | null;
  onLanded?: () => void;
  className?: string;
}

const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export default function RouletteWheel2({
  result,
  spinSeq,
  lastResult,
  onLanded,
  className,
}: RouletteWheel2Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const wheelAngleRef = useRef(Math.random() * Math.PI * 2);
  const ballAngleRef = useRef(0);
  const planRef = useRef<SpinPlan | null>(null);
  const lastResultRef = useRef<number | null>(lastResult);
  const onLandedRef = useRef(onLanded);

  useEffect(() => {
    lastResultRef.current = lastResult;
    onLandedRef.current = onLanded;
  }, [lastResult, onLanded]);

  // Arm a new spin plan whenever spinSeq increments with a result.
  useEffect(() => {
    if (spinSeq === 0 || result == null) return;
    const idx = ROULETTE2_WHEEL_ORDER.indexOf(result);
    if (idx < 0) return;
    const pocketLocal = idx * SEG;
    const w0 = wheelAngleRef.current;
    const wTotal = Math.PI * 2 * 4; // four full turns
    const wF = w0 + wTotal;
    const bF = wF + pocketLocal; // ball must end on the pocket (global angle)
    const b0 = ballAngleRef.current;
    const BASE = Math.PI * 2 * 6; // six counter-turns
    const delta = (((b0 - BASE - bF) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    planRef.current = {
      startMs: performance.now(),
      w0,
      wTotal,
      b0,
      bTotal: BASE + delta,
      pocketLocal,
      landed: false,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinSeq]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let raf = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.min(container.clientWidth, container.clientHeight || container.clientWidth);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    };
    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = canvas.width / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const rOuter = size * 0.485;
      const rPocketOuter = size * 0.44;
      const rPocketInner = size * 0.30;
      const rHub = size * 0.255;
      const rBallTrack = size * 0.40;
      const rBallRest = size * 0.345;

      const now = performance.now();
      const plan = planRef.current;

      let ballVisible = false;
      let ballR = rBallTrack;
      let ballGlobal = 0;
      let speedNorm = 0;

      if (plan) {
        const t = Math.min(1, (now - plan.startMs) / WHEEL_SPIN_MS);
        wheelAngleRef.current = plan.w0 + plan.wTotal * easeOutQuart(t);
        ballGlobal = plan.b0 - plan.bTotal * easeOutCubic(t);
        ballAngleRef.current = ballGlobal;
        ballVisible = true;
        speedNorm = 1 - t;

        // Radius: orbit high, then drop with two damped bounces, then rest.
        if (t < 0.62) {
          ballR = rBallTrack;
        } else if (t < 1) {
          const dropT = (t - 0.62) / 0.38;
          const bounce = Math.abs(Math.sin(dropT * Math.PI * 2.5)) * (1 - dropT) * 0.35;
          ballR = rBallTrack - (rBallTrack - rBallRest) * easeOutCubic(dropT) + bounce * (rBallTrack - rBallRest) * 0.4;
        } else {
          ballR = rBallRest;
        }

        if (t >= 1) {
          if (!plan.landed) {
            plan.landed = true;
            onLandedRef.current?.();
          }
          // Locked into the pocket — ride the wheel.
          ballGlobal = wheelAngleRef.current + plan.pocketLocal;
          ballR = rBallRest;
          speedNorm = 0;
        }
      } else {
        // Idle drift.
        wheelAngleRef.current += 0.0035;
      }

      const wheelAngle = wheelAngleRef.current;

      // ── Rim ──
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_BG;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLOR_ACCENT;
      ctx.shadowBlur = 18;
      ctx.shadowColor = 'rgba(34,211,238,0.55)';
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(cx, cy, rPocketOuter + 2, 0, Math.PI * 2);
      ctx.strokeStyle = COLOR_RIM;
      ctx.lineWidth = 3;
      ctx.stroke();

      // ── Pockets ──
      for (let i = 0; i < POCKETS; i++) {
        const n = ROULETTE2_WHEEL_ORDER[i];
        const a0 = wheelAngle + i * SEG - SEG / 2;
        const a1 = a0 + SEG;
        const color = pocketColor(n);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a0) * rPocketInner, cy + Math.sin(a0) * rPocketInner);
        ctx.arc(cx, cy, rPocketOuter, a0, a1);
        ctx.lineTo(cx + Math.cos(a1) * rPocketInner, cy + Math.sin(a1) * rPocketInner);
        ctx.arc(cx, cy, rPocketInner, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle =
          color === 'green' ? COLOR_GREEN : color === 'red' ? COLOR_RED : COLOR_BLACK;
        ctx.fill();
        ctx.strokeStyle = COLOR_RIM;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Number label, rotated to face outward.
        const mid = a0 + SEG / 2;
        const rText = (rPocketOuter + rPocketInner) / 2;
        ctx.save();
        ctx.translate(cx + Math.cos(mid) * rText, cy + Math.sin(mid) * rText);
        ctx.rotate(mid + Math.PI / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = `600 ${Math.max(9, size * 0.034)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), 0, 0);
        ctx.restore();
      }

      // ── Hub ──
      ctx.beginPath();
      ctx.arc(cx, cy, rHub, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_BG;
      ctx.fill();
      ctx.strokeStyle = COLOR_RIM;
      ctx.lineWidth = 2;
      ctx.stroke();

      const hubN = lastResultRef.current;
      if (hubN != null) {
        const hc = pocketColor(hubN);
        ctx.fillStyle = hc === 'green' ? COLOR_GREEN_TEXT : hc === 'red' ? '#F87171' : '#E2E8F0';
        ctx.font = `700 ${size * 0.13}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(hubN), cx, cy - size * 0.015);
        ctx.fillStyle = '#64748b';
        ctx.font = `600 ${size * 0.032}px ui-monospace, monospace`;
        ctx.fillText(
          hc === 'green' ? 'ZERO' : hc.toUpperCase(),
          cx,
          cy + size * 0.075,
        );
      } else {
        ctx.fillStyle = '#64748b';
        ctx.font = `600 ${size * 0.045}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SPIN', cx, cy);
      }

      // ── Ball ──
      if (ballVisible) {
        const bx = cx + Math.cos(ballGlobal) * ballR;
        const by = cy + Math.sin(ballGlobal) * ballR;

        // Motion trail while fast.
        if (speedNorm > 0.25) {
          for (let k = 1; k <= 3; k++) {
            const trailA = ballGlobal + k * 0.07 * speedNorm * 4;
            ctx.beginPath();
            ctx.arc(
              cx + Math.cos(trailA) * ballR,
              cy + Math.sin(trailA) * ballR,
              size * 0.012 * (1 - k * 0.22),
              0,
              Math.PI * 2,
            );
            ctx.fillStyle = `rgba(248,250,252,${0.25 * speedNorm * (1 - k * 0.28)})`;
            ctx.fill();
          }
        }

        ctx.beginPath();
        ctx.arc(bx, by, size * 0.016, 0, Math.PI * 2);
        ctx.fillStyle = '#F8FAFC';
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={containerRef} className={className ?? 'relative aspect-square w-full'}>
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
