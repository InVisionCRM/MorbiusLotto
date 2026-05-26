'use client';

import { useEffect, useState } from 'react';
import type { WalletActionPhase } from '@/components/auth/WalletActionPrompt';

/**
 * Tracks tab visibility while a wallet signature is pending so we can tell the
 * user to open their wallet app, then return to the browser tab.
 */
export function useWalletHandoffPhase(active: boolean): WalletActionPhase {
  const [pageHiddenDuringAction, setPageHiddenDuringAction] = useState(false);
  const [docHidden, setDocHidden] = useState(false);

  useEffect(() => {
    if (!active) {
      setPageHiddenDuringAction(false);
      setDocHidden(false);
      return;
    }
    const onVisibility = () => {
      const hidden = document.hidden;
      setDocHidden(hidden);
      if (hidden) setPageHiddenDuringAction(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [active]);

  if (!active) return 'open-wallet';
  if (pageHiddenDuringAction && !docHidden) return 'return-here';
  return 'open-wallet';
}
