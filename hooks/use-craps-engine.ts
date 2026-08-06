'use client';

// Server-driven, provably-fair craps engine. Bankroll IS the player's poker
// chip balance — every bet debits via applyPokerChipDelta on the server.
//
// All requests go through the Next.js proxy at /api/arcade/craps/* so the
// SIWE cookie flows automatically. No NEXT_PUBLIC_API_URL juggling here.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { BetType, Phase, RollResult } from '@/lib/craps-types';

/**
 * Backstop only. The dice normally clear `isRolling` by settling; this is how
 * long the game will wait for that before unsticking itself.
 */
const ROLL_SAFETY_MS = 6000;

export interface CrapsCommitment {
  sessionId: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface CrapsLimits {
  min: number;
  /** Applies to the TOTAL resting on any ONE betting zone, not per chip. */
  max: number;
}

export interface CrapsEngine {
  /** Off-chain chip balance (string to preserve bigint precision). */
  chipBalance: string;
  bets: Record<string, number>;
  phase: Phase;
  point: number | null;
  dice: [number, number];
  isRolling: boolean;
  lastResult: RollResult | null;
  rollHistory: number[];
  placeBet: (type: BetType, amount: number) => void;
  clearBets: () => void;
  rollDice: () => void;
  resetGame: () => void;
  /** Publish current serverSeed and commit to a new one. Returns the revealed
   *  seed so the caller can show it for verification, or null on failure. */
  rotateSeed: () => Promise<string | null>;
  /** Close the current session and open a fresh one bound to a new clientSeed
   *  the player supplies. Mirrors Plinko/Limbo "New seed" behaviour. */
  setClientSeedAndRestart: (clientSeed: string) => Promise<void>;
  /** Commitment + recipe so the player can independently verify rolls. */
  commitment: CrapsCommitment | null;
  /** True while the initial session is being created (first paint). */
  isInitializing: boolean;
  /** Last server error message; null when healthy. */
  error: string | null;
  /** Imperatively clear the last error (e.g. after the banner auto-dismisses). */
  clearError: () => void;
  /** True when wallet isn't connected yet. */
  needsWallet: boolean;
  /** True when we have a live session ready to take bets. */
  sessionReady: boolean;
  /** Table limits the server enforces, so the felt can show the same numbers. */
  limits: CrapsLimits;
}

/**
 * Fallback limits used only until GET /info answers. They match the registry
 * defaults, so a slow info call never lets a bet through that the server would
 * then reject — the server is the authority either way.
 */
const FALLBACK_LIMITS: CrapsLimits = { min: 5, max: 10_000 };

interface CreateSessionResp {
  ok: boolean;
  sessionId: string;
  serverSeedHash: string;
  clientSeed: string;
  chipBalance: string;
  phase: Phase;
  point: number | null;
  bets: Record<string, number>;
  nonce: number;
  rollHistory: number[];
  error?: string;
}

interface BetResp {
  ok: boolean;
  chipBalance: string;
  bets: Record<string, number>;
  phase: Phase;
  error?: string;
}

interface ClearResp {
  ok: boolean;
  chipBalance: string;
  bets: Record<string, number>;
  refund: number;
  error?: string;
}

interface RollResp {
  ok: boolean;
  nonce: number;
  die1: number;
  die2: number;
  sum: number;
  phase: Phase;
  point: number | null;
  chipBalance: string;
  bets: Record<string, number>;
  wins: number;
  losses: number;
  isPoint: boolean;
  isSevenOut: boolean;
  rollHistory: number[];
  error?: string;
}

async function postJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  const data = (await res.json()) as T & { ok: boolean; error?: string };
  if (!data.ok) throw new Error(data.error || `Request failed: ${path}`);
  return data;
}

