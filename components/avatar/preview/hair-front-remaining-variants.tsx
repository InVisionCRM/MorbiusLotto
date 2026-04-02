import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { HairShadeFn } from './hair-types';

export function renderHairFrontRemainingVariants(
  hairStyle: AvatarConfig['hairStyle'],
  H: string,
  hHi: HairShadeFn,
  hLo: HairShadeFn,
) {
  const capHiF = (x: number, w: number, y = 11.28) => (
    <rect
      x={x + 1.05}
      y={y}
      width={Math.max(2, w - 2.1)}
      height={0.84}
      rx={0.34}
      fill={hHi(0.12, 0.13)}
    />
  );

  switch (hairStyle) {
    case 'Afro':
      return null;
    case 'Mullet':
      return (
        <g fill={H}>
          <rect x="9" y="11" width="30" height="5" rx={2} />
          {capHiF(9, 30)}
          <rect x="9" y="15" width="3" height="5" rx={1} />
          <rect x="36" y="15" width="3" height="5" rx={1} />
          <rect x="10" y="11.5" width="28" height="1.2" rx={0.6} fill={hHi(0.2, 0.18)} />
        </g>
      );
    case 'Pigtails': {
      const tie = '#22c55e';
      return (
        <g fill={H}>
          <path d="M 9 12.1 L 22.6 12.1 L 23.5 10.85 L 24.5 10.85 L 25.4 12.1 L 39 12.1 L 39 15.6 L 37.2 15.85 L 37.2 19.2 L 35.8 19.5 L 34.2 18.1 L 34.2 15.4 L 24.2 15.15 L 13.8 15.4 L 13.8 18.1 L 12.2 19.5 L 10.8 19.2 L 10.8 15.85 L 9 15.6 Z" />
          <rect x="10.2" y="11.35" width="12.8" height="0.95" rx={0.35} fill={hHi(0.22, 0.2)} />
          <rect x="25" y="11.35" width="12.8" height="0.95" rx={0.35} fill={hHi(0.2, 0.18)} />
          <path d="M 23.6 10.9 L 24 11.35 L 24.4 10.9" fill="none" stroke={hLo(0.35, 0.35)} strokeWidth={0.28} strokeLinecap="round" />
          <rect x="10.85" y="15.2" width="1.15" height="5.2" rx={0.45} fill={H} />
          <rect x="36" y="15.2" width="1.15" height="5.2" rx={0.45} fill={H} />
          <rect x="10.95" y="15.35" width="0.45" height="4.8" rx={0.15} fill={hLo(0.4, 0.14)} />
          <rect x="36.6" y="15.35" width="0.45" height="4.8" rx={0.15} fill={hLo(0.44, 0.15)} />
          <path d="M 10.8 19.4 C 8.2 19.8 6.4 21.6 6.2 23.8 C 6 26 7 27.8 8.8 28.6 L 10.2 27.4 C 9 26.8 8.4 25.5 8.5 24.2 C 8.7 22.5 9.8 21.2 11.6 20.8 Z" fill={H} />
          <path d="M 37.2 19.4 C 39.8 19.8 41.6 21.6 41.8 23.8 C 42 26 41 27.8 39.2 28.6 L 37.8 27.4 C 39 26.8 39.6 25.5 39.5 24.2 C 39.3 22.5 38.2 21.2 36.4 20.8 Z" fill={H} />
          <path d="M 7.2 23.5 C 7 25.5 7.6 27.2 8.8 28.5" fill="none" stroke={hHi(0.28, 0.28)} strokeWidth={0.48} strokeLinecap="round" />
          <path d="M 40.8 23.5 C 41 25.5 40.4 27.2 39.2 28.5" fill="none" stroke={hHi(0.28, 0.28)} strokeWidth={0.48} strokeLinecap="round" />
          <path d="M 10.2 21 Q 11 24.5 10.5 27.5" fill="none" stroke={hLo(0.42, 0.18)} strokeWidth={0.42} strokeLinecap="round" />
          <path d="M 37.8 21 Q 37 24.5 37.5 27.5" fill="none" stroke={hLo(0.42, 0.18)} strokeWidth={0.42} strokeLinecap="round" />
          <rect x="9.35" y="18.85" width="2.35" height="0.88" rx={0.32} fill={tie} />
          <rect x="36.3" y="18.85" width="2.35" height="0.88" rx={0.32} fill={tie} />
          <rect x="9.55" y="19.02" width="2" height="0.32" rx={0.1} fill="rgba(255,255,255,0.2)" />
          <rect x="36.5" y="19.02" width="2" height="0.32" rx={0.1} fill="rgba(255,255,255,0.2)" />
          <rect x="11.8" y="12.4" width="0.35" height="2.6" rx={0.08} fill={hLo(0.32, 0.12)} />
          <rect x="35.85" y="12.4" width="0.35" height="2.6" rx={0.08} fill={hLo(0.36, 0.13)} />
        </g>
      );
    }
    case 'Messy': {
      const hiPx = (pts: [number, number][], w = 0.74, h = 0.74, keyP = 'h') =>
        pts.map(([x, y], i) => (
          <rect key={`m${keyP}-${i}`} x={x} y={y} width={w} height={h} rx={0.07} fill={hHi(0.36, 0.42)} />
        ));
      const hiCluster = (cx: number, cy: number, k: string) => (
        <g key={k}>
          <rect x={cx} y={cy} width={1.05} height={0.62} rx={0.1} fill={hHi(0.32, 0.38)} />
          <rect x={cx + 0.35} y={cy - 0.35} width={0.72} height={0.72} rx={0.08} fill={hHi(0.4, 0.45)} />
        </g>
      );
      const curlPx = (pts: [number, number][]) =>
        pts.map(([x, y], i) => (
          <rect key={`mcl-${i}`} x={x} y={y} width={0.46} height={0.46} rx={0.05} fill={hLo(0.48, 0.2)} />
        ));
      return (
        <g>
          <path d="M 7.5 15.35 L 7.25 13.5 L 7.85 11.1 L 9.35 9.35 L 11.4 7.75 L 13.9 6.95 L 16.3 7.35 L 18.9 6.05 L 21.6 4.85 L 24.3 4.15 L 27.4 4.55 L 30.1 5.35 L 32.7 6.55 L 35.2 8.15 L 37.2 10 L 38.6 12 L 39.15 13.8 L 38.95 15.15 L 36.4 15.55 L 32.6 15.25 L 28.9 15.45 L 24.8 15.2 L 20.2 15.38 L 15.6 15.32 L 11.4 15.42 L 8.6 15.38 Z" fill={H} />
          <path d="M 9 15.25 L 8.55 17.85 L 10.85 18.35 L 11.75 16.55 L 11.15 15.2 Z" fill={H} />
          <path d="M 39 15.25 L 39.45 17.9 L 37.15 18.35 L 36.25 16.5 L 36.85 15.2 Z" fill={H} />
          <rect x="25.6" y="13.85" width="0.95" height="2.35" rx={0.11} fill={H} />
          <rect x="26.45" y="14.15" width="0.82" height="1.95" rx={0.09} fill={hLo(0.28, 0.15)} />
          <rect x="25.85" y="14.05" width={0.42} height={0.55} rx={0.07} fill={hHi(0.3, 0.36)} />
          <path d="M 9.5 14.95 L 37.2 14.95 L 36.6 15.28 L 10.1 15.28 Z" fill={hLo(0.32, 0.14)} />
          <path d="M 8.2 12.8 L 38.8 12.8 L 38.2 13.05 L 8.8 13.05 Z" fill={hLo(0.18, 0.09)} />
          {hiCluster(11.2, 7.35, 'mc-l')}
          {hiCluster(23.6, 4.05, 'mc-c')}
          {hiCluster(31.8, 5.85, 'mc-r')}
          {hiPx([[10.1, 9.8], [10.9, 8.9], [14.2, 8.4], [17.5, 7.8], [20.2, 6.6], [26.8, 6.2], [29.4, 6.9], [33.2, 8.2], [35.5, 9.6], [36.8, 11.2], [9.2, 11.5], [12.8, 6.2], [25.2, 5.1], [27.8, 5.5]])}
          {hiPx([[24.1, 4.35], [24.9, 4.2]], 0.68, 0.68, 'hc')}
          {curlPx([[13.2, 10.4], [15.8, 9.6], [18.4, 11.2], [20.8, 9.1], [22.5, 10.8], [25.1, 8.9], [27.6, 10.2], [30.2, 9.4], [28.4, 7.8], [19.2, 8.5], [16.5, 10.8], [23.3, 7.5], [26.3, 7.2], [31.5, 10.5], [34.2, 9.8], [14.8, 12.5], [21.5, 12.8], [29.8, 12.2], [11.8, 13.2], [33.5, 13.5], [24.6, 11.5]])}
          <path d="M 8.9 17.4 L 9.35 16.1 L 10.1 16.05 Z" fill={hLo(0.4, 0.16)} />
          <path d="M 39.1 17.45 L 38.65 16.1 L 37.9 16.05 Z" fill={hLo(0.42, 0.17)} />
        </g>
      );
    }
    case 'Ponytail': {
      const tie = '#22c55e';
      return (
        <g fill={H}>
          <path d="M 9 12.1 L 22.6 12.1 L 23.5 10.85 L 24.5 10.85 L 25.4 12.1 L 39 12.1 L 39 15.5 L 37.8 15.65 L 37.4 17.2 L 36.8 19.5 L 35.4 20.2 L 33.8 19.4 L 33.2 17.2 L 33.6 15.35 L 24.2 15.15 L 13.8 15.4 L 13.8 18.1 L 12.2 19.5 L 10.8 19.2 L 10.8 15.85 L 9 15.6 Z" />
          <rect x="10.2" y="11.35" width="12.8" height="0.95" rx={0.35} fill={hHi(0.22, 0.2)} />
          <rect x="25" y="11.35" width="12.8" height="0.95" rx={0.35} fill={hHi(0.2, 0.18)} />
          <path d="M 23.6 10.9 L 24 11.35 L 24.4 10.9" fill="none" stroke={hLo(0.35, 0.35)} strokeWidth={0.28} strokeLinecap="round" />
          <rect x="10.85" y="15.2" width="1.15" height="5.2" rx={0.45} fill={H} />
          <rect x="36" y="15.2" width="1.15" height="5.2" rx={0.45} fill={H} />
          <rect x="10.95" y="15.35" width="0.45" height="4.8" rx={0.15} fill={hLo(0.4, 0.14)} />
          <rect x="36.6" y="15.35" width="0.45" height="4.8" rx={0.15} fill={hLo(0.44, 0.15)} />
          <path d="M 34.5 18.8 C 37.2 18.2 40.2 20 41 22.8 C 41.8 25.5 40.8 28.2 38.6 29.5 L 37 28.2 C 38.2 27.4 38.8 25.8 38.4 24.2 C 38 22 36.2 20.5 34 20.2 L 32.8 19.2 Z" fill={H} />
          <path d="M 40.2 24 C 40.4 26.2 39.6 28 38 29" fill="none" stroke={hHi(0.28, 0.28)} strokeWidth={0.48} strokeLinecap="round" />
          <path d="M 35.5 20.5 Q 36.8 24 36.2 27.5" fill="none" stroke={hLo(0.42, 0.18)} strokeWidth={0.42} strokeLinecap="round" />
          <rect x="9" y="15" width="4.8" height="7" rx={1.45} fill={H} />
          <rect x="9.55" y="16.1" width="0.55" height="5.6" rx={0.12} fill={hLo(0.38, 0.12)} />
          <rect x="35.4" y="18.75" width="2.45" height="0.88" rx={0.32} fill={tie} transform="rotate(-14 36.6 19.2)" />
          <rect x="35.6" y="18.92" width="2.05" height="0.32" rx={0.1} fill="rgba(255,255,255,0.2)" transform="rotate(-14 36.6 19.2)" />
          <rect x="11.8" y="12.4" width="0.35" height="2.6" rx={0.08} fill={hLo(0.32, 0.12)} />
          <rect x="35.85" y="12.4" width="0.35" height="2.6" rx={0.08} fill={hLo(0.36, 0.13)} />
        </g>
      );
    }
    case 'Long Straight':
      return (
        <g>
          <path d="M 9 16 L 9 14 C 9 11 11.5 9 15 8 C 18 7 21 6.8 24 6.8 C 27 6.8 30 7 33 8 C 36.5 9 39 11 39 14 L 39 16 Z" fill={H} />
          <path d="M 9 14 L 8 15 C 7.5 16.5 7 18.5 7 20.5 C 7 22 7.5 23 8.5 23.5 C 9.5 24 10.5 23.5 11.5 22.5 L 12 16 Z" fill={H} />
          <path d="M 39 14 L 40 15 C 40.5 16.5 41 18.5 41 20.5 C 41 22 40.5 23 39.5 23.5 C 38.5 24 37.5 23.5 36.5 22.5 L 36 16 Z" fill={H} />
          <path d="M 13 9 C 17 7.8 21 7.3 24 7.3 C 27 7.3 31 7.8 35 9" fill="none" stroke={hHi(0.24, 0.18)} strokeWidth={1.4} strokeLinecap="round" />
          <path d="M 15 10 C 19 8.8 22 8.5 24 8.5 C 26 8.5 29 8.8 33 10" fill="none" stroke={hHi(0.18, 0.14)} strokeWidth={0.8} strokeLinecap="round" />
          <path d="M 24 7 L 24 15.5" fill="none" stroke={hLo(0.28, 0.14)} strokeWidth={0.4} strokeLinecap="round" />
          <path d="M 24 8 C 20 9.5 16 12 13 15" fill="none" stroke={hLo(0.18, 0.07)} strokeWidth={0.35} strokeLinecap="round" />
          <path d="M 24 8 C 28 9.5 32 12 35 15" fill="none" stroke={hLo(0.18, 0.07)} strokeWidth={0.35} strokeLinecap="round" />
          <path d="M 24 8 C 19 10 15 13 12 16" fill="none" stroke={hLo(0.14, 0.05)} strokeWidth={0.28} strokeLinecap="round" />
          <path d="M 24 8 C 29 10 33 13 36 16" fill="none" stroke={hLo(0.14, 0.05)} strokeWidth={0.28} strokeLinecap="round" />
          <path d="M 9 16 C 8.5 18 8 20 8.5 22" fill="none" stroke={hLo(0.35, 0.12)} strokeWidth={0.55} strokeLinecap="round" />
          <path d="M 39 16 C 39.5 18 40 20 39.5 22" fill="none" stroke={hLo(0.38, 0.13)} strokeWidth={0.55} strokeLinecap="round" />
        </g>
      );
    case 'Bob':
      return (
        <g>
          <path d="M 7 16 L 7 14 C 7 11 9.5 9 14 8 C 17 7.2 20.5 7 24 7 C 27.5 7 31 7.2 34 8 C 38.5 9 41 11 41 14 L 41 16 Z" fill={H} />
          <path d="M 7 14 C 6.5 17 6.5 20 7 23 C 7.5 26 8 28.5 9 30 C 10 31.5 11.5 32 13 31.5 C 13.5 30.5 13 28 12.5 25 C 12.5 22 12 18 12 16 Z" fill={H} />
          <path d="M 41 14 C 41.5 17 41.5 20 41 23 C 40.5 26 40 28.5 39 30 C 38 31.5 36.5 32 35 31.5 C 34.5 30.5 35 28 35.5 25 C 35.5 22 36 18 36 16 Z" fill={H} />
          <path d="M 12.5 15.5 C 14 12.5 17 11 21 10.5 C 24 10.2 27 10.5 29 12 C 30 13 29.5 14.5 28.5 15.5 Z" fill={H} />
          <path d="M 12 9 C 16 7.8 20 7.5 24 7.5 C 28 7.5 32 7.8 36 9" fill="none" stroke={hHi(0.25, 0.18)} strokeWidth={1.3} strokeLinecap="round" />
          <path d="M 14 10 C 18 9 22 8.5 24 8.5 C 26 8.5 30 9 34 10" fill="none" stroke={hHi(0.18, 0.13)} strokeWidth={0.7} strokeLinecap="round" />
          <path d="M 21 8.5 C 19 10 17 12 15 15" fill="none" stroke={hLo(0.2, 0.09)} strokeWidth={0.35} strokeLinecap="round" />
          <path d="M 27 8.5 C 29 10 31 12 33 15" fill="none" stroke={hLo(0.18, 0.08)} strokeWidth={0.35} strokeLinecap="round" />
          <path d="M 9 17 C 8.5 20 8.5 24 9 28" fill="none" stroke={hLo(0.32, 0.11)} strokeWidth={0.55} strokeLinecap="round" />
          <path d="M 39 17 C 39.5 20 39.5 24 39 28" fill="none" stroke={hLo(0.35, 0.12)} strokeWidth={0.55} strokeLinecap="round" />
          <path d="M 7.5 18 C 7.3 22 7.5 25 8 29" fill="none" stroke={hHi(0.16, 0.1)} strokeWidth={0.6} strokeLinecap="round" />
          <path d="M 40.5 18 C 40.7 22 40.5 25 40 29" fill="none" stroke={hHi(0.13, 0.08)} strokeWidth={0.5} strokeLinecap="round" />
          <path d="M 9.5 30 C 10.5 31 11.5 31.5 12.5 31" fill="none" stroke={hLo(0.25, 0.1)} strokeWidth={0.4} strokeLinecap="round" />
          <path d="M 38.5 30 C 37.5 31 36.5 31.5 35.5 31" fill="none" stroke={hLo(0.25, 0.1)} strokeWidth={0.4} strokeLinecap="round" />
        </g>
      );
    case 'Long Wavy':
      return (
        <g fill={H}>
          <rect x="9" y="11" width="30" height="5" rx={2} />
          {capHiF(9, 30)}
          <rect x="9" y="15" width="5" height="7" rx={1.5} />
          <rect x="34" y="15" width="5" height="7" rx={1.5} />
          <rect x="10.5" y="11.05" width="27" height="2.35" rx={0.95} fill={hHi(0.1, 0.16)} />
          <rect x="12" y="11.2" width="5.2" height="1.05" rx={0.4} fill={hHi(0.28, 0.2)} />
          <rect x="19" y="11.08" width="7" height="1.15" rx={0.45} fill={hHi(0.32, 0.22)} />
          <rect x="27.5" y="11.15" width="6" height="1.05" rx={0.42} fill={hHi(0.26, 0.19)} />
          <rect x="34.5" y="11.22" width="4.8" height="0.98" rx={0.38} fill={hHi(0.24, 0.17)} />
          {[11.2, 14.5, 18, 21.5, 26, 29.5, 33, 36.5].map((sx) => (
            <rect key={sx} x={sx} y="12" width="0.32" height="3.2" rx={0.08} fill={hLo(0.3, 0.18)} />
          ))}
          <rect x="9.5" y="16" width="1.2" height="5" fill={hLo(0.38, 0.12)} />
          <rect x="37.3" y="16" width="1.2" height="5" fill={hLo(0.42, 0.13)} />
        </g>
      );
    case 'Bald':
    default:
      return null;
  }
}
