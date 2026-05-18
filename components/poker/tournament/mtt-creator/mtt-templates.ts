import type { PokerBlindIncreaseMode } from '@/hooks/use-poker-tournament';
import type { PokerPrizePresetId } from '@/lib/poker-tournament-prize-presets';

/**
 * Prefab MTT configurations surfaced as one-click "Quick start" cards on the
 * template picker. Selecting a template prefills the wizard state and jumps
 * the user straight to the Review step where they can publish or tweak.
 *
 * Templates intentionally do NOT include `name` or `scheduledStartAt` — those
 * are always user-provided so duplicate publishes don't collide.
 */
export interface MttTemplate {
  id: string;
  label: string;
  /** Short blurb shown under the label (1 line). */
  tagline: string;
  /** Longer description shown on hover / focus (preview area). */
  description: string;
  /** Tag chip shown in the corner (e.g. "Popular", "Fastest"). Optional. */
  chip?: string;
  buyInMode: 'freeroll' | 'chips';
  /** Whole-MORBIUS string for the buy-in (chips mode only). */
  buyInChips: string;
  /** Chips guarantee for freeroll mode (string, whole chips). */
  guaranteedPool: string;
  maxPlayers: number;
  seatsPerTable: number;
  startingStack: number;
  blindMode: PokerBlindIncreaseMode;
  /** Only meaningful when blindMode === 'by_time'. */
  blindIntervalMinutes: number;
  prizePresetId: PokerPrizePresetId;
  /** 0–15 integer; creator's cut of the prize pool. */
  creatorFeePercent: number;
}

export const MTT_TEMPLATES: readonly MttTemplate[] = [
  {
    id: 'sunday_major',
    label: 'Sunday Major',
    tagline: '100-player MTT · 15k stack · 15-min levels',
    description:
      'The flagship weekly format. Mid-stakes buy-in, 9-max tables, 15-minute blind levels — built for a 2–3 hour run. Top 10 paid with a top-heavy curve.',
    chip: 'Popular',
    buyInMode: 'chips',
    buyInChips: '500',
    guaranteedPool: '0',
    maxPlayers: 100,
    seatsPerTable: 9,
    startingStack: 15000,
    blindMode: 'by_time',
    blindIntervalMinutes: 15,
    prizePresetId: 'deep_table',
    creatorFeePercent: 2,
  },
  {
    id: 'turbo_mtt',
    label: 'Turbo MTT',
    tagline: '27-player turbo · 6-max · 5-min levels',
    description:
      'Fast format for quick action. 6-max tables, 5-minute blind levels, shorter stack. Designed to wrap in under an hour. Top 3 paid.',
    chip: 'Fastest',
    buyInMode: 'chips',
    buyInChips: '100',
    guaranteedPool: '0',
    maxPlayers: 27,
    seatsPerTable: 6,
    startingStack: 5000,
    blindMode: 'by_time',
    blindIntervalMinutes: 5,
    prizePresetId: 'podium_classic',
    creatorFeePercent: 2,
  },
  {
    id: 'freeroll_friday',
    label: 'Freeroll Friday',
    tagline: '50-player freeroll · 10k guaranteed',
    description:
      'No buy-in. Guaranteed prize pool of 10,000 MORBIUS chips funded by the creator. Standard 9-max structure with by-hand blinds for casual pacing. Top 5 paid.',
    chip: 'Free',
    buyInMode: 'freeroll',
    buyInChips: '0',
    guaranteedPool: '10000',
    maxPlayers: 50,
    seatsPerTable: 9,
    startingStack: 10000,
    blindMode: 'by_hand',
    blindIntervalMinutes: 15,
    prizePresetId: 'top_five',
    creatorFeePercent: 0,
  },
];
