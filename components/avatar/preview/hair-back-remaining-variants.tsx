import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { HairShadeFn, HairSideShadeRenderer } from './hair-types';

export function renderHairBackRemainingVariants(
  hairStyle: AvatarConfig['hairStyle'],
  hairFill: string,
  hHi: HairShadeFn,
  hLo: HairShadeFn,
  hairSideShade: HairSideShadeRenderer,
) {
  const H = hairFill;
  switch (hairStyle) {
    case 'Afro': {
      /*
       * Single mass only (no hair-front layer): face + ears paint on top of the center; outline is the dome itself.
       * Curved bottom: stepped arc (center y higher on screen than corners) — not a flat horizontal cut.
       * Texture: mirrored 2x1 / 1x2 clusters only — no stroke ring.
       */
      const afroD =
        'M 4 28 L 4 25 3 25 3 20 2 20 2 18 3 18 3 16 4 13 5 10 6 8 8 6 10 5 11 4 11 3 12 3 13 4 14 3 16 3 18 3 20 3 22 3 24 3 L 26 3 28 3 30 3 32 3 34 3 36 4 37 3 37 4 38 5 40 6 42 8 43 10 44 13 45 16 46 16 46 18 46 20 45 20 L 44 23 44 26 43 27 41 28 38 27 35 26 32 25 28 24 24 24 20 24 16 25 13 26 10 27 7 28 L 4 28 Z';
      const afroHi = hHi(0.32, 0.24);
      const afroLo = hLo(0.36, 0.16);
      const afroHiL: [number, number, number, number][] = [
        [14, 6, 2, 1], [10, 7, 2, 1], [13, 10, 2, 1], [18, 12, 1, 2], [20, 9, 2, 1], [22, 6, 2, 1],
      ];
      const afroLoL: [number, number, number, number][] = [
        [16, 21, 2, 1], [13, 25, 2, 1],
      ];
      const mirrorPair = (cells: [number, number, number, number][], fill: string, prefix: string) =>
        cells.flatMap(([x, y, w, h], i) => {
          const mx = 48 - x - w;
          const els = [<rect key={`${prefix}-l-${i}`} x={x} y={y} width={w} height={h} fill={fill} />];
          if (mx !== x) els.push(<rect key={`${prefix}-r-${i}`} x={mx} y={y} width={w} height={h} fill={fill} />);
          return els;
        });
      return (
        <g>
          <path d={afroD} fill={H} />
          {mirrorPair(afroHiL, afroHi, 'af')}
          {mirrorPair(afroLoL, afroLo, 'aflo')}
        </g>
      );
    }
    case 'Mullet':
      return (
        <g>
          <rect x="7" y="22" width="34" height="16" rx={2} fill={H} />
          <rect x="10" y="24" width="10" height="3" rx={1} fill={hHi(0.18, 0.16)} />
          <rect x="14" y="28" width="20" height="8" rx={1.5} fill={hLo(0.2, 0.09)} />
          {[9, 12, 15, 18, 38, 35, 32].map((sx) => (
            <rect key={sx} x={sx} y="25" width="0.36" height="10" rx={0.1} fill={hLo(0.32, 0.16)} />
          ))}
          {hairSideShade(7, 22, 34, 16)}
        </g>
      );
    case 'Pigtails': {
      const tie = '#22c55e';
      return (
        <g>
          {/* Chunky tail: steps outward, then down & slightly in — ends ~chin; outer edge reads lighter */}
          <path
            d="M 11.4 18.8 L 9.2 18.4 C 5.8 18.6 3.2 21.2 2.2 25.5 C 1.2 30 1.4 34.2 3 37.2 C 4.2 39.5 6.5 40.8 8.8 40.6 L 10.2 39.2 C 8.6 38 7.6 35.8 7.8 33.2 C 8.2 29.5 9.8 26 12.4 23.5 C 13.8 22.2 12.8 20 11.4 18.8 Z"
            fill={H}
          />
          <path
            d="M 36.6 18.8 L 38.8 18.4 C 42.2 18.6 44.8 21.2 45.8 25.5 C 46.8 30 46.6 34.2 45 37.2 C 43.8 39.5 41.5 40.8 39.2 40.6 L 37.8 39.2 C 39.4 38 40.4 35.8 40.2 33.2 C 39.8 29.5 38.2 26 35.6 23.5 C 34.2 22.2 35.2 20 36.6 18.8 Z"
            fill={H}
          />
          <path
            d="M 2.8 24.5 C 2.2 28.5 2.6 32.5 4.2 35.8"
            fill="none"
            stroke={hHi(0.3, 0.32)}
            strokeWidth={0.65}
            strokeLinecap="round"
          />
          <path
            d="M 45.2 24.5 C 45.8 28.5 45.4 32.5 43.8 35.8"
            fill="none"
            stroke={hHi(0.3, 0.32)}
            strokeWidth={0.65}
            strokeLinecap="round"
          />
          <path
            d="M 10.5 20 Q 11.8 26 10.8 32"
            fill="none"
            stroke={hLo(0.45, 0.2)}
            strokeWidth={0.5}
            strokeLinecap="round"
          />
          <path
            d="M 37.5 20 Q 36.2 26 37.2 32"
            fill="none"
            stroke={hLo(0.45, 0.2)}
            strokeWidth={0.5}
            strokeLinecap="round"
          />
          <rect x="9.8" y="18.1" width="2.4" height="0.95" rx={0.35} fill={tie} />
          <rect x="35.8" y="18.1" width="2.4" height="0.95" rx={0.35} fill={tie} />
          <rect x="10.05" y="18.25" width="2.1" height="0.35" rx={0.12} fill="rgba(255,255,255,0.22)" />
          <rect x="36.05" y="18.25" width="2.1" height="0.35" rx={0.12} fill="rgba(255,255,255,0.22)" />
        </g>
      );
    }
    default:
      return null;
  }
}
