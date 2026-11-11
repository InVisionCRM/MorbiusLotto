import { planCashTable, readBotCashConfig, PokerBotCashService } from '../../services/poker-bot-cash.service';
import { computeStreamPayouts, computeBlindInfo } from '../../services/poker-bot-stream-meta';
import { setPokerBotRegistryForTesting } from '../../lib/poker-bot-registry';

const cfg = { seats: 10, bigBlind: 10, minBots: 4, openSeats: 3, refill: true };
const bot = (a: string, stack: number) => ({ address: a, stack, isBot: true });
const human = (a: string, stack: number) => ({ address: a, stack, isBot: false });

describe('planCashTable', () => {
  it('seats the minimum bots on an empty table', () => {
    expect(planCashTable([], cfg, false)).toEqual({ leave: [], sit: 4 });
  });

  it('a bot below one big blind leaves between hands, and a fresh one is planned', () => {
    const seats = [bot('a', 0), bot('b', 600), bot('c', 400), bot('d', 9), human('h', 500)];
    expect(planCashTable(seats, cfg, false)).toEqual({ leave: ['a', 'd'], sit: 2 });
  });

  it('never leaves mid-hand', () => {
    const seats = [bot('a', 0), bot('b', 600), bot('c', 400), bot('d', 500)];
    expect(planCashTable(seats, cfg, true)).toEqual({ leave: [], sit: 0 });
  });

  it('always keeps openSeats free for humans', () => {
    const seats = [bot('a', 500), human('h1', 500), human('h2', 500), human('h3', 500), human('h4', 500), human('h5', 500)];
    // 4 free seats, 3 reserved → only 1 bot may sit even though 3 are wanted
    expect(planCashTable(seats, cfg, false)).toEqual({ leave: [], sit: 1 });
  });

  it('refill=false: busted bots are not replaced once the table is running', () => {
    const seats = [bot('a', 0), bot('b', 600), human('h', 500)];
    expect(planCashTable(seats, { ...cfg, refill: false }, false)).toEqual({ leave: ['a'], sit: 0 });
  });
});

describe('readBotCashConfig', () => {
  const keys = ['POKER_BOT_CASH_ENABLED', 'POKER_BOT_CASH_SB', 'POKER_BOT_CASH_BB', 'POKER_BOT_CASH_BUYIN', 'POKER_BOT_CASH_REBUY'];
  const prev: Record<string, string | undefined> = {};
  beforeEach(() => keys.forEach((k) => ((prev[k] = process.env[k]), delete process.env[k])));
  afterEach(() => keys.forEach((k) => (prev[k] === undefined ? delete process.env[k] : (process.env[k] = prev[k]))));

  it('defaults: off, 5/10 blinds, 500 buy-in (50 BB), no rebuy', () => {
    const c = readBotCashConfig();
    expect(c).toMatchObject({ enabled: false, smallBlind: 5, bigBlind: 10, buyIn: 500, minBots: 4, rebuy: false, refill: true, seats: 10 });
  });

  it('reads overrides', () => {
    process.env.POKER_BOT_CASH_ENABLED = 'true';
    process.env.POKER_BOT_CASH_SB = '10';
    process.env.POKER_BOT_CASH_REBUY = '1';
    const c = readBotCashConfig();
    expect(c).toMatchObject({ enabled: true, smallBlind: 10, bigBlind: 20, buyIn: 1000, rebuy: true });
  });
});

describe('PokerBotCashService.tick', () => {
  const B1 = '0x000000000000000000000000000000000000b081';
  const B2 = '0x000000000000000000000000000000000000b082';
  afterEach(() => {
    setPokerBotRegistryForTesting(null);
    delete process.env.POKER_BOT_CASH_ENABLED;
    delete process.env.POKER_BOT_CASH_MIN_BOTS;
  });

  it('creates the table, then a busted bot leaves and is not re-seated during its cooldown', async () => {
    process.env.POKER_BOT_CASH_ENABLED = 'true';
    process.env.POKER_BOT_CASH_MIN_BOTS = '2';
    setPokerBotRegistryForTesting([
      { walletAddress: B1, displayName: 'Chan', personality: {}, role: 'cash' },
      { walletAddress: B2, displayName: 'Seidel', personality: {}, role: 'cash' },
      { walletAddress: '0x000000000000000000000000000000000000b071', displayName: 'Brunson', personality: {} },
    ]);
    const tables: string[] = [];
    let seats: { addr: string; stack: string }[] = [];
    const client = { query: jest.fn(async () => ({ rows: [] })), release: jest.fn() };
    const pool: any = {
      connect: jest.fn(async () => client),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('DELETE FROM poker_bot_cash_tables')) return { rows: [] };
        if (sql.includes('SELECT table_id FROM poker_bot_cash_tables')) return { rows: tables.map((t) => ({ table_id: t })) };
        if (sql.includes('INSERT INTO poker_bot_cash_tables')) { tables.push(String(params![0])); return { rows: [] }; }
        if (sql.includes('FROM poker_seats WHERE table_id')) return { rows: seats };
        if (sql.includes('FROM poker_hands')) return { rows: [] };
        if (sql.includes('JOIN poker_bot_cash_tables')) return { rows: seats.map((s) => ({ addr: s.addr })) };
        throw new Error('unexpected sql ' + sql);
      }),
    };
    const joined: string[] = [];
    const left: string[] = [];
    const game = {
      createTable: jest.fn(async () => 'aaaaaaaa-0000-0000-0000-000000000001'),
      joinTable: jest.fn(async (_t: string, a: string, b: string) => { joined.push(a); seats.push({ addr: a, stack: b }); }),
      leaveTable: jest.fn(async (_t: string, a: string) => { left.push(a); seats = seats.filter((s) => s.addr !== a); }),
    };
    const svc = new PokerBotCashService(pool, game);
    // Bankroll funding is covered by poker-bot-bankroll tests; stub it here.
    const bankroll = require('../../lib/poker-bot-bankroll');
    jest.spyOn(bankroll, 'fundPokerBotToBalance').mockResolvedValue({ funded: 500n, balance: 500n });

    await svc.tick(1_000);
    expect(game.createTable).toHaveBeenCalledWith(5, 10, 10, undefined, null);
    expect(new Set(joined)).toEqual(new Set([B1, B2])); // only cash-role bots

    seats = seats.map((s) => (s.addr === B1 ? { ...s, stack: '3' } : s));
    joined.length = 0;
    await svc.tick(2_000);
    expect(left).toEqual([B1]);
    expect(joined).toEqual([]); // B1 cooling down, B2 already seated, no other cash bots
  });
});

describe('stream meta helpers', () => {
  it('payouts follow settlement math (3% platform fee)', () => {
    expect(computeStreamPayouts(3500, [50, 30, 20], 3, 0)).toEqual([
      { place: 1, percent: 50, amount: 1697 },
      { place: 2, percent: 30, amount: 1018 },
      { place: 3, percent: 20, amount: 679 },
    ]);
  });

  it('next level time for by_time blinds', () => {
    const info = computeBlindInfo(
      { blindIncreaseMode: 'by_time', blindIntervalMinutes: 5, blindSchedule: [
        { level: 1, smallBlind: 25, bigBlind: 50 }, { level: 2, smallBlind: 50, bigBlind: 100 },
      ] },
      1,
      new Date('2026-11-11T09:00:00Z'),
      { smallBlind: 25, bigBlind: 50 },
    );
    expect(info).toEqual({ level: 1, smallBlind: 25, bigBlind: 50, nextLevelAt: '2026-11-11T09:05:00.000Z', nextSmallBlind: 50, nextBigBlind: 100 });
  });
});
