// node --test stream/  (no deps)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { streamConfig, DEFAULT_CASH_PROMO, promoFile, pickFeatureTable, scoreTable, dailyStreamTitle, streamTitle, isMttBroadcast, MIN_DWELL_MS, applyBroadcast, currentExtras } from './worker.mjs';
import { mockCurrent, SCENARIOS } from './mock.mjs';

test('stream config defaults: avatars on, cash promo copy', () => {
  const c = streamConfig({});
  assert.equal(c.avatars, true);
  assert.equal(c.avatarBase, 'https://morbius.io/api/poker/avatar');
  assert.deepEqual(c.cashPromo, { enabled: true, ...DEFAULT_CASH_PROMO, lines: ['1, 4, 9 AM · 1, 5, 9 PM ET', '10,010 prize pool · Winner takes all'] });
  assert.match(c.cashPromo.tag, /\$Morbius on #PulseChain/);
  assert.equal(c.cashPromo.url, 'morbius.io/poker');
});

test('stream config: promo copy and avatars come from env', () => {
  const c = streamConfig({
    SITE_URL: 'https://staging.morbius.io/', STREAM_AVATARS: '0', STREAM_CASH_PROMO_TITLE: 'Weekly MTT',
    STREAM_CASH_PROMO_LINES: ' Sat 10 AM ET | 50,000 chips || ', STREAM_CASH_PROMO_KICKER: 'NEW',
  });
  assert.equal(c.avatars, false);
  assert.equal(c.avatarBase, 'https://staging.morbius.io/api/poker/avatar');
  assert.equal(c.cashPromo.title, 'Weekly MTT');
  assert.equal(c.cashPromo.kicker, 'NEW');
  assert.deepEqual(c.cashPromo.lines, ['Sat 10 AM ET', '50,000 chips']);
  assert.equal(streamConfig({ STREAM_CASH_PROMO: 'off' }).cashPromo.enabled, false);
});

test('stream config: promo CTA; QR is opt-in (1 = bundled, or a file in promos/; junk is ignored)', () => {
  assert.equal(streamConfig({}).cashPromo.cta, 'Play free at');
  assert.equal(streamConfig({}).cashPromo.qr, '');
  assert.equal(streamConfig({ STREAM_CASH_PROMO_CTA: 'Join free at' }).cashPromo.cta, 'Join free at');
  assert.equal(streamConfig({ STREAM_CASH_PROMO_QR: '1' }).cashPromo.qr, 'qr-morbius-poker.svg');
  assert.equal(streamConfig({ STREAM_CASH_PROMO_QR: 'qr-mtt.png' }).cashPromo.qr, 'qr-mtt.png');
  assert.equal(streamConfig({ STREAM_CASH_PROMO_QR: '../secret.svg' }).cashPromo.qr, '');
});

test('promo card assets ship in promos/ and are served with the right types (homepage tile art, M mark, Poppins)', () => {
  const want = { 'poker-tile-art.webp': 'image/webp', 'm-mark.png': 'image/png', 'pulsechain-logo.png': 'image/png', 'qr-morbius-poker.svg': 'image/svg+xml',
    'poppins-600.woff2': 'font/woff2', 'poppins-700.woff2': 'font/woff2', 'poppins-800.woff2': 'font/woff2', 'poppins-900.woff2': 'font/woff2' };
  for (const [f, type] of Object.entries(want)) assert.equal(promoFile(`/promos/${f}`)?.type, type, f);
  assert.equal(promoFile('/promos/../worker.mjs'), null);
  const svg = fs.readFileSync(new URL('./promos/qr-morbius-poker.svg', import.meta.url), 'utf8');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 29 29"/); // version-2 QR (25 modules) + 2-module quiet zone
});

test('view.html ships the promo panel, avatars and table talk, with the same default copy', () => {
  const html = fs.readFileSync(new URL('./view.html', import.meta.url), 'utf8');
  for (const id of ['id="cashPromo"', 'id="fx"', '/stream-config', 'function avatarEl', 'function processTalk',
    '/promos/poker-tile-art.webp', '/promos/m-mark.png', '/promos/pulsechain-logo.png', '/promos/poppins-900.woff2', 'id="cpQ"', 'function promoLineKind']) assert.ok(html.includes(id), id);
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(html.slice(html.indexOf('<div id="cashPromo">'), html.indexOf('<div id="right"'))), 'no emoji in the promo card');
  for (const v of [DEFAULT_CASH_PROMO.title, DEFAULT_CASH_PROMO.url, DEFAULT_CASH_PROMO.tag, ...DEFAULT_CASH_PROMO.lines]) assert.ok(html.includes(v), v);
  // the inline script must at least parse
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new Function(script));
});

