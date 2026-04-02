import React from 'react';
import type { HairShadeFn } from './hair-types';

export function renderHairSideShade(
  x: number,
  y: number,
  w: number,
  h: number,
  hLo: HairShadeFn,
) {
  return (
    <g pointerEvents="none">
      <rect x={x} y={y + 0.7} width={0.84} height={Math.max(0, h - 1)} rx={0.6} fill={hLo(0.32, 0.11)} />
      <rect x={x + w - 0.84} y={y + 0.7} width={0.84} height={Math.max(0, h - 1)} rx={0.6} fill={hLo(0.48, 0.13)} />
    </g>
  );
}
