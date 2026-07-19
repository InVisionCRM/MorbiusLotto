#!/usr/bin/env node
/**
 * Unit tests for the deposit modal's PLS quote selection (hooks/use-pls-quote.ts).
 *
 * The deposit CTA is gated on this logic — when it misbehaves the Deposit
 * button either stays disabled (quote stuck "loading") or enables while the
 * handler silently no-ops (no quote). These tests pin the pure selection
 * logic across every price-source branch. Run: node scripts/test-pls-quote.cjs
 */
const path = require('path');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));
const fs = require('fs');

// Transpile the hook and load it with stubbed externals — selectPlsQuote itself is pure.
const src = fs.readFileSync(path.join(__dirname, '..', 'hooks', 'use-pls-quote.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const stubs = {
  react: { useMemo: (f) => f(), useState: (v) => [v, () => {}], useEffect: () => {} },
  wagmi: { useReadContract: () => ({ data: undefined, error: null, isLoading: false }) },
  '@/lib/contracts': {
    PULSEX_V1_ROUTER_ADDRESS: '0xrouter', WPLS_TOKEN_ADDRESS: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
    MORBIUS_TOKEN_ADDRESS: '0xmorb', WPLS_MORBIUS_PAIR: '0xpair', TOKEN_DECIMALS: 18,
  },
  '@/lib/dexscreener-client': { fetchDexScreenerProxy: async () => ({ ok: false }) },
};
const mod = { exports: {} };
new Function('exports', 'require', 'module', js)(mod.exports, (name) => {
  if (stubs[name]) return stubs[name];
  throw new Error('unexpected import: ' + name);
}, mod);
const { selectPlsQuote } = mod.exports;
if (typeof selectPlsQuote !== 'function') { console.error('FAIL: selectPlsQuote not exported'); process.exit(1); }

const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
const E18 = 10n ** 18n;
const base = { plsBaseQuote: undefined, reserves: undefined, token0: undefined, dexScreenerPrice: null, morbiusCost: 10000n * E18, wplsAddress: WPLS, tokenDecimals: 18 };

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '—', e.message); }
}
function eq(a, b, what) { if (a !== b) throw new Error(`${what}: got ${a}, want ${b}`); }

console.log('selectPlsQuote — price source priority & failure modes');

t('router quote wins when present', () => {
  const r = selectPlsQuote({ ...base, plsBaseQuote: [123n * E18, 10000n * E18], reserves: [1n, 2n, 0], token0: WPLS });
  eq(r.source, 'router', 'source'); eq(r.hasQuote, true, 'hasQuote'); eq(r.usingFallback, false, 'fallback');
  eq(r.plsValue, 123n * E18, 'plsValue');
});

t('reserves fallback when router missing (WPLS is token0)', () => {
  // 2,000,000 WPLS : 1,000,000 MORBIUS pool → 10,000 MORBIUS costs 20,000 PLS
  const r = selectPlsQuote({ ...base, reserves: [2000000n * E18, 1000000n * E18, 0], token0: WPLS });
  eq(r.source, 'reserves', 'source'); eq(r.usingFallback, true, 'fallback');
  eq(r.plsValue, 20000n * E18, 'plsValue');
});

t('reserves fallback orients correctly when WPLS is token1', () => {
  const r = selectPlsQuote({ ...base, reserves: [1000000n * E18, 2000000n * E18, 0], token0: '0xother' });
  eq(r.source, 'reserves', 'source'); eq(r.plsValue, 20000n * E18, 'plsValue (flipped reserves)');
});

t('dexscreener is last resort', () => {
  // priceNative 2.0 → 10,000 MORBIUS costs 20,000 PLS
  const r = selectPlsQuote({ ...base, dexScreenerPrice: 2n * E18 });
  eq(r.source, 'dexscreener', 'source'); eq(r.usingFallback, true, 'fallback');
  eq(r.plsValue, 20000n * E18, 'plsValue');
});

t('THE BUG CASE: no source at all → hasQuote false, zero value (CTA must show a reason, not silently no-op)', () => {
  const r = selectPlsQuote({ ...base });
  eq(r.hasQuote, false, 'hasQuote'); eq(r.plsValue, 0n, 'plsValue'); eq(r.source, 'none', 'source');
});

t('empty router array does not count as a quote', () => {
  const r = selectPlsQuote({ ...base, plsBaseQuote: [] });
  eq(r.hasQuote, false, 'hasQuote');
});

t('zero morbiusCost never produces a quote from fallbacks', () => {
  const r = selectPlsQuote({ ...base, morbiusCost: 0n, reserves: [2n * E18, 1n * E18, 0], token0: WPLS, dexScreenerPrice: 2n * E18 });
  eq(r.hasQuote, false, 'hasQuote'); eq(r.plsValue, 0n, 'plsValue');
});

t('empty pool (zero MORBIUS reserve) is not a quote and does not divide by zero', () => {
  const r = selectPlsQuote({ ...base, reserves: [2000000n * E18, 0n, 0], token0: WPLS });
  eq(r.hasQuote, false, 'hasQuote');
});

t('tiny amount rounding to zero PLS is rejected (cannot send 0 PLS)', () => {
  // 1 wei of MORBIUS against a pool where price rounds to zero
  const r = selectPlsQuote({ ...base, morbiusCost: 1n, reserves: [1n, 1000000n * E18, 0], token0: WPLS });
  eq(r.hasQuote, false, 'hasQuote');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
