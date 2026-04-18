"use strict";
/**
 * Texas Hold'em hand evaluation for 5-7 cards.
 * Card indices 0-51: rank = (idx % 13) + 2 (2=Two, 14=Ace), suit = floor(idx/13).
 * Matches the game service encoding where rankIndex 0=Two, 12=Ace.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bestHand = bestHand;
exports.handRankToName = handRankToName;
exports.compareHands = compareHands;
exports.winners = winners;
function rankOf(cardIndex) {
    return (cardIndex % 13) + 2;
}
function suitOf(cardIndex) {
    return Math.floor(cardIndex / 13);
}
/** Rank values for comparison (Ace = 14, already natural from rankOf). */
function rankValues(cardIndices) {
    return cardIndices.map((c) => rankOf(c));
}
/** All 5-card combinations from 7 cards (C(7,5) = 21) */
function choose5(indices) {
    const out = [];
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
function eval5(cards) {
    const ranks = cards.map((c) => rankOf(c));
    const suits = cards.map((c) => suitOf(c));
    const values = rankValues(cards).sort((a, b) => b - a);
    const countByRank = {};
    for (const r of values) {
        countByRank[r] = (countByRank[r] || 0) + 1;
    }
    const counts = Object.entries(countByRank)
        .map(([r, c]) => [Number(r), c])
        .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const isFlush = suits.every((s) => s === suits[0]);
    const sorted = [...values].sort((a, b) => b - a);
    const unique = [...new Set(sorted)];
    function isStraight(vals) {
        let s = [...new Set(vals)].sort((a, b) => b - a);
        if (s.includes(14))
            s = [...new Set([...s, 1])].sort((a, b) => b - a);
        for (let i = 0; i <= s.length - 5; i++) {
            const slice = s.slice(i, i + 5);
            if (slice[0] - slice[4] === 4)
                return slice[0];
        }
        return null;
    }
    const straightHigh = isStraight(values);
    if (isFlush && straightHigh !== null) {
        return { rank: 8 /* HandRank.StraightFlush */, values: [straightHigh], cards };
    }
    if (counts[0][1] === 4) {
        const quad = counts[0][0];
        const kicker = counts[1][0];
        return { rank: 7 /* HandRank.Quads */, values: [quad, kicker], cards };
    }
    if (counts[0][1] === 3 && counts[1][1] >= 2) {
        return { rank: 6 /* HandRank.FullHouse */, values: [counts[0][0], counts[1][0]], cards };
    }
    if (isFlush) {
        return { rank: 5 /* HandRank.Flush */, values: sorted.slice(0, 5), cards };
    }
    if (straightHigh !== null) {
        return { rank: 4 /* HandRank.Straight */, values: [straightHigh], cards };
    }
    if (counts[0][1] === 3) {
        const trip = counts[0][0];
        const kickers = counts.slice(1).map((x) => x[0]).sort((a, b) => b - a).slice(0, 2);
        return { rank: 3 /* HandRank.Trips */, values: [trip, ...kickers], cards };
    }
    if (counts[0][1] === 2 && counts[1][1] === 2) {
        const [p1, p2] = [counts[0][0], counts[1][0]].sort((a, b) => b - a);
        const kicker = counts[2][0];
        return { rank: 2 /* HandRank.TwoPair */, values: [p1, p2, kicker], cards };
    }
    if (counts[0][1] === 2) {
        const pair = counts[0][0];
        const kickers = counts.slice(1).map((x) => x[0]).sort((a, b) => b - a).slice(0, 3);
        return { rank: 1 /* HandRank.Pair */, values: [pair, ...kickers], cards };
    }
    return { rank: 0 /* HandRank.HighCard */, values: sorted.slice(0, 5), cards };
}
/**
 * Best 5-card hand from 5 to 7 card indices (0-51).
 */
function bestHand(cardIndices) {
    if (cardIndices.length === 5)
        return eval5(cardIndices);
    if (cardIndices.length < 5 || cardIndices.length > 7)
        throw new Error('Need 5-7 cards');
    const combos = choose5(cardIndices);
    let best = eval5(combos[0]);
    for (let i = 1; i < combos.length; i++) {
        const candidate = eval5(combos[i]);
        if (compareHands(candidate, best) > 0)
            best = candidate;
    }
    return best;
}
/** Human-readable hand name for UI. */
function handRankToName(rank) {
    const names = {
        [0 /* HandRank.HighCard */]: 'High Card',
        [1 /* HandRank.Pair */]: 'Pair',
        [2 /* HandRank.TwoPair */]: 'Two Pair',
        [3 /* HandRank.Trips */]: 'Three of a Kind',
        [4 /* HandRank.Straight */]: 'Straight',
        [5 /* HandRank.Flush */]: 'Flush',
        [6 /* HandRank.FullHouse */]: 'Full House',
        [7 /* HandRank.Quads */]: 'Four of a Kind',
        [8 /* HandRank.StraightFlush */]: 'Straight Flush',
    };
    return names[rank] ?? 'Hand';
}
/**
 * Compare two ranked hands. Returns positive if a > b, negative if a < b, 0 if tie.
 */
function compareHands(a, b) {
    if (a.rank !== b.rank)
        return a.rank - b.rank;
    for (let i = 0; i < Math.max(a.values.length, b.values.length); i++) {
        const va = a.values[i] ?? 0;
        const vb = b.values[i] ?? 0;
        if (va !== vb)
            return va - vb;
    }
    return 0;
}
/**
 * Given multiple hands (e.g. at showdown), return winner indices (can be tie).
 * Each hand is array of 5-7 card indices for that player.
 */
function winners(hands) {
    if (hands.length === 0)
        return [];
    const ranked = hands.map((h) => bestHand(h));
    let bestIdx = 0;
    const result = [0];
    for (let i = 1; i < ranked.length; i++) {
        const cmp = compareHands(ranked[i], ranked[bestIdx]);
        if (cmp > 0) {
            bestIdx = i;
            result.length = 0;
            result.push(i);
        }
        else if (cmp === 0) {
            result.push(i);
        }
    }
    return result;
}
//# sourceMappingURL=poker-hand-eval.js.map