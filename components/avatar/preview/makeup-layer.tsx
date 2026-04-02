import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';

type MakeupLayerProps = {
  makeup: AvatarConfig['makeup'];
};

/** Optional cosmetics — blush / contour / freckles (base face stays clean). */
export function MakeupLayer({ makeup }: MakeupLayerProps) {
  const m = makeup ?? 'None';
  switch (m) {
    case 'Blush Soft':
      return (
        <g pointerEvents="none">
          <ellipse cx="17" cy="26.5" rx="3.2" ry="2.4" fill="rgba(220,100,120,0.22)" />
          <ellipse cx="31" cy="26.5" rx="3.2" ry="2.4" fill="rgba(220,100,120,0.22)" />
        </g>
      );
    case 'Blush Rosy':
      return (
        <g pointerEvents="none">
          <ellipse cx="17" cy="26.5" rx="3.5" ry="2.7" fill="rgba(210,70,100,0.38)" />
          <ellipse cx="31" cy="26.5" rx="3.5" ry="2.7" fill="rgba(210,70,100,0.38)" />
        </g>
      );
    case 'Contour':
      return (
        <g pointerEvents="none">
          <ellipse cx="12.5" cy="27" rx="2.8" ry="7" fill="rgba(80,40,30,0.07)" />
          <ellipse cx="35.5" cy="27" rx="2.8" ry="7" fill="rgba(80,40,30,0.09)" />
          <ellipse cx="24" cy="32" rx="5" ry="2.2" fill="rgba(60,35,28,0.05)" />
        </g>
      );
    case 'Highlighter':
      return (
        <g pointerEvents="none">
          <ellipse cx="18" cy="19" rx="1.6" ry="0.85" fill="rgba(255,255,255,0.14)" />
          <ellipse cx="30" cy="19" rx="1.6" ry="0.85" fill="rgba(255,255,255,0.13)" />
          <ellipse cx="24" cy="20.5" rx="2.2" ry="0.9" fill="rgba(255,255,255,0.08)" />
          <ellipse cx="17" cy="25.5" rx="1.2" ry="0.9" fill="rgba(255,255,255,0.1)" />
          <ellipse cx="31" cy="25.5" rx="1.2" ry="0.9" fill="rgba(255,255,255,0.1)" />
        </g>
      );
    case 'Freckles':
      return (
        <g pointerEvents="none" fill="rgba(120,72,48,0.45)">
          {[
            [15.2, 24.1], [16.8, 25.3], [18.1, 24.6], [29.2, 24.2], [30.6, 25.4], [32.1, 24.7],
            [17.5, 26.8], [19.2, 27.5], [28.8, 26.9], [30.4, 27.6], [22, 25.2], [26, 25.3],
          ].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width="0.45" height="0.45" rx={0.12} />
          ))}
        </g>
      );
    case 'Eye Shadow':
      return (
        <g pointerEvents="none">
          <rect x="13.5" y="20" width="7" height="2.2" rx={0.6} fill="rgba(90,50,110,0.18)" />
          <rect x="27.5" y="20" width="7" height="2.2" rx={0.6} fill="rgba(90,50,110,0.18)" />
          <rect x="14.2" y="20.2" width="5.5" height="0.55" rx={0.2} fill="rgba(255,255,255,0.06)" />
          <rect x="28.2" y="20.2" width="5.5" height="0.55" rx={0.2} fill="rgba(255,255,255,0.06)" />
        </g>
      );
    case 'Glam Full':
      return (
        <g pointerEvents="none">
          <ellipse cx="17" cy="26.5" rx="3" ry="2.3" fill="rgba(220,90,120,0.2)" />
          <ellipse cx="31" cy="26.5" rx="3" ry="2.3" fill="rgba(220,90,120,0.2)" />
          <ellipse cx="12.8" cy="27" rx="2.4" ry="6.5" fill="rgba(70,35,40,0.06)" />
          <ellipse cx="35.2" cy="27" rx="2.4" ry="6.5" fill="rgba(70,35,40,0.08)" />
          <ellipse cx="18" cy="19" rx="1.4" ry="0.75" fill="rgba(255,255,255,0.12)" />
          <ellipse cx="30" cy="19" rx="1.4" ry="0.75" fill="rgba(255,255,255,0.11)" />
        </g>
      );
    case 'None':
    default:
      return null;
  }
}
