'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

/** Chromium install prompt (not in lib.dom.d.ts everywhere). */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type PwaInstallPromptContextValue = {
  deferredPrompt: BeforeInstallPromptEvent | null;
  clearDeferredPrompt: () => void;
};

const PwaInstallPromptContext = createContext<PwaInstallPromptContextValue | null>(
  null,
);

/**
 * Captures `beforeinstallprompt` app-wide with `preventDefault()` so the browser
 * mini-infobar is suppressed and we can show a home-page install UI instead.
 * Must wrap the tree that includes pages where install should be offered.
 */
export function PwaInstallPromptProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  const clearDeferredPrompt = useCallback(() => {
    setDeferredPrompt(null);
  }, []);

  const value = useMemo(
    () => ({ deferredPrompt, clearDeferredPrompt }),
    [deferredPrompt, clearDeferredPrompt],
  );

  return (
    <PwaInstallPromptContext.Provider value={value}>
      {children}
    </PwaInstallPromptContext.Provider>
  );
}

export function usePwaInstallPrompt() {
  const ctx = useContext(PwaInstallPromptContext);
  if (!ctx) {
    throw new Error('usePwaInstallPrompt must be used within PwaInstallPromptProvider');
  }
  return ctx;
}
