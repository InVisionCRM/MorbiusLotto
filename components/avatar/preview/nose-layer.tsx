import React from 'react';

export function renderNoseLayer() {
  return (
    <g>
      <rect x="22.15" y="28.05" width="3.7" height="1.85" rx={0.65} fill="rgba(0,0,0,0.12)" />
      <rect x="22.35" y="28.18" width="1.65" height="0.55" rx={0.2} fill="rgba(255,255,255,0.1)" />
      <ellipse cx="22.78" cy="29.02" rx="0.32" ry="0.26" fill="rgba(0,0,0,0.2)" />
      <ellipse cx="25.22" cy="29.02" rx="0.32" ry="0.26" fill="rgba(0,0,0,0.2)" />
      <path d="M 23.65 27.72 Q 24 27.38 24.35 27.72" fill="none" stroke="rgba(0,0,0,0.14)" strokeWidth="0.12" strokeLinecap="round" />
    </g>
  );
}