export function useCrapsEngine(): CrapsEngine {
  const { address, isConnected } = useAccount();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [commitment, setCommitment] = useState<CrapsCommitment | null>(null);

  const [chipBalance, setChipBalance] = useState<string>('0');
  const [bets, setBets] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<Phase>('COME_OUT');
  const [point, setPoint] = useState<number | null>(null);
  const [dice, setDice] = useState<[number, number]>([3, 4]);
  const [isRolling, setIsRolling] = useState(false);
  /** Bumped per throw so the felt animates even when the dice repeat. */
  const [rollNonce, setRollNonce] = useState(0);
  const settleGuard = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastResult, setLastResult] = useState<RollResult | null>(null);
  const [rollHistory, setRollHistory] = useState<number[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<CrapsLimits>(FALLBACK_LIMITS);

  // Table limits are public and admin-configurable, so read them rather than
  // hardcoding them in the UI. Failing here just leaves the fallback in place.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/arcade/craps/info', { credentials: 'include' });
        const d = (await res.json()) as { ok?: boolean; minBet?: number; maxBet?: number };
        if (cancelled || !d?.ok) return;
        if (Number.isFinite(d.minBet) && Number.isFinite(d.maxBet)) {
          setLimits({ min: Number(d.minBet), max: Number(d.maxBet) });
        }
      } catch {
        // Keep the fallback; the server still enforces the real numbers.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Guards against double-create in StrictMode + duplicate-wallet effect runs.
  const creatingRef = useRef(false);
  const createdForAddrRef = useRef<string | null>(null);

  const createSession = useCallback(async (clientSeedOverride?: string) => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setIsInitializing(true);
    try {
      const body =
        typeof clientSeedOverride === 'string' && clientSeedOverride.trim()
          ? { clientSeed: clientSeedOverride.trim() }
          : undefined;
      const s = await postJSON<CreateSessionResp>('/api/arcade/craps/session', body);
      setSessionId(s.sessionId);
      setCommitment({
        sessionId: s.sessionId,
        serverSeedHash: s.serverSeedHash,
        clientSeed: s.clientSeed,
        nonce: s.nonce,
      });
      setChipBalance(s.chipBalance);
      setBets(s.bets);
      setPhase(s.phase);
      setPoint(s.point);
      setRollHistory(s.rollHistory);
      setLastResult(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsInitializing(false);
      creatingRef.current = false;
    }
  }, []);

  // Resume an in-progress session if one exists (so a reload doesn't strand
  // already-debited bets); otherwise open a fresh one. Boot-only — resetGame /
  // setClientSeedAndRestart still create deliberately new sessions.
  const resumeOrCreate = useCallback(async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setIsInitializing(true);
    let adopted = false;
    try {
      const res = await fetch('/api/arcade/craps/active-session', { credentials: 'include' });
      const data = (await res.json()) as {
        ok: boolean;
        session: null | {
          sessionId: string;
          serverSeedHash: string;
          clientSeed: string;
          nonce: number;
          phase: Phase;
          point: number | null;
          chipBalance: string;
          bets: Record<string, number>;
          rollHistory: number[];
        };
      };
      if (data?.ok && data.session) {
        const s = data.session;
        setSessionId(s.sessionId);
        setCommitment({
          sessionId: s.sessionId,
          serverSeedHash: s.serverSeedHash,
          clientSeed: s.clientSeed,
          nonce: s.nonce,
        });
        setChipBalance(s.chipBalance);
        setBets(s.bets ?? {});
        setPhase(s.phase);
        setPoint(s.point);
        setRollHistory(s.rollHistory ?? []);
        setLastResult(null);
        setError(null);
        adopted = true;
      }
    } catch {
      // Network / parse issue — fall through to create a fresh session below.
    } finally {
      setIsInitializing(false);
      creatingRef.current = false;
    }
    if (!adopted) await createSession();
  }, [createSession]);

  // Boot: resume or create a session as soon as the wallet is connected.
  useEffect(() => {
    if (!isConnected || !address) return;
    if (createdForAddrRef.current === address) return;
    createdForAddrRef.current = address;
    void resumeOrCreate();
  }, [address, isConnected, resumeOrCreate]);

  const placeBet = useCallback((type: BetType, amount: number) => {
    // Friendly visible reasons for every early-return path so a silent click
    // never leaves the player wondering why nothing happened.
    if (isRolling) {
      setError('Wait for the dice to settle.');
      return;
    }
    if (!sessionId) {
      setError(
        isInitializing
          ? 'Connecting to the table — try again in a moment.'
          : 'Not connected — sign in with your wallet.',
      );
      return;
    }
    // Pre-check the table limits so the felt says no immediately instead of
    // after a round trip. The server re-checks the same rule — this is only
    // there to make the refusal instant and legible.
    if (amount < limits.min) {
      setError(`Minimum bet is ${limits.min.toLocaleString()} chips.`);
      return;
    }
    const resting = Number(bets[type] || 0);
    if (resting + amount > limits.max) {
      setError(`Table max is ${limits.max.toLocaleString()} chips on any one bet.`);
      return;
    }
    setError(null);
    void (async () => {
      try {
        const r = await postJSON<BetResp>(`/api/arcade/craps/session/${sessionId}/bet`, { type, amount });
        setChipBalance(r.chipBalance);
        setBets(r.bets);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [sessionId, isRolling, isInitializing, bets, limits]);

  const clearBets = useCallback(() => {
    if (!sessionId || isRolling) return;
    if (Object.keys(bets).length === 0) return;
    void (async () => {
      try {
        const r = await postJSON<ClearResp>(`/api/arcade/craps/session/${sessionId}/clear`);
        setChipBalance(r.chipBalance);
        setBets(r.bets);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [sessionId, isRolling, bets]);

  const rollDice = useCallback(() => {
    if (!sessionId || isRolling) return;
    setIsRolling(true);
    const spinStart = Date.now();
    void (async () => {
      let r: RollResp;
      try {
        r = await postJSON<RollResp>(`/api/arcade/craps/session/${sessionId}/roll`);
      } catch (e) {
        setError((e as Error).message);
        setIsRolling(false);
        return;
      }
      // The dice go out the moment the result is known: the physics throw is
      // the wait now, so padding it to a fixed animation length would only sit
      // the player in front of a still felt before anything moved.
      setDice([r.die1, r.die2]);
      setChipBalance(r.chipBalance);
      setBets(r.bets);
      setPhase(r.phase);
      setPoint(r.point);
      setRollHistory(r.rollHistory);
      setLastResult({
        wins: r.wins,
        lost: r.losses,
        sum: r.sum,
        isPoint: r.isPoint,
        isSevenOut: r.isSevenOut,
      });
      setCommitment((prev) => (prev ? { ...prev, nonce: r.nonce + 1 } : prev));
      setRollNonce((n) => n + 1);

      // isRolling stays true until the dice actually stop, so a second throw
      // cannot be started mid-flight. The felt calls diceSettled() for that;
      // this timer only covers the case where it never does — an unmount, a
      // hidden tab throttling rAF — so the game can never wedge on a throw.
      if (settleGuard.current) clearTimeout(settleGuard.current);
      settleGuard.current = setTimeout(() => setIsRolling(false), ROLL_SAFETY_MS);
    })();
  }, [sessionId, isRolling]);

  /** Called by the felt once the dice have come to rest. */
  const diceSettled = useCallback(() => {
    if (settleGuard.current) {
      clearTimeout(settleGuard.current);
      settleGuard.current = null;
    }
    setIsRolling(false);
  }, []);

  const rotateSeed = useCallback(async (): Promise<string | null> => {
    if (!sessionId || isRolling) return null;
    try {
      const r = await postJSON<{
        ok: boolean;
        serverSeedRevealed: string;
        serverSeedHash: string;
        nonce: number;
      }>(`/api/arcade/craps/session/${sessionId}/rotate`);
      // Update the in-memory commitment to the new hash; nonce resets to 0.
      setCommitment({
        sessionId,
        serverSeedHash: r.serverSeedHash,
        clientSeed: commitment?.clientSeed ?? '',
        nonce: r.nonce,
      });
      return r.serverSeedRevealed;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [sessionId, isRolling, commitment?.clientSeed]);

  const setClientSeedAndRestart = useCallback(async (newClientSeed: string): Promise<void> => {
    if (isRolling) return;
    if (!newClientSeed.trim()) return;
    try {
      // Close the active session first so any open bets refund cleanly.
      if (sessionId) {
        await fetch(`/api/arcade/craps/session/${sessionId}/close`, {
          method: 'POST', credentials: 'include',
        }).catch(() => {});
      }
      setIsInitializing(true);
      setSessionId(null);
      setCommitment(null);
      setBets({});
      setPhase('COME_OUT');
      setPoint(null);
      setDice([3, 4]);
      setLastResult(null);
      setRollHistory([]);
      creatingRef.current = false;
      await createSession(newClientSeed);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sessionId, isRolling, createSession]);

  const resetGame = useCallback(() => {
    // Close current session (refunds bets + reveals seed) and start a fresh one.
    if (isRolling) return;
    void (async () => {
      try {
        if (sessionId) {
          fetch(`/api/arcade/craps/session/${sessionId}/close`, {
            method: 'POST', credentials: 'include',
          }).catch(() => {});
        }
        setIsInitializing(true);
        setSessionId(null);
        setCommitment(null);
        setBets({});
        setPhase('COME_OUT');
        setPoint(null);
        setDice([3, 4]);
        setLastResult(null);
        setRollHistory([]);
        // Allow re-creation for this address.
        creatingRef.current = false;
        await createSession();
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [sessionId, isRolling, createSession]);

  return {
    chipBalance,
    bets, phase, point, dice, isRolling, lastResult, rollHistory,
    rollNonce, diceSettled,
    placeBet, clearBets, rollDice, resetGame, rotateSeed,
    setClientSeedAndRestart,
    commitment, isInitializing, error,
    clearError: () => setError(null),
    needsWallet: !isConnected || !address,
    sessionReady: Boolean(sessionId),
    limits,
  };
}
