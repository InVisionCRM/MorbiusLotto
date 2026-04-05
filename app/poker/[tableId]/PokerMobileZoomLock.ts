'use client';

import { useEffect } from 'react';

// LANDSCAPE NOTE: This hook handles zoom prevention only. Do NOT add
// orientation-lock logic here (e.g. screen.orientation.lock) — landscape
// support is handled purely via CSS in globals.css. Adding JS orientation
// control would conflict with the CSS-only approach and break on iOS.
export function usePokerMobileZoomLock() {
  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    const originalContent = viewport?.getAttribute('content') ?? '';
    const setViewport = (mobile: boolean) => {
      if (!viewport) return;
      if (mobile) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      } else {
        viewport.setAttribute('content', originalContent || 'width=device-width, initial-scale=1');
      }
    };
    const check = () => setViewport(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('resize', check);
      if (viewport) viewport.setAttribute('content', originalContent || 'width=device-width, initial-scale=1');
    };
  }, []);
}
