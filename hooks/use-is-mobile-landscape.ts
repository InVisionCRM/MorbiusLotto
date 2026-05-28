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
 * Defaults match the redesign spec:
 *   - landscape: innerWidth > innerHeight
 *   - shortHeight: innerHeight <= 500
 *
 * `maxHeight` can be overridden if a particular surface needs a different
 * cut-off (e.g. allow up to 600px for layouts that tolerate more vertical
 * room).
 *
 * SSR-safe: returns `false` until mounted to avoid hydration mismatches.
 */
export function useIsMobileLandscape(maxHeight = 500): boolean {
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
