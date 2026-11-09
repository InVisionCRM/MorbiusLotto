/**
 * Unit tests for VIP rakeback across a rate change (migrations 198/199).
 *
 * No DB required: a fake pool answers the queries VipService.getStatus makes
 * from an in-memory ledger, applying the same reason filters and the
 * (since, until] window the real SQL uses. Covers: no history = one rate for
 * the whole window, a window split at a rate change, a cursor after the
 * change, per-stretch clamping, the exact boundary instant, several recorded
 * changes, and history belonging to other tiers.
 *
 * Run: cd server && npm test -- --selectProjects unit --testPathPattern vip-rakeback-rates
 */

import type { Pool } from 'pg';
import { VipService } from '../services/vip.service';

const ADDR = '0x00000000000000000000000000000000000000a1';
const CURSOR = '2026-11-01 00:00:00+00';            // player_vip_state text form
const SWITCH = new Date('2026-11-05T12:00:00.000Z');  // effective_until
const LONG_AGO = new Date('2026-10-01T00:00:00.000Z');

/** Live ladder after migration 199; Gold (tier 3) = 1200 bps. */
const TIER_ROWS = [
  [0, 'Unranked', '0', 0],
  [1, 'Bronze', '10000', 500],
  [2, 'Silver', '100000', 800],
  [3, 'Gold', '500000', 1200],
  [4, 'Platinum', '2500000', 1600],
  [5, 'Diamond', '10000000', 2000],
  [6, 'Obsidian', '50000000', 2500],
].map(([tier_level, tier_name, min, bps]) => ({
  tier_level,
  tier_name,
  min_lifetime_wager_chips: min,
  rakeback_bps: bps,
  level_up_bonus_chips: '0',
  color: '#000000',
}));

interface LedgerRow { delta: bigint; reason: string; createdAt: Date }
interface HistoryRow { tier_level: number; rakeback_bps: number; effective_until: Date }

const isBet = (r: string) => r.endsWith('_bet');
const isCredit = (r: string) => r.endsWith('_payout') || (r.endsWith('_refund') && r !== 'tournament_refund');

function fakePool(ledger: LedgerRow[], history: HistoryRow[]): Pool {
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM vip_tier_config')) return { rows: TIER_ROWS };
    if (sql.includes('FROM vip_rakeback_rate_history')) return { rows: history };
    if (sql.includes('INSERT INTO player_vip_state')) return { rows: [] };
    if (sql.includes('FROM player_vip_state')) {
      return {
        rows: [{
          wallet_address: ADDR,
          last_rakeback_claim_at: CURSOR,
          highest_tier_awarded: 3,
          lifetime_rakeback_chips: '0',
          lifetime_bonus_chips: '0',
        }],
      };
    }
    if (sql.includes("to_regclass('vip_wager_credits')")) return { rows: [{ present: false }] };
    if (sql.includes('AS wagered')) {
      if (params.length !== 1) throw new Error('fake pool: windowed wager query not modelled');
      const wagered = ledger.filter((l) => isBet(l.reason)).reduce((s, l) => s - l.delta, 0n);
      return { rows: [{ wagered: wagered.toString() }] };
    }
    if (sql.includes('AS net_loss')) {
      const since = /created_at > \$(\d+)/.exec(sql);
      const until = /created_at <= \$(\d+)/.exec(sql);
      const sinceAt = since ? new Date(params[Number(since[1]) - 1] as string) : null;
      const untilAt = until ? new Date(params[Number(until[1]) - 1] as string) : null;
      const sum = ledger
        .filter((l) => isBet(l.reason) || isCredit(l.reason))
        .filter((l) => (sinceAt === null || l.createdAt > sinceAt) && (untilAt === null || l.createdAt <= untilAt))
        .reduce((s, l) => s - l.delta, 0n);
      return { rows: [{ net_loss: sum.toString() }] };
    }
    throw new Error(`fake pool: unexpected query ${sql}`);
  };
  return { query } as unknown as Pool;
}

const at = (iso: string) => new Date(iso);
const ms = (d: Date, offsetMs: number) => new Date(d.getTime() + offsetMs);

/** 600k wagered (net 0) before the cursor puts the player in Gold without touching the window. */
const GOLD_SEED: LedgerRow[] = [
  { delta: -600_000n, reason: 'plinko_bet', createdAt: LONG_AGO },
  { delta: 600_000n, reason: 'plinko_payout', createdAt: LONG_AGO },
];

