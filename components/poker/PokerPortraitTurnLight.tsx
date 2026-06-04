'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Ambient turn-light — port of the poker-mobile-lab flare. A soft cyan glow bleeds in from
 * the screen edge nearest whoever is acting; on the hero's turn it washes the full bottom.
 * Rendered inside the table root (above the felt, below the seats) with mix-blend screen so it
 * reads like off-screen stage lighting. Portrait only.
 *
 * On a turn change the flare SLIDES ALONG THE SCREEN PERIMETER (edges + corners) from the old
 * spot to the new one — it never cuts diagonally across the table. We drive left/top with a short
 * rAF tween (transient, ~0.6s per turn change; no continuous repaint) instead of a CSS left/top
 * transition, which would interpolate in a straight line right through the middle of the felt.
 */

export interface PokerPortraitTurnLightProps {
  /** Acting seat anchor (fractions 0–1) — null when nobody is acting. */
  fx: number | null;
  fy: number | null;
  /** True when it's the hero's turn → full-width bottom wash. */
  isHero?: boolean;
}

// Perimeter rectangle in container-fraction space: ~7% beyond each edge so only the soft falloff
// bleeds in (matches the old projected-edge positions). The single parameter s ∈ [0,1) runs
// clockwise from the top-left corner: top edge → right edge → bottom edge → left edge.
const LO = -0.07;
const HI = 1.07;
const SPAN = HI - LO; // 1.14
const HERO_S = 0.625; // bottom-centre — where the full-width hero wash lives
const SLIDE_MS = 600;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Perimeter parameter [0,1) for the edge point nearest an acting seat anchor. */
function edgeParam(fx: number, fy: number): number {
  const dx = fx - 0.5;
  const dy = fy - 0.5;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx >= ady) {
    // Left/right edge is nearest — position along it comes from the vertical projection.
    const ly = adx === 0 ? 0.5 : clamp(0.5 + dy * (0.5 / adx) * 1.14, LO, HI);
    return dx >= 0
      ? 0.25 + ((ly - LO) / SPAN) * 0.25 // right edge (top → bottom)
      : 0.75 + ((HI - ly) / SPAN) * 0.25; // left edge (bottom → top)
  }
  const lx = ady === 0 ? 0.5 : clamp(0.5 + dx * (0.5 / ady) * 1.14, LO, HI);
  return dy < 0
    ? ((lx - LO) / SPAN) * 0.25 // top edge (left → right)
    : 0.5 + ((HI - lx) / SPAN) * 0.25; // bottom edge (right → left)
}

/** Map a perimeter parameter back to a left/top % point on the rectangle edge. */
function perimeterPoint(s: number): { left: string; top: string } {
  const w = ((s % 1) + 1) % 1;
  const seg = Math.floor(w * 4);
  const f = w * 4 - seg;
  let x: number;
  let y: number;
  if (seg === 0) { x = LO + f * SPAN; y = LO; } // top
  else if (seg === 1) { x = HI; y = LO + f * SPAN; } // right
  else if (seg === 2) { x = HI - f * SPAN; y = HI; } // bottom
  else { x = LO; y = HI - f * SPAN; } // left
  return { left: `${x * 100}%`, top: `${y * 100}%` };
}

const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

export function PokerPortraitTurnLight({ fx, fy, isHero = false }: PokerPortraitTurnLightProps) {
  const active = fx != null && fy != null;
  const targetS = active ? (isHero ? HERO_S : edgeParam(fx as number, fy as number)) : null;

  const flareRef = useRef<HTMLDivElement>(null);
  const sRef = useRef<number>(HERO_S);
  const rafRef = useRef<number | null>(null);
  const wasActiveRef = useRef(false);

  // Place the flare before first paint so there's never a (0,0) flash if mounted mid-turn.
  useLayoutEffect(() => {
    const el = flareRef.current;
    if (el && targetS != null) {
      sRef.current = targetS;
      const p = perimeterPoint(targetS);
      el.style.left = p.left;
      el.style.top = p.top;
      wasActiveRef.current = true;
    }
    // Initial positioning only — subsequent moves are handled by the tween effect below.
  }, []);

  useEffect(() => {
    const el = flareRef.current;
    if (!el) return;
    if (targetS == null) {
      // Turn ended → fade out in place (opacity via the `on` class); re-arm for the next turn.
      wasActiveRef.current = false;
      return;
    }
    const apply = (s: number) => {
      const p = perimeterPoint(s);
      el.style.left = p.left;
      el.style.top = p.top;
    };
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Coming back from inactive (we're invisible mid-fade) or reduced-motion → snap, never fly across.
    if (!wasActiveRef.current || reduce) {
      sRef.current = targetS;
      apply(targetS);
      wasActiveRef.current = true;
      return;
    }
    // Active → active: tween ALONG THE PERIMETER the short way round (never across the middle).
    const from = sRef.current;
    let delta = (((targetS - from) % 1) + 1) % 1; // [0,1)
    if (delta > 0.5) delta -= 1; // shortest signed direction around the loop
    if (Math.abs(delta) < 1e-4) { sRef.current = targetS; apply(targetS); return; }
    const to = from + delta;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / SLIDE_MS);
      const s = from + (to - from) * easeInOutCubic(p);
      sRef.current = ((s % 1) + 1) % 1;
      apply(sRef.current);
      rafRef.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [targetS]);

  return (
    <div className="ptl" aria-hidden>
      <div ref={flareRef} className={`ptl-flare${active ? ' on' : ''}${isHero ? ' hero' : ''}`} />
    </div>
  );
}
