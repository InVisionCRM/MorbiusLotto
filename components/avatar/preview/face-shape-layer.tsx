import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';

export function renderFaceShapeLayer(
  faceShape: AvatarConfig['faceShape'],
  fillColor: string,
  _detail: 'full' | 'silhouette' = 'full',
) {
  switch (faceShape) {
    case 'Round':
      /* Forehead lift vs legacy (+3u total): hair sits above skin; outer band tracks inner. */
      return (
        <g fill={fillColor}>
          <rect x="14" y="13" width="20" height="23" rx={1.1} />
          <rect x="12" y="15" width="24" height="19" rx={0.9} />
        </g>
      );
    case 'Oval':
      return (
        <g fill={fillColor}>
          <rect x="14" y="16" width="20" height="22" rx={1} />
          <rect x="16" y="14" width="16" height="2" rx={0.7} />
          <rect x="16" y="38" width="16" height="2" rx={0.7} />
        </g>
      );
    case 'Heart':
      return (
        <g fill={fillColor}>
          <rect x="12" y="16" width="24" height="14" rx={0.9} />
          <rect x="14" y="30" width="20" height="4" rx={0.7} />
          <rect x="18" y="34" width="12" height="2" rx={0.5} />
        </g>
      );
    case 'Diamond':
      return (
        <g fill={fillColor}>
          <rect x="12" y="22" width="24" height="8" rx={0.7} />
          <rect x="14" y="18" width="20" height="4" rx={0.7} />
          <rect x="14" y="30" width="20" height="4" rx={0.7} />
          <rect x="18" y="16" width="12" height="2" rx={0.5} />
          <rect x="18" y="34" width="12" height="2" rx={0.5} />
        </g>
      );
    case 'Triangle':
      return (
        <g fill={fillColor}>
          <rect x="16" y="16" width="16" height="6" rx={0.7} />
          <rect x="14" y="22" width="20" height="6" rx={0.7} />
          <rect x="12" y="28" width="24" height="8" rx={0.9} />
        </g>
      );
    case 'Inverted Triangle':
      return (
        <g fill={fillColor}>
          <rect x="12" y="16" width="24" height="8" rx={0.8} />
          <rect x="14" y="24" width="20" height="6" rx={0.7} />
          <rect x="16" y="30" width="16" height="6" rx={0.7} />
        </g>
      );
    case 'Long':
      return <rect x="14" y="14" width="20" height="24" rx={1} fill={fillColor} />;
    case 'Wide':
      return <rect x="10" y="18" width="28" height="16" rx={1.1} fill={fillColor} />;
    case 'Slim':
      return <rect x="16" y="16" width="16" height="20" rx={0.9} fill={fillColor} />;
    default:
      // Square — softened "portrait oval"; +1u taller top (forehead under hair) for same chin line
      return <rect x="11.95" y="15.35" width="24.1" height="20.3" rx="2.25" fill={fillColor} />;
  }
}
