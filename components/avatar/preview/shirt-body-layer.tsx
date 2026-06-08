import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';

type ShirtBodyLayerProps = {
  shirtStyle: AvatarConfig['shirtStyle'];
  shirtFill: string;
};

/** Shared shouldered torso silhouette (matches the polished Default body). */
const TORSO_PATH = 'M 8 56 L 8 40.35 Q 8.85 38.95 10.85 38.62 Q 12.9 38.45 14.5 38.55 L 19.5 39.95 L 20.2 40.35 Q 24 41.15 27.8 40.35 L 28.5 39.95 L 33.5 38.55 Q 35.1 38.45 37.15 38.62 Q 39.15 38.95 40 40.35 L 40 56 Q 24 55.4 8 56 Z';

export function ShirtBodyLayer({ shirtStyle, shirtFill }: ShirtBodyLayerProps) {
  const c = shirtFill;
  const style = shirtStyle || 'Default';
  switch (style) {
    case 'Streetwear V1': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="8" y="44" width="32" height="2" fill="rgba(255,255,255,0.15)" /><rect x="14" y="48" width="20" height="4" fill="rgba(0,0,0,0.12)" /></g>;
    case 'Streetwear V2': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="8" y="40" width="32" height="4" fill="rgba(0,0,0,0.2)" /><rect x="22" y="44" width="4" height="12" fill="rgba(255,255,255,0.12)" /></g>;
    case 'Streetwear V3': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="10" y="42" width="6" height="6" fill="rgba(255,255,255,0.18)" /><rect x="32" y="42" width="6" height="6" fill="rgba(255,255,255,0.18)" /><rect x="16" y="52" width="16" height="2" fill="rgba(0,0,0,0.2)" /></g>;
    case 'Streetwear V4': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="8" y="48" width="32" height="2" fill="rgba(255,255,255,0.2)" /><rect x="18" y="40" width="12" height="4" fill="rgba(0,0,0,0.15)" /></g>;
    case 'Streetwear V5': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="8" y="40" width="4" height="16" fill="rgba(0,0,0,0.12)" /><rect x="36" y="40" width="4" height="16" fill="rgba(0,0,0,0.12)" /><rect x="20" y="44" width="8" height="4" fill="rgba(255,255,255,0.18)" /></g>;
    case 'Streetwear V6': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="12" y="42" width="24" height="2" fill="rgba(255,255,255,0.2)" /><rect x="12" y="50" width="24" height="2" fill="rgba(255,255,255,0.15)" /><rect x="22" y="44" width="4" height="10" fill="rgba(0,0,0,0.15)" /></g>;
    case 'Streetwear V7': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="10" y="46" width="28" height="2" fill="rgba(0,0,0,0.15)" /><rect x="16" y="48" width="16" height="6" fill="rgba(255,255,255,0.12)" /></g>;
    case 'Streetwear V8': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="8" y="42" width="32" height="2" fill="rgba(255,255,255,0.18)" /><rect x="18" y="44" width="12" height="4" fill="rgba(0,0,0,0.2)" /><rect x="20" y="50" width="8" height="4" fill="rgba(0,0,0,0.1)" /></g>;
    case 'Streetwear V9': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="12" y="40" width="24" height="4" fill="rgba(0,0,0,0.12)" /><rect x="12" y="52" width="24" height="2" fill="rgba(255,255,255,0.18)" /><rect x="22" y="44" width="4" height="8" fill="rgba(255,255,255,0.12)" /></g>;
    case 'Streetwear V10': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="10" y="42" width="6" height="4" fill="rgba(0,0,0,0.15)" /><rect x="32" y="42" width="6" height="4" fill="rgba(0,0,0,0.15)" /><rect x="16" y="48" width="16" height="4" fill="rgba(255,255,255,0.16)" /><rect x="20" y="52" width="8" height="2" fill="rgba(0,0,0,0.15)" /></g>;
    case 'Tuxedo': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#1a1a1a" />
        <rect x="20" y="40" width="8" height="16" fill="#f0f0f0" />
        <rect x="16" y="40" width="4" height="10" fill="#1a1a1a" />
        <rect x="28" y="40" width="4" height="10" fill="#1a1a1a" />
        <rect x="18" y="40" width="2" height="6" fill="#f0f0f0" />
        <rect x="28" y="40" width="2" height="6" fill="#f0f0f0" />
        <rect x="20" y="42" width="8" height="2" fill="#1a0030" />
        <rect x="22" y="40" width="4" height="6" fill="#1a0030" />
        <rect x="10" y="42" width="4" height="4" fill="#f0f0f0" />
        <rect x="22" y="48" width="4" height="2" fill="#ccc" />
      </g>
    );
    case 'Cheetah Print': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#d4882a" />
        <rect x="10" y="42" width="4" height="2" fill="#3d2000" /><rect x="10" y="44" width="2" height="2" fill="#3d2000" />
        <rect x="18" y="40" width="2" height="4" fill="#3d2000" /><rect x="20" y="40" width="2" height="2" fill="#3d2000" />
        <rect x="28" y="44" width="4" height="2" fill="#3d2000" /><rect x="30" y="46" width="2" height="2" fill="#3d2000" />
        <rect x="14" y="48" width="4" height="2" fill="#3d2000" /><rect x="16" y="50" width="2" height="2" fill="#3d2000" />
        <rect x="24" y="50" width="4" height="2" fill="#3d2000" /><rect x="22" y="52" width="2" height="2" fill="#3d2000" />
        <rect x="34" y="42" width="2" height="4" fill="#3d2000" /><rect x="36" y="44" width="2" height="2" fill="#3d2000" />
        <rect x="10" y="52" width="4" height="2" fill="#3d2000" />
      </g>
    );
    case 'Hawaiian': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill={c} />
        <rect x="12" y="42" width="2" height="2" fill="#ff6b6b" /><rect x="10" y="44" width="2" height="2" fill="#ff6b6b" /><rect x="14" y="44" width="2" height="2" fill="#ff6b6b" /><rect x="12" y="46" width="2" height="2" fill="#ff6b6b" />
        <rect x="28" y="44" width="2" height="2" fill="#ffd93d" /><rect x="26" y="46" width="2" height="2" fill="#ffd93d" /><rect x="30" y="46" width="2" height="2" fill="#ffd93d" /><rect x="28" y="48" width="2" height="2" fill="#ffd93d" />
        <rect x="18" y="50" width="2" height="2" fill="#6bcb77" /><rect x="16" y="52" width="2" height="2" fill="#6bcb77" /><rect x="20" y="52" width="2" height="2" fill="#6bcb77" />
        <rect x="34" y="48" width="2" height="2" fill="#ff6b6b" /><rect x="32" y="50" width="2" height="2" fill="#ff6b6b" /><rect x="36" y="50" width="2" height="2" fill="#ff6b6b" />
      </g>
    );
    case 'Pinstripe': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#1e2030" />
        <rect x="12" y="40" width="2" height="16" fill="rgba(255,255,255,0.18)" />
        <rect x="18" y="40" width="2" height="16" fill="rgba(255,255,255,0.18)" />
        <rect x="24" y="40" width="2" height="16" fill="rgba(255,255,255,0.18)" />
        <rect x="30" y="40" width="2" height="16" fill="rgba(255,255,255,0.18)" />
        <rect x="36" y="40" width="2" height="16" fill="rgba(255,255,255,0.18)" />
      </g>
    );
    case 'Flannel': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill={c} />
        <rect x="8" y="44" width="32" height="2" fill="rgba(255,255,255,0.22)" />
        <rect x="8" y="50" width="32" height="2" fill="rgba(255,255,255,0.22)" />
        <rect x="14" y="40" width="2" height="16" fill="rgba(0,0,0,0.2)" />
        <rect x="22" y="40" width="2" height="16" fill="rgba(0,0,0,0.2)" />
        <rect x="30" y="40" width="2" height="16" fill="rgba(0,0,0,0.2)" />
        <rect x="14" y="44" width="2" height="2" fill="rgba(255,255,255,0.3)" />
        <rect x="22" y="44" width="2" height="2" fill="rgba(255,255,255,0.3)" />
        <rect x="30" y="44" width="2" height="2" fill="rgba(255,255,255,0.3)" />
        <rect x="14" y="50" width="2" height="2" fill="rgba(255,255,255,0.3)" />
        <rect x="22" y="50" width="2" height="2" fill="rgba(255,255,255,0.3)" />
      </g>
    );
    case 'Denim Jacket': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#4a6fa5" />
        <rect x="8" y="40" width="32" height="4" fill="#3a5f95" />
        <rect x="22" y="40" width="4" height="16" fill="#3a5f95" />
        <rect x="10" y="44" width="6" height="4" fill="#3a5f95" />
        <rect x="32" y="44" width="6" height="4" fill="#3a5f95" />
        <rect x="10" y="50" width="28" height="2" fill="rgba(255,255,255,0.15)" />
        <rect x="22" y="46" width="4" height="2" fill="#6080b0" />
        <rect x="22" y="52" width="4" height="2" fill="#6080b0" />
      </g>
    );
    case 'Leather Jacket': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#1a1a1a" />
        <rect x="8" y="40" width="8" height="8" fill="#222" />
        <rect x="32" y="40" width="8" height="8" fill="#222" />
        <rect x="12" y="40" width="4" height="10" fill="#2d2d2d" />
        <rect x="32" y="40" width="4" height="10" fill="#2d2d2d" />
        <rect x="22" y="40" width="4" height="16" fill="#444" />
        <rect x="22" y="40" width="4" height="2" fill="#888" />
        <rect x="22" y="46" width="4" height="2" fill="#888" />
        <rect x="8" y="40" width="2" height="16" fill="rgba(255,255,255,0.08)" />
        <rect x="38" y="40" width="2" height="16" fill="rgba(255,255,255,0.08)" />
      </g>
    );
    case 'Varsity': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill={c} />
        <rect x="8" y="40" width="6" height="16" fill="#f0f0f0" />
        <rect x="34" y="40" width="6" height="16" fill="#f0f0f0" />
        <rect x="8" y="40" width="32" height="4" fill="#f0f0f0" />
        <rect x="8" y="46" width="6" height="2" fill={c} />
        <rect x="34" y="46" width="6" height="2" fill={c} />
        <rect x="20" y="44" width="2" height="6" fill="#f0f0f0" />
        <rect x="26" y="44" width="2" height="6" fill="#f0f0f0" />
        <rect x="22" y="44" width="4" height="2" fill="#f0f0f0" />
      </g>
    );
    case 'Hoodie': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill={c} />
        <rect x="18" y="40" width="12" height="2" fill="rgba(0,0,0,0.2)" />
        <rect x="20" y="42" width="8" height="2" fill="rgba(0,0,0,0.2)" />
        <rect x="14" y="48" width="20" height="6" fill="rgba(0,0,0,0.15)" />
        <rect x="22" y="48" width="4" height="6" fill="rgba(0,0,0,0.1)" />
        <rect x="20" y="40" width="2" height="4" fill="rgba(0,0,0,0.3)" />
        <rect x="26" y="40" width="2" height="4" fill="rgba(0,0,0,0.3)" />
      </g>
    );
    case 'Camo': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#4a5e35" />
        <rect x="8" y="40" width="6" height="4" fill="#3a4a28" />
        <rect x="18" y="42" width="8" height="4" fill="#6b7c45" />
        <rect x="30" y="40" width="6" height="6" fill="#3a4a28" />
        <rect x="10" y="46" width="4" height="4" fill="#6b7c45" />
        <rect x="16" y="48" width="6" height="4" fill="#3a4a28" />
        <rect x="26" y="46" width="8" height="4" fill="#6b7c45" />
        <rect x="8" y="50" width="8" height="6" fill="#3a4a28" />
        <rect x="22" y="52" width="6" height="4" fill="#6b7c45" />
        <rect x="34" y="48" width="6" height="8" fill="#3a4a28" />
        <rect x="14" y="52" width="4" height="4" fill="#4a5e35" />
      </g>
    );
    case 'Suit': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#2d2d3a" />
        <rect x="20" y="40" width="8" height="16" fill="#f5f5f5" />
        <rect x="16" y="40" width="6" height="10" fill="#2d2d3a" />
        <rect x="26" y="40" width="6" height="10" fill="#2d2d3a" />
        <rect x="18" y="40" width="2" height="8" fill="#f5f5f5" />
        <rect x="28" y="40" width="2" height="8" fill="#f5f5f5" />
        <rect x="22" y="42" width="4" height="12" fill="#8b0000" />
        <rect x="22" y="42" width="4" height="2" fill="#a00000" />
        <rect x="22" y="48" width="4" height="2" fill="#ddd" />
      </g>
    );
    case 'Blazer': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill={c} />
        <rect x="20" y="40" width="8" height="16" fill="#f5f5f5" />
        <rect x="14" y="40" width="8" height="10" fill={c} />
        <rect x="26" y="40" width="8" height="10" fill={c} />
        <rect x="18" y="40" width="2" height="8" fill="#f5f5f5" />
        <rect x="28" y="40" width="2" height="8" fill="#f5f5f5" />
        <rect x="10" y="42" width="4" height="4" fill="#f5f5f5" />
        <rect x="22" y="48" width="4" height="2" fill="rgba(255,255,255,0.4)" />
      </g>
    );
    case 'Kimono': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill={c} />
        <rect x="8" y="40" width="10" height="16" fill="rgba(0,0,0,0.2)" />
        <rect x="30" y="40" width="10" height="16" fill="rgba(0,0,0,0.2)" />
        <rect x="8" y="40" width="32" height="4" fill="rgba(255,255,255,0.15)" />
        <rect x="8" y="52" width="32" height="4" fill="rgba(255,255,255,0.2)" />
        <rect x="10" y="52" width="2" height="4" fill="rgba(0,0,0,0.2)" />
        <rect x="16" y="52" width="2" height="4" fill="rgba(0,0,0,0.2)" />
        <rect x="22" y="52" width="2" height="4" fill="rgba(0,0,0,0.2)" />
        <rect x="28" y="52" width="2" height="4" fill="rgba(0,0,0,0.2)" />
        <rect x="34" y="52" width="2" height="4" fill="rgba(0,0,0,0.2)" />
        <rect x="18" y="46" width="12" height="4" fill="rgba(255,255,200,0.4)" />
      </g>
    );
    case 'Polo': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill={c} />
        <rect x="16" y="40" width="16" height="4" fill="rgba(255,255,255,0.25)" />
        <rect x="18" y="38" width="12" height="4" fill={c} />
        <rect x="22" y="40" width="4" height="8" fill="rgba(0,0,0,0.15)" />
        <rect x="22" y="42" width="4" height="2" fill="rgba(255,255,255,0.4)" />
        <rect x="22" y="46" width="4" height="2" fill="rgba(255,255,255,0.4)" />
        <rect x="8" y="40" width="2" height="16" fill="rgba(255,255,255,0.2)" />
        <rect x="38" y="40" width="2" height="16" fill="rgba(255,255,255,0.2)" />
      </g>
    );
    case 'Zebra Print': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#f5f5f5" />
        <rect x="8" y="40" width="4" height="16" fill="#111" />
        <rect x="14" y="40" width="4" height="16" fill="#111" />
        <rect x="22" y="40" width="4" height="16" fill="#111" />
        <rect x="30" y="40" width="4" height="16" fill="#111" />
        <rect x="38" y="40" width="2" height="16" fill="#111" />
      </g>
    );
    case 'Leopard Print': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#c8922a" />
        <rect x="10" y="42" width="6" height="4" fill="#8b5e0a" opacity="0.7" />
        <rect x="12" y="40" width="2" height="2" fill="#8b5e0a" opacity="0.7" />
        <rect x="12" y="46" width="2" height="2" fill="#8b5e0a" opacity="0.7" />
        <rect x="22" y="44" width="6" height="4" fill="#8b5e0a" opacity="0.7" />
        <rect x="24" y="42" width="2" height="2" fill="#8b5e0a" opacity="0.7" />
        <rect x="24" y="48" width="2" height="2" fill="#8b5e0a" opacity="0.7" />
        <rect x="32" y="40" width="6" height="4" fill="#8b5e0a" opacity="0.7" />
        <rect x="34" y="44" width="2" height="2" fill="#8b5e0a" opacity="0.7" />
        <rect x="16" y="50" width="6" height="4" fill="#8b5e0a" opacity="0.7" />
        <rect x="18" y="48" width="2" height="2" fill="#8b5e0a" opacity="0.7" />
        <rect x="28" y="50" width="4" height="4" fill="#8b5e0a" opacity="0.7" />
      </g>
    );
    case 'Snake Skin': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#4a7a3a" />
        <rect x="8" y="40" width="4" height="4" fill="#3a6a2a" />
        <rect x="14" y="40" width="4" height="4" fill="#3a6a2a" />
        <rect x="20" y="40" width="4" height="4" fill="#3a6a2a" />
        <rect x="26" y="40" width="4" height="4" fill="#3a6a2a" />
        <rect x="32" y="40" width="4" height="4" fill="#3a6a2a" />
        <rect x="10" y="44" width="4" height="4" fill="#3a6a2a" />
        <rect x="16" y="44" width="4" height="4" fill="#3a6a2a" />
        <rect x="22" y="44" width="4" height="4" fill="#3a6a2a" />
        <rect x="28" y="44" width="4" height="4" fill="#3a6a2a" />
        <rect x="34" y="44" width="4" height="4" fill="#3a6a2a" />
        <rect x="8" y="48" width="4" height="4" fill="#3a6a2a" />
        <rect x="14" y="48" width="4" height="4" fill="#3a6a2a" />
        <rect x="20" y="48" width="4" height="4" fill="#3a6a2a" />
        <rect x="26" y="48" width="4" height="4" fill="#3a6a2a" />
        <rect x="32" y="48" width="4" height="4" fill="#3a6a2a" />
        <rect x="10" y="52" width="4" height="4" fill="#3a6a2a" />
        <rect x="16" y="52" width="4" height="4" fill="#3a6a2a" />
        <rect x="22" y="52" width="4" height="4" fill="#3a6a2a" />
        <rect x="28" y="52" width="4" height="4" fill="#3a6a2a" />
        <rect x="34" y="52" width="4" height="4" fill="#3a6a2a" />
        <rect x="10" y="40" width="2" height="2" fill="rgba(255,255,255,0.2)" />
        <rect x="16" y="40" width="2" height="2" fill="rgba(255,255,255,0.2)" />
        <rect x="22" y="40" width="2" height="2" fill="rgba(255,255,255,0.2)" />
      </g>
    );
    case 'Tie-Dye': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#ff6b6b" />
        <rect x="10" y="42" width="28" height="12" fill="#ffd93d" />
        <rect x="12" y="44" width="24" height="8" fill="#6bcb77" />
        <rect x="14" y="46" width="20" height="4" fill="#4d96ff" />
        <rect x="18" y="46" width="12" height="2" fill="#c77dff" />
        <rect x="22" y="46" width="4" height="2" fill="#ff6b6b" />
        <rect x="8" y="48" width="2" height="2" fill="#6bcb77" />
        <rect x="38" y="44" width="2" height="2" fill="#4d96ff" />
        <rect x="10" y="54" width="2" height="2" fill="#ffd93d" />
        <rect x="36" y="52" width="2" height="2" fill="#ff6b6b" />
      </g>
    );
    case 'Neon Crop': return (
      <g>
        <rect x="8" y="40" width="32" height="10" fill={c} />
        <rect x="8" y="48" width="32" height="2" fill="rgba(255,255,255,0.5)" />
        <rect x="8" y="44" width="32" height="2" fill="rgba(255,255,255,0.2)" />
        <rect x="8" y="50" width="32" height="6" fill="rgba(0,0,0,0)" />
      </g>
    );
    case 'Biker': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#111" />
        <rect x="18" y="40" width="12" height="6" fill="#222" />
        <rect x="20" y="40" width="8" height="10" fill="#111" />
        <rect x="8" y="40" width="2" height="2" fill="#aaa" />
        <rect x="12" y="40" width="2" height="2" fill="#aaa" />
        <rect x="16" y="40" width="2" height="2" fill="#aaa" />
        <rect x="30" y="40" width="2" height="2" fill="#aaa" />
        <rect x="34" y="40" width="2" height="2" fill="#aaa" />
        <rect x="38" y="40" width="2" height="2" fill="#aaa" />
        <rect x="10" y="44" width="10" height="8" fill="#222" />
        <rect x="10" y="44" width="10" height="2" fill="#555" />
        <rect x="10" y="50" width="10" height="2" fill="#555" />
        <rect x="22" y="40" width="4" height="12" fill="#333" />
        <rect x="22" y="44" width="4" height="2" fill="#777" />
      </g>
    );
    case 'Sailor': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#f5f5f5" />
        <rect x="8" y="42" width="32" height="2" fill="#1e3a6e" />
        <rect x="8" y="46" width="32" height="2" fill="#1e3a6e" />
        <rect x="8" y="50" width="32" height="2" fill="#1e3a6e" />
        <rect x="8" y="54" width="32" height="2" fill="#1e3a6e" />
        <rect x="8" y="40" width="12" height="8" fill="#1e3a6e" />
        <rect x="28" y="40" width="12" height="8" fill="#1e3a6e" />
        <rect x="8" y="40" width="32" height="4" fill="#1e3a6e" />
        <rect x="22" y="50" width="4" height="6" fill="#1e3a6e" />
        <rect x="20" y="50" width="8" height="2" fill="#1e3a6e" />
        <rect x="20" y="54" width="2" height="2" fill="#1e3a6e" />
        <rect x="26" y="54" width="2" height="2" fill="#1e3a6e" />
      </g>
    );
    case 'Space Suit': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#c8c8d4" />
        <rect x="8" y="40" width="32" height="4" fill="#a0a0b0" />
        <rect x="8" y="52" width="32" height="4" fill="#a0a0b0" />
        <rect x="10" y="44" width="8" height="8" fill="#888898" />
        <rect x="10" y="44" width="8" height="2" fill="#6a6a7a" />
        <rect x="12" y="46" width="2" height="2" fill="#44f" opacity="0.6" />
        <rect x="16" y="46" width="2" height="2" fill="#f44" opacity="0.6" />
        <rect x="12" y="48" width="6" height="2" fill="#6a6a7a" />
        <rect x="20" y="44" width="8" height="8" fill="#8898b0" />
        <rect x="22" y="46" width="4" height="4" fill="#aabbcc" />
        <rect x="30" y="44" width="8" height="8" fill="#888898" />
        <rect x="30" y="46" width="8" height="2" fill="#6a6a7a" />
        <rect x="8" y="40" width="2" height="16" fill="#8888a0" />
        <rect x="38" y="40" width="2" height="16" fill="#8888a0" />
      </g>
    );
    case 'Grim Reaper': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#111118" />
        <rect x="14" y="40" width="20" height="16" fill="#1a0030" />
        <rect x="14" y="40" width="4" height="16" fill="#0d001a" />
        <rect x="30" y="40" width="4" height="16" fill="#0d001a" />
        <rect x="22" y="40" width="4" height="16" fill="#0d001a" />
        <rect x="20" y="44" width="8" height="6" fill="#ddd" />
        <rect x="20" y="42" width="8" height="2" fill="#ddd" />
        <rect x="20" y="50" width="2" height="2" fill="#ddd" />
        <rect x="26" y="50" width="2" height="2" fill="#ddd" />
        <rect x="22" y="50" width="4" height="2" fill="#111118" />
        <rect x="20" y="44" width="2" height="2" fill="#111118" />
        <rect x="26" y="44" width="2" height="2" fill="#111118" />
        <rect x="8" y="54" width="32" height="2" fill="#4b0082" opacity="0.6" />
      </g>
    );
    case 'Golden Armor': return (
      <g>
        <rect x="8" y="40" width="32" height="16" fill="#b8860b" />
        <rect x="12" y="40" width="24" height="16" fill="#daa520" />
        <rect x="12" y="46" width="24" height="2" fill="#b8860b" />
        <rect x="12" y="52" width="24" height="2" fill="#b8860b" />
        <rect x="22" y="40" width="4" height="16" fill="#b8860b" />
        <rect x="8" y="40" width="6" height="8" fill="#daa520" />
        <rect x="34" y="40" width="6" height="8" fill="#daa520" />
        <rect x="8" y="46" width="6" height="2" fill="#b8860b" />
        <rect x="34" y="46" width="6" height="2" fill="#b8860b" />
        <rect x="14" y="40" width="4" height="6" fill="#ffd700" opacity="0.5" />
        <rect x="26" y="40" width="4" height="6" fill="#ffd700" opacity="0.5" />
        <rect x="8" y="40" width="2" height="16" fill="rgba(255,215,0,0.3)" />
        <rect x="22" y="42" width="4" height="4" fill="#00bcd4" />
      </g>
    );
    case 'Black Tie': return (
      <g>
        <path d={TORSO_PATH} fill="#15151c" />
        <path d="M12 39 L21 41.5 L20.4 49 L13.6 45 Z" fill="#24242e" />
        <path d="M36 39 L27 41.5 L27.6 49 L34.4 45 Z" fill="#24242e" />
        <path d="M20.6 41 L27.4 41 L26 53 L24 54 L22 53 Z" fill="#f2efe6" />
        <path d="M21 41 L24 42.6 L21 44 Z" fill="#0a0a10" />
        <path d="M27 41 L24 42.6 L27 44 Z" fill="#0a0a10" />
        <rect x="23.3" y="41.6" width="1.4" height="1.7" rx="0.3" fill="#000000" />
        <rect x="23.6" y="47" width="0.9" height="0.9" rx="0.3" fill="#0a0a10" />
        <rect x="23.6" y="50" width="0.9" height="0.9" rx="0.3" fill="#0a0a10" />
        <rect x="13.6" y="45.4" width="2.4" height="1.4" fill="#f2efe6" />
      </g>
    );
    case 'Pinstripe Suit': return (
      <g>
        <path d={TORSO_PATH} fill="#20222e" />
        <rect x="11" y="40" width="0.5" height="16" fill="rgba(255,255,255,0.16)" />
        <rect x="15" y="40" width="0.5" height="16" fill="rgba(255,255,255,0.16)" />
        <rect x="19" y="40" width="0.5" height="16" fill="rgba(255,255,255,0.16)" />
        <rect x="29" y="40" width="0.5" height="16" fill="rgba(255,255,255,0.16)" />
        <rect x="33" y="40" width="0.5" height="16" fill="rgba(255,255,255,0.16)" />
        <rect x="37" y="40" width="0.5" height="16" fill="rgba(255,255,255,0.16)" />
        <path d="M11.5 39 L21 42 L20.2 50 L13 45.5 Z" fill="#2a2c3a" />
        <path d="M36.5 39 L27 42 L27.8 50 L35 45.5 Z" fill="#2a2c3a" />
        <path d="M20.8 41.5 L27.2 41.5 L26 53 L24 53.8 L22 53 Z" fill="#15151c" />
        <rect x="23" y="42" width="2" height="11.5" fill="#a83040" />
        <rect x="22.7" y="42" width="2.6" height="1.8" rx="0.4" fill="#bf3a4a" />
        <path d="M13 45.6 L16 45 L14.8 47.2 Z" fill="#a83040" />
      </g>
    );
    case 'High Roller': return (
      <g>
        <path d={TORSO_PATH} fill="#a9803f" />
        <path d="M19.5 40.2 L28.5 40.2 L27 56 L21 56 Z" fill="#14141a" />
        <path d="M12 39 L20 41.5 L18.8 48 L13 44 Z" fill="#b88f4e" />
        <path d="M36 39 L28 41.5 L29.2 48 L35 44 Z" fill="#b88f4e" />
        <path d="M20.8 43 Q24 46.4 27.2 43" fill="none" stroke="#f0c24a" strokeWidth="1" strokeLinecap="round" />
        <path d="M20.2 45 Q24 49 27.8 45" fill="none" stroke="#e6b53e" strokeWidth="0.8" strokeLinecap="round" />
        <circle cx="24" cy="49" r="1.3" fill="#f7d35a" />
        <circle cx="24" cy="49" r="0.6" fill="#b8860b" />
        <circle cx="23.3" cy="43.5" r="0.45" fill="rgba(255,255,255,0.85)" />
        <circle cx="24" cy="47.6" r="0.45" fill="rgba(255,255,255,0.85)" />
      </g>
    );
    case 'Smoking Jacket': return (
      <g>
        <path d={TORSO_PATH} fill="#4a1226" />
        <rect x="14" y="41" width="1" height="14" fill="rgba(255,255,255,0.05)" />
        <rect x="19" y="41" width="1" height="14" fill="rgba(255,255,255,0.05)" />
        <rect x="29" y="41" width="1" height="14" fill="rgba(255,255,255,0.05)" />
        <rect x="34" y="41" width="1" height="14" fill="rgba(255,255,255,0.05)" />
        <path d="M13 45 Q14 39 20 40.6 L24 42.2 L28 40.6 Q34 39 35 45 L33 45.6 Q28 41.8 24 43.2 Q20 41.8 15 45.6 Z" fill="#6a2038" />
        <path d="M22.4 42.6 L24 49 L25.6 42.6 Z" fill="#1a0a12" />
        <rect x="9" y="50.5" width="30" height="2" fill="#33091a" />
        <rect x="22.5" y="50.3" width="3" height="2.4" rx="0.4" fill="#5a1830" />
        <rect x="23.4" y="52.7" width="0.5" height="2.3" fill="#5a1830" />
        <rect x="24.6" y="52.7" width="0.5" height="2.3" fill="#5a1830" />
      </g>
    );
    case 'Royal': return (
      <g>
        <path d={TORSO_PATH} fill="#3a1d6e" />
        <rect x="14" y="42" width="1" height="14" fill="rgba(255,255,255,0.06)" />
        <rect x="20" y="42" width="1" height="14" fill="rgba(255,255,255,0.06)" />
        <rect x="28" y="42" width="1" height="14" fill="rgba(255,255,255,0.06)" />
        <rect x="34" y="42" width="1" height="14" fill="rgba(255,255,255,0.06)" />
        <path d="M10.5 38.6 Q24 42 37.5 38.6 L36.5 43.6 Q24 46.4 11.5 43.6 Z" fill="#f0ece2" />
        <rect x="13" y="40.4" width="0.9" height="1.1" rx="0.3" fill="rgba(60,50,40,0.5)" />
        <rect x="16" y="40.4" width="0.9" height="1.1" rx="0.3" fill="rgba(60,50,40,0.5)" />
        <rect x="19" y="40.4" width="0.9" height="1.1" rx="0.3" fill="rgba(60,50,40,0.5)" />
        <rect x="29" y="40.4" width="0.9" height="1.1" rx="0.3" fill="rgba(60,50,40,0.5)" />
        <rect x="32" y="40.4" width="0.9" height="1.1" rx="0.3" fill="rgba(60,50,40,0.5)" />
        <rect x="35" y="40.4" width="0.9" height="1.1" rx="0.3" fill="rgba(60,50,40,0.5)" />
        <circle cx="24" cy="42.5" r="1.5" fill="#f0c24a" />
        <circle cx="24" cy="42.5" r="0.7" fill="#b8860b" />
        <circle cx="23.5" cy="42" r="0.45" fill="rgba(255,255,255,0.85)" />
      </g>
    );
    case 'Iced Out': return (
      <g>
        <path d={TORSO_PATH} fill="#14141b" />
        <path d="M12 39 L20.5 41.4 L20 47 L13 44 Z" fill="#1c1c26" />
        <path d="M36 39 L27.5 41.4 L28 47 L35 44 Z" fill="#1c1c26" />
        <rect x="18" y="44" width="1.3" height="1.3" rx="0.2" fill="#bff0ff" transform="rotate(45 18.65 44.65)" />
        <rect x="20.5" y="44" width="1.3" height="1.3" rx="0.2" fill="#bff0ff" transform="rotate(45 21.15 44.65)" />
        <rect x="23" y="44" width="1.3" height="1.3" rx="0.2" fill="#bff0ff" transform="rotate(45 23.65 44.65)" />
        <rect x="25.5" y="44" width="1.3" height="1.3" rx="0.2" fill="#bff0ff" transform="rotate(45 26.15 44.65)" />
        <rect x="28" y="44" width="1.3" height="1.3" rx="0.2" fill="#bff0ff" transform="rotate(45 28.65 44.65)" />
        <rect x="22.8" y="48" width="2.4" height="2.4" rx="0.3" fill="#cfefff" transform="rotate(45 24 49.2)" />
        <rect x="23.4" y="48.6" width="1.2" height="1.2" fill="#ffffff" transform="rotate(45 24 49.2)" />
        <circle cx="19" cy="44.3" r="0.45" fill="rgba(255,255,255,0.85)" />
        <circle cx="24" cy="44" r="0.45" fill="rgba(255,255,255,0.85)" />
        <circle cx="29" cy="44.3" r="0.45" fill="rgba(255,255,255,0.85)" />
      </g>
    );
    case 'Dealer': return (
      <g>
        <path d={TORSO_PATH} fill="#f1eee6" />
        <path d="M11 40 L21 42.4 L21 56 L11 56 Z" fill="#16161d" />
        <path d="M37 40 L27 42.4 L27 56 L37 56 Z" fill="#16161d" />
        <path d="M21 41 L24 42.6 L21 44 Z" fill="#0a0a10" />
        <path d="M27 41 L24 42.6 L27 44 Z" fill="#0a0a10" />
        <rect x="23.3" y="41.6" width="1.4" height="1.7" rx="0.3" fill="#000000" />
        <rect x="23.6" y="46" width="0.8" height="0.8" rx="0.3" fill="#ffffff" />
        <rect x="23.6" y="49" width="0.8" height="0.8" rx="0.3" fill="#ffffff" />
        <rect x="9.4" y="44" width="1.6" height="3.2" rx="0.4" fill="#b03040" />
      </g>
    );
    case 'Tech Mogul': return (
      <g>
        <path d={TORSO_PATH} fill="#34343e" />
        <rect x="20" y="33" width="8" height="8" rx="2.4" fill="#17171c" />
        <path d="M20.6 40.5 L20.6 56 L27.4 56 L27.4 40.5 Z" fill="#1b1b20" />
        <path d="M12 39.2 L20.5 41.4 L20.5 56 L11 56 Z" fill="#3a3a45" />
        <path d="M36 39.2 L27.5 41.4 L27.5 56 L37 56 Z" fill="#3a3a45" />
      </g>
    );
    case 'Bomber': return (
      <g>
        <path d={TORSO_PATH} fill="#2a3128" />
        <path d="M11 39 Q24 41.6 37 39 L37 41 Q24 43.8 11 41 Z" fill="#1c2118" />
        <path d="M22 41 L21 44 L23.6 44 Z" fill="#e0742a" />
        <rect x="23.6" y="41" width="0.8" height="14" fill="#0d0d0d" />
        <rect x="23.2" y="41" width="1.6" height="1.6" rx="0.3" fill="#9a9a9a" />
        <rect x="8" y="53.4" width="32" height="2.6" fill="#1c2118" />
        <circle cx="14.5" cy="46.5" r="1.7" fill="#b03030" />
        <circle cx="14.5" cy="46.5" r="1.7" fill="none" stroke="#e0c060" strokeWidth="0.3" />
      </g>
    );
    default: return (
      <g>
        <path
          d="M 8 56 L 8 40.35 Q 8.85 38.95 10.85 38.62 Q 12.9 38.45 14.5 38.55 L 19.5 39.95 L 20.2 40.35 Q 24 41.15 27.8 40.35 L 28.5 39.95 L 33.5 38.55 Q 35.1 38.45 37.15 38.62 Q 39.15 38.95 40 40.35 L 40 56 Q 24 55.4 8 56 Z"
          fill={c}
        />
        <path
          d="M 8.6 41.2 L 8.6 55.2 Q 24 54.65 39.4 55.2 L 39.4 41.2 Q 37.35 39.35 33.2 39.35 L 28.4 40.65 Q 24 41.35 19.6 40.65 L 14.8 39.35 Q 10.65 39.35 8.6 41.2 Z"
          fill="rgba(255,255,255,0.06)"
        />
        <path
          d="M 19.2 40.5 Q 24 41.45 28.8 40.5"
          fill="none"
          stroke="rgba(0,0,0,0.14)"
          strokeWidth="0.35"
          strokeLinecap="round"
        />
        <rect x="8" y="53.5" width="32" height="2.35" rx={0.45} fill="rgba(0,0,0,0.1)" />
        <rect x="22.5" y="44.5" width="3.2" height="7.5" rx={0.35} fill="rgba(0,0,0,0.06)" />
        <rect x="10.2" y="44" width="3.6" height="9.5" rx={0.4} fill="rgba(255,255,255,0.05)" />
        <rect x="34.2" y="44" width="3.6" height="9.5" rx={0.4} fill="rgba(0,0,0,0.05)" />
      </g>
    );
  }
}
