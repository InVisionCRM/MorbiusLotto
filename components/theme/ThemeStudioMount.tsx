'use client';

/**
 * Gates the Theme Studio and keeps it out of the normal client bundle.
 *
 * Enabled in local dev automatically, and on any deploy (preview included) by
 * visiting with `?theme-studio=1` — the flag sticks for the rest of the tab so
 * you can navigate around the app while editing. `?theme-studio=0` clears it.
 */

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const ThemeStudio = dynamic(() => import('./ThemeStudio'), { ssr: false });

const ENABLE_KEY = 'morblotto:theme-studio:enabled';

export default function ThemeStudioMount() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let on = process.env.NODE_ENV === 'development';
    try {
      const param = new URLSearchParams(window.location.search).get('theme-studio');
      if (param === '1') {
        window.sessionStorage.setItem(ENABLE_KEY, '1');
        on = true;
      } else if (param === '0') {
        window.sessionStorage.removeItem(ENABLE_KEY);
        on = false;
      } else if (window.sessionStorage.getItem(ENABLE_KEY) === '1') {
        on = true;
      }
    } catch {
      // Storage unavailable (private mode, embedded webview) — fall back to the
      // NODE_ENV default rather than breaking the page.
    }
    setEnabled(on);
  }, []);

  return enabled ? <ThemeStudio /> : null;
}
