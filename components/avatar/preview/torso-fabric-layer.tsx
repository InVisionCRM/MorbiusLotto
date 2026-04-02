import React from 'react';

/** Torso / neck seam shading — applies to every shirt style uniformly. */
export function TorsoFabricLayer() {
  return (
    <g pointerEvents="none">
      <rect x="8.1" y="41.35" width="0.32" height="11.05" rx={0.05} fill="rgba(0,0,0,0.048)" />
      <rect x="39.58" y="41.35" width="0.32" height="11.05" rx={0.05} fill="rgba(0,0,0,0.078)" />
      {/* Neck seam: slight center dip matches Default shirt crew; still reads ok on flat y=40 shirts */}
      <path d="M 10.2 40.42 Q 24 41.05 37.8 40.42" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.26" strokeLinecap="round" />
      <rect x="10.5" y="54.45" width="27" height="0.3" rx={0.1} fill="rgba(0,0,0,0.06)" />
    </g>
  );
}
