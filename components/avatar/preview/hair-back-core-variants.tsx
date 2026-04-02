import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { HairShadeFn } from './hair-types';

export function renderHairBackCoreVariants(
  hairStyle: AvatarConfig['hairStyle'],
  hairFill: string,
  hHi: HairShadeFn,
  hLo: HairShadeFn,
) {
  if (hairStyle === 'Bob') {
    return (
      <g>
        {/* Main bob silhouette — rounded, ends at chin */}
        <path
          d="M 24 12.5 C 29 12.5 34 13 37 14.5 C 39.5 16 40.5 18 41 21 C 41.5 24 41 27 40 29.5 C 39 31.5 37 33 34 33.5 C 30.5 34 27.5 33.5 24 33 C 20.5 33.5 17.5 34 14 33.5 C 11 33 9 31.5 8 29.5 C 7 27 6.5 24 7 21 C 7.5 18 8.5 16 11 14.5 C 14 13 19 12.5 24 12.5 Z"
          fill={hairFill}
        />
        {/* Center-back depth shadow */}
        <path
          d="M 17 17 C 15.5 19 15 22 15 25 C 15 28 16 30 18 31.5 L 24 32.5 L 30 31.5 C 32 30 33 28 33 25 C 33 22 32.5 19 31 17 Z"
          fill={hLo(0.12, 0.06)}
        />
        {/* Left highlight band */}
        <path d="M 8.5 17 C 8 21 8 25 8.5 28.5 C 9 30.5 10 32 11.5 33" fill="none" stroke={hHi(0.18, 0.12)} strokeWidth={0.7} strokeLinecap="round" />
        {/* Right highlight band */}
        <path d="M 39.5 18 C 40 22 40 25 39.5 28 C 39 30 38 31.5 36.5 32.5" fill="none" stroke={hHi(0.14, 0.1)} strokeWidth={0.6} strokeLinecap="round" />
        {/* Strand lines */}
        <path d="M 10 16 C 9 20 8.5 24 9 28 C 9.3 30 10 31.5 11.5 32.5" fill="none" stroke={hLo(0.18, 0.07)} strokeWidth={0.35} strokeLinecap="round" />
        <path d="M 38 16 C 39 20 39.5 24 39 28 C 38.7 30 38 31.5 36.5 32.5" fill="none" stroke={hLo(0.18, 0.07)} strokeWidth={0.35} strokeLinecap="round" />
        <path d="M 13 16 C 12 20 11.5 24 12 28 C 12.3 30 13 31.5 14.5 32.5" fill="none" stroke={hLo(0.14, 0.06)} strokeWidth={0.3} strokeLinecap="round" />
        <path d="M 35 16 C 36 20 36.5 24 36 28 C 35.7 30 35 31.5 33.5 32.5" fill="none" stroke={hLo(0.14, 0.06)} strokeWidth={0.3} strokeLinecap="round" />
        {/* Bottom curl-under shadow */}
        <path d="M 12 32 C 16 33.5 20 34 24 33.5 C 28 34 32 33.5 36 32" fill="none" stroke={hLo(0.25, 0.1)} strokeWidth={0.5} strokeLinecap="round" />
      </g>
    );
  }

  if (hairStyle === 'Ponytail') {
    const tie = '#22c55e';
    return (
      <g>
        {/* Single tail — same language as pigtails back: out, down, taper in; highlight outside, shadow inside */}
        <path
          d="M 32.4 17.6 L 30.2 17 C 26.2 17.4 23.4 20.6 22.4 25.8 C 21.4 30.4 21.6 34.8 23.4 38 C 25 40.6 27.8 42.1 30.8 41.9 L 32.6 40.4 C 30.8 39 29.6 36.5 29.8 33.4 C 30.2 29.2 32 25.5 34.8 23.2 C 36.4 21.8 35.4 19.5 33.8 18.2 L 32.4 17.6 Z"
          fill={hairFill}
        />
        <path
          d="M 23.2 24.8 C 22.6 29.2 23 33.4 24.6 36.6"
          fill="none"
          stroke={hHi(0.3, 0.32)}
          strokeWidth={0.65}
          strokeLinecap="round"
        />
        <path
          d="M 33.2 19.5 Q 31.2 26.5 30.8 33.2"
          fill="none"
          stroke={hLo(0.45, 0.2)}
          strokeWidth={0.5}
          strokeLinecap="round"
        />
        <rect x="30.6" y="16.95" width="2.65" height="0.95" rx={0.35} fill={tie} transform="rotate(-20 31.9 17.4)" />
        <rect x="30.85" y="17.1" width="2.2" height="0.34" rx={0.12} fill="rgba(255,255,255,0.22)" transform="rotate(-20 31.9 17.4)" />
      </g>
    );
  }

  return null;
}
