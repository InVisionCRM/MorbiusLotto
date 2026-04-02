import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import { hairTwinLocks } from './helpers';
import type { HairShadeFn } from './hair-types';

export function renderHairFrontDreadlocksVariants(
  hairStyle: AvatarConfig['hairStyle'],
  H: string,
  hHi: HairShadeFn,
  hLo: HairShadeFn,
) {
  const lockShF = hLo(0.42, 0.12);
  const dTwinF = (locks: [number, number, number, number][], rxScale = 0.9) =>
    hairTwinLocks(H, locks, rxScale, lockShF);
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
    case 'Dreadlocks': {
      const fHi = hHi(0.24, 0.18);
      const fLo = hLo(0.48, 0.18);
      const fDeep = hLo(0.6, 0.12);
      const fLoc = (d: string, w: number, k: string) => (
        <g key={k}>
          <path d={d} fill="none" stroke={H} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke={fLo} strokeWidth={w * 0.82} strokeLinecap="butt" strokeDasharray={`${w * 0.3} ${w * 0.52}`} />
          <path d={d} fill="none" stroke={fDeep} strokeWidth={w * 0.4} strokeLinecap="butt" strokeDasharray={`${w * 0.18} ${w * 0.72}`} strokeDashoffset={w * 0.35} />
          <path d={d} fill="none" stroke={fHi} strokeWidth={w * 0.14} strokeLinecap="round" strokeDasharray={`${w * 0.38} ${w * 0.92}`} strokeDashoffset={w * 0.22} />
        </g>
      );
      return (
        <g>
          <path d="M 6 15 L 6 12 C 6 9 9 7 14 6.2 C 18 5.6 21 5.5 24 5.5 C 27 5.5 30 5.6 34 6.2 C 39 7 42 9 42 12 L 42 15 Z" fill={H} />
          <path d="M 10 7.5 C 15 6.2 20 5.8 24 5.8 C 28 5.8 33 6.2 38 7.5" fill="none" stroke={fHi} strokeWidth={1.2} strokeLinecap="round" opacity={0.85} />
          {fLoc('M 18 7 C 17.5 6 17 5.2 17.5 4.8 C 17.8 4.6 18 5 18 5.5', 2.2, 'dt0')}
          {fLoc('M 21 6.5 C 20.5 5.5 20.8 4.8 21.5 4.5 C 21.8 4.5 21.8 5 21.5 5.5', 2, 'dt1')}
          {fLoc('M 24 6 C 24.2 5 24 4.5 23.5 4.2 C 23.3 4.2 23.3 4.6 23.5 5', 2, 'dt2')}
          {fLoc('M 27 6.5 C 27.5 5.5 27.2 4.8 26.5 4.5 C 26.2 4.5 26.2 5 26.5 5.5', 2, 'dt3')}
          {fLoc('M 30 7 C 30.5 6 31 5.2 30.5 4.8 C 30.2 4.6 30 5 30 5.5', 2.2, 'dt4')}
          {fLoc('M 15 7.5 C 14 6.5 13.8 5.8 14.2 5.3 C 14.5 5.2 14.8 5.5 14.8 6', 2, 'dt5')}
          {fLoc('M 33 7.5 C 34 6.5 34.2 5.8 33.8 5.3 C 33.5 5.2 33.2 5.5 33.2 6', 2, 'dt6')}
          {fLoc('M 7 14 C 5 17 3.5 20.5 4 23.5 C 4.5 25 5.5 25 5.5 24', 3.2, 'df0')}
          {fLoc('M 9 13 C 7 16 6 19.5 7 22.5 C 7.5 23.5 8.5 23 8 22', 2.9, 'df1')}
          {fLoc('M 11 12.5 C 9.5 15.5 9 18 10 21 C 10.5 22 11 21.5 11 20.5', 2.7, 'df2')}
          {fLoc('M 13.5 12 C 12 14.5 11.5 17 12.5 19.5 C 13 20 13.5 19.5 13.5 19', 2.5, 'df3')}
          {fLoc('M 16 11.5 C 15 13.5 14.5 16 15.5 18.5', 2.3, 'df4')}
          {fLoc('M 18.5 11 C 17.5 13 17 15 17.5 17.5', 2.1, 'df5')}
          {fLoc('M 21 10 C 20 12.5 19.5 14.5 20 16.5', 2, 'df6')}
          {fLoc('M 24 9.5 C 24 12 24.5 14 24 16', 2, 'df7')}
          {fLoc('M 27 10 C 28 12.5 28.5 14.5 28 16.5', 2, 'df8')}
          {fLoc('M 29.5 11 C 30.5 13 31 15 30.5 17.5', 2.1, 'df9')}
          {fLoc('M 32 11.5 C 33 13.5 33.5 16 32.5 18.5', 2.3, 'dfa')}
          {fLoc('M 34.5 12 C 36 14.5 36.5 17 35.5 19.5 C 35 20 34.5 19.5 34.5 19', 2.5, 'dfb')}
          {fLoc('M 37 12.5 C 38.5 15.5 39 18 38 21 C 37.5 22 37 21.5 37 20.5', 2.7, 'dfc')}
          {fLoc('M 39 13 C 41 16 42 19.5 41 22.5 C 40.5 23.5 39.5 23 40 22', 2.9, 'dfd')}
          {fLoc('M 41 14 C 43 17 44.5 20.5 44 23.5 C 43.5 25 42.5 25 42.5 24', 3.2, 'dfe')}
          <path d="M 6.5 14 C 5.5 17 5 19.5 5.5 22" fill="none" stroke={H} strokeWidth={3.5} strokeLinecap="round" />
          <path d="M 41.5 14 C 42.5 17 43 19.5 42.5 22" fill="none" stroke={H} strokeWidth={3.5} strokeLinecap="round" />
        </g>
      );
    }
    case 'Dreadlocks V1': return <g fill={H}><rect x="9" y="11" width="30" height="5" rx={1.8} />{capHiF(9, 30)}{dTwinF([[12, 16, 3.5, 6], [18, 16, 3.5, 8], [24, 16, 3.5, 8], [30, 16, 3.5, 6]])}</g>;
    case 'Dreadlocks V2': return <g fill={H}><rect x="9" y="11" width="30" height="5" rx={1.8} />{capHiF(9, 30)}{dTwinF([[12, 16, 3.5, 6], [18, 16, 3.5, 8], [24, 16, 3.5, 8], [30, 16, 3.5, 6]])}<rect x="18" y="20" width="4" height="2" rx={0.6} fill="#f59e0b" /></g>;
    case 'Dreadlocks V3': return <g fill={H}><rect x="7" y="11" width="34" height="5" rx={2} />{capHiF(7, 34)}{dTwinF([[8, 16, 3.5, 6], [14, 16, 3.5, 8], [20, 16, 3.5, 7], [26, 16, 3.5, 7], [32, 16, 3.5, 8], [36, 16, 3.5, 6]])}</g>;
    case 'Dreadlocks V4': return <g fill={H}><rect x="7" y="11" width="34" height="5" rx={2} />{capHiF(7, 34)}{dTwinF([[8, 16, 3.5, 6], [14, 16, 3.5, 8], [20, 16, 3.5, 7], [26, 16, 3.5, 7], [32, 16, 3.5, 8], [36, 16, 3.5, 6]])}<rect x="32" y="20" width="4" height="2" rx={0.6} fill="#22c55e" /></g>;
    case 'Dreadlocks V5': return <g fill={H}><rect x="9" y="11" width="30" height="5" rx={1.8} />{capHiF(9, 30)}{dTwinF([[10, 16, 3.5, 6], [16, 16, 3.5, 8], [22, 16, 3.5, 8], [28, 16, 3.5, 8], [34, 16, 3.5, 6]])}</g>;
    case 'Dreadlocks V6': return <g fill={H}><rect x="9" y="11" width="30" height="5" rx={1.8} />{capHiF(9, 30)}{dTwinF([[12, 16, 3.5, 8], [18, 16, 3.5, 10], [24, 16, 3.5, 10], [30, 16, 3.5, 8]])}</g>;
    case 'Dreadlocks V7': return <g fill={H}><rect x="9" y="11" width="30" height="5" rx={1.8} />{capHiF(9, 30)}{dTwinF([[12, 16, 3.5, 8], [18, 16, 3.5, 10], [24, 16, 3.5, 10], [30, 16, 3.5, 8]])}<rect x="24" y="22" width="4" height="2" rx={0.6} fill="#f59e0b" /></g>;
    case 'Dreadlocks V8': return <g fill={H}><rect x="7" y="11" width="34" height="5" rx={2} />{capHiF(7, 34)}{dTwinF([[8, 16, 3.5, 8], [14, 16, 3.5, 8], [20, 16, 3.5, 10], [26, 16, 3.5, 10], [32, 16, 3.5, 8], [36, 16, 3.5, 8]])}</g>;
    case 'Dreadlocks V9': return <g fill={H}><rect x="7" y="11" width="34" height="5" rx={2} />{capHiF(7, 34)}{dTwinF([[6, 16, 3.5, 8], [12, 16, 3.5, 8], [18, 16, 3.5, 10], [24, 16, 3.5, 10], [30, 16, 3.5, 8], [36, 16, 3.5, 8], [38, 16, 3.5, 8]])}</g>;
    case 'Dreadlocks V10': return <g fill={H}><rect x="7" y="11" width="34" height="5" rx={2} />{capHiF(7, 34)}{dTwinF([[8, 16, 3.5, 8], [14, 16, 3.5, 10], [20, 16, 3.5, 10], [26, 16, 3.5, 10], [32, 16, 3.5, 10], [36, 16, 3.5, 8]])}<rect x="14" y="22" width="4" height="2" rx={0.6} fill="#ef4444" /></g>;
    case 'Locks V1': return <g fill={H}><rect x="9" y="11" width="30" height="5" rx={2} />{capHiF(9, 30)}{dTwinF([[13, 16, 3, 6], [19, 16, 3, 7], [25, 16, 3, 7], [31, 16, 3, 6]], 0.82)}</g>;
    case 'Locks V2': return <g fill={H}><rect x="7" y="11" width="34" height="5" rx={2} />{capHiF(7, 34)}{dTwinF([[8, 16, 3, 6], [14, 16, 3, 8], [20, 16, 3, 7], [26, 16, 3, 7], [32, 16, 3, 8], [37, 16, 3, 6]], 0.82)}</g>;
    case 'Locks V3': return <g fill={H}><rect x="9" y="11" width="30" height="5" rx={2} />{capHiF(9, 30)}{dTwinF([[12, 16, 3, 8], [18, 16, 3, 10], [24, 16, 3, 10], [30, 16, 3, 8]], 0.82)}</g>;
    case 'Locks V4': return <g fill={H}><rect x="7" y="11" width="34" height="5" rx={2} />{capHiF(7, 34)}{dTwinF([[8, 16, 3, 8], [14, 16, 3, 10], [20, 16, 3, 8], [26, 16, 3, 8], [32, 16, 3, 10], [37, 16, 3, 8]], 0.82)}</g>;
    case 'Locks V5': return <g fill={H}><rect x="9" y="11" width="30" height="5" rx={2} />{capHiF(9, 30)}{dTwinF([[10, 16, 3, 6], [16, 16, 3, 8], [22, 16, 3, 10], [28, 16, 3, 8], [34, 16, 3, 6]], 0.82)}</g>;
    case 'Locks V6': return <g fill={H}><rect x="9" y="11" width="30" height="5" rx={2} />{capHiF(9, 30)}{dTwinF([[12, 16, 3, 8], [18, 16, 3, 10], [24, 16, 3, 10], [30, 16, 3, 8]], 0.82)}</g>;
    case 'Locks V7': return <g fill={H}><rect x="7" y="11" width="34" height="5" rx={2} />{capHiF(7, 34)}{dTwinF([[8, 16, 3, 8], [14, 16, 3, 10], [20, 16, 3, 10], [26, 16, 3, 10], [32, 16, 3, 10], [37, 16, 3, 8]], 0.82)}</g>;
    case 'Locks V8': return <g fill={H}><rect x="9" y="11" width="30" height="5" rx={2} />{capHiF(9, 30)}{dTwinF([[8, 16, 3, 8], [14, 16, 3, 10], [20, 16, 3, 10], [26, 16, 3, 10], [32, 16, 3, 8]], 0.82)}</g>;
    case 'Locks V9': return <g fill={H}><rect x="7" y="11" width="34" height="5" rx={2} />{capHiF(7, 34)}{dTwinF([[6, 16, 3, 8], [12, 16, 3, 10], [18, 16, 3, 10], [24, 16, 3, 10], [30, 16, 3, 10], [36, 16, 3, 8], [38, 16, 3, 8]], 0.82)}</g>;
    case 'Locks V10': return <g fill={H}><rect x="7" y="11" width="34" height="5" rx={2} />{capHiF(7, 34)}{dTwinF([[8, 16, 3, 8], [14, 16, 3, 10], [20, 16, 3, 12], [26, 16, 3, 12], [32, 16, 3, 10], [37, 16, 3, 8]], 0.82)}</g>;
    default:
      return null;
  }
}
