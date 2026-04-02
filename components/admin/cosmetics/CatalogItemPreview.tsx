'use client';

import React, { useEffect, useState } from 'react';
import { Paintbrush } from 'lucide-react';
import { parseGradient, gradientDefToCssLinearBackground } from '@/lib/gradient-utils';
import type { ItemRow } from '@/components/admin/cosmetics/types';

/** Strip CSS `url("...")` wrappers (same idea as SVG `<image href>`). */
function normalizeCatalogRasterUrl(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  if (/^url\s*\(/i.test(s) && s.endsWith(')')) {
    s = s.slice(s.indexOf('(') + 1, -1).trim();
    if (
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))
    ) {
      s = s.slice(1, -1);
    }
  }
  return s.trim();
}

/** Solid fill for swatch: #RGB, #RRGGBB, #RRGGBBAA, or rgb()/rgba(). */
function unlockSolidCss(value: string): string | null {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/i.test(v)) return v;
  if (/^#[0-9a-fA-F]{8}$/i.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/i.test(v)) {
    const [, x] = v.match(/^#([0-9a-fA-F]{3})$/i)!;
    return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`.toLowerCase();
  }
  if (/^rgba?\(/i.test(v)) return v;
  return null;
}

/**
 * Catalog card preview — supports colors, gradients, patterns, and raster URLs.
 */
export function CatalogItemPreview({ item, size = 'sm' }: { item: ItemRow; size?: 'sm' | 'md' | 'lg' }) {
  const v = item.unlocks[0]?.value ?? '';
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [v]);

  const dimClass =
    size === 'lg'
      ? 'w-[min(100%,7.5rem)] h-24 rounded-xl'
      : size === 'md'
        ? 'w-12 h-12 rounded-xl'
        : 'w-5 h-5 rounded';

  const solid = unlockSolidCss(v);
  if (solid) {
    return (
      <div className={`${dimClass} shrink-0 ring-1 ring-white/10`} style={{ backgroundColor: solid }} />
    );
  }

  const grad = parseGradient(v);
  if (grad) {
    return (
      <div
        className={`${dimClass} shrink-0 ring-1 ring-white/10`}
        style={{ backgroundImage: gradientDefToCssLinearBackground(grad) }}
      />
    );
  }

  const patternMatch = /^\s*url\s*\(\s*#([^)]+)\)\s*$/i.exec(v);
  if (patternMatch || /^\s*url\s*\(\s*#/i.test(v)) {
    const name = patternMatch?.[1] ?? v.replace(/^[\s\S]*?#\s*/i, '').replace(/\)\s*$/, '').trim();
    return (
      <div
        className={`${dimClass} shrink-0 ring-1 ring-violet-500/35 bg-gradient-to-br from-violet-950/90 to-zinc-900 flex flex-col items-center justify-center gap-0.5 px-1 overflow-hidden`}
        title={`Pattern: ${name}`}
      >
        <Paintbrush size={size === 'lg' ? 20 : 12} className="text-violet-300/85 shrink-0" />
        {size === 'lg' && (
          <span className="text-[8px] text-violet-200/80 font-mono truncate max-w-full leading-tight">{name}</span>
        )}
      </div>
    );
  }

  const raster = v && !v.startsWith('{') ? normalizeCatalogRasterUrl(v) : '';
  const rasterOk =
    raster &&
    !raster.startsWith('url(') &&
    (raster.startsWith('data:') ||
      raster.startsWith('http://') ||
      raster.startsWith('https://') ||
      raster.startsWith('/'));

  if (rasterOk && !imgFailed) {
    return (
      <img
        src={raster}
        alt=""
        className={`${dimClass} shrink-0 object-cover ring-1 ring-white/10 bg-zinc-800`}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${dimClass} shrink-0 bg-zinc-700 ring-1 ring-white/10 flex items-center justify-center`}
      title={v ? `${item.displayName} — non-color unlock (e.g. style name)` : 'No unlock value'}
    >
      <span
        className={`${size === 'sm' ? 'text-[8px]' : 'text-[10px]'} text-zinc-400 font-bold leading-none text-center px-0.5 line-clamp-2`}
      >
        {item.displayName.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}
