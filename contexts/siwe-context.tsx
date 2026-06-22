'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { SiweMessage } from 'siwe';
import { getAddress, isAddress } from 'viem';
import { setAuthFailureHandler, setWsAuthHandler } from '@/lib/api-auth';
import { useWalletAction } from '@/contexts/wallet-action-context';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').trim();

/** SIWE domain must match server SIWE_EXPECTED_DOMAIN (defaults to morbius.io). */
const SIWE_DOMAIN =
  (process.env.NEXT_PUBLIC_SIWE_DOMAIN ?? 'morbius.io').trim() || 'morbius.io';

export interface SiweState {
  address: `0x${string}` | null;
  isAuthenticated: boolean;
  isSigningIn: boolean;
  signIn: () => Promise<`0x${string}`>;
  signInIfNeeded: () => Promise<`0x${string}`>;
  /** Verify a live session with the server first; only prompt a sign-in if none exists. */
  ensureSiweSession: () => Promise<`0x${string}`>;
  signOut: () => Promise<void>;
}

const SiweContext = createContext<SiweState | null>(null);

/** Same-origin in the browser so morb_session is first-party; direct API only on server. */
function authUrl(path: string): string {
  if (typeof window !== 'undefined') return path;
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${path}`;
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).error ?? '';
    } catch {
      /* noop */
    }
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

export function SiweProvider({ children }: { children: React.ReactNode }) {
  const { address: connectedAddress, chain } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const walletAction = useWalletAction();
  const [authedAddress, setAuthedAddress] = useState<`0x${string}` | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const signInPromiseRef = useRef<Promise<`0x${string}`> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me: { address?: string } = await fetchJson(authUrl('/api/auth/me'));
        if (cancelled) return;
        const sessionAddrLower = me.address?.toLowerCase();
        const connectedAddrLower = connectedAddress?.toLowerCase();
        if (sessionAddrLower && connectedAddrLower && sessionAddrLower === connectedAddrLower) {
          setAuthedAddress(me.address as `0x${string}`);
          return;
        }
        if (sessionAddrLower && connectedAddrLower && sessionAddrLower !== connectedAddrLower) {
          try {
            await fetch(authUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('siwe:session-cleared', { detail: { reason: 'wallet-mismatch' } }),
              );
            }
          } catch {
            /* best-effort */
          }
        }
        if (!cancelled) setAuthedAddress(null);
      } catch {
        if (!cancelled) setAuthedAddress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectedAddress]);

  const signIn = useCallback(async (): Promise<`0x${string}`> => {
    if (!connectedAddress) throw new Error('Connect a wallet first');
    // siwe 3.x validates line 2 (the address) against EIP-55 and throws
    // "line 2: invalid (EIP-55) address" if it isn't checksummed. Some connectors
    // (notably mobile WalletConnect / in-app wallet browsers) hand back a lowercase
    // address, so re-checksum here before building the message.
    if (!isAddress(connectedAddress)) {
      throw new Error('Connected wallet address is not a valid EVM address');
    }
    const checksummedAddress = getAddress(connectedAddress);

    if (signInPromiseRef.current) return signInPromiseRef.current;

    const run = (async () => {
      setIsSigningIn(true);
      walletAction.begin({ variant: 'sign-in' });
      try {
        const { nonce } = await fetchJson(authUrl('/api/auth/nonce'));

        const message = new SiweMessage({
          domain: SIWE_DOMAIN,
          address: checksummedAddress,
          statement: 'Sign in to MORBIUS. This proves you own this wallet. No funds will move.',
          uri: window.location.origin,
          version: '1',
          chainId: chain?.id ?? 369,
          nonce,
          issuedAt: new Date().toISOString(),
        }).prepareMessage();

        const signature = await signMessageAsync({ message });

        walletAction.markFinishing();
        const result: { address: `0x${string}` } = await fetchJson(authUrl('/api/auth/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, signature }),
        });

        // Confirm cookie actually persisted (guards mobile browsers that drop Set-Cookie).
        const me: { address?: string } = await fetchJson(authUrl('/api/auth/me'));
        if (me.address?.toLowerCase() !== result.address.toLowerCase()) {
          setAuthedAddress(null);
          throw new Error('Sign-in succeeded but session cookie was not saved. Try again.');
        }

        setAuthedAddress(result.address);
        return result.address;
      } finally {
        setIsSigningIn(false);
        walletAction.end();
        signInPromiseRef.current = null;
      }
    })();

    signInPromiseRef.current = run;
    return run;
  }, [connectedAddress, chain?.id, signMessageAsync, walletAction]);

  const signInIfNeeded = useCallback(async (): Promise<`0x${string}`> => {
    if (!connectedAddress) throw new Error('Connect a wallet first');
    if (authedAddress && authedAddress.toLowerCase() === connectedAddress.toLowerCase()) {
      return authedAddress;
    }
    return signIn();
  }, [authedAddress, connectedAddress, signIn]);

  const ensureSiweSession = useCallback(async (): Promise<`0x${string}`> => {
    if (!connectedAddress) throw new Error('Connect a wallet first');
    try {
      const me: { address?: string } = await fetchJson(authUrl('/api/auth/me'));
      if (me.address?.toLowerCase() === connectedAddress.toLowerCase()) {
        setAuthedAddress(me.address as `0x${string}`);
        return me.address as `0x${string}`;
      }
    } catch {
      /* no session yet */
    }
    return signIn();
  }, [connectedAddress, signIn]);

  // On 401 the server says there is no valid session — always re-sign, never short-circuit.
  const forceSignIn = useCallback(async (): Promise<`0x${string}`> => {
    setAuthedAddress(null);
    return signIn();
  }, [signIn]);

  useEffect(() => {
    setAuthFailureHandler(forceSignIn);
    setWsAuthHandler(ensureSiweSession);
    return () => {
      setAuthFailureHandler(null);
      setWsAuthHandler(null);
    };
  }, [forceSignIn, ensureSiweSession]);

  const signOut = useCallback(async () => {
    try {
      await fetch(authUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('siwe:session-cleared', { detail: { reason: 'sign-out' } }));
      }
    } finally {
      setAuthedAddress(null);
    }
  }, []);

  const value: SiweState = {
    address: authedAddress,
    isAuthenticated:
      !!authedAddress &&
      !!connectedAddress &&
      authedAddress.toLowerCase() === connectedAddress.toLowerCase(),
    isSigningIn,
    signIn,
    signInIfNeeded,
    ensureSiweSession,
    signOut,
  };

  return <SiweContext.Provider value={value}>{children}</SiweContext.Provider>;
}

export function useSiwe(): SiweState {
  const ctx = useContext(SiweContext);
  if (!ctx) throw new Error('useSiwe must be used inside <SiweProvider>');
  return ctx;
}
