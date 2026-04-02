import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';

type HatLayerProps = {
  hat: AvatarConfig['hat'];
  hatFill: string | null;
};

export function HatLayer({ hat, hatFill }: HatLayerProps) {
  const hc = hatFill;
  switch (hat) {
    case 'Cap': return (
      <g>
        <rect x="12" y="8" width="24" height="8" rx={0.7} fill={hc ?? '#ef4444'} />
        <rect x="12.8" y="8.7" width="22.4" height="1.3" rx={0.4} fill="rgba(255,255,255,0.14)" />
        {[13.2, 16.5, 20, 23.5, 27, 30.5, 33.8].map((sx) => (
          <rect key={sx} x={sx} y="8.35" width="0.22" height="6.8" rx={0.04} fill="rgba(0,0,0,0.055)" />
        ))}
        <path d="M 13.5 10.2 Q 24 9.2 34.5 10.2" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.22" strokeLinecap="round" />
        <rect x="12" y="14" width="32" height="2" rx={0.3} fill={hc ?? '#ef4444'} />
        <rect x="14" y="14.16" width="24" height="0.7" rx={0.2} fill="rgba(0,0,0,0.12)" />
        <rect x="16" y="14.05" width="16" height="0.28" rx={0.1} fill="rgba(255,255,255,0.08)" />
      </g>
    );
    case 'Beanie': return (
      <g>
        <rect x="10" y="8" width="28" height="10" rx="4" fill={hc ?? '#3b82f6'} />
        {[10.5, 13.5, 16.5, 19.5, 22.5, 25.5, 28.5, 31.5, 34.5, 37.5].map((sx) => (
          <rect key={sx} x={sx} y="9" width="0.26" height="7.5" rx={0.05} fill="rgba(0,0,0,0.065)" />
        ))}
        <rect x="11" y="8.35" width="26" height="0.4" rx={0.15} fill="rgba(255,255,255,0.1)" />
        <rect x="10" y="16" width="28" height="4" fill={hc ?? '#2563eb'} />
        <rect x="10.5" y="16.15" width="27" height="0.35" rx={0.1} fill="rgba(0,0,0,0.12)" />
      </g>
    );
    case 'Top Hat': return (
      <g>
        <rect x="14" y="0" width="20" height="16" fill={hc ?? '#111'} />
        {[14.8, 17.5, 20.2, 22.9, 25.6, 28.3, 31].map((sx) => (
          <rect key={sx} x={sx} y="1" width="0.2" height="13" rx={0.04} fill="rgba(255,255,255,0.04)" />
        ))}
        <rect x="14.4" y="0.35" width="19.2" height="0.45" rx={0.12} fill="rgba(255,255,255,0.08)" />
        <rect x="8" y="16" width="32" height="2" fill={hc ?? '#111'} />
        <rect x="8.3" y="16.12" width="31.4" height="0.35" rx={0.1} fill="rgba(255,255,255,0.06)" />
        <rect x="14" y="12" width="20" height="4" fill={hc ? 'rgba(0,0,0,0.35)' : '#dc2626'} />
      </g>
    );
    case 'Cowboy': return (
      <g>
        <rect x="14" y="4" width="20" height="10" fill={hc ?? '#78350f'} />
        <path d="M 15 6 Q 24 4.5 33 6" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.24" strokeLinecap="round" />
        {[14.5, 18, 22, 26, 30, 33.5].map((sx) => (
          <rect key={sx} x={sx} y="5" width="0.22" height="7.5" rx={0.04} fill="rgba(0,0,0,0.08)" />
        ))}
        <rect x="6" y="14" width="36" height="4" fill={hc ?? '#78350f'} />
        <rect x="8" y="14.12" width="32" height="0.4" rx={0.1} fill="rgba(255,255,255,0.06)" />
        <rect x="10" y="16.2" width="28" height="0.35" rx={0.08} fill="rgba(0,0,0,0.15)" />
      </g>
    );
    case 'Crown': return (
      <g fill={hc ?? '#fbbf24'}>
        <rect x="12" y="9" width="24" height="8" rx={0.6} />
        <rect x="12.5" y="9.4" width="23" height="1.1" rx={0.4} fill="rgba(255,255,255,0.2)" />
        <rect x="12" y="13.7" width="24" height="0.9" rx={0.3} fill="rgba(0,0,0,0.12)" />
        <rect x="12" y="5" width="4" height="4" rx={0.5} /><rect x="22" y="5" width="4" height="4" rx={0.5} /><rect x="32" y="5" width="4" height="4" rx={0.5} />
        <rect x="12.4" y="5.3" width="1.8" height="1.1" rx={0.24} fill="rgba(255,255,255,0.25)" />
        <rect x="22.4" y="5.3" width="1.8" height="1.1" rx={0.24} fill="rgba(255,255,255,0.25)" />
        <rect x="32.4" y="5.3" width="1.8" height="1.1" rx={0.24} fill="rgba(255,255,255,0.25)" />
      </g>
    );
    case 'Bandana': return <g fill={hc ?? '#ef4444'}><rect x="10" y="12" width="28" height="6" /><rect x="36" y="14" width="4" height="8" /></g>;
    case 'Hat V1': return <g><rect x="10" y="8" width="28" height="6" fill={hc ?? '#1f2937'} /><rect x="8" y="14" width="32" height="2" fill={hc ?? '#1f2937'} /></g>;
    case 'Hat V2': return <g><rect x="12" y="6" width="24" height="8" fill={hc ?? '#111827'} /><rect x="8" y="14" width="32" height="4" fill={hc ?? '#111827'} /></g>;
    case 'Hat V3': return <g><rect x="14" y="4" width="20" height="10" fill={hc ?? '#334155'} /><rect x="8" y="14" width="32" height="2" fill={hc ?? '#334155'} /></g>;
    case 'Hat V4': return <g><rect x="12" y="8" width="24" height="8" fill={hc ?? '#7c2d12'} /><rect x="10" y="16" width="28" height="2" fill={hc ?? '#7c2d12'} /><rect x="20" y="10" width="8" height="2" fill="rgba(255,255,255,0.2)" /></g>;
    case 'Hat V5': return <g><rect x="10" y="8" width="28" height="8" fill={hc ?? '#0f766e'} /><rect x="10" y="16" width="28" height="2" fill={hc ?? '#0f766e'} /><rect x="18" y="8" width="12" height="2" fill="rgba(255,255,255,0.2)" /></g>;
    case 'Hat V7': return <g><rect x="10" y="6" width="28" height="10" fill={hc ?? '#6b21a8'} /><rect x="8" y="16" width="32" height="2" fill={hc ?? '#6b21a8'} /></g>;
    case 'Hat V8': return <g><rect x="12" y="8" width="24" height="6" fill={hc ?? '#854d0e'} /><rect x="10" y="14" width="28" height="4" fill={hc ?? '#854d0e'} /><rect x="20" y="8" width="8" height="2" fill="rgba(255,255,255,0.2)" /></g>;
    case 'Hat V10': return <g><rect x="10" y="8" width="28" height="6" fill={hc ?? '#0f172a'} /><rect x="8" y="14" width="32" height="4" fill={hc ?? '#0f172a'} /><rect x="22" y="8" width="4" height="2" fill="rgba(255,255,255,0.25)" /></g>;
    default:
      return null;
  }
}
