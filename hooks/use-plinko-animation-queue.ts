'use client';

import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { ContractResult, RiskLevel } from '@/app/PLINKO/types';

type DropSpeed = 'normal' | 'fast' | 'burst';

export interface PlinkoAnimationItem {
  bucket: number;
  risk: RiskLevel;
  multiplier: number;
  payout: number;
  seed: string;
}

interface LastDropState {
  id: number;
  risk: RiskLevel;
  contractResult?: ContractResult;
}

interface UsePlinkoAnimationQueueParams {
  freePlayEnabled: boolean;
  dropSpeed: DropSpeed;
  setLastDrop: Dispatch<SetStateAction<LastDropState | null>>;
  lastRiskRef: MutableRefObject<RiskLevel>;
}

export function usePlinkoAnimationQueue({
  freePlayEnabled,
  dropSpeed,
  setLastDrop,
  lastRiskRef,
}: UsePlinkoAnimationQueueParams) {
  const [animationQueue, setAnimationQueue] = useState<PlinkoAnimationItem[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [expectedBallCount, setExpectedBallCount] = useState(0);
  const [scoredBallCount, setScoredBallCount] = useState(0);
  const [ballsLaunched, setBallsLaunched] = useState(0);
  const animationTimerRef = useRef<number | null>(null);

  const ballsStillInFlight = expectedBallCount > 0 && scoredBallCount < expectedBallCount;
  const ballsInPhysics = ballsLaunched > 0 && scoredBallCount < ballsLaunched;
  const isGameRunning = ballsStillInFlight || ballsInPhysics || animationQueue.length > 0 || isAnimating;

  useEffect(() => {
    const allExpectedScored = expectedBallCount > 0 && scoredBallCount >= expectedBallCount;
    const allLaunchedScored = ballsLaunched > 0 && scoredBallCount >= ballsLaunched;
    if ((allExpectedScored || allLaunchedScored) && animationQueue.length === 0 && !isAnimating) {
      const timer = window.setTimeout(() => {
        setExpectedBallCount(0);
        setScoredBallCount(0);
        setBallsLaunched(0);
      }, 1000);
      return () => window.clearTimeout(timer);
    }
  }, [expectedBallCount, scoredBallCount, ballsLaunched, animationQueue.length, isAnimating]);

  useEffect(() => {
    if (!isGameRunning) return;
    const safety = window.setTimeout(() => {
      console.warn('Safety timeout: forcing game state reset');
      setExpectedBallCount(0);
      setScoredBallCount(0);
      setBallsLaunched(0);
    }, 120_000);
    return () => window.clearTimeout(safety);
  }, [isGameRunning]);

  useEffect(() => {
    return () => {
      if (animationTimerRef.current !== null) {
        window.clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (animationQueue.length === 0 || isAnimating || freePlayEnabled || animationTimerRef.current !== null) return;

    setIsAnimating(true);
    const nextAnimation = animationQueue[0];
    lastRiskRef.current = nextAnimation.risk;

    setBallsLaunched((prev) => prev + 1);
    setLastDrop({
      id: Date.now(),
      risk: nextAnimation.risk,
      contractResult: {
        seed: nextAnimation.seed,
        bucket: nextAnimation.bucket,
        multiplier: nextAnimation.multiplier,
        payout: nextAnimation.payout,
      },
    });

    animationTimerRef.current = window.setTimeout(() => {
      setAnimationQueue((prev) => prev.slice(1));
      setIsAnimating(false);
      animationTimerRef.current = null;
    }, dropSpeed === 'burst' ? 100 : dropSpeed === 'fast' ? 500 : 1000);
  }, [animationQueue, isAnimating, freePlayEnabled, dropSpeed, setLastDrop, lastRiskRef]);

  return {
    animationQueue,
    setAnimationQueue,
    isAnimating,
    expectedBallCount,
    setExpectedBallCount,
    scoredBallCount,
    setScoredBallCount,
    ballsLaunched,
    setBallsLaunched,
    isGameRunning,
  };
}
