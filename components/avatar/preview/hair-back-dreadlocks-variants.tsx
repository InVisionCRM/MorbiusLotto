import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import type {
  HairCapHighlightRenderer,
  HairShadeFn,
  HairTwinLocksRenderer,
} from './hair-types';

export function renderHairBackDreadlocksVariants(
  hairStyle: AvatarConfig['hairStyle'],
  hairFill: string,
  hHi: HairShadeFn,
  hLo: HairShadeFn,
  capHi: HairCapHighlightRenderer,
  dTwin: HairTwinLocksRenderer,
) {
  const H = hairFill;
  switch (hairStyle) {
      case 'Dreadlocks': {
        const dHi = hHi(0.26, 0.2);
        const dLo = hLo(0.48, 0.18);
        const dDeep = hLo(0.6, 0.12);
        /* Dreadloc with twist-band texture via dashed strokes + extra depth shadow */
        const loc = (d: string, w: number, k: string) => (
          <g key={k}>
            <path d={d} fill="none" stroke={H} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} fill="none" stroke={dLo} strokeWidth={w * 0.82} strokeLinecap="butt" strokeDasharray={`${w * 0.3} ${w * 0.52}`} />
            <path d={d} fill="none" stroke={dDeep} strokeWidth={w * 0.4} strokeLinecap="butt" strokeDasharray={`${w * 0.18} ${w * 0.72}`} strokeDashoffset={w * 0.35} />
            <path d={d} fill="none" stroke={dHi} strokeWidth={w * 0.14} strokeLinecap="round" strokeDasharray={`${w * 0.38} ${w * 0.92}`} strokeDashoffset={w * 0.22} />
          </g>
        );
        return (
          <g>
            {/* Scalp mass */}
            <path
              d="M 24 11.5 C 16 11.5 8 14.5 7 21 C 6.5 25 7 30 8 34 L 9.5 35 C 9 30 9.5 24 11 19 L 24 16.5 L 37 19 C 38.5 24 39 30 38.5 35 L 41 34 C 42 30 42.5 25 42 21 C 41 14.5 33 11.5 24 11.5 Z"
              fill={H}
            />
            {/* Left locs — S-curves with curling tips, varied lengths */}
            {loc('M 6 16 C 3 20 0.5 27 1 34 C 1.5 39 3 44 5 47 C 6.5 48 7 46.5 6 45', 3.5, 'lb0')}
            {loc('M 7.5 15 C 5 20 3 26 3.5 33 C 4 38 5.5 42 7.5 44 C 8.5 44.5 9 43.5 8 42', 3.2, 'lb1')}
            {loc('M 9.5 14.5 C 7.5 19 6 25 7 32 C 7.5 36 9 40 11 42 C 12 42.5 12 41 11 40', 3, 'lb2')}
            {loc('M 11.5 14 C 10 18 9 23 10 30 C 10.5 34 12 38 14 40 C 15 40.5 15 39 14 38', 2.8, 'lb3')}
            {loc('M 14 14 C 13 18 12 22 13 28 C 13.5 31 14.5 33 15.5 34', 2.5, 'lb4')}
            {loc('M 16 14.5 C 15.5 18 15 22 16 27 C 16.5 30 17.5 33 18.5 35', 2.3, 'lb5')}
            {/* Right locs — mirrored, rb1 runs longer for asymmetry */}
            {loc('M 42 16 C 45 20 47.5 27 47 34 C 46.5 39 45 43 43 45 C 41.5 46 41 44.5 42 43', 3.5, 'rb0')}
            {loc('M 40.5 15 C 43 20 45 26 44.5 34 C 44 39 42.5 44 40.5 46 C 39.5 47 39 45.5 40 44', 3.2, 'rb1')}
            {loc('M 38.5 14.5 C 40.5 19 42 25 41 32 C 40.5 36 39 40 37 42 C 36 42.5 36 41 37 40', 3, 'rb2')}
            {loc('M 36.5 14 C 38 18 39 23 38 30 C 37.5 34 36 38 34 40 C 33 40.5 33 39 34 38', 2.8, 'rb3')}
            {loc('M 34 14 C 35 18 36 22 35 28 C 34.5 32 33 35 31.5 37 C 31 37.5 31 36.5 31.5 36', 2.5, 'rb4')}
            {loc('M 32 14.5 C 32.5 18 33 22 32 27 C 31.5 30 30.5 33 29.5 35', 2.3, 'rb5')}
            {/* Center-back locs — shorter, neck gap */}
            {loc('M 19 15 C 18 19 17 24 18 29 C 18.5 32 19 34 19.5 35', 2.2, 'cb0')}
            {loc('M 22 15.5 C 21.5 19 21 23 21.5 27 C 22 29 22.5 30.5 23 31', 2, 'cb1')}
            {loc('M 26 15.5 C 26.5 19 27 23 26.5 27 C 26 29 25.5 30.5 25 31', 2, 'cb2')}
            {loc('M 29 15 C 30 19 31 24 30 29 C 29.5 32 29 34 28.5 35', 2.2, 'cb3')}
            {/* Crown highlight */}
            <path d="M 10 13 C 15 11.5 20 11 24 11 C 28 11 33 11.5 38 13" fill="none" stroke={dHi} strokeWidth={1.2} strokeLinecap="round" opacity={0.8} />
          </g>
        );
      }
      case 'Dreadlocks V1': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={1.8} />
          {capHi(9, 30)}
          {dTwin([[11, 18, 4, 20], [17, 18, 4, 22], [23, 18, 4, 22], [29, 18, 4, 20]])}
        </g>
      );
      case 'Dreadlocks V2': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={1.8} />
          {capHi(9, 30)}
          {dTwin([[11, 18, 4, 18], [17, 18, 4, 20], [23, 18, 4, 20], [29, 18, 4, 18]])}
          <rect x="18" y="26" width="4" height="3" rx={0.8} fill="#f59e0b" />
          <rect x="24" y="30" width="4" height="3" rx={0.8} fill="#22c55e" />
        </g>
      );
      case 'Dreadlocks V3': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 4, 20], [11, 18, 4, 22], [17, 18, 4, 20], [23, 18, 4, 20], [29, 18, 4, 22], [35, 18, 4, 20]])}
        </g>
      );
      case 'Dreadlocks V4': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 4, 18], [11, 18, 4, 20], [17, 18, 4, 20], [23, 18, 4, 20], [29, 18, 4, 20], [35, 18, 4, 18]])}
          <rect x="12" y="26" width="4" height="3" rx={0.8} fill="#ef4444" />
          <rect x="30" y="28" width="4" height="3" rx={0.8} fill="#f59e0b" />
        </g>
      );
      case 'Dreadlocks V5': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={1.8} />
          {capHi(9, 30)}
          {dTwin([[11, 18, 4, 18], [17, 18, 4, 20], [23, 18, 4, 20], [29, 18, 4, 18]])}
          {dTwin([[9.2, 19, 2.6, 14], [36.2, 19, 2.6, 14]], 0.75)}
        </g>
      );
      case 'Dreadlocks V6': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={1.8} />
          {capHi(9, 30)}
          {dTwin([[11, 18, 4, 24], [17, 18, 4, 26], [23, 18, 4, 26], [29, 18, 4, 24]])}
        </g>
      );
      case 'Dreadlocks V7': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={1.8} />
          {capHi(9, 30)}
          {dTwin([[11, 18, 4, 24], [17, 18, 4, 26], [23, 18, 4, 26], [29, 18, 4, 24]])}
          <rect x="18" y="34" width="4" height="3" rx={0.8} fill="#f59e0b" />
          <rect x="24" y="36" width="4" height="3" rx={0.8} fill="#22c55e" />
        </g>
      );
      case 'Dreadlocks V8': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 4, 24], [11, 18, 4, 22], [17, 18, 4, 24], [23, 18, 4, 24], [29, 18, 4, 22], [35, 18, 4, 24]])}
        </g>
      );
      case 'Dreadlocks V9': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[3, 18, 4, 24], [9, 18, 4, 22], [15, 18, 4, 24], [21, 18, 4, 24], [27, 18, 4, 22], [33, 18, 4, 22], [39, 18, 4, 24]])}
        </g>
      );
      case 'Dreadlocks V10': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 4, 22], [11, 18, 4, 24], [17, 18, 4, 26], [23, 18, 4, 26], [29, 18, 4, 24], [35, 18, 4, 22]])}
          <rect x="18" y="32" width="4" height="3" rx={0.8} fill="#ef4444" />
          <rect x="24" y="34" width="4" height="3" rx={0.8} fill="#f59e0b" />
        </g>
      );
      case 'Locks V1': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={2} />
          {capHi(9, 30)}
          {dTwin([[12, 18, 3.5, 18], [18, 18, 3.5, 20], [24, 18, 3.5, 20], [30, 18, 3.5, 18]], 0.92)}
        </g>
      );
      case 'Locks V2': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[8, 18, 3.5, 20], [14, 18, 3.5, 22], [20, 18, 3.5, 20], [26, 18, 3.5, 20], [32, 18, 3.5, 22], [36.5, 18, 3.5, 20]], 0.92)}
        </g>
      );
      case 'Locks V3': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={2} />
          {capHi(9, 30)}
          {dTwin([[12, 18, 3.5, 22], [18, 18, 3.5, 24], [24, 18, 3.5, 24], [30, 18, 3.5, 22]], 0.92)}
        </g>
      );
      case 'Locks V4': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 3.5, 22], [11, 18, 3.5, 24], [17, 18, 3.5, 22], [23, 18, 3.5, 22], [29, 18, 3.5, 24], [35, 18, 3.5, 22]], 0.92)}
        </g>
      );
      case 'Locks V5': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={2} />
          {capHi(9, 30)}
          {dTwin([[10, 18, 3.5, 20], [16, 18, 3.5, 22], [22, 18, 3.5, 24], [28, 18, 3.5, 22], [34, 18, 3.5, 20]], 0.92)}
        </g>
      );
      case 'Locks V6': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={2} />
          {capHi(9, 30)}
          {dTwin([[12, 18, 3.5, 24], [18, 18, 3.5, 26], [24, 18, 3.5, 26], [30, 18, 3.5, 24]], 0.92)}
        </g>
      );
      case 'Locks V7': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 3.5, 24], [11, 18, 3.5, 26], [17, 18, 3.5, 24], [23, 18, 3.5, 24], [29, 18, 3.5, 26], [35, 18, 3.5, 24]], 0.92)}
        </g>
      );
      case 'Locks V8': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={2} />
          {capHi(9, 30)}
          {dTwin([[8, 18, 3.5, 22], [14, 18, 3.5, 24], [20, 18, 3.5, 26], [26, 18, 3.5, 24], [32, 18, 3.5, 22]], 0.92)}
        </g>
      );
      case 'Locks V9': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[3, 18, 3.5, 24], [9, 18, 3.5, 24], [15, 18, 3.5, 26], [21, 18, 3.5, 24], [27, 18, 3.5, 24], [33, 18, 3.5, 24], [39, 18, 3.5, 24]], 0.92)}
        </g>
      );
      case 'Locks V10': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 3.5, 24], [11, 18, 3.5, 26], [17, 18, 3.5, 28], [23, 18, 3.5, 28], [29, 18, 3.5, 26], [35, 18, 3.5, 24]], 0.92)}
        </g>
      );
      default:
        return null;
    }
}
