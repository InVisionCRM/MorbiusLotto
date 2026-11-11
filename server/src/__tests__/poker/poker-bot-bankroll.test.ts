/**
 * Bot bankroll + registry integration tests.
 *
 * Run: cd server && npm test -- poker-bot-bankroll
 * Requires: server/.env with TEST_DATABASE_URL and migration 200 applied there.
 *
 * Covers:
 *   - migration 200 seeded the launch roster and the registry loads it
 *   - fundPokerBotToBalance is a ledgered bankroll → bot transfer (two rows, same ref)
 *   - funding is capped at the target, never above
 *   - funding fails fast when the bankroll can't cover it (no partial write)
 *   - sweepPokerBotBankroll returns everything to the bankroll
 *   - bot_bankroll_* reasons never count as `*_bet` wager turnover
 *   - Weekly Drop accrual skips bot wallets (tournament_buyin path)
 */

import { testPool, withRollback } from '../setup';
import {
  getPokerBotAccount,
  isPokerBotWallet,
  listPokerBotAccounts,
  loadPokerBotRegistry,
} from '../../lib/poker-bot-registry';
import { fundPokerBotToBalance, sweepPokerBotBankroll } from '../../lib/poker-bot-bankroll';
import { applyPokerChipDelta, getPokerChipBalance } from '../../services/poker-chip-wallet';
import { WeeklyDropService } from '../../services/weekly-drop.service';

const BANKROLL = '0x00000000000000000000000000000000000000aa';
const BOT_1 = '0x000000000000000000000000000000000000b071';
const BOT_2 = '0x000000000000000000000000000000000000b072';
const HUMAN = '0x000000000000000000000000000000000000beef';

let prevBankrollEnv: string | undefined;

beforeAll(async () => {
  prevBankrollEnv = process.env.POKER_BOT_BANKROLL_WALLET;
  process.env.POKER_BOT_BANKROLL_WALLET = BANKROLL;
  await loadPokerBotRegistry(testPool);
});

afterAll(async () => {
  if (prevBankrollEnv === undefined) delete process.env.POKER_BOT_BANKROLL_WALLET;
  else process.env.POKER_BOT_BANKROLL_WALLET = prevBankrollEnv;
  await testPool
    .query(`DELETE FROM player_poker_chips WHERE wallet_address = $1`, [BANKROLL])
    .catch(() => {});
});

describe('poker_bot_accounts registry (migration 200)', () => {
  it('seeds the launch roster with _bot names and b07x addresses', () => {
    const bots = listPokerBotAccounts();
    expect(bots.length).toBeGreaterThanOrEqual(3);
    for (const b of bots) {
      expect(b.displayName.endsWith('_bot')).toBe(true);
      expect(b.walletAddress).toMatch(/^0x[0-9a-f]{40}$/);
    }
    expect(isPokerBotWallet(BOT_1)).toBe(true);
    expect(getPokerBotAccount(BOT_1)?.displayName).toBe('Brunson_bot');
    expect(isPokerBotWallet(HUMAN)).toBe(false);
  });

  it('migration created players / chip / display-name rows for every bot', async () => {
    for (const b of listPokerBotAccounts()) {
      const p = await testPool.query(`SELECT 1 FROM players WHERE wallet_address = $1`, [b.walletAddress]);
      const c = await testPool.query(`SELECT 1 FROM player_poker_chips WHERE wallet_address = $1`, [b.walletAddress]);
      const d = await testPool.query(
        `SELECT display_name FROM chat_display_names WHERE wallet_address = $1`,
        [b.walletAddress],
      );
      expect(p.rows.length).toBe(1);
      expect(c.rows.length).toBe(1);
      expect(d.rows[0]?.display_name).toBe(b.displayName);
    }
  });
});

