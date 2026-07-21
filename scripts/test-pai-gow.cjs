#!/usr/bin/env node
/**
 * Unit tests for the Pai Gow Poker math (server/src/services/arcade-pai-gow-poker.ts).
 * Transpiles the TS in-memory and exercises the evaluators, the house way
 * (must NEVER foul), split validation, and settlement (commission + copies).
 * Run: node scripts/test-pai-gow.cjs
 */
const path = require('path');
const fs = require('fs');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));

const src = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'src', 'services', 'arcade-pai-gow-poker.ts'),
  'utf8',
);
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', js)(mod.exports, require, mod);
const {
  pgRank, pgSuit, handName, highHandName, houseWaySplit, validateSplit, settlePaiGow, validateBet,
  PG_MIN_BET, PG_MAX_BET,
} = mod.exports;

// card(rank 2..14, suit 0..3) -> deck index 0..51
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
  eq(pgRank(card(14, 0)), 14, 'ace rank');
  eq(pgRank(card(2, 3)), 2, 'two rank');
  eq(pgSuit(card(7, 2)), 2, 'suit');
  for (let i = 0; i < 52; i++) { ok(pgRank(i) >= 2 && pgRank(i) <= 14, 'rank range'); ok(pgSuit(i) >= 0 && pgSuit(i) <= 3, 'suit range'); }
});

// ── 5-card evaluator (via highHandName) ──────────────────────────────────────
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

// ── settlement ───────────────────────────────────────────────────────────────
console.log('settlement (commission + copies)');
const royalHigh = [card(14,0),card(13,0),card(12,0),card(11,0),card(10,0)];
const weakHigh  = [card(9,0),card(7,1),card(5,2),card(4,3),card(2,0)]; // 9 high
const kkLow = [card(13,2),card(13,3)];
const q3Low = [card(12,2),card(3,3)];

t('win both → 1:1 minus 5% commission', () => {
  const s = settlePaiGow(royalHigh, kkLow, weakHigh, q3Low, 1000);
  eq(s.result, 'win', 'result'); eq(s.totalPayout, 1950, 'gross'); eq(s.net, 950, 'net');
  ok(s.winHigh && s.winLow && s.won, 'flags');
});
t('win one / lose one → push', () => {
  const s = settlePaiGow(royalHigh, q3Low, weakHigh, kkLow, 1000); // win high, lose low
  eq(s.result, 'push', 'result'); eq(s.totalPayout, 1000, 'gross'); eq(s.net, 0, 'net');
  ok(s.winHigh && !s.winLow && !s.won, 'flags');
});
t('lose both → bet lost', () => {
  const s = settlePaiGow(weakHigh, q3Low, royalHigh, kkLow, 1000);
  eq(s.result, 'loss', 'result'); eq(s.totalPayout, 0, 'gross'); eq(s.net, -1000, 'net');
});
t('copies go to the dealer (high copy + low loss = loss)', () => {
  // identical high hands (copy → dealer), player loses low → wins 0 → loss
  const s = settlePaiGow(royalHigh, q3Low, royalHigh, kkLow, 1000);
  ok(s.copyHigh, 'copyHigh'); ok(!s.winHigh, 'copy is not a win'); eq(s.result, 'loss', 'result');
});
t('copy on one, win the other → push', () => {
  const s = settlePaiGow(royalHigh, kkLow, royalHigh, q3Low, 1000); // high copy, win low
  ok(s.copyHigh && s.winLow, 'flags'); eq(s.result, 'push', 'push');
});
t('commission floors (odd bet)', () => {
  const s = settlePaiGow(royalHigh, kkLow, weakHigh, q3Low, 777); // comm floor(777*0.05)=38
  eq(s.totalPayout, 777 + (777 - 38), 'gross'); eq(s.net, 777 - 38, 'net');
});

// ── bet validation ───────────────────────────────────────────────────────────
console.log('bet validation');
t('clamps to [MIN,MAX]', () => {
  eq(validateBet(500).ok, true, 'valid'); eq(validateBet(500).bet, 500, 'bet');
  eq(validateBet(PG_MIN_BET - 1).ok, false, 'below min');
  eq(validateBet(PG_MAX_BET + 1).ok, false, 'above max');
  eq(validateBet('abc').ok, false, 'nan');
});

// ── deterministic RNG for random deals ───────────────────────────────────────
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function deal7(rng) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = deck[i]; deck[i] = deck[j]; deck[j] = x; }
  return deck.slice(0, 7);
}

// ── house way: MUST never foul, over many random deals ───────────────────────
console.log('house way (never fouls) + split validation');
t('house way never fouls across 20000 random deals', () => {
  const rng = mulberry32(0xC0FFEE);
  for (let n = 0; n < 20000; n++) {
    const hand = deal7(rng);
    const { low, high } = houseWaySplit(hand);
    eq(low.length, 2, 'low size'); eq(high.length, 5, 'high size');
    // low + high must be a partition of the 7 dealt cards
    const all = [...low, ...high].slice().sort((a, b) => a - b);
    eq(JSON.stringify(all), JSON.stringify(hand.slice().sort((a, b) => a - b)), 'partition');
    // the house-way split must validate (i.e. never foul)
    const v = validateSplit(hand, low);
    ok(v.ok, `house way fouled on deal ${JSON.stringify(hand)}: ${v.error}`);
  }
});

t('validateSplit rejects fouls, wrong counts, foreign/dup cards', () => {
  // A pair of aces down with a weak 5-high up would foul → craft one:
  // hand: A A 9 7 5 4 2  → putting the two aces low fouls (pair beats 9-high)
  const hand = [card(14,0),card(14,1),card(9,2),card(7,3),card(5,0),card(4,1),card(2,2)];
  const foul = validateSplit(hand, [card(14,0),card(14,1)]);
  eq(foul.ok, false, 'foul rejected');
  eq(validateSplit(hand, [card(14,0)]).ok, false, 'need exactly 2');
  eq(validateSplit(hand, [card(14,0),card(14,0)]).ok, false, 'distinct');
  eq(validateSplit(hand, [card(14,0),card(13,3)]).ok, false, 'foreign card');
  // a valid split: two lowest singles down
  const good = validateSplit(hand, [card(4,1),card(2,2)]);
  eq(good.ok, true, 'valid split ' + (good.error || ''));
  eq(good.low.length, 2, 'low'); eq(good.high.length, 5, 'high');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
