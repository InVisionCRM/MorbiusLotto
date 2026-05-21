'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTokenBalance } from '@/hooks/use-token';
import { POKER_CHIP_WEI } from '@/lib/poker-buy-in';
import { toBigIntSafe } from '@/lib/safe-bigint';

export type PokerOnboardingStep = 0 | 1 | 2 | 3 | 4 | 5;

const DISMISSED_KEY = 'morblotto:poker:onboarding:dismissed';
const PLAYED_KEY = 'morblotto:poker:onboarding:played';

function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export interface UsePokerOnboardingArgs {
  address: `0x${string}` | undefined;
  isConnected: boolean;
  /** MORBIUS play balance from server, as a wei string. */
  playBalanceWei: string | null;
  /** Poker chip balance from server, as a chip-count string (not wei). */
  chipBalance: string | null;
}

export interface UsePokerOnboardingResult {
  /** 0=connect, 1=get MORBIUS, 2=deposit, 3=convert to chips, 4=ready to sit, 5=complete. */
  currentStep: PokerOnboardingStep;
  /** True once the user has chips and can sit down. */
  isReady: boolean;
  /** True once the user has played at least one hand (or marked complete manually). */
  isComplete: boolean;
  /** True if the user dismissed the checklist widget. The wizard can still be opened on demand. */
  dismissed: boolean;
  /** Hide the persistent checklist widget. The wizard still opens when the user clicks Sit. */
  dismiss: () => void;
  /** Un-hide the checklist widget. */
  undismiss: () => void;
  /** Mark onboarding complete (call after the user's first hand). */
  markPlayed: () => void;
  /** MORBIUS in the user's wallet (wei, as bigint). */
  walletMorbiusWei: bigint;
  /** MORBIUS in play balance (wei, as bigint). */
  playBalanceBn: bigint;
  /** Chips at table (count, as bigint). */
  chipsBn: bigint;
}

/**
 * Computes the current onboarding step for a poker player by combining wallet, on-chain MORBIUS,
 * server-side play balance, server-side chip balance, and localStorage flags.
 *
 * Step progression:
 *   0 = wallet not connected
 *   1 = no MORBIUS anywhere (wallet, play balance, chips all zero)
 *   2 = MORBIUS in wallet but no play balance and no chips
 *   3 = play balance > 0 but no chips
 *   4 = chips > 0 (ready to sit)
 *   5 = played a hand (dismissed forever)
 */
export function usePokerOnboarding({
  address,
  isConnected,
  playBalanceWei,
  chipBalance,
}: UsePokerOnboardingArgs): UsePokerOnboardingResult {
  const { balance: walletMorbiusWei } = useTokenBalance(address);

  const [dismissed, setDismissed] = useState<boolean>(false);
  const [hasPlayed, setHasPlayed] = useState<boolean>(false);

  useEffect(() => {
    setDismissed(readFlag(DISMISSED_KEY));
    setHasPlayed(readFlag(PLAYED_KEY));
  }, []);

  const dismiss = useCallback(() => {
    writeFlag(DISMISSED_KEY, true);
    setDismissed(true);
  }, []);

  const undismiss = useCallback(() => {
    writeFlag(DISMISSED_KEY, false);
    setDismissed(false);
  }, []);

  const markPlayed = useCallback(() => {
    writeFlag(PLAYED_KEY, true);
    setHasPlayed(true);
  }, []);

  const playBalanceBn = useMemo(() => toBigIntSafe(playBalanceWei ?? '0'), [playBalanceWei]);
  const chipsBn = useMemo(() => toBigIntSafe(chipBalance ?? '0'), [chipBalance]);
  // Treat chips as MORBIUS-equivalent for the "any MORBIUS at all" check. 1 chip = POKER_CHIP_WEI.
  const chipsAsMorbiusWei = useMemo(() => chipsBn * POKER_CHIP_WEI, [chipsBn]);

  const currentStep: PokerOnboardingStep = useMemo(() => {
    if (hasPlayed) return 5;
    if (!isConnected || !address) return 0;
    if (chipsBn > 0n) return 4;
    if (playBalanceBn > 0n) return 3;
    if (walletMorbiusWei > 0n || chipsAsMorbiusWei > 0n) return 2;
    return 1;
  }, [hasPlayed, isConnected, address, walletMorbiusWei, playBalanceBn, chipsBn, chipsAsMorbiusWei]);

  return {
    currentStep,
    isReady: currentStep >= 4,
    isComplete: hasPlayed,
    dismissed,
    dismiss,
    undismiss,
    markPlayed,
    walletMorbiusWei,
    playBalanceBn,
    chipsBn,
  };
}