describe('fundPokerBotToBalance / sweepPokerBotBankroll', () => {
  it('moves chips bankroll → bot through the ledger, capped at target', async () => {
    await withRollback(async (client) => {
      // Give the bankroll 1,000 chips (admin_credit is an existing non-wager reason).
      await applyPokerChipDelta(client, BANKROLL, 1000n, 'admin_credit');
      const botStart = await getPokerChipBalance(client, BOT_1);
      expect(botStart).toBe(0n);

      const ref = { type: 'test', id: '11111111-1111-4111-8111-111111111111' };
      const first = await fundPokerBotToBalance(client, BOT_1, 500n, ref);
      expect(first.funded).toBe(500n);
      expect(first.balance).toBe(500n);
      expect(await getPokerChipBalance(client, BANKROLL)).toBe(500n);

      // Already at target → no-op, no new ledger rows.
      const before = await client.query(`SELECT COUNT(*)::int AS c FROM poker_chip_ledger WHERE reason = 'bot_bankroll_fund'`);
      const second = await fundPokerBotToBalance(client, BOT_1, 500n, ref);
      expect(second.funded).toBe(0n);
      const after = await client.query(`SELECT COUNT(*)::int AS c FROM poker_chip_ledger WHERE reason = 'bot_bankroll_fund'`);
      expect(after.rows[0].c).toBe(before.rows[0].c);

      // Exactly two rows for the transfer: debit on bankroll, credit on bot, same ref.
      const rows = await client.query<{ wallet_address: string; delta: string; ref_id: string | null }>(
        `SELECT wallet_address, delta::text AS delta, ref_id FROM poker_chip_ledger
          WHERE reason = 'bot_bankroll_fund' AND ref_id = $1 ORDER BY delta ASC`,
        [ref.id],
      );
      expect(rows.rows).toEqual([
        { wallet_address: BANKROLL, delta: '-500', ref_id: ref.id },
        { wallet_address: BOT_1, delta: '500', ref_id: ref.id },
      ]);

      // Sweep returns everything.
      const swept = await sweepPokerBotBankroll(client, BOT_1, ref);
      expect(swept).toBe(500n);
      expect(await getPokerChipBalance(client, BOT_1)).toBe(0n);
      expect(await getPokerChipBalance(client, BANKROLL)).toBe(1000n);
      expect(await sweepPokerBotBankroll(client, BOT_1, ref)).toBe(0n);
    });
  });

  it('fails fast when the bankroll cannot cover the top-up and writes nothing', async () => {
    await withRollback(async (client) => {
      await applyPokerChipDelta(client, BANKROLL, 100n, 'admin_credit');
      await client.query('SAVEPOINT before_fund');
      await expect(fundPokerBotToBalance(client, BOT_2, 500n)).rejects.toThrow('Insufficient poker chips');
      await client.query('ROLLBACK TO SAVEPOINT before_fund');
      expect(await getPokerChipBalance(client, BANKROLL)).toBe(100n);
      expect(await getPokerChipBalance(client, BOT_2)).toBe(0n);
    });
  });

  it('refuses to fund or sweep a non-bot wallet', async () => {
    await withRollback(async (client) => {
      await expect(fundPokerBotToBalance(client, HUMAN, 10n)).rejects.toThrow('Not a registered poker bot wallet');
      await expect(sweepPokerBotBankroll(client, HUMAN)).rejects.toThrow('Not a registered poker bot wallet');
    });
  });

  it('bot_bankroll_* rows are not wager turnover (VIP / Weekly Drop predicate)', async () => {
    await withRollback(async (client) => {
      await applyPokerChipDelta(client, BANKROLL, 300n, 'admin_credit');
      await fundPokerBotToBalance(client, BOT_1, 300n);
      const r = await client.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM poker_chip_ledger
          WHERE wallet_address IN ($1, $2) AND (reason LIKE '%\\_bet' OR reason LIKE '%\\_payout' OR reason LIKE '%\\_refund')`,
        [BANKROLL, BOT_1],
      );
      expect(r.rows[0].c).toBe(0);
    });
  });
});

describe('Weekly Drop excludes bot wallets', () => {
  it('a bot tournament_buyin accrues no entries and no pot; a human does', async () => {
    await withRollback(async (client) => {
      const service = new WeeklyDropService(testPool);
      // Ensure an open draw exists inside this transaction's view.
      const open = await client.query<{ id: string }>(
        `SELECT id FROM drop_draws WHERE status = 'open' ORDER BY closes_at ASC LIMIT 1`,
      );
      let drawId = open.rows[0]?.id;
      if (!drawId) {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO drop_draws (opens_at, closes_at, pot_chips, guaranteed_min)
           VALUES (NOW(), NOW() + INTERVAL '6 days', 0, 25000) RETURNING id`,
        );
        drawId = ins.rows[0].id;
      }

      await service.accrueFromWager(client, BOT_1, 5000n, 'tournament');
      await service.accrueFromWager(client, HUMAN, 5000n, 'tournament');

      const botRow = await client.query(
        `SELECT 1 FROM drop_entries WHERE draw_id = $1 AND player_address = $2`,
        [drawId, BOT_1],
      );
      const humanRow = await client.query<{ entries: number; pot_contributed: string }>(
        `SELECT entries, pot_contributed::text AS pot_contributed FROM drop_entries
          WHERE draw_id = $1 AND player_address = $2`,
        [drawId, HUMAN],
      );
      expect(botRow.rows.length).toBe(0);
      expect(humanRow.rows[0].entries).toBe(5);
      expect(humanRow.rows[0].pot_contributed).toBe('12'); // 0.25% of 5000, floored
    });
  });
});
