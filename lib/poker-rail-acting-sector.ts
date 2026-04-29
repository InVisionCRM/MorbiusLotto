import { POKER_TABLE_MAX_SEATS, SEAT_ANCHOR_RING, type SeatAnchor } from '@/lib/poker-seat-layout';

/** ViewBox matches the poker table shell: `left:3%` `width:94%` `top:5%` `height:88%` — root (fx,fy) → (100*fx-3, 100*fy-5). */
export const POKER_RAIL_VIEWBOX = { w: 94, h: 88 } as const;

/**
 * Map full-table fractional coords (PokerTable root) to the rail shell SVG local space.
 * Same transform used for `SEAT_ANCHOR_RING` when the SVG covers the 3% / 5% / 94% / 88% box.
 */
export function rootFxFyToRailLocal(f: SeatAnchor): { x: number; y: number } {
  return { x: 100 * f.fx - 3, y: 100 * f.fy - 5 };
}

function normPi(x: number): number {
  let n = x % (2 * Math.PI);
  if (n < -Math.PI) n += 2 * Math.PI;
  if (n > Math.PI) n -= 2 * Math.PI;
  return n;
}

/** B unit-vector bisector between two vertex directions (stable across ±π). */
function meanAngle2(a: number, b: number): number {
  return Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b));
}

/** Intersection of ray from (cx,cy) at `angle` with axis-aligned ellipse (t > 0). */
export function rayToEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle: number
): { x: number; y: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 / Math.sqrt((c * c) / (rx * rx) + (s * s) / (ry * ry));
  return { x: cx + t * c, y: cy + t * s };
}

/**
 * One annulus sector (ring slice) for SVG path, between two radials a → b in math angle (atan2, y down).
 * Uses the short arc on both ellipses when |b−a| < π.
 */
export function ellipticalAnnulusSectorPathD(
  cx: number,
  cy: number,
  rxO: number,
  ryO: number,
  rxI: number,
  ryI: number,
  a: number,
  b: number
): string {
  const d = normPi(b - a);
  const sweep = d > 0 ? 1 : 0;
  const large = Math.abs(d) > Math.PI ? 1 : 0;

  const p0o = rayToEllipse(cx, cy, rxO, ryO, a);
  const p1o = rayToEllipse(cx, cy, rxO, ryO, b);
  const p0i = rayToEllipse(cx, cy, rxI, ryI, a);
  const p1i = rayToEllipse(cx, cy, rxI, ryI, b);

  const f = (n: number) => Math.round(n * 1000) / 1000;
  return [
    `M ${f(p0o.x)} ${f(p0o.y)}`,
    `A ${f(rxO)} ${f(ryO)} 0 ${large} ${sweep} ${f(p1o.x)} ${f(p1o.y)}`,
    `L ${f(p1i.x)} ${f(p1i.y)}`,
    `A ${f(rxI)} ${f(ryI)} 0 ${large} ${1 - sweep} ${f(p0i.x)} ${f(p0i.y)}`,
    'Z',
  ].join(' ');
}

export interface RailSectorRadii {
  rxOuter: number;
  ryOuter: number;
  rxInner: number;
  ryInner: number;
}

// Fallback radii used only when callers don't pass tableDims. These are a
// rough guess; the live `PokerTable` always passes dims so it computes the
// correct cushion band per render.
const DEFAULT_RADII: RailSectorRadii = {
  rxOuter: 45.2,
  ryOuter: 42.4,
  rxInner: 32.0,
  ryInner: 30.0,
};

/**
 * `ringIndex` is 0..POKER_TABLE_MAX_SEATS-1 (canonical 10-vertex index), matching `ringIndexForDisplaySlot`.
 */
export function getActingRingSectorPathD(
  ringIndex: number,
  radii: RailSectorRadii = DEFAULT_RADII
): string {
  if (ringIndex < 0 || ringIndex >= POKER_TABLE_MAX_SEATS) return '';

  const c = { x: POKER_RAIL_VIEWBOX.w / 2, y: POKER_RAIL_VIEWBOX.h / 2 };
  const { rxOuter, ryOuter, rxInner, ryInner } = radii;

  const thetas: number[] = SEAT_ANCHOR_RING.map((p) => {
    const v = rootFxFyToRailLocal(p);
    return Math.atan2(v.y - c.y, v.x - c.x);
  });

  const left = thetas[(ringIndex - 1 + POKER_TABLE_MAX_SEATS) % POKER_TABLE_MAX_SEATS]!;
  const mid = thetas[ringIndex]!;
  const right = thetas[(ringIndex + 1) % POKER_TABLE_MAX_SEATS]!;

  const a = meanAngle2(left, mid);
  const b = meanAngle2(mid, right);

  return ellipticalAnnulusSectorPathD(c.x, c.y, rxOuter, ryOuter, rxInner, ryInner, a, b);
}

export { DEFAULT_RADII as POKER_RAIL_ACTING_SECTOR_RADII_DEFAULT };