// ---- feature-table picker ----
const T = (n, o = {}) => ({ tableId: 't' + n, tableNumber: n, seated: 9, maxSeats: 10, pot: 0, phase: null, allIn: false, showdown: false, biggestStack: 8000, ...o });
const NOW = 1_000_000;
const old = { tableId: 't1', since: NOW - 60_000 };

test('picker: single live table / daily game stays put', () => {
  const r = pickFeatureTable({ tables: [T(1, { phase: 'flop', pot: 300 })], cur: { tableId: 't1', since: NOW }, now: NOW });
  assert.equal(r.tableId, 't1'); assert.equal(r.switched, false); assert.equal(r.reason, 'only-table');
  // final table: other tables emptied -> stay on the survivor
  assert.equal(pickFeatureTable({ tables: [T(1, { seated: 0 }), T(2, { phase: 'turn' })], cur: old, now: NOW }).tableId, 't2');
});
test('picker: initial pick = hottest table; all-in beats a bigger pot', () => {
  const tables = [T(1, { phase: 'flop', pot: 9000 }), T(2, { phase: 'turn', pot: 1200, allIn: true }), T(3)];
  const r = pickFeatureTable({ tables, cur: null, now: NOW });
  assert.equal(r.tableId, 't2'); assert.ok(scoreTable(tables[1], { maxPot: 9000, maxStack: 8000 }) > scoreTable(tables[0], { maxPot: 9000, maxStack: 8000 }));
});
test('picker: minimum dwell prevents flicker', () => {
  const tables = [T(1), T(2, { phase: 'river', allIn: true, pot: 5000 })];
  const r = pickFeatureTable({ tables, cur: { tableId: 't1', since: NOW - (MIN_DWELL_MS - 1000) }, now: NOW });
  assert.equal(r.tableId, 't1'); assert.equal(r.reason, 'dwell');
  const r2 = pickFeatureTable({ tables, cur: { tableId: 't1', since: NOW - MIN_DWELL_MS - 1 }, now: NOW });
  assert.equal(r2.tableId, 't2'); assert.equal(r2.label, 'ALL-IN'); assert.equal(r2.switched, true);
});
test('picker: finishes the current hand; only an all-in/showdown elsewhere interrupts a quiet hand', () => {
  const busy = T(1, { phase: 'flop', pot: 400 });
  // bigger pot elsewhere is not enough mid-hand
  assert.equal(pickFeatureTable({ tables: [busy, T(2, { phase: 'turn', pot: 6000 })], cur: old, now: NOW }).reason, 'finish-hand');
  // all-in elsewhere while ours is folding around -> switch
  const r = pickFeatureTable({ tables: [busy, T(2, { phase: 'turn', pot: 6000, allIn: true })], cur: old, now: NOW });
  assert.equal(r.tableId, 't2'); assert.equal(r.reason, 'hot-elsewhere');
  // ours is itself all-in: never leave it
  assert.equal(pickFeatureTable({ tables: [T(1, { phase: 'river', allIn: true, pot: 2000 }), T(2, { phase: 'turn', showdown: true, pot: 9000 })], cur: old, now: NOW }).tableId, 't1');
});
test('picker: between hands moves only for a clearly better table; dead current table switches immediately', () => {
  assert.equal(pickFeatureTable({ tables: [T(1), T(2, { phase: 'preflop', pot: 30 })], cur: old, now: NOW }).switched, false);
  assert.equal(pickFeatureTable({ tables: [T(1), T(2, { phase: 'turn', showdown: true, pot: 3000 })], cur: old, now: NOW }).label, 'SHOWDOWN');
  const gone = pickFeatureTable({ tables: [T(2, { phase: 'flop' }), T(3)], cur: { tableId: 't1', since: NOW }, now: NOW });
  assert.equal(gone.switched, true); assert.equal(gone.reason, 'table-gone');
});
test('applyBroadcast: daily single table keeps the old shape; MTT exposes feature + broadcast', () => {
  const daily = { tournamentId: 'x', slotKey: '2026-11-15 21:00 America/New_York' };
  applyBroadcast(daily, { tables: [T(1)], tournament: { entrants: 8 } }, NOW);
  assert.equal(daily.feature, null);
  assert.deepEqual(Object.keys(currentExtras(daily, NOW)).sort(), ['brand', 'title']);
  assert.equal(currentExtras(daily, NOW).title, '#PulseChain Poker FreeRoll at 9pm EST');
  const mtt = { tournamentId: 'y' };
  const bc = { tables: [T(1), T(2, { phase: 'river', allIn: true, pot: 900 })], tournament: { entrants: 100, name: 'Big One', paidPlaces: 10 }, leaderboard: [], eliminations: [], flags: {} };
  applyBroadcast(mtt, bc, NOW); // first pick: no switch chip
  assert.equal(mtt.feature.tableId, 't2'); assert.equal(mtt.feature.switchedAt, null);
  assert.ok(isMttBroadcast(bc));
  const x = currentExtras(mtt, NOW);
  assert.equal(x.mtt, true); assert.equal(x.feature.tableNumber, 2); assert.equal(x.title, 'Big One');
});

