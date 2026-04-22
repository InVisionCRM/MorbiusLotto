/**
 * Preset prize splits for poker SNG creation. Server requires integer % per rank
 * (length = max seats), summing to exactly 100.
 */

export type PokerPrizePresetId =
  | 'winner_takes_all'
  | 'everybody_wins'
  | 'podium_classic'
  | 'top_two'
  | 'top_four'
  | 'top_five'
  | 'balanced_podium'
  | 'champion_heavy'
  | 'silver_runner_up'
  | 'deep_table';

export interface PokerPrizePresetMeta {
  id: PokerPrizePresetId;
  label: string;
  shortDescription: string;
}

/** Largest remainder: integer shares summing to `total` from non-negative weights. */
export function allocatePercentsFromWeights(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) {
    const out = Array(weights.length).fill(0);
    out[0] = total;
    return out;
  }
  const exact = weights.map((w) => (total * w) / sumW);
  const floors = exact.map((v) => Math.floor(v));
  let rem = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < rem; k++) {
    out[order[k % order.length].i]++;
  }
  return out;
}

function winnerTakesAllWeights(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0));
}

/**
 * First ~70%, last place 2%, remaining spread by rank among middle finishers
 * (better ranks among middle get more). Heads-up: 98 / 2.
 */
export function everybodyWinsPercents(n: number): number[] {
  if (n < 2) return [100];
  if (n === 2) return [98, 2];
  const out = Array(n).fill(0);
  out[0] = 70;
  out[n - 1] = 2;
  const middle = n - 2;
  const pool = 28;
  const weights = Array.from({ length: middle }, (_, i) => middle - i);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const middleParts = allocatePercentsFromWeights(pool, weights);
  for (let i = 0; i < middle; i++) {
    out[1 + i] = middleParts[i];
  }
  return out;
}

function fromHeadTemplate(head: number[], n: number): number[] {
  const w = head.slice(0, n);
  while (w.length < n) w.push(0);
  return allocatePercentsFromWeights(100, w);
}

export const POKER_PRIZE_PRESET_LIST: PokerPrizePresetMeta[] = [
  { id: 'winner_takes_all', label: 'Winner takes all', shortDescription: '100% to 1st place' },
  { id: 'everybody_wins', label: 'Everybody wins', shortDescription: '~70% 1st, 2% last, rest by rank' },
  { id: 'podium_classic', label: 'Classic podium', shortDescription: '50% / 30% / 20% for top three' },
  { id: 'top_two', label: 'Top two duel', shortDescription: '70% / 30% for the final two' },
  { id: 'top_four', label: 'Top four', shortDescription: '40% / 25% / 20% / 15%' },
  { id: 'top_five', label: 'Top five', shortDescription: '45% / 22% / 15% / 10% / 8%' },
  { id: 'balanced_podium', label: 'Balanced podium', shortDescription: '40% / 35% / 25% for top three' },
  { id: 'champion_heavy', label: 'Champion heavy', shortDescription: 'Top-heavy: ~82% / 12% / 6%' },
  { id: 'silver_runner_up', label: 'Silver & runner-up', shortDescription: '48% / 35% / 12% / 5% for top four' },
  { id: 'deep_table', label: 'Deep table', shortDescription: 'Six-way curve down the field' },
];

const HEAD_BY_ID: Record<Exclude<PokerPrizePresetId, 'everybody_wins'>, number[]> = {
  winner_takes_all: [100, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  podium_classic: [50, 30, 20, 0, 0, 0, 0, 0, 0, 0],
  top_two: [70, 30, 0, 0, 0, 0, 0, 0, 0, 0],
  top_four: [40, 25, 20, 15, 0, 0, 0, 0, 0, 0],
  top_five: [45, 22, 15, 10, 8, 0, 0, 0, 0, 0],
  balanced_podium: [40, 35, 25, 0, 0, 0, 0, 0, 0, 0],
  champion_heavy: [82, 12, 6, 0, 0, 0, 0, 0, 0, 0],
  silver_runner_up: [48, 35, 12, 5, 0, 0, 0, 0, 0, 0],
  deep_table: [25, 20, 17, 15, 13, 10, 0, 0, 0, 0],
};

export function buildPrizePercents(presetId: PokerPrizePresetId, maxPlayers: number): number[] {
  const n = Math.max(2, Math.min(10, maxPlayers));
  if (presetId === 'everybody_wins') {
    return everybodyWinsPercents(n);
  }
  if (presetId === 'winner_takes_all') {
    return allocatePercentsFromWeights(100, winnerTakesAllWeights(n));
  }
  return fromHeadTemplate(HEAD_BY_ID[presetId], n);
}

export function findPokerPrizePresetMeta(id: PokerPrizePresetId): PokerPrizePresetMeta | undefined {
  return POKER_PRIZE_PRESET_LIST.find((p) => p.id === id);
}
