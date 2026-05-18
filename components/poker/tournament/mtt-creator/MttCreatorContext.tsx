'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PokerBlindIncreaseMode } from '@/hooks/use-poker-tournament';
import type { PokerPrizePresetId } from '@/lib/poker-tournament-prize-presets';
import type { MttTemplate } from './mtt-templates';

/**
 * The 7 logical screens. `template` is the entry screen (no form yet); 1–6 are wizard steps;
 * `review` is the final summary + publish.
 *
 * Index used in the progress bar / tag row maps 1..6 to NAME..PAYOUTS. The template screen
 * comes BEFORE step 1 and the review screen comes AFTER step 6, so neither appears in the bar.
 */
export type MttWizardScreen =
  | 'template'
  | 'name'
  | 'buy-in'
  | 'field'
  | 'stack'
  | 'blinds'
  | 'payouts'
  | 'review';

export const MTT_WIZARD_STEPS: MttWizardScreen[] = [
  'name', 'buy-in', 'field', 'stack', 'blinds', 'payouts',
];

/** Brutalist uppercase tag shown under each segment of the progress bar. */
export const MTT_STEP_TAGS: Record<Exclude<MttWizardScreen, 'template' | 'review'>, string> = {
  'name':     'Name',
  'buy-in':   'Buy-in',
  'field':    'Field',
  'stack':    'Stack',
  'blinds':   'Blinds',
  'payouts':  'Payouts',
};

/** Form-wide values. Mirrors the shape consumed by createPokerTournament's params. */
export interface MttFormValues {
  // 1. Name + schedule
  name: string;
  /** Local YYYY-MM-DD. Combined with `scheduledTime` at publish to make a `Date`. */
  scheduledDate: string;
  /** Local HH:mm. */
  scheduledTime: string;
  isPrivate: boolean;
  /** 4–12 digits when isPrivate; blank = server auto-generates. */
  privatePin: string;

  // 2. Buy-in
  buyInMode: 'freeroll' | 'chips';
  /** Whole-MORBIUS string. Empty when freeroll. */
  buyInChips: string;
  /** Chips guarantee (whole-chip string). Required when buyInMode === 'freeroll'. */
  guaranteedPool: string;

  // 3. Field
  maxPlayers: number;
  seatsPerTable: number;

  // 4. Stack
  startingStack: number;

  // 5. Blinds
  blindMode: PokerBlindIncreaseMode;
  /** Only meaningful when blindMode === 'by_time'. */
  blindIntervalMinutes: number;

  // 6. Payouts
  prizePresetId: PokerPrizePresetId;
  /** 0–15 integer. */
  creatorFeePercent: number;
}

export const MTT_DEFAULT_VALUES: MttFormValues = {
  name: '',
  scheduledDate: '',
  scheduledTime: '',
  isPrivate: false,
  privatePin: '',
  buyInMode: 'chips',
  buyInChips: '500',
  guaranteedPool: '0',
  maxPlayers: 27,
  seatsPerTable: 9,
  startingStack: 10000,
  blindMode: 'by_time',
  blindIntervalMinutes: 10,
  prizePresetId: 'podium_classic',
  creatorFeePercent: 2,
};

interface MttCreatorContextValue {
  screen: MttWizardScreen;
  values: MttFormValues;
  /**
   * Partial setter — overlays the provided keys onto current values. Use for individual field
   * edits; use `applyTemplate` to overwrite many fields at once with a preset.
   */
  setValues: (patch: Partial<MttFormValues>) => void;
  applyTemplate: (template: MttTemplate) => void;
  /** Navigate to a specific screen. Used by the rail / pencil edit links / template picker. */
  go: (screen: MttWizardScreen) => void;
  /** Step forward in the wizard ordering. From the last step ('payouts') jumps to 'review'. */
  next: () => void;
  /** Step back. From 'name' jumps to 'template'; from 'review' jumps to 'payouts'. */
  back: () => void;
  /** Index used by the progress bar (0..5 for the 6 form steps). -1 on template / review. */
  stepIndex: number;
  /** Total wizard steps (6). */
  stepCount: number;
}

const MttCreatorContext = createContext<MttCreatorContextValue | null>(null);

export function MttCreatorProvider({
  children,
  initialValues = MTT_DEFAULT_VALUES,
  initialScreen = 'template',
}: {
  children: React.ReactNode;
  initialValues?: MttFormValues;
  initialScreen?: MttWizardScreen;
}) {
  const [screen, setScreen] = useState<MttWizardScreen>(initialScreen);
  const [values, setValuesState] = useState<MttFormValues>(initialValues);

  const setValues = useCallback((patch: Partial<MttFormValues>) => {
    setValuesState((prev) => ({ ...prev, ...patch }));
  }, []);

  const applyTemplate = useCallback((template: MttTemplate) => {
    setValuesState((prev) => ({
      ...prev,
      buyInMode: template.buyInMode,
      buyInChips: template.buyInChips,
      guaranteedPool: template.guaranteedPool,
      maxPlayers: template.maxPlayers,
      seatsPerTable: template.seatsPerTable,
      startingStack: template.startingStack,
      blindMode: template.blindMode,
      blindIntervalMinutes: template.blindIntervalMinutes,
      prizePresetId: template.prizePresetId,
      creatorFeePercent: template.creatorFeePercent,
      // name + schedule + privacy: never overwritten by templates — always user-supplied.
    }));
  }, []);

  const go = useCallback((s: MttWizardScreen) => setScreen(s), []);

  const next = useCallback(() => {
    setScreen((cur) => {
      if (cur === 'template') return 'name';
      const idx = MTT_WIZARD_STEPS.indexOf(cur);
      if (idx < 0) return cur;
      if (idx >= MTT_WIZARD_STEPS.length - 1) return 'review';
      return MTT_WIZARD_STEPS[idx + 1];
    });
  }, []);

  const back = useCallback(() => {
    setScreen((cur) => {
      if (cur === 'template') return 'template';
      if (cur === 'name') return 'template';
      if (cur === 'review') return 'payouts';
      const idx = MTT_WIZARD_STEPS.indexOf(cur);
      if (idx <= 0) return cur;
      return MTT_WIZARD_STEPS[idx - 1];
    });
  }, []);

  const stepIndex = useMemo(() => {
    if (screen === 'template' || screen === 'review') return -1;
    return MTT_WIZARD_STEPS.indexOf(screen);
  }, [screen]);

  const value: MttCreatorContextValue = {
    screen,
    values,
    setValues,
    applyTemplate,
    go,
    next,
    back,
    stepIndex,
    stepCount: MTT_WIZARD_STEPS.length,
  };

  return <MttCreatorContext.Provider value={value}>{children}</MttCreatorContext.Provider>;
}

export function useMttCreator(): MttCreatorContextValue {
  const ctx = useContext(MttCreatorContext);
  if (!ctx) throw new Error('useMttCreator must be used inside <MttCreatorProvider>');
  return ctx;
}
