'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true when the viewport is a phone in landscape orientation —
 * i.e. wider than tall AND short enough that the desktop poker layout
 * does not fit.
 *
 * Why this exists: Tailwind's width-only `sm:` breakpoint (640px) treats
 * landscape phones like iPhone Pro (844×390) as "desktop" and renders the
 * full chrome (promo banner, stats column, activity rail, slider strip).
 * On a real phone this is unplayable. This hook flags those viewports so
 * components can swap to a simplified mobile layout.
 *
 * Defaults:
 *   - landscape: innerWidth > innerHeight
 *   - shortHeight: innerHeight <= 600
 *
 * The 600px threshold matches the `(orientation: landscape) and (max-height: 600px)`
 * media query in globals.css; keeping these aligned ensures the React render path
 * (compact bar) and the CSS layout (fixed positioning + table reservation) agree on
 * which viewports are "mobile landscape". When they drift apart, taller landscape
 * phones get the desktop bar pinned to the bottom edge, eating ~1/4 of the screen.
 *
 * `maxHeight` can be overridden if a particular surface needs a different cut-off.
 *
 * SSR-safe: returns `false` until mounted to avoid hydration mismatches.
 */
export function useIsMobileLandscape(maxHeight = 600): boolean {
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const evaluate = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsMobileLandscape(w > h && h <= maxHeight);
    };

    evaluate();

    window.addEventListener('resize', evaluate);
    window.addEventListener('orientationchange', evaluate);

    return () => {
      window.removeEventListener('resize', evaluate);
      window.removeEventListener('orientationchange', evaluate);
    };
  }, [maxHeight]);

  return isMobileLandscape;
}