// ---- titles / branding ----
test('daily stream title: lowercase am/pm, minutes only when not :00, literal EST', () => {
  assert.equal(dailyStreamTitle('2026-11-15 21:00 America/New_York'), '#PulseChain Poker FreeRoll at 9pm EST');
  assert.equal(dailyStreamTitle('2026-11-15 00:30 America/New_York'), '#PulseChain Poker FreeRoll at 12:30am EST');
  assert.equal(dailyStreamTitle('2026-11-15 12:00 America/New_York'), '#PulseChain Poker FreeRoll at 12pm EST');
  assert.equal(streamTitle({ name: 'The Morbius 100-Player Freeroll', slotKey: '2026-11-15 21:00 x' }), 'The Morbius 100-Player Freeroll');
  assert.equal(streamTitle({ name: '  ', slotKey: '2026-11-15 13:05 x' }), '#PulseChain Poker FreeRoll at 1:05pm EST');
});
test('"Beat the Bots" never appears in anything a viewer can see', () => {
  const dir = new URL('./', import.meta.url);
  const texts = ['view.html', 'worker.mjs', 'mock.mjs', 'promos/promos.json'].map((f) => fs.readFileSync(new URL(f, dir), 'utf8'));
  for (const t of texts) assert.ok(!/beat\s+the\s+bots/i.test(t));
  for (const sc of SCENARIOS) assert.ok(!/beat\s+the\s+bots/i.test(JSON.stringify(mockCurrent(sc))), sc);
  assert.ok(!/beat\s+the\s+bots/i.test(JSON.stringify([streamConfig({}), dailyStreamTitle('2026-11-15 21:00 x')])));
});
test('mock scenarios: MTT ones expose feature table + flags; daily keeps the legacy shape', () => {
  for (const sc of SCENARIOS.filter((s) => s !== 'daily')) { const r = mockCurrent(sc); assert.equal(r.mtt, true, sc); assert.ok(r.feature.tableNumber > 0); assert.ok(r.broadcast.leaderboard.length > 0); }
  // Official MTT is winner-take-all (1 paid place): bubble is 2 left, which is also heads-up.
  assert.equal(mockCurrent('bubble').broadcast.flags.bubble, false);
  assert.equal(mockCurrent('itm-bust').broadcast.flags.inTheMoney, false);
  assert.equal(mockCurrent('headsup').broadcast.flags.headsUp, true);
  assert.equal(mockCurrent('headsup').broadcast.flags.bubble, true);
  assert.equal(mockCurrent('early').feature.tableNumber, 6);
  const d = mockCurrent('daily'); assert.equal(d.mtt, undefined); assert.equal(d.broadcast, undefined);
});
