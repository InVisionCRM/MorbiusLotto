/**
 * Texas Hold'em hand evaluation for 5-7 cards.
 * Card indices 0-51 follow app-wide encoding:
 *   rankIndex = idx % 13 where 0..12 => 2,3,4,5,6,7,8,9,T,J,Q,K,A
 *   suitIndex = floor(idx / 13)
 */

export const enum HandRank {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

function rankOf(cardIndex: number): number {
  const rankIndex = cardIndex % 13;
  // 0..11 => 2..13, 12 => 14 (Ace high)
  return rankIndex === 12 ? 14 : rankIndex + 2;
}

function suitOf(cardIndex: number): number {
  return Math.floor(cardIndex / 13);
}

/** Rank 1 (Ace) can be 1 or 14 for straights */
function rankValues(cardIndices: number[]): number[] {
  return cardIndices.map((c) => rankOf(c));
}

/** All 5-card combinations from 7 cards (C(7,5) = 21) */
function choose5(indices: number[]): number[][] {
  const out: number[][] = [];
  const n = indices.length;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        for (let d = c + 1; d < n; d++) {
          for (let e = d + 1; e < n; e++) {
            out.push([indices[a], indices[b], indices[c], indices[d], indices[e]]);
          }
        }
      }
    }
  }
  return out;
}

export interface RankedHand {
  rank: HandRank;
  /** Comparable values: e.g. [pair rank, kicker1, kicker2, kicker3] for pair */
  values: number[];
  cards: number[];
}

function eval5(cards: number[]): RankedHand {
  const ranks = cards.map((c) => rankOf(c));
  const suits = cards.map((c) => suitOf(c));
  const values = rankValues(cards).sort((a, b) => b - a);

  const countByRank: Record<number, number> = {};
  for (const r of values) {
    countByRank[r] = (countByRank[r] || 0) + 1;
  }
  const counts = Object.entries(countByRank)
    .map(([r, c]) => [Number(r), c] as [number, number])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const isFlush = suits.every((s) => s === suits[0]);
  const sorted = [...values].sort((a, b) => b - a);
  const unique = [...new Set(sorted)];

  function isStraight(vals: number[]): number | null {
    let s = [...new Set(vals)].sort((a, b) => b - a);
    if (s.includes(14)) s = [...new Set([...s, 1])].sort((a, b) => b - a);
    for (let i = 0; i <= s.length - 5; i++) {
      const slice = s.slice(i, i + 5);
      if (slice[0] - slice[4] === 4) return slice[0];
    }
    return null;
  }

  const straightHigh = isStraight(values);
  if (isFlush && straightHigh !== null) {
    return { rank: HandRank.StraightFlush, values: [straightHigh], cards };
  }
  if (counts[0][1] === 4) {
    const quad = counts[0][0];
    const kicker = counts[1][0];
    return { rank: HandRank.Quads, values: [quad, kicker], cards };
  }
  if (counts[0][1] === 3 && counts[1][1] >= 2) {
    return { rank: HandRank.FullHouse, values: [counts[0][0], counts[1][0]], cards };
  }
  if (isFlush) {
    return { rank: HandRank.Flush, values: sorted.slice(0, 5), cards };
  }
  if (straightHigh !== null) {
    return { rank: HandRank.Straight, values: [straightHigh], cards };
  }
  if (counts[0][1] === 3) {
    const trip = counts[0][0];
    const kickers = counts.slice(1).map((x) => x[0]).sort((a, b) => b - a).slice(0, 2);
    return { rank: HandRank.Trips, values: [trip, ...kickers], cards };
  }
  if (counts[0][1] === 2 && counts[1][1] === 2) {
    const [p1, p2] = [counts[0][0], counts[1][0]].sort((a, b) => b - a);
    const kicker = counts[2][0];
    return { rank: HandRank.TwoPair, values: [p1, p2, kicker], cards };
  }
  if (counts[0][1] === 2) {
    const pair = counts[0][0];
    const kickers = counts.slice(1).map((x) => x[0]).sort((a, b) => b - a).slice(0, 3);
    return { rank: HandRank.Pair, values: [pair, ...kickers], cards };
  }
  return { rank: HandRank.HighCard, values: sorted.slice(0, 5), cards };
}

/**
 * Best 5-card hand from 5 to 7 card indices (0-51).
 */
export function bestHand(cardIndices: number[]): RankedHand {
  if (cardIndices.length === 5) return eval5(cardIndices);
  if (cardIndices.length < 5 || cardIndices.length > 7) throw new Error('Need 5-7 cards');
  const combos = choose5(cardIndices);
  let best = eval5(combos[0]);
  for (let i = 1; i < combos.length; i++) {
    const candidate = eval5(combos[i]);
    if (compareHands(candidate, best) > 0) best = candidate;
  }
  return best;
}

/** Human-readable hand name for UI. */
export function handRankToName(rank: HandRank): string {
  const names: Record<HandRank, string> = {
    [HandRank.HighCard]: 'High Card',
    [HandRank.Pair]: 'Pair',
    [HandRank.TwoPair]: 'Two Pair',
    [HandRank.Trips]: 'Three of a Kind',
    [HandRank.Straight]: 'Straight',
    [HandRank.Flush]: 'Flush',
    [HandRank.FullHouse]: 'Full House',
    [HandRank.Quads]: 'Four of a Kind',
    [HandRank.StraightFlush]: 'Straight Flush',
  };
  return names[rank] ?? 'Hand';
}

/**
 * Compare two ranked hands. Returns positive if a > b, negative if a < b, 0 if tie.
 */
export function compareHands(a: RankedHand, b: RankedHand): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.values.length, b.values.length); i++) {
    const va = a.values[i] ?? 0;
    const vb = b.values[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

/**
 * Given multiple hands (e.g. at showdown), return winner indices (can be tie).
 * Each hand is array of 5-7 card indices for that player.
 */
export function winners(
  hands: number[][]
): number[] {
  if (hands.length === 0) return [];
  const ranked = hands.map((h) => bestHand(h));
  let bestIdx = 0;
  const result: number[] = [0];
  for (let i = 1; i < ranked.length; i++) {
    const cmp = compareHands(ranked[i], ranked[bestIdx]);
    if (cmp > 0) {
      bestIdx = i;
      result.length = 0;
      result.push(i);
    } else if (cmp === 0) {
      result.push(i);
    }
  }
  return result;
}
