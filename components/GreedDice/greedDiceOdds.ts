/**
 * greedDiceOdds — odds-tab data for /greed-dice (Farkle push-your-luck). Every
 * scoring die banks automatically; the accumulated points convert to a payout
 * multiplier via a per-volatility scale:
 *
 *   multiplierX100 = round(points / scale × 100)
 *   payout         = floor(bet × multiplierX100 / 100)
 *
 * The scoring table (single 1 = 100, single 5 = 50, three-of-a-kind = face × 100
 * / 1000 for ones, escalating ×2/×4/×8 for 4/5/6 of a kind) and the volatility
 * configs (5/6/7 starting dice, bust ~25/22/20%, scale 300/440/620) mirror
 * GREED_DICE_VOLATILITIES in server/src/services/arcade-greed-dice.ts. The scales
 * are Monte-Carlo-tuned so all three variants return the same ~96% over time —
 * even strong bank/push play sits just under the stake (~4% house edge).
 */

import type { GameOdds, OddsRow, OddsVariant } from '@/components/arcade2/ArcadeOddsTab';

/** ~96% RTP target across all variants (≈4% edge). */
const RTP_PCT = 96;
const EDGE_PCT = 100 - RTP_PCT;

/** Shared Farkle scoring rows — identical across every volatility. */
const SCORING_ROWS: OddsRow[] = [
  { outcome: 'Single 1', chance: '100 pts', extra: 'each', tone: 'cyan' },
  { outcome: 'Single 5', chance: '50 pts', extra: 'each', tone: 'cyan' },
  { outcome: 'Three 1s', chance: '1000 pts', extra: '3 of a kind', tone: 'amber' },
  { outcome: 'Three of a kind', chance: 'face × 100', extra: '3 of a kind', tone: 'slate' },
  { outcome: 'Four / five / six', chance: '×2 / ×4 / ×8', extra: 'on the triple', tone: 'slate' },
  { outcome: 'Hot dice', chance: 'reroll all', extra: 'points kept', tone: 'cyan' },
];

interface Volatility {
  id: string;
  label: string;
  dice: number;
  scale: number;
  bustPct: number;
}

// dice / scale mirror GREED_DICE_VOLATILITIES; bust% from the lab Monte-Carlo.
const VOLATILITIES: Volatility[] = [
  { id: 'five', label: '5 dice · high vol', dice: 5, scale: 300, bustPct: 25 },
  { id: 'six', label: '6 dice · balanced', dice: 6, scale: 440, bustPct: 22 },
  { id: 'seven', label: '7 dice · low vol', dice: 7, scale: 620, bustPct: 20 },
];

function buildVariant(v: Volatility): OddsVariant {
  return {
    id: v.id,
    label: v.label,
    edgePct: EDGE_PCT,
    rtpPct: RTP_PCT,
    rows: SCORING_ROWS,
    headers: ['Combo', 'Scores', 'Note'],
    note: `Start with ${v.dice} dice; a non-scoring roll farkles (~${v.bustPct}% per turn) and forfeits the turn. Banked points pay multiplierX100 = round(points / ${v.scale} × 100), so ${v.scale} points = 1.00×. Fewer dice farkle more often but the scale is tuned per variant, so all three return the same ~${RTP_PCT}% over time.`,
  };
}

export const greedDiceOdds: GameOdds = {
  blurb:
    'Roll the dice; every scoring die banks automatically and your points grow. Bank the points for a multiplier, or reroll the leftovers for more — but roll nothing and you farkle, losing the whole turn. The scoring table is the same for all three variants; only the dice count and the points→multiplier scale change, tuned so each returns the same ~96%.',
  variants: VOLATILITIES.map(buildVariant),
};
