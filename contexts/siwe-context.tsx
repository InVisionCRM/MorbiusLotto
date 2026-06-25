'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { SiweMessage } from 'siwe';
import { getAddress, isAddress } from 'viem';
import { setAuthFailureHandler, setWsAuthHandler } from '@/lib/api-auth';
import { useWalletAction } from '@/contexts/wallet-action-context';
import { SignInGate } from '@/components/auth/SignInGate';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').trim();

/** SIWE domain must match server SIWE_EXPECTED_DOMAIN (defaults to morbius.io). */
const SIWE_DOMAIN =
  (process.env.NEXT_PUBLIC_SIWE_DOMAIN ?? 'morbius.io').trim() || 'morbius.io';

/**
 * How long a pre-fetched nonce is treated as usable. The server nonce TTL is
 * ~10 min; we refresh well inside that so a warmed nonce is never stale at sign
 * time. A warm nonce is what lets signMessageAsync run as the FIRST awaited
 * wallet call inside the user's tap — required for mobile WalletConnect to
 * foreground/deep-link the wallet app (see CLAUDE.md: never sign after an await).
 */
const NONCE_FRESH_MS = 8 * 60_000;

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

  // ── Pre-fetched single-use nonce (kept warm so signing needs no preceding await) ──
  const nonceRef = useRef<{ value: string; ts: number } | null>(null);
  const noncePrefetchRef = useRef<Promise<string> | null>(null);

  // ── Mobile "tap to sign in" gate state (only used on WalletConnect handoff) ──
  const [gateOpen, setGateOpen] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const gatePromiseRef = useRef<Promise<`0x${string}`> | null>(null);
  const gateResolveRef = useRef<((addr: `0x${string}`) => void) | null>(null);
  const gateRejectRef = useRef<((err: Error) => void) | null>(null);

  /** Fetch a nonce ahead of time (deduped). Returns the cached one if still fresh. */
  const prefetchNonce = useCallback(async (force = false): Promise<string> => {
    if (typeof window === 'undefined') return '';
    const cached = nonceRef.current;
    if (!force && cached && Date.now() - cached.ts < NONCE_FRESH_MS) return cached.value;
    if (noncePrefetchRef.current) return noncePrefetchRef.current;
    const p = (async () => {
      try {
        const { nonce } = await fetchJson(authUrl('/api/auth/nonce'));
        nonceRef.current = { value: nonce, ts: Date.now() };
        return nonce as string;
      } finally {
        noncePrefetchRef.current = null;
      }
    })();
    noncePrefetchRef.current = p;
    return p;
  }, []);

  /** Synchronously take a fresh pre-fetched nonce, or null. Never awaits. */
  const takeWarmNonce = useCallback((): string | null => {
    const cached = nonceRef.current;
    if (cached && Date.now() - cached.ts < NONCE_FRESH_MS) return cached.value;
    return null;
  }, []);

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
        // Connected but no valid session → warm a nonce so the next sign-in tap
        // can reach signMessageAsync with the user gesture intact (mobile).
        if (!cancelled && connectedAddrLower) void prefetchNonce();
      } catch {
        if (!cancelled) setAuthedAddress(null);
        if (!cancelled && connectedAddress) void prefetchNonce();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectedAddress, prefetchNonce]);

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
        // Prefer a pre-fetched nonce so signMessageAsync is the FIRST awaited
        // wallet call inside the tap. Only fall back to an inline fetch when no
        // warm nonce exists (desktop, or a first tap that raced the prefetch).
        let nonce = takeWarmNonce();
        if (!nonce) nonce = await prefetchNonce(true);
        nonceRef.current = null; // single-use — consumed by this sign-in

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
      } catch (err) {
        // Warm a fresh nonce so an immediate retry is still gesture-safe.
        if (connectedAddress) void prefetchNonce(true);
        throw err;
      } finally {
        setIsSigningIn(false);
        walletAction.end();
        signInPromiseRef.current = null;
      }
    })();

    signInPromiseRef.current = run;
    return run;
  }, [connectedAddress, chain?.id, signMessageAsync, walletAction, takeWarmNonce, prefetchNonce]);

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

  // ── Mobile sign-in gate plumbing ──────────────────────────────────────────
  // On WalletConnect handoff a wallet signature can only foreground the wallet
  // app from a fresh user gesture. A background 401 has no gesture, so instead
  // of signing off-gesture (which silently fails — the "0.05s flash") we show a
  // one-tap "Sign in to play" prompt and sign from THAT tap.
  const closeGate = useCallback(() => {
    setGateOpen(false);
    setGateError(null);
    gatePromiseRef.current = null;
    gateResolveRef.current = null;
    gateRejectRef.current = null;
  }, []);

  const gateSignIn = useCallback(async () => {
    setGateError(null);
    try {
      const addr = await signIn();
      const resolve = gateResolveRef.current;
      closeGate();
      resolve?.(addr);
    } catch (err) {
      // Keep the gate open so the user can retry; surface a friendly reason.
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      setGateError(/reject|denied|cancel/i.test(msg) ? 'Signature was rejected. Try again.' : msg);
    }
  }, [signIn, closeGate]);

  const gateCancel = useCallback(() => {
    const reject = gateRejectRef.current;
    closeGate();
    reject?.(new Error('Sign-in cancelled'));
  }, [closeGate]);

  /**
   * Auth-failure handler registered with apiFetch. Desktop / injected wallets
   * sign immediately (no gesture needed). Mobile WalletConnect opens the gate
   * and resolves once the user taps Sign in.
   */
  const requestSignIn = useCallback(async (): Promise<`0x${string}`> => {
    if (!connectedAddress) throw new Error('Connect a wallet first');
    setAuthedAddress(null);
    if (!walletAction.mobileHandoff) return signIn();
    if (gatePromiseRef.current) return gatePromiseRef.current;
    void prefetchNonce(); // warm the nonce while the user reads the prompt
    setGateError(null);
    setGateOpen(true);
    const p = new Promise<`0x${string}`>((resolve, reject) => {
      gateResolveRef.current = resolve;
      gateRejectRef.current = reject;
    });
    gatePromiseRef.current = p;
    return p;
  }, [connectedAddress, walletAction.mobileHandoff, signIn, prefetchNonce]);

  useEffect(() => {
    setAuthFailureHandler(requestSignIn);
    setWsAuthHandler(ensureSiweSession);
    return () => {
      setAuthFailureHandler(null);
      setWsAuthHandler(null);
    };
  }, [requestSignIn, ensureSiweSession]);

  const signOut = useCallback(async () => {
    try {
      await fetch(authUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('siwe:session-cleared', { detail: { reason: 'sign-out' } }));
      }
    } finally {
      setAuthedAddress(null);
      if (connectedAddress) void prefetchNonce(true);
    }
  }, [connectedAddress, prefetchNonce]);

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

  return (
    <SiweContext.Provider value={value}>
      {children}
      <SignInGate
        open={gateOpen}
        busy={isSigningIn}
        error={gateError}
        onSignIn={gateSignIn}
        onCancel={gateCancel}
      />
    </SiweContext.Provider>
  );
}

export function useSiwe(): SiweState {
  const ctx = useContext(SiweContext);
  if (!ctx) throw new Error('useSiwe must be used inside <SiweProvider>');
  return ctx;
}