/** Gold paid 12 bps on losses up to SWITCH. */
const GOLD_SWITCH: HistoryRow[] = [{ tier_level: 3, rakeback_bps: 12, effective_until: SWITCH }];

async function claimable(ledger: LedgerRow[], history: HistoryRow[]): Promise<string> {
  const status = await new VipService(fakePool([...GOLD_SEED, ...ledger], history)).getStatus(ADDR);
  expect(status.currentTier.tierName).toBe('Gold');
  return status.claimableRakebackChips;
}

describe('VIP rakeback across a rate change', () => {
  it('pays the current rate on the whole window when no change is recorded', async () => {
    const owed = await claimable(
      [{ delta: -1_000_000n, reason: 'keno_bet', createdAt: at('2026-11-03T00:00:00Z') }],
      [],
    );
    expect(owed).toBe('120000'); // 1,000,000 × 12%
  });

  it('pays losses before the change at the old rate and after it at the new rate', async () => {
    const owed = await claimable(
      [
        { delta: -1_000_000n, reason: 'keno_bet', createdAt: at('2026-11-03T00:00:00Z') },
        { delta: -500_000n, reason: 'keno_bet', createdAt: at('2026-11-07T00:00:00Z') },
      ],
      GOLD_SWITCH,
    );
    expect(owed).toBe('61200'); // 1,000,000 × 0.12% + 500,000 × 12%
  });

  it('ignores a change that is older than the claim cursor', async () => {
    const before = new Date('2026-10-15T00:00:00.000Z');
    const owed = await claimable(
      [{ delta: -200_000n, reason: 'keno_bet', createdAt: at('2026-11-03T00:00:00Z') }],
      [{ tier_level: 3, rakeback_bps: 12, effective_until: before }],
    );
    expect(owed).toBe('24000'); // 200,000 × 12%
  });

  it('clamps each stretch on its own: a win before the change does not cancel a loss after it', async () => {
    const owed = await claimable(
      [
        { delta: -200_000n, reason: 'keno_bet', createdAt: at('2026-11-03T00:00:00Z') },
        { delta: 500_000n, reason: 'keno_payout', createdAt: at('2026-11-03T00:00:00Z') },
        { delta: -100_000n, reason: 'keno_bet', createdAt: at('2026-11-07T00:00:00Z') },
      ],
      GOLD_SWITCH,
    );
    expect(owed).toBe('12000'); // 0 + 100,000 × 12%
  });

  it('puts a row stamped exactly at the change in the old stretch, and 1 ms later in the new', async () => {
    const owed = await claimable(
      [
        { delta: -1_000_000n, reason: 'keno_bet', createdAt: SWITCH },
        { delta: -20_000n, reason: 'keno_bet', createdAt: ms(SWITCH, 1) },
      ],
      GOLD_SWITCH,
    );
    expect(owed).toBe('3600'); // 1,000,000 × 0.12% + 20,000 × 12%
  });

  it('splits the window at every recorded change, in order', async () => {
    const first = new Date('2026-11-03T00:00:00.000Z');
    const owed = await claimable(
      [
        { delta: -500_000n, reason: 'keno_bet', createdAt: at('2026-11-02T00:00:00Z') }, // 5 bps
        { delta: -500_000n, reason: 'keno_bet', createdAt: at('2026-11-04T00:00:00Z') }, // 12 bps
        { delta: -100_000n, reason: 'keno_bet', createdAt: at('2026-11-07T00:00:00Z') }, // 1200 bps
      ],
      [
        { tier_level: 3, rakeback_bps: 5, effective_until: first },
        { tier_level: 3, rakeback_bps: 12, effective_until: SWITCH },
      ],
    );
    expect(owed).toBe('12850'); // 250 + 600 + 12,000
  });

  it("uses only the player's own tier's history", async () => {
    const owed = await claimable(
      [{ delta: -1_000_000n, reason: 'keno_bet', createdAt: at('2026-11-03T00:00:00Z') }],
      [
        { tier_level: 2, rakeback_bps: 8, effective_until: SWITCH },
        { tier_level: 4, rakeback_bps: 16, effective_until: SWITCH },
      ],
    );
    expect(owed).toBe('120000'); // Gold has no recorded change → 12% on all of it
  });
});
