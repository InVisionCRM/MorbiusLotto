'use client';

// Server-driven, provably-fair craps engine. Bankroll IS the player's poker
// chip balance — every bet debits via applyPokerChipDelta on the server.
//
// All requests go through the Next.js proxy at /api/arcade/craps/* so the
// SIWE cookie flows automatically. No NEXT_PUBLIC_API_URL juggling here.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { BetType, Phase, RollResult } from '@/lib/craps-types';

const ROLL_ANIM_MS = 1200;

export interface CrapsCommitment {
  sessionId: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
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
  /** True when wallet isn't connected yet. */
  needsWallet: boolean;
}

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
  const [lastResult, setLastResult] = useState<RollResult | null>(null);
  const [rollHistory, setRollHistory] = useState<number[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Boot: create a session as soon as wallet is connected.
  useEffect(() => {
    if (!isConnected || !address) return;
    if (createdForAddrRef.current === address) return;
    createdForAddrRef.current = address;
    void createSession();
  }, [address, isConnected, createSession]);

  const placeBet = useCallback((type: BetType, amount: number) => {
    if (!sessionId || isRolling) return;
    void (async () => {
      try {
        const r = await postJSON<BetResp>(`/api/arcade/craps/session/${sessionId}/bet`, { type, amount });
        setChipBalance(r.chipBalance);
        setBets(r.bets);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [sessionId, isRolling]);

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
      const elapsed = Date.now() - spinStart;
      const wait = Math.max(0, ROLL_ANIM_MS - elapsed);
      setTimeout(() => {
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
        setIsRolling(false);
      }, wait);
    })();
  }, [sessionId, isRolling]);

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
    placeBet, clearBets, rollDice, resetGame, rotateSeed,
    setClientSeedAndRestart,
    commitment, isInitializing, error,
    needsWallet: !isConnected || !address,
  };
}
