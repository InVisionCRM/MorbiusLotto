/**
 * Prize preset splits used by the poker SNG creator (shared lib at repo root).
 * Run: cd server && npm test -- prize-presets.unit
 */

import { normalizePokerTournamentPrizePercents } from '../../services/poker-tournament.service';
import {
  buildPrizePercents,
  everybodyWinsPercents,
  POKER_PRIZE_PRESET_LIST,
  type PokerPrizePresetId,
} from '../../../../lib/poker-tournament-prize-presets';

const ALL_PRESET_IDS = POKER_PRIZE_PRESET_LIST.map((p) => p.id) as PokerPrizePresetId[];

describe('poker-tournament-prize-presets (unit)', () => {
  it.each(ALL_PRESET_IDS)('preset %s sums to 100 and length matches maxPlayers for n=2..10', (presetId) => {
    for (let n = 2; n <= 10; n++) {
      const percents = buildPrizePercents(presetId, n);
      expect(percents).toHaveLength(n);
      const sum = percents.reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
      for (const p of percents) {
        expect(Number.isInteger(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
      }
      expect(() => normalizePokerTournamentPrizePercents(n, percents)).not.toThrow();
    }
  });

  it('everybody_wins: last place gets 2% when n >= 3; heads-up is 98/2', () => {
    for (let n = 3; n <= 10; n++) {
      const p = everybodyWinsPercents(n);
      expect(p[n - 1]).toBe(2);
      expect(p[0]).toBe(70);
    }
    expect(everybodyWinsPercents(2)).toEqual([98, 2]);
  });
});
