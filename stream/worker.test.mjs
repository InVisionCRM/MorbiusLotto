// node --test stream/  (no deps)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { streamConfig, DEFAULT_CASH_PROMO, promoFile } from './worker.mjs';

test('stream config defaults: avatars on, cash promo copy', () => {
  const c = streamConfig({});
  assert.equal(c.avatars, true);
  assert.equal(c.avatarBase, 'https://morbius.io/api/poker/avatar');
  assert.deepEqual(c.cashPromo, { enabled: true, ...DEFAULT_CASH_PROMO, lines: ['1, 5 & 9 PM ET', '3,500 prize pool'] });
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
