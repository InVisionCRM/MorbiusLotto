'use client';

import { useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useWalletDetection } from '@/hooks/use-wallet-detection';

/**
 * True when the connected wallet on mobile likely requires leaving the browser
 * (WalletConnect deep link, etc.). Injected MetaMask in-app browser returns false.
 */
export function useMobileWalletHandoff(): boolean {
  const { isMobile, isWalletConnect } = useWalletDetection();
  const { connector } = useAccount();

  return useMemo(() => {
    const connectorId = connector?.id?.toLowerCase() ?? '';
    const isInjectedMobile =
      connectorId.includes('injected') || connectorId.includes('metamask');
    return isMobile && (isWalletConnect || !isInjectedMobile);
  }, [connector?.id, isMobile, isWalletConnect]);
}
