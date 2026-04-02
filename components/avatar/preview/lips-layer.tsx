import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { Emotion } from '../AvatarView';

export function renderLipsLayer(lipShape: AvatarConfig['lipShape'], emotion: Emotion) {
  if (emotion === 'surprised') {
    return (
      <g>
        <rect x="22" y="32" width="4" height="4" rx={1.1} fill="rgba(30,10,15,0.88)" />
        <rect x="22.5" y="32.5" width="3" height="1.1" rx={0.5} fill="rgba(255,255,255,0.08)" />
        <rect x="22.7" y="34.3" width="2.6" height="1.1" rx={0.4} fill="rgba(200,80,90,0.35)" />
        <ellipse cx="24" cy="33.6" rx="1.1" ry="0.85" fill="rgba(0,0,0,0.35)" />
      </g>
    );
  }
  switch (lipShape) {
    case 'Thin':
    case 'Full': // legacy — coerced to Thin in mergeV1AvatarPartial; keep for in-memory configs
      return (
        <g>
          <rect x="20" y="32.3" width="8" height="1.1" rx={0.44} fill="rgba(90,30,40,0.55)" />
          <rect x="20" y="33.2" width="8" height="1.1" rx={0.56} fill="rgba(0,0,0,0.32)" />
          <path d="M 20.35 32.85 L 27.65 32.85" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.12" strokeLinecap="round" />
        </g>
      );
    case 'Smile':
    case 'Smirk': // legacy — coerced to Smile in mergeV1AvatarPartial
      return (
        <g>
          <path
            d="M 20.2 32.78 Q 24 31.38 27.8 32.78"
            fill="none"
            stroke="rgba(42,20,28,0.5)"
            strokeWidth="0.36"
            strokeLinecap="round"
          />
          <rect x="20.65" y="32.82" width="6.7" height="1.12" rx={0.24} fill="rgba(255,252,248,0.97)" />
          <rect x="21" y="33.02" width="6" height="0.3" rx={0.09} fill="rgba(0,0,0,0.055)" />
          <path
            d="M 20.38 34.18 Q 24 35.38 27.62 34.18"
            fill="none"
            stroke="rgba(34,14,20,0.46)"
            strokeWidth="0.4"
            strokeLinecap="round"
          />
          <rect x="20.05" y="33.42" width="0.44" height="0.34" rx={0.1} fill="rgba(0,0,0,0.11)" />
          <rect x="27.51" y="33.42" width="0.44" height="0.34" rx={0.1} fill="rgba(0,0,0,0.11)" />
        </g>
      );
    default:
      return (
        <g>
          <rect x="20" y="31.9" width="8" height="1.1" rx={0.44} fill="rgba(95,35,45,0.45)" />
          <rect x="20" y="32.8" width="8" height="1.1" rx={0.5} fill="rgba(0,0,0,0.36)" />
          <path d="M 20.4 32.35 L 27.6 32.35" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="0.1" strokeLinecap="round" />
        </g>
      );
  }
}
