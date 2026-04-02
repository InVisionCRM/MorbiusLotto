import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import { hairTwinLocks } from './helpers';
import { renderHairSideShade } from './hair-side-shade';
import { renderHairBackLongVariants } from './hair-back-long-variants';
import { renderHairBackCoreVariants } from './hair-back-core-variants';
import { renderHairBackDreadlocksVariants } from './hair-back-dreadlocks-variants';
import { renderHairBackRemainingVariants } from './hair-back-remaining-variants';
import type { HairShadeFn } from './hair-types';

export function renderHairBackLayer(
  hairStyle: AvatarConfig['hairStyle'],
  hairFill: string,
  hHi: HairShadeFn,
  hLo: HairShadeFn,
) {
  const H = hairFill;
  const hairSideShade = (x: number, y: number, w: number, h: number) =>
    renderHairSideShade(x, y, w, h, hLo);
  const lockSh = hLo(0.42, 0.12);
  const dTwin = (locks: [number, number, number, number][], rxScale = 1) =>
    hairTwinLocks(H, locks, rxScale, lockSh);
  const capHi = (x: number, w: number, y = 13.32) => (
    <rect
      x={x + 1.15}
      y={y}
      width={Math.max(2, w - 2.3)}
      height={0.92}
      rx={0.4}
      fill={hHi(0.16, 0.15)}
    />
  );

  const longVariant = renderHairBackLongVariants(hairStyle, H, hHi, hLo, hairSideShade);
  if (longVariant) return longVariant;
  const coreVariant = renderHairBackCoreVariants(hairStyle, H, hHi, hLo);
  if (coreVariant) return coreVariant;
  const dreadlocksVariant = renderHairBackDreadlocksVariants(hairStyle, H, hHi, hLo, capHi, dTwin);
  if (dreadlocksVariant) return dreadlocksVariant;
  return renderHairBackRemainingVariants(hairStyle, H, hHi, hLo, hairSideShade);
}
