'use client';

// Tutorial state machine — walks a first-time player through Pass Line →
// Come Out roll → Point phase → Place bets → Point roll.

import { useState, useEffect } from 'react';
import { Phase, RollResult } from '@/lib/craps-types';

export type TutorialStep =
  | 'OFF'
  | 'WELCOME'
  | 'PASS_BET_PROMPT'
  | 'COME_OUT_ROLL_PROMPT'
  | 'COME_OUT_RESULT_EXPLAIN'
  | 'POINT_EXPLAIN'
  | 'PLACE_BET_PROMPT'
  | 'POINT_ROLL_PROMPT'
  | 'POINT_ROLL_RESULT'
  | 'FINISHED';

export function useCrapsTutorial(
  bets: Record<string, number>,
  phase: Phase,
  point: number | null,
  isRolling: boolean,
  lastResult: RollResult | null,
) {
  const [step, setStep] = useState<TutorialStep>('OFF');
  const [prevRolling, setPrevRolling] = useState(false);

  useEffect(() => {
    switch (step) {
      case 'PASS_BET_PROMPT':
        if (bets['PASS'] > 0) setStep('COME_OUT_ROLL_PROMPT');
        break;
      case 'COME_OUT_ROLL_PROMPT':
        if (isRolling) setPrevRolling(true);
        else if (prevRolling && !isRolling) {
          setPrevRolling(false);
          setStep('COME_OUT_RESULT_EXPLAIN');
        }
        break;
      case 'PLACE_BET_PROMPT': {
        const placed = ['PLACE_4', 'PLACE_5', 'PLACE_6', 'PLACE_8', 'PLACE_9', 'PLACE_10']
          .some((k) => bets[k] > 0);
        if (placed) setStep('POINT_ROLL_PROMPT');
        break;
      }
      case 'POINT_ROLL_PROMPT':
        if (isRolling) setPrevRolling(true);
        else if (prevRolling && !isRolling) {
          setPrevRolling(false);
          setStep('POINT_ROLL_RESULT');
        }
        break;
    }
  }, [bets, isRolling, step, prevRolling]);

  const advance = () => {
    switch (step) {
      case 'WELCOME': setStep('PASS_BET_PROMPT'); break;
      case 'COME_OUT_RESULT_EXPLAIN':
        setStep(phase === 'COME_OUT' ? 'PASS_BET_PROMPT' : 'POINT_EXPLAIN');
        break;
      case 'POINT_EXPLAIN': setStep('PLACE_BET_PROMPT'); break;
      case 'POINT_ROLL_RESULT': setStep('FINISHED'); break;
      case 'FINISHED': setStep('OFF'); break;
    }
  };

  const start = () => setStep('WELCOME');
  const stop = () => setStep('OFF');

  return { step, advance, start, stop, lastResult, point };
}
