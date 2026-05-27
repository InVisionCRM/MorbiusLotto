'use client';

import { useEffect, useState } from 'react';

// Reference dimensions the poker table renders at before scaling.
// Seat positions, nudges, and chip sizes are all computed for this size.
// The CSS scale shrinks the whole table uniformly to fit mobile landscape.
export const POKER_TABLE_REF_W = 1300;
export const POKER_TABLE_REF_H = 570;

// Approximate heights of the header and bottom bar on mobile landscape.
// The header collapses to ~40px in landscape via the globals.css "Poker landscape"
// rules. The bottom bar varies in height (the default variant renders the marquee,
// quick-size row, pre-actions, commit buttons, and raise/slider — easily 150–180px).
// Default to 170 so the scaled table never extends behind the fixed bar; the actual
// measured height (set by PokerBottomBar.tsx into `--poker-bottom-reserve`) is read
// at compute time when present.
const MOBILE_HEADER_H = 40;
const MOBILE_BOTTOM_FALLBACK_H = 170;

function readMeasuredBottomReserve(): number {
  const shell = document.querySelector('[data-poker-shell]') as HTMLElement | null;
  if (!shell) return 0;
  const raw = getComputedStyle(shell).getPropertyValue('--poker-bottom-reserve').trim();
  if (!raw) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

interface PokerMobileLayout {
  /** True when on a mobile portrait viewport — show "rotate your device" overlay. */
  isPortraitMobile: boolean;
  /** Scale factor to apply to the poker table container. 1.0 on desktop. */
  tableScale: number;
}

export function usePokerMobileZoomLock(): PokerMobileLayout {
  const [layout, setLayout] = useState<PokerMobileLayout>({ isPortraitMobile: false, tableScale: 1 });

  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    const originalContent = viewport?.getAttribute('content') ?? '';

    const setViewportMeta = (mobile: boolean) => {
      if (!viewport) return;
      if (mobile) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      } else {
        viewport.setAttribute('content', originalContent || 'width=device-width, initial-scale=1');
      }
    };

    const compute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Treat as mobile when width < 1024 OR device reports touch capability
      const isMobile = w < 1024 || ('ontouchstart' in window && w < 1280);
      const isPortrait = h > w;

      setViewportMeta(isMobile);

      if (!isMobile) {
        setLayout({ isPortraitMobile: false, tableScale: 1 });
        return;
      }
      if (isPortrait) {
        setLayout({ isPortraitMobile: true, tableScale: 1 });
        return;
      }
      // Landscape mobile: compute uniform scale to fit the reference table.
      // Prefer the live measured bar height so the scaled table never extends
      // behind the fixed bar (otherwise the felt is clipped or the bar overlays it).
      const bottomH = readMeasuredBottomReserve() || MOBILE_BOTTOM_FALLBACK_H;
      const availH = h - MOBILE_HEADER_H - bottomH;
      const scale = Math.min(w / POKER_TABLE_REF_W, availH / POKER_TABLE_REF_H, 1);
      setLayout({ isPortraitMobile: false, tableScale: Math.max(0.35, scale) });
    };

    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);

    // The bottom bar's height isn't known until after PokerBottomBar mounts and
    // measures itself. Re-run compute whenever the shell's CSS var changes so
    // the scaled table tracks the actual bar height.
    const shell = document.querySelector('[data-poker-shell]') as HTMLElement | null;
    let mo: MutationObserver | null = null;
    if (shell) {
      mo = new MutationObserver(compute);
      mo.observe(shell, { attributes: true, attributeFilter: ['style'] });
    }

    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
      mo?.disconnect();
      if (viewport) viewport.setAttribute('content', originalContent || 'width=device-width, initial-scale=1');
    };
  }, []);

  return layout;
}
