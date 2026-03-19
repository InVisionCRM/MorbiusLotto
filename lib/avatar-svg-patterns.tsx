import React from 'react';

/**
 * Shared SVG pattern/gradient definitions used by the avatar system.
 * Renders the seven decorative fill patterns plus the rainbow gradient.
 *
 * @param prefix - Optional ID prefix for per-instance scoping (avoids SVG ID collisions)
 */
export function AvatarPatternDefs({ prefix = '' }: { prefix?: string }) {
  return (
    <>
      <pattern id={`${prefix}tiger`} patternUnits="userSpaceOnUse" width="4" height="4">
        <rect width="4" height="4" fill="#f97316" /><rect x="0" y="1" width="2" height="1" fill="#000" /><rect x="2" y="3" width="2" height="1" fill="#000" />
      </pattern>
      <pattern id={`${prefix}zebra`} patternUnits="userSpaceOnUse" width="4" height="4">
        <rect width="4" height="4" fill="#fff" /><rect x="0" y="0" width="1" height="4" fill="#000" /><rect x="2" y="0" width="1" height="4" fill="#000" />
      </pattern>
      <pattern id={`${prefix}leopard`} patternUnits="userSpaceOnUse" width="4" height="4">
        <rect width="4" height="4" fill="#facc15" /><rect x="0" y="0" width="1" height="1" fill="#78350f" /><rect x="2" y="2" width="1" height="1" fill="#78350f" />
      </pattern>
      <pattern id={`${prefix}camo`} patternUnits="userSpaceOnUse" width="4" height="4">
        <rect width="4" height="4" fill="#4d7c0f" /><rect x="0" y="0" width="2" height="1" fill="#14532d" /><rect x="2" y="2" width="2" height="1" fill="#78350f" /><rect x="1" y="3" width="2" height="1" fill="#14532d" />
      </pattern>
      <linearGradient id={`${prefix}rainbow`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ef4444" /><stop offset="20%" stopColor="#f97316" /><stop offset="40%" stopColor="#eab308" /><stop offset="60%" stopColor="#22c55e" /><stop offset="80%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#a855f7" />
      </linearGradient>
      <pattern id={`${prefix}galaxy`} patternUnits="userSpaceOnUse" width="4" height="4">
        <rect width="4" height="4" fill="#0f172a" /><rect x="1" y="0" width="1" height="1" fill="#fff" /><rect x="3" y="2" width="1" height="1" fill="#c084fc" /><rect x="0" y="3" width="1" height="1" fill="#38bdf8" />
      </pattern>
      <pattern id={`${prefix}checkerboard`} patternUnits="userSpaceOnUse" width="2" height="2">
        <rect width="2" height="2" fill="#fff" /><rect x="0" y="0" width="1" height="1" fill="#000" /><rect x="1" y="1" width="1" height="1" fill="#000" />
      </pattern>
    </>
  );
}
