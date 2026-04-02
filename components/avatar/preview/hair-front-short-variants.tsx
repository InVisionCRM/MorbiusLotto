import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { HairShadeFn } from './hair-types';

export function renderHairFrontShortVariants(
  hairStyle: AvatarConfig['hairStyle'],
  H: string,
  S: string,
  hHi: HairShadeFn,
  hLo: HairShadeFn,
) {
  const puff = (cx: number, cy: number, w: number, h: number) => (
    <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={Math.min(w, h) / 2} fill={H} />
  );

  switch (hairStyle) {
    case 'Short': {
      const shHi = hHi(0.3, 0.2);
      const shLo = hLo(0.38, 0.1);
      const sh1: [number, number, number, number][] = [
        [11, 13, 2, 1], [15, 12, 2, 1], [19, 11, 2, 1], [23, 13, 2, 1], [27, 12, 2, 1], [31, 11, 2, 1],
      ];
      const sh1px: [number, number][] = [
        [10, 16], [13, 17], [16, 16], [34, 16], [37, 17],
      ];
      const mirW = (cells: [number, number, number, number][], fill: string, p: string) =>
        cells.flatMap(([x, y, w, h], i) => {
          const mx = 48 - x - w;
          const o = [<rect key={`${p}a${i}`} x={x} y={y} width={w} height={h} fill={fill} />];
          if (mx !== x) o.push(<rect key={`${p}b${i}`} x={mx} y={y} width={w} height={h} fill={fill} />);
          return o;
        });
      const mirP = (pts: [number, number][], fill: string, p: string) =>
        pts.flatMap(([x, y], i) => {
          const mx = 47 - x;
          const o = [<rect key={`${p}a${i}`} x={x} y={y} width={1} height={1} fill={fill} />];
          if (mx !== x) o.push(<rect key={`${p}b${i}`} x={mx} y={y} width={1} height={1} fill={fill} />);
          return o;
        });
      return (
        <g fill={H}>
          <rect x="9.5" y="11.85" width="29" height="5.05" rx={2.05} />
          <rect x="10.75" y="13.95" width="1.2" height="3.55" rx={0.55} />
          <rect x="11.03" y="16.95" width="0.92" height="4.45" rx={0.48} />
          <rect x="36.05" y="13.95" width="1.2" height="3.55" rx={0.55} />
          <rect x="36.05" y="16.95" width="0.92" height="4.45" rx={0.48} />
          {[[14.2, 13.55, 3.8, 2.9], [19.5, 13.05, 4.6, 3.2], [24, 13, 4.8, 3.25], [28.5, 13.05, 4.6, 3.2], [33.8, 13.55, 3.8, 2.9]].map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} rx={1.05} />
          ))}
          {[[16, 13.15, 1.6, 2], [21.5, 12.8, 1.7, 2.1], [24.15, 12.7, 1.8, 2.15], [26.8, 12.8, 1.7, 2.1], [31.4, 13.15, 1.6, 2]].map(([x, y, w, h], i) => (
            <rect key={`s-${i}`} x={x} y={y} width={w} height={h} rx={0.5} fill={hLo(0.32, 0.12)} />
          ))}
          <rect x="10.75" y="14.2" width="0.55" height="6.85" rx={0.28} fill={hLo(0.4, 0.13)} />
          <rect x="36.7" y="14.2" width="0.55" height="6.85" rx={0.28} fill={hLo(0.44, 0.14)} />
          {mirW(sh1, shHi, 'sh')}
          {mirP(sh1px, shLo, 'shp')}
          {mirP(
            [[9, 12], [10, 11], [11, 11], [9, 14], [9, 15]],
            H,
            'she',
          )}
        </g>
      );
    }
    case 'Buzz':
      return (
        <g fill={H}>
          <rect x="11" y="13" width="26" height="3" rx={1.4} opacity={0.88} />
          {[[13, 14], [17, 13.5], [21, 13.5], [25, 13.5], [29, 13.5], [33, 14]].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width="1.2" height="1.2" rx={0.4} fill={hHi(0.28, 0.22)} />
          ))}
          {[[12.2, 13.6], [15.4, 13.2], [19.2, 13.1], [23.2, 13.1], [27.2, 13.2], [30.6, 13.5], [34.2, 13.7]].map(([x, y], i) => (
            <rect key={`b-${i}`} x={x} y={y} width="0.65" height="0.65" rx={0.2} fill={hLo(0.35, 0.14)} />
          ))}
        </g>
      );
    case 'Curly': {
      const cuLo = hLo(0.42, 0.12);
      const cuP: [number, number][] = [[11, 15], [15, 16], [19, 15], [10, 18], [14, 19]];
      const mirP = (pts: [number, number][], fill: string, p: string) =>
        pts.flatMap(([x, y], i) => {
          const mx = 47 - x;
          const o = [<rect key={`${p}a${i}`} x={x} y={y} width={1} height={1} fill={fill} />];
          if (mx !== x) o.push(<rect key={`${p}b${i}`} x={mx} y={y} width={1} height={1} fill={fill} />);
          return o;
        });
      return (
        <g>
          <rect x="9.25" y="14.25" width="4.25" height="7.25" rx={1.35} fill={H} />
          <rect x="34.5" y="14.25" width="4.25" height="7.25" rx={1.35} fill={H} />
          {puff(12, 14, 8, 7)}
          {puff(20, 13, 9, 8)}
          {puff(28, 13, 9, 8)}
          {puff(36, 14, 8, 7)}
          {puff(10, 17, 10, 7)}
          {puff(16, 17, 7, 7)}
          {puff(24, 16, 8, 8)}
          {puff(32, 17, 7, 7)}
          {puff(38, 17, 10, 7)}
          {puff(10, 15, 4, 4)}
          {puff(18, 15, 5, 5)}
          {puff(26, 15, 5, 5)}
          {puff(34, 15, 4, 4)}
          {mirP(cuP, cuLo, 'cup')}
          {mirP(
            [[5, 16], [6, 14], [7, 13], [11, 12], [8, 19], [9, 20], [13, 10], [20, 13]],
            H,
            'cue',
          )}
        </g>
      );
    }
    case 'Spiky':
      return (
        <g fill={H}>
          <rect x="10" y="12" width="28" height="4" rx={1.2} />
          <path d="M 14 12 L 15 4 L 16 12 Z" fill={H} />
          <path d="M 20 12 L 22 2 L 24 12 Z" fill={H} />
          <path d="M 28 12 L 30 3 L 32 12 Z" fill={H} />
          <path d="M 32 12 L 34 5 L 36 12 Z" fill={H} />
          <path d="M 11 12 L 11.8 7 L 12.6 12 Z" fill={H} opacity={0.85} />
          <path d="M 17 12 L 18 6 L 19 12 Z" fill={H} opacity={0.85} />
          <path d="M 35 12 L 35.8 7 L 36.6 12 Z" fill={H} opacity={0.85} />
          <rect x="12" y="12.5" width="24" height="1" rx={0.5} fill={hHi(0.22, 0.18)} />
        </g>
      );
    case 'Fade':
      return (
        <g>
          <rect x="11" y="11" width="26" height="5" rx={1.6} fill={H} />
          <rect x="12" y="11.6" width="24" height="1.2" rx={0.6} fill={hHi(0.2, 0.18)} />
          <rect x="8" y="15" width="4" height="8" rx={1} fill={S} opacity={0.55} />
          <rect x="36" y="15" width="4" height="8" rx={1} fill={S} opacity={0.55} />
          <rect x="10" y="17" width="2" height="5" fill={hLo(0.25, 0.1)} />
          <rect x="36" y="17" width="2" height="5" fill={hLo(0.28, 0.11)} />
        </g>
      );
    case 'Mohawk':
      return (
        <g fill={H}>
          <path d="M 20 14 L 22 2 L 26 2 L 28 14 Z" />
          <rect x="21" y="3" width="6" height="12" rx={1.5} />
          <rect x="20.5" y="5" width="2" height="10" rx={0.8} fill={hLo(0.4, 0.16)} />
          <rect x="25.5" y="5" width="2" height="10" rx={0.8} fill={hHi(0.24, 0.14)} />
          <rect x="18" y="12" width="12" height="3" rx={1} />
        </g>
      );
    default:
      return null;
  }
}
