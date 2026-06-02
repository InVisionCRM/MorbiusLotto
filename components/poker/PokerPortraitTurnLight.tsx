'use client';

/**
 * Ambient turn-light — port of the poker-mobile-lab flare. A soft cyan glow bleeds in from
 * the screen edge nearest whoever is acting; on the hero's turn it washes the full bottom.
 * Rendered inside the table root (above the felt, below the seats) with mix-blend screen so it
 * reads like off-screen stage lighting. Portrait only.
 */

export interface PokerPortraitTurnLightProps {
  /** Acting seat anchor (fractions 0–1) — null when nobody is acting. */
  fx: number | null;
  fy: number | null;
  /** True when it's the hero's turn → full-width bottom wash. */
  isHero?: boolean;
}

export function PokerPortraitTurnLight({ fx, fy, isHero = false }: PokerPortraitTurnLightProps) {
  const active = fx != null && fy != null;
  let left = '50%';
  let top = '120%'; // parked off-screen when inactive
  if (active) {
    if (isHero) {
      left = '50%';
      top = '108%';
    } else {
      const cx = 0.5;
      const cy = 0.5;
      let dx = (fx as number) - cx;
      let dy = (fy as number) - cy;
      if (!dx && !dy) dy = 1;
      const tx = dx !== 0 ? 0.5 / Math.abs(dx) : Infinity;
      const ty = dy !== 0 ? 0.5 / Math.abs(dy) : Infinity;
      const t = Math.min(tx, ty);
      // Project to the nearest edge, push slightly beyond so only the soft falloff bleeds in.
      left = `${(cx + dx * t * 1.14) * 100}%`;
      top = `${(cy + dy * t * 1.14) * 100}%`;
    }
  }
  return (
    <div className="ptl" aria-hidden>
      <div className={`ptl-flare${active ? ' on' : ''}${isHero ? ' hero' : ''}`} style={{ left, top }} />
    </div>
  );
}
