/**
 * Free-entry promo games (Beat the Bots): humans join for 0 chips, house bots still pay the
 * buy-in (so the prize pool is bot-funded), one free seat per wallet, and free seats are never
 * refunded on unregister. Pure unit test over a fake pg pool — no database.
 */
import * as chipWallet from '../../services/poker-chip-wallet';
import { setPokerBotRegistryForTesting } from '../../lib/poker-bot-registry';
import { PokerTournamentService } from '../../services/poker-tournament.service';

const BOT = '0x000000000000000000000000000000000000b001';
const HUMAN = '0x1111111111111111111111111111111111111111';
const TID = '7a0d2e9a-3d4b-4135-b820-f2e540624e64';

type Row = Record<string, unknown>;

function fakePool(opts: { freeEntry: boolean; priorEntryFor?: string; registeredFor?: string }) {
  const sql: string[] = [];
  const poolUpdates: string[] = [];
  const config = {
    startingStack: 5000, minPlayers: 2, maxPlayers: 10, startMode: 'time', blindIncreaseMode: 'by_time',
    blindIntervalMinutes: 5, ...(opts.freeEntry ? { humanFreeEntry: true } : {}),
  };
  const tournament = {
    id: TID, status: 'registration', is_private: false, pin_code: null, buy_in_amount: '500',
    prize_token_address: null, poker_config: config, scheduled_start_at: new Date(Date.now() + 600_000),
  };
  const q = async (text: string, params: unknown[] = []): Promise<{ rows: Row[] }> => {
    sql.push(text);
    const t = text.replace(/\s+/g, ' ');
    if (/FROM tournament_entries te JOIN tournaments t/.test(t)) return { rows: [] }; // fast path miss
    if (/FROM tournaments t WHERE t.id = \$1 AND t.game_type = 'poker' FOR UPDATE/.test(t)) return { rows: [tournament] };
    if (/FROM tournaments WHERE id = \$1 AND game_type = 'poker'/.test(t)) return { rows: [tournament] };
    if (/SELECT status, scheduled_start_at FROM tournaments WHERE id = \$1 FOR UPDATE/.test(t)) return { rows: [tournament] };
    if (/SELECT 1 FROM tournament_entries/.test(t)) {
      return { rows: opts.priorEntryFor && String(params[1]) === opts.priorEntryFor ? [{ '?column?': 1 }] : [] };
    }
    if (/SELECT id FROM tournament_entries/.test(t)) {
      return { rows: opts.registeredFor && String(params[1]).toLowerCase() === opts.registeredFor ? [{ id: 'e1' }] : [] };
    }
    if (/COUNT\(\*\) AS c FROM tournament_entries/.test(t)) return { rows: [{ c: 7 }] };
    if (/UPDATE tournaments SET prize_pool/.test(t)) { poolUpdates.push(String(params[0])); return { rows: [] }; }
    if (/INSERT INTO tournament_entries/.test(t)) return { rows: [{ id: 'entry-1' }] };
    return { rows: [] };
  };
  const client = { query: q, release: () => {} };
  return { pool: { query: q, connect: async () => client } as any, sql, poolUpdates };
}

describe('Beat the Bots free entry', () => {
  let delta: jest.SpyInstance;
  beforeEach(() => {
    setPokerBotRegistryForTesting([{ walletAddress: BOT, displayName: 'Hellmuth', personality: {} }]);
    delta = jest.spyOn(chipWallet, 'applyPokerChipDelta').mockResolvedValue(undefined as any);
  });
  afterEach(() => {
    delta.mockRestore();
    setPokerBotRegistryForTesting(null);
  });
  const svc = (pool: any) => new PokerTournamentService(pool, {} as any, {} as any);

  it('humans join for free: no chip debit, no prize-pool increase', async () => {
    const f = fakePool({ freeEntry: true });
    const res = await svc(f.pool).joinPokerTournament(TID, HUMAN);
    expect(res.entryId).toBe('entry-1');
    expect(delta).not.toHaveBeenCalled();
    expect(f.poolUpdates).toEqual([]);
  });

  it('bots still pay the 500 buy-in into the pool', async () => {
    const f = fakePool({ freeEntry: true });
    await svc(f.pool).joinPokerTournament(TID, BOT);
    expect(delta).toHaveBeenCalledWith(expect.anything(), BOT, -500n, 'tournament_buyin', expect.anything());
    expect(f.poolUpdates).toEqual(['500']);
  });

  it('one free seat per wallet per game (an earlier entry blocks a second free seat)', async () => {
    const f = fakePool({ freeEntry: true, priorEntryFor: HUMAN });
    await expect(svc(f.pool).joinPokerTournament(TID, HUMAN)).rejects.toThrow(/one seat per wallet/);
    expect(delta).not.toHaveBeenCalled();
  });

  it('normal (non-promo) games still charge humans', async () => {
    const f = fakePool({ freeEntry: false });
    await svc(f.pool).joinPokerTournament(TID, HUMAN);
    expect(delta).toHaveBeenCalledWith(expect.anything(), HUMAN, -500n, 'tournament_buyin', expect.anything());
    expect(f.poolUpdates).toEqual(['500']);
  });

  it('fails closed: if the bot registry is not loaded everyone pays', async () => {
    setPokerBotRegistryForTesting(null);
    const f = fakePool({ freeEntry: true });
    await svc(f.pool).joinPokerTournament(TID, HUMAN);
    expect(delta).toHaveBeenCalledWith(expect.anything(), HUMAN, -500n, 'tournament_buyin', expect.anything());
  });

  it('unregistering a free seat refunds nothing (no free-chip farming)', async () => {
    const f = fakePool({ freeEntry: true, registeredFor: HUMAN });
    await svc(f.pool).leavePokerTournamentRegistration(TID, HUMAN);
    expect(delta).not.toHaveBeenCalled();
    expect(f.poolUpdates).toEqual([]);
  });

  it('unregistering deletes the entry (does not mark it busted) so the wallet can rejoin', async () => {
    const f = fakePool({ freeEntry: true, registeredFor: HUMAN });
    await svc(f.pool).leavePokerTournamentRegistration(TID, HUMAN);
    const flat = f.sql.map((x) => x.replace(/\s+/g, ' '));
    expect(flat.some((x) => /DELETE FROM tournament_entries WHERE id = \$1/.test(x))).toBe(true);
    expect(flat.some((x) => /UPDATE tournament_entries SET status = 'busted'/.test(x))).toBe(false);
  });

  it('joining clears a legacy unregistered row before the one-free-seat check', async () => {
    const f = fakePool({ freeEntry: true });
    await svc(f.pool).joinPokerTournament(TID, HUMAN);
    const flat = f.sql.map((x) => x.replace(/\s+/g, ' '));
    const del = flat.findIndex((x) => /DELETE FROM tournament_entries te/.test(x) && /final_rank IS NULL/.test(x));
    const prior = flat.findIndex((x) => /SELECT 1 FROM tournament_entries/.test(x));
    expect(del).toBeGreaterThanOrEqual(0);
    expect(prior).toBeGreaterThan(del);
  });

  it('unregistering a paid seat in a normal game refunds the buy-in', async () => {
    const f = fakePool({ freeEntry: false, registeredFor: HUMAN });
    await svc(f.pool).leavePokerTournamentRegistration(TID, HUMAN);
    expect(delta).toHaveBeenCalledWith(expect.anything(), HUMAN, 500n, 'tournament_refund', expect.anything());
  });
});
