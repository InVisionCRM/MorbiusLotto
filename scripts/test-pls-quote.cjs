#!/usr/bin/env node
/**
 * Unit tests for the deposit modal's PLS quote selection (hooks/use-pls-quote.ts).
 *
 * The deposit CTA is gated on this logic — when it misbehaves the Deposit
 * button either stays disabled (quote stuck "loading") or enables while the
 * handler silently no-ops (no quote). These tests pin the pure selection
 * logic across every price-source branch. Background (verified on-chain):
 * the PulseX router's getAmountsIn reverts (ds-math-sub-underflow) for ANY
 * amount on the WPLS/MORBIUS pair, so the quote is computed from the pair's
 * own reserves with the exact UniswapV2 getAmountIn formula.
 * Run: node scripts/test-pls-quote.cjs
 */
const path = require('path');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));
const fs = require('fs');

// Transpile the hook and load it with stubbed externals — the tested functions are pure.
const src = fs.readFileSync(path.join(__dirname, '..', 'hooks', 'use-pls-quote.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const stubs = {
  react: { useMemo: (f) => f(), useState: (v) => [v, () => {}], useEffect: () => {} },
  wagmi: { useReadContract: () => ({ data: undefined, error: null, isLoading: false }) },
  '@/lib/contracts': {
    WPLS_TOKEN_ADDRESS: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
    WPLS_MORBIUS_PAIR: '0xpair', TOKEN_DECIMALS: 18,
  },
  '@/lib/dexscreener-client': { fetchDexScreenerProxy: async () => ({ ok: false }) },
};
const mod = { exports: {} };
new Function('exports', 'require', 'module', js)(mod.exports, (name) => {
  if (stubs[name]) return stubs[name];
  throw new Error('unexpected import: ' + name);
}, mod);
const { selectPlsQuote, getAmountInV2 } = mod.exports;
if (typeof selectPlsQuote !== 'function' || typeof getAmountInV2 !== 'function') {
  console.error('FAIL: selectPlsQuote/getAmountInV2 not exported'); process.exit(1);
}

const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
const E18 = 10n ** 18n;
const base = { reserves: undefined, token0: undefined, dexScreenerPrice: null, morbiusCost: 10000n * E18, wplsAddress: WPLS, tokenDecimals: 18 };

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '—', e.message); }
}
function eq(a, b, what) { if (a !== b) throw new Error(`${what}: got ${a}, want ${b}`); }
function ok(cond, what) { if (!cond) throw new Error(what); }

// Reference implementation of the UniswapV2 router formula, written independently.
const refAmountIn = (out, rin, rout) => (rin * out * 1000n) / ((rout - out) * 997n) + 1n;

console.log('getAmountInV2 — exact router math');

t('matches the UniswapV2 formula on a synthetic pool', () => {
  const rIn = 2000000n * E18, rOut = 1000000n * E18, out = 10000n * E18;
  eq(getAmountInV2(out, rIn, rOut), refAmountIn(out, rIn, rOut), 'amountIn');
});

t('rejects amountOut >= reserveOut (cannot drain the pool)', () => {
  eq(getAmountInV2(1000n, 1000n * E18, 1000n), null, 'at reserve');
  eq(getAmountInV2(2000n, 1000n * E18, 1000n), null, 'above reserve');
});

t('rejects zero/empty inputs', () => {
  eq(getAmountInV2(0n, E18, E18), null, 'zero out');
  eq(getAmountInV2(E18, 0n, E18), null, 'zero reserveIn');
  eq(getAmountInV2(E18, E18, 0n), null, 'zero reserveOut');
});

t('live-pool sanity: 10,000 MORBIUS from the on-chain probed reserves costs ~37.9K PLS', () => {
  // Values read from the real pair on 2026-07 (rpc.pulsechain.com):
  const wplsReserve = 379432488329067667129224602n;
  const morbReserve = 100394749078886762270736310n;
  const amountIn = getAmountInV2(10000n * E18, wplsReserve, morbReserve);
  ok(amountIn != null, 'quote exists');
  const pls = Number(amountIn) / 1e18;
  // spot ratio ≈ 37,794 PLS; with 0.3% fee ≈ 37,911 — accept a sane band
  ok(pls > 37000 && pls < 39000, `quote out of range: ${pls}`);
});

console.log('selectPlsQuote — price source priority & failure modes');

t('reserves are the PRIMARY source (WPLS is token0), exact formula applied', () => {
  const rIn = 2000000n * E18, rOut = 1000000n * E18;
  const r = selectPlsQuote({ ...base, reserves: [rIn, rOut, 0], token0: WPLS });
  eq(r.source, 'reserves', 'source'); eq(r.hasQuote, true, 'hasQuote'); eq(r.usingFallback, false, 'fallback');
  eq(r.plsValue, refAmountIn(10000n * E18, rIn, rOut), 'plsValue');
});

t('reserves orient correctly when WPLS is token1', () => {
  const rIn = 2000000n * E18, rOut = 1000000n * E18;
  const r = selectPlsQuote({ ...base, reserves: [rOut, rIn, 0], token0: '0xother' });
  eq(r.source, 'reserves', 'source');
  eq(r.plsValue, refAmountIn(10000n * E18, rIn, rOut), 'plsValue (flipped)');
});

t('dexscreener is the fallback when reserves are missing', () => {
  // priceNative 2.0 → 10,000 MORBIUS costs 20,000 PLS
  const r = selectPlsQuote({ ...base, dexScreenerPrice: 2n * E18 });
  eq(r.source, 'dexscreener', 'source'); eq(r.usingFallback, true, 'fallback');
  eq(r.plsValue, 20000n * E18, 'plsValue');
});

t('THE BUG CASE: no source at all → hasQuote false, zero value (CTA must show a reason, not silently no-op)', () => {
  const r = selectPlsQuote({ ...base });
  eq(r.hasQuote, false, 'hasQuote'); eq(r.plsValue, 0n, 'plsValue'); eq(r.source, 'none', 'source');
});

t('zero morbiusCost never produces a quote', () => {
  const r = selectPlsQuote({ ...base, morbiusCost: 0n, reserves: [2n * E18, E18, 0], token0: WPLS, dexScreenerPrice: 2n * E18 });
  eq(r.hasQuote, false, 'hasQuote'); eq(r.plsValue, 0n, 'plsValue');
});

t('empty pool (zero MORBIUS reserve) falls through to dexscreener when available', () => {
  const r = selectPlsQuote({ ...base, reserves: [2000000n * E18, 0n, 0], token0: WPLS, dexScreenerPrice: 2n * E18 });
  eq(r.source, 'dexscreener', 'source'); eq(r.hasQuote, true, 'hasQuote');
});

t('amountOut exceeding the pool reserve is not quotable from reserves', () => {
  const r = selectPlsQuote({ ...base, morbiusCost: 2000000n * E18, reserves: [2000000n * E18, 1000000n * E18, 0], token0: WPLS });
  eq(r.hasQuote, false, 'hasQuote');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
