import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';

type AccessoriesLayerProps = {
  accessory: AvatarConfig['accessory'];
  accessoryFill: string;
  uid: string;
};

export function AccessoriesLayer({ accessory, accessoryFill, uid }: AccessoriesLayerProps) {
  const ac = accessoryFill;
  const fitGlasses = (inner: React.ReactNode) => (
    <g transform="translate(24 21.5) scale(0.89 1) translate(-24 -21.5)">{inner}</g>
  );
  switch (accessory) {
    case 'Glasses': return fitGlasses(<g fill={ac}><rect x="12" y="20" width="10" height="2" rx={0.4} /><rect x="12" y="26" width="10" height="2" rx={0.4} /><rect x="12" y="22" width="2" height="4" rx={0.24} /><rect x="20" y="22" width="2" height="4" rx={0.24} /><rect x="26" y="20" width="10" height="2" rx={0.4} /><rect x="26" y="26" width="10" height="2" rx={0.4} /><rect x="26" y="22" width="2" height="4" rx={0.24} /><rect x="34" y="22" width="2" height="4" rx={0.24} /><rect x="22" y="22" width="4" height="2" rx={0.3} /><rect x="8" y="22" width="4" height="2" rx={0.3} /><rect x="36" y="22" width="4" height="2" rx={0.3} /><rect x="12.3" y="21.7" width="9.4" height="0.7" rx={0.3} fill="rgba(255,255,255,0.15)" /><rect x="26.3" y="21.7" width="9.4" height="0.7" rx={0.3} fill="rgba(255,255,255,0.15)" /></g>);
    case 'Sunglasses': return fitGlasses(<g fill={ac}><rect x="12" y="20" width="10" height="8" rx={0.7} /><rect x="26" y="20" width="10" height="8" rx={0.7} /><rect x="12.4" y="20.4" width="9.2" height="0.9" rx={0.4} fill="rgba(255,255,255,0.12)" /><rect x="26.4" y="20.4" width="9.2" height="0.9" rx={0.4} fill="rgba(255,255,255,0.12)" /><rect x="22" y="22" width="4" height="2" rx={0.3} /><rect x="8" y="22" width="4" height="2" rx={0.3} /><rect x="36" y="22" width="4" height="2" rx={0.3} /></g>);
    case 'Aviators': return fitGlasses(
      <g fill={ac}>
        <path d="M 10 20 L 22 20 L 22 24.2 Q 16 30.35 10 24.2 Z" />
        <path d="M 26 20 L 38 20 L 38 24.2 Q 32 30.35 26 24.2 Z" />
        <rect x="22" y="20" width="4" height="2" rx={0.35} />
        <rect x="8" y="20" width="2" height="2" rx={0.25} />
        <rect x="38" y="20" width="2" height="2" rx={0.25} />
        <path d="M 10.6 20.45 L 21.4 20.45" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={0.45} strokeLinecap="round" />
        <path d="M 26.6 20.45 L 37.4 20.45" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={0.45} strokeLinecap="round" />
      </g>,
    );
    case 'Cyberpunk': return fitGlasses(<g><rect x="8" y="20" width="32" height="6" fill="#00ffcc" opacity="0.8" /><rect x="8" y="20" width="32" height="2" fill="#ff00ff" opacity="0.8" /><rect x="8" y="22" width="2" height="4" fill="#111" /><rect x="38" y="22" width="2" height="4" fill="#111" /></g>);
    case 'Shades V1': return fitGlasses(<g fill={ac}><rect x="10" y="20" width="12" height="6" /><rect x="26" y="20" width="12" height="6" /><rect x="22" y="22" width="4" height="2" /></g>);
    case 'Shades V2': return fitGlasses(<g fill={ac}><rect x="10" y="18" width="12" height="8" /><rect x="26" y="18" width="12" height="8" /><rect x="22" y="20" width="4" height="2" /><rect x="8" y="20" width="2" height="4" /><rect x="38" y="20" width="2" height="4" /></g>);
    case 'Shades V3': return fitGlasses(<g fill={ac}><rect x="12" y="20" width="8" height="6" /><rect x="28" y="20" width="8" height="6" /><rect x="20" y="22" width="8" height="2" /></g>);
    case 'Shades V4': return fitGlasses(<g fill={ac}><rect x="10" y="20" width="12" height="8" /><rect x="26" y="20" width="12" height="8" /><rect x="22" y="22" width="4" height="4" /><rect x="12" y="18" width="8" height="2" /><rect x="28" y="18" width="8" height="2" /></g>);
    case 'Shades V5': return fitGlasses(<g fill={ac}><rect x="10" y="22" width="12" height="4" /><rect x="26" y="22" width="12" height="4" /><rect x="22" y="22" width="4" height="2" /></g>);
    case 'Shades V6': return fitGlasses(<g fill={ac}><rect x="10" y="20" width="10" height="8" /><rect x="28" y="20" width="10" height="8" /><rect x="20" y="22" width="8" height="2" /></g>);
    case 'Shades V7': return fitGlasses(<g fill={ac}><rect x="12" y="18" width="10" height="8" /><rect x="26" y="18" width="10" height="8" /><rect x="22" y="20" width="4" height="2" /><rect x="10" y="20" width="2" height="4" /><rect x="36" y="20" width="2" height="4" /></g>);
    case 'Shades V8': return fitGlasses(<g fill={ac}><rect x="10" y="20" width="12" height="6" /><rect x="26" y="20" width="12" height="6" /><rect x="22" y="20" width="4" height="2" /><rect x="12" y="26" width="8" height="2" /><rect x="28" y="26" width="8" height="2" /></g>);
    case 'Shades V9': return fitGlasses(<g fill={ac}><rect x="10" y="20" width="12" height="8" /><rect x="26" y="20" width="12" height="8" /><rect x="22" y="22" width="4" height="2" /><rect x="8" y="22" width="2" height="2" /><rect x="38" y="22" width="2" height="2" /></g>);
    case 'Shades V10': return fitGlasses(<g fill={ac}><rect x="10" y="18" width="12" height="6" /><rect x="26" y="18" width="12" height="6" /><rect x="22" y="20" width="4" height="2" /><rect x="12" y="24" width="8" height="4" /><rect x="28" y="24" width="8" height="4" /></g>);
    case 'Voxel Glasses': return fitGlasses(<g><rect x="10" y="20" width="12" height="8" fill={`url(#${uid}custom)`} /><rect x="26" y="20" width="12" height="8" fill={`url(#${uid}custom)`} /><rect x="22" y="22" width="4" height="2" fill="#111" /><rect x="8" y="22" width="2" height="2" fill="#111" /><rect x="38" y="22" width="2" height="2" fill="#111" /></g>);
    case 'Earrings': return <g fill="#FFD700"><rect x="8" y="26" width="2" height="2" /><rect x="38" y="26" width="2" height="2" /></g>;
    case 'Headband': return <rect x="10" y="14" width="28" height="4" fill="#E11D48" />;
    case 'None':
    default:
      return null;
  }
}
