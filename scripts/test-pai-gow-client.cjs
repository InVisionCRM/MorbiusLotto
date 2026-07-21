#!/usr/bin/env node
/**
 * Unit tests for the CLIENT Pai Gow Poker mirror (lib/pai-gow-poker-client.ts).
 * Transpiles the TS in-memory (stubbing the `@/lib/*` imports it never calls in
 * these tests) and exercises the index-based evaluators + the client house way,
 * which must NEVER foul. Companion to scripts/test-pai-gow.cjs (which tests the
 * SERVER module). Run: node scripts/test-pai-gow-client.cjs
 */
const path = require('path');
const fs = require('fs');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));

const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'pai-gow-poker-client.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

// The client lib imports API helpers (@/lib/api-auth, @/lib/api-urls) that the
// pure card/house-way functions never call — stub any '@/…' module.
function stubRequire(id) {
  if (id.startsWith('@/')) return {};
  return require(id);
}
const mod = { exports: {} };
new Function('exports', 'require', 'module', js)(mod.exports, stubRequire, mod);
const {
  cardRank, cardSuit, score5, highHandName, lowName, houseWay, isValidSplit, checkSplit,
  reconcileSettlement,
} = mod.exports;

// card(rank 2..14, suit 0..3) -> deck index 0..51 (matches the server encoding)
const card = (r, s) => s * 13 + (r - 2);

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '—', e.message); }
}
function eq(a, b, what) { if (a !== b) throw new Error(`${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
function ok(v, what) { if (!v) throw new Error(what); }

// ── card encoding round-trips ────────────────────────────────────────────────
console.log('card encoding');
t('rank/suit derive from index', () => {
  eq(cardRank(card(14, 0)), 14, 'ace rank');
  eq(cardRank(card(2, 3)), 2, 'two rank');
  eq(cardSuit(card(7, 2)), 2, 'suit');
  for (let i = 0; i < 52; i++) {
    ok(cardRank(i) >= 2 && cardRank(i) <= 14, 'rank range');
    ok(cardSuit(i) >= 0 && cardSuit(i) <= 3, 'suit range');
  }
});

// ── 5-card evaluator (via highHandName) — known hands ────────────────────────
console.log('5-card hand naming / ranking');
t('names the canonical hands', () => {
  eq(highHandName([card(14,0),card(13,0),card(12,0),card(11,0),card(10,0)]), 'Royal flush', 'royal');
  eq(highHandName([card(9,1),card(8,1),card(7,1),card(6,1),card(5,1)]), 'Straight flush', 'sf');
  eq(highHandName([card(14,0),card(14,1),card(14,2),card(14,3),card(13,0)]), 'Four As', 'quads');
  eq(highHandName([card(14,0),card(14,1),card(14,2),card(13,0),card(13,1)]), 'Full house', 'boat');
  eq(highHandName([card(14,2),card(11,2),card(9,2),card(5,2),card(3,2)]), 'Flush', 'flush');
  eq(highHandName([card(9,0),card(8,1),card(7,2),card(6,3),card(5,0)]), 'Straight', 'straight');
  eq(highHandName([card(14,0),card(2,1),card(3,2),card(4,3),card(5,0)]), 'Straight', 'wheel');
  eq(highHandName([card(14,0),card(14,1),card(14,2),card(13,0),card(12,1)]), 'Three As', 'trips');
  eq(highHandName([card(14,0),card(14,1),card(13,0),card(13,1),card(12,0)]), 'Two pair', 'twopair');
  eq(highHandName([card(14,0),card(14,1),card(13,0),card(12,1),card(11,0)]), 'Pair of As', 'pair');
  eq(highHandName([card(14,0),card(13,1),card(12,0),card(11,1),card(9,0)]), 'A high', 'high');
});

t('flush beats a straight (5-card ranking)', () => {
  const flush = score5([card(14,2),card(11,2),card(9,2),card(5,2),card(3,2)]);
  const straight = score5([card(9,0),card(8,1),card(7,2),card(6,3),card(5,0)]);
  ok(flush[0] > straight[0], 'flush category above straight');
});

t('lowName reads pair vs high correctly', () => {
  eq(lowName([card(13,2),card(13,3)]), 'Pair of Ks', 'pair');
  eq(lowName([card(12,2),card(3,3)]), 'Q-3 high', 'high');
});

// ── settlement reconcile mirror ──────────────────────────────────────────────
console.log('settlement reconcile (commission + copies)');
const royalHigh = [card(14,0),card(13,0),card(12,0),card(11,0),card(10,0)];
const weakHigh  = [card(9,0),card(7,1),card(5,2),card(4,3),card(2,0)];
const kkLow = [card(13,2),card(13,3)];
const q3Low = [card(12,2),card(3,3)];
t('win both → 1:1 minus 5% commission', () => {
  const s = reconcileSettlement(royalHigh, kkLow, weakHigh, q3Low, 1000);
  eq(s.result, 'win', 'result'); eq(s.totalPayout, 1950, 'gross'); eq(s.net, 950, 'net');
});
t('win one → push', () => {
  const s = reconcileSettlement(royalHigh, q3Low, weakHigh, kkLow, 1000);
  eq(s.result, 'push', 'result'); eq(s.totalPayout, 1000, 'gross');
});
t('lose both → bet lost', () => {
  const s = reconcileSettlement(weakHigh, q3Low, royalHigh, kkLow, 1000);
  eq(s.result, 'loss', 'result'); eq(s.totalPayout, 0, 'gross'); eq(s.net, -1000, 'net');
});
t('copies go to the dealer', () => {
  const s = reconcileSettlement(royalHigh, q3Low, royalHigh, kkLow, 1000);
  ok(s.copyHigh, 'copyHigh'); ok(!s.winHigh, 'copy is not a win'); eq(s.result, 'loss', 'result');
});

// ── deterministic RNG for random deals ───────────────────────────────────────
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function deal7(rng) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = deck[i]; deck[i] = deck[j]; deck[j] = x; }
  return deck.slice(0, 7);
}

// ── client house way: MUST never foul, over many random deals ────────────────
console.log('client house way (never fouls) + split checks');
t('house way never fouls across 5000 random deals', () => {
  const rng = mulberry32(0xC0FFEE);
  for (let n = 0; n < 5000; n++) {
    const hand = deal7(rng);
    const { low, high } = houseWay(hand);
    eq(low.length, 2, 'low size'); eq(high.length, 5, 'high size');
    // low + high must be a partition of the 7 dealt cards
    const all = [...low, ...high].slice().sort((a, b) => a - b);
    eq(JSON.stringify(all), JSON.stringify(hand.slice().sort((a, b) => a - b)), 'partition');
    // the house-way split must validate (i.e. never foul)
    ok(isValidSplit(high, low), `house way fouled on deal ${JSON.stringify(hand)}`);
    // checkSplit agrees the house-way low is a legal, non-fouling split
    const chk = checkSplit(hand, low);
    ok(chk.ok && !chk.fouled, `checkSplit rejected house way: ${chk.message}`);
  }
});

t('checkSplit flags an obvious foul (two aces down under a weak high)', () => {
  // A A 9 7 5 4 2 — putting both aces low fouls (pair beats the 9-high up top)
  const hand = [card(14,0),card(14,1),card(9,2),card(7,3),card(5,0),card(4,1),card(2,2)];
  const foul = checkSplit(hand, [card(14,0),card(14,1)]);
  ok(!foul.ok && foul.fouled, 'foul flagged');
  const good = checkSplit(hand, [card(4,1),card(2,2)]);
  ok(good.ok && !good.fouled, 'legal split accepted');
  const partial = checkSplit(hand, [card(4,1)]);
  ok(!partial.ok && !partial.fouled, 'incomplete split is not-ok but not a foul');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
