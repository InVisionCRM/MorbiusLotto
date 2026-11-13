// node --test stream/  (no deps)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { streamConfig, DEFAULT_CASH_PROMO } from './worker.mjs';

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

test('view.html ships the promo panel, avatars and table talk, with the same default copy', () => {
  const html = fs.readFileSync(new URL('./view.html', import.meta.url), 'utf8');
  for (const id of ['id="cashPromo"', 'id="fx"', '/stream-config', 'function avatarEl', 'function processTalk']) assert.ok(html.includes(id), id);
  for (const v of [DEFAULT_CASH_PROMO.title, DEFAULT_CASH_PROMO.url, DEFAULT_CASH_PROMO.tag, ...DEFAULT_CASH_PROMO.lines]) assert.ok(html.includes(v), v);
  // the inline script must at least parse
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new Function(script));
});
