'use client';

import { useEffect, useState } from 'react';

// Reference dimensions the poker table renders at before scaling.
// Seat positions, nudges, and chip sizes are all computed for this size.
// The CSS scale shrinks the whole table uniformly to fit mobile landscape.
export const POKER_TABLE_REF_W = 1032;
export const POKER_TABLE_REF_H = 576;

// Approximate heights of the header and bottom bar on mobile landscape
// (the CSS in globals.css compacts the header to ~40px and the bottom bar
// collapses to ~80px in landscape via max-height: 52px + padding).
const MOBILE_HEADER_H = 40;
const MOBILE_BOTTOM_H = 80;

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
      // Landscape mobile: compute uniform scale to fit the reference table
      const availH = h - MOBILE_HEADER_H - MOBILE_BOTTOM_H;
      const scale = Math.min(w / POKER_TABLE_REF_W, availH / POKER_TABLE_REF_H, 1);
      setLayout({ isPortraitMobile: false, tableScale: Math.max(0.35, scale) });
    };

    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);

    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
      if (viewport) viewport.setAttribute('content', originalContent || 'width=device-width, initial-scale=1');
    };
  }, []);

  return layout;
}
