'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { SiweMessage } from 'siwe';
import { setAuthFailureHandler } from '@/lib/api-auth';

// Direct literal property access — Next.js inlines `process.env.NEXT_PUBLIC_*`
// at build time ONLY when accessed by literal name. `getApiUrl()` in api-urls.ts
// goes through a `process.env[name]` indirection that doesn't get inlined.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').trim();

interface SiweState {
  /** Address of the wallet currently signed in via SIWE (checksummed). Null if not signed in. */
  address: `0x${string}` | null;
  /** True if a server session is active for the currently-connected wallet. */
  isAuthenticated: boolean;
  /** Sign-in in flight (wallet popup / network roundtrip). */
  isSigningIn: boolean;
  /** Trigger an explicit SIWE sign-in flow. Returns the authed address on success. */
  signIn: () => Promise<`0x${string}`>;
  /**
   * Ensure the connected wallet has an active session, prompting a sign-in if not.
   * Use this before any privileged API call from a UI handler.
   */
  signInIfNeeded: () => Promise<`0x${string}`>;
  /** Revoke the current session and clear the cookie. */
  signOut: () => Promise<void>;
}

const SiweContext = createContext<SiweState | null>(null);

const apiBase = () => API_BASE;

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error ?? ''; } catch { /* noop */ }
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

export function SiweProvider({ children }: { children: React.ReactNode }) {
  const { address: connectedAddress, chain } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [authedAddress, setAuthedAddress] = useState<`0x${string}` | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Track an in-flight sign-in to dedupe concurrent calls (e.g. two UI buttons fired together).
  const signInPromiseRef = useRef<Promise<`0x${string}`> | null>(null);

  // On mount and whenever the connected wallet changes, check whether the
  // server already has a session for this wallet (cookie is httpOnly so we
  // can't read it; ask the server).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base = apiBase();
      if (!base) return;
      try {
        const me: { address?: string } = await fetchJson(`${base}/api/auth/me`);
        if (cancelled) return;
        if (me.address && connectedAddress && me.address.toLowerCase() === connectedAddress.toLowerCase()) {
          setAuthedAddress(me.address as `0x${string}`);
        } else {
          // Either no session, or session is for a different wallet (user switched accounts).
          setAuthedAddress(null);
        }
      } catch {
        if (!cancelled) setAuthedAddress(null);
      }
    })();
    return () => { cancelled = true; };
  }, [connectedAddress]);

  const signIn = useCallback(async (): Promise<`0x${string}`> => {
    if (!connectedAddress) throw new Error('Connect a wallet first');
    const base = apiBase();
    if (!base) throw new Error('API URL not configured (NEXT_PUBLIC_API_URL)');

    // Dedupe concurrent calls.
    if (signInPromiseRef.current) return signInPromiseRef.current;

    const run = (async () => {
      setIsSigningIn(true);
      try {
        const { nonce } = await fetchJson(`${base}/api/auth/nonce`);

        const message = new SiweMessage({
          domain: window.location.host,
          address: connectedAddress,
          // EIP-4361 requires ASCII-only in the statement. No em-dashes, smart quotes, etc.
          statement: 'Sign in to MORBlotto. This proves you own this wallet. No funds will move.',
          uri: window.location.origin,
          version: '1',
          chainId: chain?.id ?? 369, // PulseChain
          nonce,
          issuedAt: new Date().toISOString(),
        }).prepareMessage();

        const signature = await signMessageAsync({ message });

        const result: { address: `0x${string}` } = await fetchJson(`${base}/api/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, signature }),
        });

        setAuthedAddress(result.address);
        return result.address;
      } finally {
        setIsSigningIn(false);
        signInPromiseRef.current = null;
      }
    })();

    signInPromiseRef.current = run;
    return run;
  }, [connectedAddress, chain?.id, signMessageAsync]);

  const signInIfNeeded = useCallback(async (): Promise<`0x${string}`> => {
    if (!connectedAddress) throw new Error('Connect a wallet first');
    if (authedAddress && authedAddress.toLowerCase() === connectedAddress.toLowerCase()) {
      return authedAddress;
    }
    return signIn();
  }, [authedAddress, connectedAddress, signIn]);

  // Register signInIfNeeded as the global 401 recovery handler so apiFetch
  // can automatically prompt a sign-in popup when any authed route returns 401.
  // Without this, callers would have to manually call signInIfNeeded before each
  // authed request — easy to forget, fragile across the codebase.
  useEffect(() => {
    setAuthFailureHandler(signInIfNeeded);
    return () => setAuthFailureHandler(null);
  }, [signInIfNeeded]);

  const signOut = useCallback(async () => {
    const base = apiBase();
    if (!base) return;
    try {
      await fetch(`${base}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      setAuthedAddress(null);
    }
  }, []);

  const value: SiweState = {
    address: authedAddress,
    isAuthenticated:
      !!authedAddress && !!connectedAddress &&
      authedAddress.toLowerCase() === connectedAddress.toLowerCase(),
    isSigningIn,
    signIn,
    signInIfNeeded,
    signOut,
  };

  return <SiweContext.Provider value={value}>{children}</SiweContext.Provider>;
}

/**
 * Access the SIWE session state.
 *
 *   const { isAuthenticated, signInIfNeeded } = useSiwe();
 *   const handleWithdraw = async () => {
 *     await signInIfNeeded();              // prompts wallet sig if not signed in
 *     await apiFetch('/api/withdraw', { method: 'POST', body: JSON.stringify({ amount }) });
 *   };
 */
export function useSiwe(): SiweState {
  const ctx = useContext(SiweContext);
  if (!ctx) throw new Error('useSiwe must be used inside <SiweProvider>');
  return ctx;
}
