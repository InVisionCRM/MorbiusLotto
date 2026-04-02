import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { HairShadeFn, HairSideShadeRenderer } from './hair-types';

export function renderHairBackLongVariants(
  hairStyle: AvatarConfig['hairStyle'],
  hairFill: string,
  hHi: HairShadeFn,
  hLo: HairShadeFn,
  hairSideShade: HairSideShadeRenderer,
) {
  if (hairStyle === 'Long Straight') {
    return (
      <g>
        {/* Main flowing silhouette — neck gap at center bottom */}
        <path
          d="M 24 11.5 C 29 11.5 34 12 37.5 13.5 C 40 14.5 41.5 16.5 42 19.5 C 42.5 23 42.5 27 42 32 C 41.5 36.5 40.5 40 38.5 42.5 C 36.5 44 34 45 31 45 C 30 45 29.5 42 29 39 C 28.5 37 27 36 24 36 C 21 36 19.5 37 19 39 C 18.5 42 18 45 17 45 C 14 45 11.5 44 9.5 42.5 C 7.5 40 6.5 36.5 6 32 C 5.5 27 5.5 23 6 19.5 C 6.5 16.5 8 14.5 10.5 13.5 C 14 12 19 11.5 24 11.5 Z"
          fill={hairFill}
        />
        {/* Center-back depth shadow */}
        <path
          d="M 18 16 C 16 19 15 24 15 30 C 15 34 16 36 18 36 L 24 36 L 30 36 C 32 36 33 34 33 30 C 33 24 32 19 30 16 Z"
          fill={hLo(0.12, 0.06)}
        />
        {/* Broad left-side highlight */}
        <path d="M 8.5 16 C 7.5 22 7 29 7.5 36 C 8 40 9 42 10.5 43.5" fill="none" stroke={hHi(0.2, 0.14)} strokeWidth={1} strokeLinecap="round" />
        {/* Broad right-side highlight */}
        <path d="M 40 17 C 40.5 23 41 29 40.5 36 C 40 40 39 42 37.5 43.5" fill="none" stroke={hHi(0.15, 0.1)} strokeWidth={0.8} strokeLinecap="round" />
        {/* Left flowing strands */}
        <path d="M 10 15 C 9 21 8.5 28 9 36 C 9.3 40 10 42.5 11.5 44" fill="none" stroke={hLo(0.2, 0.08)} strokeWidth={0.4} strokeLinecap="round" />
        <path d="M 12.5 15 C 11.5 21 11 29 11.5 37 C 11.8 41 12.5 43 14 44.5" fill="none" stroke={hLo(0.18, 0.07)} strokeWidth={0.35} strokeLinecap="round" />
        <path d="M 15 15 C 14 22 13.5 30 14 38 C 14.3 41 15 43 16.5 44.5" fill="none" stroke={hLo(0.14, 0.06)} strokeWidth={0.3} strokeLinecap="round" />
        {/* Right flowing strands */}
        <path d="M 38 15 C 39 21 39.5 28 39 36 C 38.7 40 38 42.5 36.5 44" fill="none" stroke={hLo(0.2, 0.08)} strokeWidth={0.4} strokeLinecap="round" />
        <path d="M 35.5 15 C 36.5 21 37 29 36.5 37 C 36.2 41 35.5 43 34 44.5" fill="none" stroke={hLo(0.18, 0.07)} strokeWidth={0.35} strokeLinecap="round" />
        <path d="M 33 15 C 34 22 34.5 30 34 38 C 33.7 41 33 43 31.5 44.5" fill="none" stroke={hLo(0.14, 0.06)} strokeWidth={0.3} strokeLinecap="round" />
        {/* Secondary inner highlight accents */}
        <path d="M 9.5 20 C 9 26 9 32 9.5 38" fill="none" stroke={hHi(0.14, 0.1)} strokeWidth={0.6} strokeLinecap="round" />
        <path d="M 39 21 C 39.5 27 39.5 32 39 38" fill="none" stroke={hHi(0.12, 0.08)} strokeWidth={0.5} strokeLinecap="round" />
      </g>
    );
  }

  if (hairStyle === 'Long Wavy') {
    const d = (xs: [number, number, number, number][], r = 1.2) =>
      xs.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx={r} fill={hairFill} />);
    return (
      <g fill={hairFill}>
        {/* Main mass — neck gap at center bottom */}
        <path
          d="M 9 15 C 8 15 7 15.5 7 17 L 7 32 C 7 36 8 39 10 41 C 11.5 42.5 14 43 17 43 C 18 43 18.5 40 19 38 C 19.5 36.5 21 36 24 36 C 27 36 28.5 36.5 29 38 C 29.5 40 30 43 31 43 C 34 43 36.5 42.5 38 41 C 40 39 41 36 41 32 L 41 17 C 41 15.5 40 15 39 15 Z"
        />
        {d([[5, 19, 3, 5], [5, 26, 3, 5], [5, 33, 3, 5], [40, 19, 3, 5], [40, 26, 3, 5], [40, 33, 3, 5]])}
        {d([[6, 22, 2.4, 3.5], [6, 29.5, 2.4, 3.5], [39.6, 22, 2.4, 3.5], [39.6, 29.5, 2.4, 3.5]], 0.85)}
        {/* Bottom waves — sides only, avoiding neck center */}
        {d([[9, 36, 5, 3], [33, 36, 5, 3]], 0.9)}
        <rect x="9" y="20" width="6" height="4" rx={1.5} fill={hHi(0.2, 0.16)} />
        <rect x="33" y="24" width="6" height="4" rx={1.5} fill={hHi(0.16, 0.13)} />
        {/* Depth under lower waves */}
        <rect x="10" y="31.6" width="7" height="0.55" rx={0.12} fill={hLo(0.35, 0.14)} />
        <rect x="31" y="31.6" width="7" height="0.55" rx={0.12} fill={hLo(0.35, 0.14)} />
        {hairSideShade(7, 15, 34, 21)}
      </g>
    );
  }

  return null;
}
