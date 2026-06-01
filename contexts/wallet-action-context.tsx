'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMobileWalletHandoff } from '@/hooks/use-mobile-wallet-handoff';
import { useWalletHandoffPhase } from '@/hooks/use-wallet-handoff-phase';
import {
  WalletActionPrompt,
  type WalletActionPhase,
  type WalletActionVariant,
} from '@/components/auth/WalletActionPrompt';

export interface WalletActionOptions {
  /** Picks the copy shown in the overlay. Defaults to 'transaction'. */
  variant?: WalletActionVariant;
  /** Optional eyebrow title (e.g. "Tournament buy-in"). */
  title?: string;
}

export interface WalletActionContextValue {
  /**
   * True on mobile when the connected wallet signs in a *separate app*
   * (WalletConnect / deep-link). Extension + injected mobile wallets are false.
   * Use this to decide whether extra "open your wallet" guidance is worthwhile.
   */
  mobileHandoff: boolean;
  /**
   * Show the "check your wallet app" overlay. No-op visual effect on desktop /
   * injected wallets (the request surfaces in-page there). Ref-counted, so
   * overlapping actions keep the overlay up until the last one ends.
   */
  begin: (opts?: WalletActionOptions) => void;
  /** Hide the overlay (decrement the ref count). */
  end: () => void;
  /** Switch the overlay to the "processing / waiting for network" state. */
  markFinishing: () => void;
  /**
   * Wrap a signing / transaction promise: shows the overlay while it is pending
   * (mobile only) and hides it when the promise settles. Returns the promise's
   * value so call sites read like a normal `await`.
   *
   *   const hash = await run(() => writeContractAsync(cfg), { variant: 'transaction' })
   */
  run: <T>(action: () => Promise<T>, opts?: WalletActionOptions) => Promise<T>;
}

const WalletActionContext = createContext<WalletActionContextValue | null>(null);

/**
 * Single owner of the mobile "open your wallet app" overlay. Mounting this once
 * near the root means any signing flow — poker socket auth, game bets, buy-ins,
 * sign-in — can surface the same clear guidance instead of spinning silently.
 *
 * On mobile WalletConnect the request always reaches the wallet over the relay;
 * the browser just can't bring the wallet app to the foreground. This overlay
 * tells the user to switch apps, which is the actual missing piece.
 */
export function WalletActionProvider({ children }: { children: React.ReactNode }) {
  const mobileHandoff = useMobileWalletHandoff();
  const [active, setActive] = useState(false);
  const [variant, setVariant] = useState<WalletActionVariant>('transaction');
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [overridePhase, setOverridePhase] = useState<WalletActionPhase | null>(null);
  // Ref-count concurrent actions so an inner action ending doesn't hide the
  // overlay while an outer one is still pending.
  const depthRef = useRef(0);

  const begin = useCallback((opts?: WalletActionOptions) => {
    depthRef.current += 1;
    setOverridePhase(null);
    if (opts?.variant) setVariant(opts.variant);
    setTitle(opts?.title);
    setActive(true);
  }, []);

  const end = useCallback(() => {
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) {
      setActive(false);
      setOverridePhase(null);
    }
  }, []);

  const markFinishing = useCallback(() => {
    if (depthRef.current > 0) setOverridePhase('finishing');
  }, []);

  const run = useCallback(
    <T,>(action: () => Promise<T>, opts?: WalletActionOptions): Promise<T> => {
      begin(opts);
      return action().finally(end);
    },
    [begin, end],
  );

  const visible = mobileHandoff && active;
  const autoPhase = useWalletHandoffPhase(visible && overridePhase !== 'finishing');
  const phase: WalletActionPhase = overridePhase ?? autoPhase;

  const value = useMemo<WalletActionContextValue>(
    () => ({ mobileHandoff, begin, end, markFinishing, run }),
    [mobileHandoff, begin, end, markFinishing, run],
  );

  return (
    <WalletActionContext.Provider value={value}>
      {children}
      <WalletActionPrompt visible={visible} phase={phase} variant={variant} title={title} />
    </WalletActionContext.Provider>
  );
}

export function useWalletAction(): WalletActionContextValue {
  const ctx = useContext(WalletActionContext);
  if (!ctx) {
    throw new Error('useWalletAction must be used within <WalletActionProvider>');
  }
  return ctx;
}

/**
 * Same as useWalletAction but returns null outside the provider instead of
 * throwing — for shared components that may render in trees without it.
 */
export function useWalletActionOptional(): WalletActionContextValue | null {
  return useContext(WalletActionContext);
}
