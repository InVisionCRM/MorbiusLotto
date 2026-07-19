#!/usr/bin/env node
/**
 * Unit tests for the swap-deposit verification helper
 * (server/src/utils/swap-deposit.ts) — the server credits PLS deposits by
 * summing MORBIUS Transfer→vault logs from the user's PulseX swap tx.
 * Run: node scripts/test-swap-deposit.cjs
 */
const path = require('path');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));
const fs = require('fs');

const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'src', 'utils', 'swap-deposit.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', js)(mod.exports, () => { throw new Error('no imports expected'); }, mod);
const { extractSwapDepositAmount, ERC20_TRANSFER_TOPIC } = mod.exports;

const MORB = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
const VAULT = '0x4A5a82f644A7CB20A2c8Bf0Cf4369DC641E8CeD2';
const PAIR = '0x81acd0AA872675678A25fbB154992A2baD4F6CEF';
const OTHER = '0x1111111111111111111111111111111111111111';
const E18 = 10n ** 18n;

const topicAddr = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const amountData = (v) => '0x' + v.toString(16).padStart(64, '0');
const transferLog = (token, from, to, value) => ({
  address: token,
  topics: [ERC20_TRANSFER_TOPIC, topicAddr(from), topicAddr(to)],
  data: amountData(value),
});

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '—', e.message); }
}
function eq(a, b, what) { if (a !== b) throw new Error(`${what}: got ${a}, want ${b}`); }

console.log('extractSwapDepositAmount — swap-tx crediting');

t('credits the MORBIUS Transfer from the pair to the vault', () => {
  const logs = [transferLog(MORB, PAIR, VAULT, 10000n * E18)];
  eq(extractSwapDepositAmount(logs, MORB, VAULT), 10000n * E18, 'amount');
});

t('sums multiple hops into the vault', () => {
  const logs = [
    transferLog(MORB, PAIR, VAULT, 6000n * E18),
    transferLog(MORB, OTHER, VAULT, 4000n * E18),
  ];
  eq(extractSwapDepositAmount(logs, MORB, VAULT), 10000n * E18, 'sum');
});

t('ignores transfers of OTHER tokens to the vault (no counterfeit-token credit)', () => {
  const logs = [transferLog(OTHER, PAIR, VAULT, 999999n * E18)];
  eq(extractSwapDepositAmount(logs, MORB, VAULT), 0n, 'amount');
});

t('ignores MORBIUS transfers to other recipients (user keeping the tokens is not a deposit)', () => {
  const logs = [transferLog(MORB, PAIR, OTHER, 10000n * E18)];
  eq(extractSwapDepositAmount(logs, MORB, VAULT), 0n, 'amount');
});

t('address comparison is case-insensitive (checksummed vs lowercase)', () => {
  const logs = [transferLog(MORB.toLowerCase(), PAIR, VAULT.toLowerCase(), 5n * E18)];
  eq(extractSwapDepositAmount(logs, MORB.toUpperCase().replace('0X', '0x'), VAULT, 5n * E18 > 0n ? 5n * E18 : 0n), 5n * E18, 'amount');
});

t('rejects malformed data payloads instead of throwing', () => {
  const logs = [{ address: MORB, topics: [ERC20_TRANSFER_TOPIC, topicAddr(PAIR), topicAddr(VAULT)], data: '0xzz' }];
  eq(extractSwapDepositAmount(logs, MORB, VAULT), 0n, 'amount');
});

t('non-Transfer events from the token are ignored (wrong topic0)', () => {
  const logs = [{ address: MORB, topics: ['0x' + 'ab'.repeat(32), topicAddr(PAIR), topicAddr(VAULT)], data: amountData(5n) }];
  eq(extractSwapDepositAmount(logs, MORB, VAULT), 0n, 'amount');
});

t('empty logs → zero (route must reject)', () => {
  eq(extractSwapDepositAmount([], MORB, VAULT), 0n, 'amount');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
