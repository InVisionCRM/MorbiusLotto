'use client';

import React from 'react';
import { AvatarPatternDefs } from '@/lib/avatar-svg-patterns';

const URL_FILL = /^url\(#([\w-]+)\)$/;

/**
 * Picker swatch: solid/gradient strings pass through; `url(#id)` embeds defs in this SVG
 * so patterns resolve reliably (no sibling 0×0 sprite SVG).
 */
export function ColorSwatch({ value }: { value: string }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const m = URL_FILL.exec(value.trim());

  if (m) {
    const frag = m[1];
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
        <defs>
          <AvatarPatternDefs prefix={uid} />
        </defs>
        <rect width="100" height="100" fill={`url(#${uid}${frag})`} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
      <rect width="100" height="100" fill={value} />
    </svg>
  );
}
