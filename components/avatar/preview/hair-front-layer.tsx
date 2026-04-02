import type { AvatarConfig } from '@/lib/websocket-client';
import { renderHairFrontShortVariants } from './hair-front-short-variants';
import { renderHairFrontDreadlocksVariants } from './hair-front-dreadlocks-variants';
import { renderHairFrontRemainingVariants } from './hair-front-remaining-variants';
import type { HairShadeFn } from './hair-types';

export function renderHairFrontLayer(
  hairStyle: AvatarConfig['hairStyle'],
  hairFill: string,
  skinFill: string,
  hHi: HairShadeFn,
  hLo: HairShadeFn,
) {
  switch (hairStyle) {
    case 'Short':
    case 'Buzz':
    case 'Curly':
    case 'Spiky':
    case 'Fade':
    case 'Mohawk':
      return renderHairFrontShortVariants(hairStyle, hairFill, skinFill, hHi, hLo);
    case 'Dreadlocks':
    case 'Dreadlocks V1':
    case 'Dreadlocks V2':
    case 'Dreadlocks V3':
    case 'Dreadlocks V4':
    case 'Dreadlocks V5':
    case 'Dreadlocks V6':
    case 'Dreadlocks V7':
    case 'Dreadlocks V8':
    case 'Dreadlocks V9':
    case 'Dreadlocks V10':
    case 'Locks V1':
    case 'Locks V2':
    case 'Locks V3':
    case 'Locks V4':
    case 'Locks V5':
    case 'Locks V6':
    case 'Locks V7':
    case 'Locks V8':
    case 'Locks V9':
    case 'Locks V10':
      return renderHairFrontDreadlocksVariants(hairStyle, hairFill, hHi, hLo);
    case 'Afro':
    case 'Mullet':
    case 'Pigtails':
    case 'Messy':
    case 'Ponytail':
    case 'Long Straight':
    case 'Bob':
    case 'Long Wavy':
    case 'Bald':
    default:
      return renderHairFrontRemainingVariants(hairStyle, hairFill, hHi, hLo);
  }
}
