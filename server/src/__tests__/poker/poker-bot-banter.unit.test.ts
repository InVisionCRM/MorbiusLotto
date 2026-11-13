import {
  ALL_BOT_EMOTES,
  BOT_TEASE_EMOTES,
  DEFAULT_BANTER_CONFIG,
  FRIENDLY_EMOTES,
  LINES,
  detectBanterEvents,
  fill,
  newBanterTableState,
  planBanter,
  snapshotFromState,
  type BanterSnapshot,
} from '../../lib/poker-bot-banter';
import { PokerBotBanterService } from '../../services/poker-bot-banter.service';
import { getTableTalk, recordTableTalk, resetTableTalkForTesting } from '../../lib/poker-table-talk';
import { setPokerBotRegistryForTesting } from '../../lib/poker-bot-registry';
import { WebSocketService } from '../../services/websocket.service';

const BOT_A = '0xa000000000000000000000000000000000000001';
const BOT_B = '0xb000000000000000000000000000000000000002';
const HUMAN = '0xc000000000000000000000000000000000000003';
const BOTS = new Set([BOT_A, BOT_B]);

function seat(position: number, addr: string | null, extra: Record<string, unknown> = {}) {
  return { position, playerAddress: addr, stack: '1000', currentBet: '0', folded: false, status: 'active', displayName: addr === BOT_A ? 'Brunson' : addr === BOT_B ? 'Selbst' : addr ? 'Kyle' : null, ...extra };
}
function state(seats: any[], hand: any = null) {
  return { bigBlind: '10', seats, currentHand: hand };
}
const snap = (st: any) => snapshotFromState(st, (a) => BOTS.has(a));
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('poker bot banter — event detection', () => {
  it('no events on first sight of a table', () => {
    expect(detectBanterEvents(null, snap(state([seat(0, BOT_A)])))).toEqual([]);
  });

  it('detects a human joining, a new hand, an all-in and a big showdown win with its loser', () => {
    const a = snap(state([seat(0, BOT_A), seat(1, BOT_B)], { handId: 'h1', street: 'flop', pot: '40' }));
    const b = snap(state([seat(0, BOT_A), seat(1, BOT_B), seat(2, HUMAN)], { handId: 'h1', street: 'flop', pot: '40' }));
    expect(detectBanterEvents(a, b)).toEqual([{ type: 'human_joined', position: 2 }]);

    const c = snap(state([seat(0, BOT_A, { stack: '0', currentBet: '500' }), seat(1, BOT_B), seat(2, HUMAN)], { handId: 'h2', street: 'turn', pot: '600' }));
    const ev = detectBanterEvents(b, c);
    expect(ev).toEqual(expect.arrayContaining([{ type: 'new_hand' }, { type: 'all_in', position: 0 }]));
    // same all-in is not re-announced on the next poll
    expect(detectBanterEvents(c, c).some((e) => e.type === 'all_in')).toBe(false);

    const d = snap(state([seat(0, BOT_A, { stack: '0' }), seat(1, BOT_B, { stack: '2000' }), seat(2, HUMAN)], {
      handId: 'h2', street: 'showdown', pot: '1000', handWentToShowdown: true,
      winners: [{ address: BOT_B, amount: '1000', handName: 'Flush' }],
      committedByAddress: { [BOT_A]: '500', [BOT_B]: '500' },
    }));
    const ev2 = detectBanterEvents(c, d);
    expect(ev2).toEqual(expect.arrayContaining([
      { type: 'win', position: 1, amount: 1000, handName: 'Flush', big: true, showdown: true, loserPosition: 0 },
      { type: 'bad_beat', position: 0, winnerPosition: 1, lost: 500 },
      { type: 'bust', position: 0 },
    ]));
    // the result is reported once per hand
    expect(detectBanterEvents(d, d)).toEqual([]);
  });
});

describe('poker bot banter — planning + rate limit', () => {
  const base = (): BanterSnapshot => snap(state([seat(0, BOT_A), seat(1, BOT_B), seat(2, HUMAN)]));

  it('welcomes a human once, from a bot, with only friendly emotes', () => {
    const st = newBanterTableState(0);
    const out = planBanter([{ type: 'human_joined', position: 2 }], base(), st, 100_000, seq(0.1, 0.1, 0.1, 0.1));
    expect(out[0]).toMatchObject({ kind: 'say', from: expect.any(Number) });
    expect([0, 1]).toContain((out[0] as any).from);
    expect((out[0] as any).text).toContain('Kyle');
    const emote = out.find((a) => a.kind === 'emote') as any;
    if (emote) { expect(emote.to).toBe(2); expect(FRIENDLY_EMOTES as readonly string[]).toContain(emote.emote); }
    // greeted already → silence on a re-join
    expect(planBanter([{ type: 'human_joined', position: 2 }], base(), st, 500_000, seq(0.1))).toEqual([]);
  });

  it('enforces the 20–40 s gap between messages', () => {
    const st = newBanterTableState(0);
    const win = { type: 'win' as const, position: 0, amount: 500, handName: null, big: true, showdown: false, loserPosition: null };
    const first = planBanter([win], base(), st, 100_000, seq(0.5));
    expect(first.length).toBeGreaterThan(0);
    expect(st.nextGapMs).toBeGreaterThanOrEqual(DEFAULT_BANTER_CONFIG.minGapMs);
    expect(st.nextGapMs).toBeLessThanOrEqual(DEFAULT_BANTER_CONFIG.maxGapMs);
    expect(planBanter([win], base(), st, 100_000 + 15_000, seq(0.5))).toEqual([]);
    expect(planBanter([win], base(), st, 100_000 + 41_000, seq(0.5)).length).toBeGreaterThan(0);
  });

  it('never aims teasing emotes or throwables at a human (many random runs)', () => {
    const events: any[] = [
      { type: 'win', position: 2, amount: 900, handName: 'Two Pair', big: true, showdown: true, loserPosition: 0 },
      { type: 'bad_beat', position: 0, winnerPosition: 2, lost: 400 },
      { type: 'all_in', position: 2 },
      { type: 'bust', position: 2 },
      { type: 'new_hand' },
    ];
    for (let i = 0; i < 3000; i++) {
      const st = newBanterTableState(0);
      const evs = [events[i % events.length]];
      const out = planBanter(evs, base(), st, 1_000_000, Math.random);
      for (const a of out) {
        if (a.kind === 'emote' && a.to === 2) expect(FRIENDLY_EMOTES as readonly string[]).toContain(a.emote);
        if (a.kind === 'emote') expect(ALL_BOT_EMOTES).toContain(a.emote);
        expect([0, 1]).toContain(a.from); // only bots talk
      }
    }
  });

  it('bot → bot teasing can use throwables', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const st = newBanterTableState(0);
      const out = planBanter([{ type: 'win', position: 1, amount: 900, handName: null, big: true, showdown: true, loserPosition: 0 }], base(), st, 1_000_000, Math.random);
      for (const a of out) if (a.kind === 'emote') { expect(a.to).toBe(1); seen.add(a.emote); }
    }
    expect([...seen].some((k) => (BOT_TEASE_EMOTES as readonly string[]).includes(k))).toBe(true);
  });

  it('copy is short and human-facing lines never tease', () => {
    for (const [k, lines] of Object.entries(LINES)) {
      for (const l of lines) {
        expect(fill(l, { name: 'Kyle', amount: 1000, hand: 'Full House' }).length).toBeLessThanOrEqual(80);
        if (['greetHuman', 'humanWins', 'humanWinsBig', 'humanBusts', 'botLosesToHuman'].includes(k)) {
          expect(l).not.toMatch(/fold(ing)? all night|calculator|awake|card dead|lucky|rigged|fish|donk|idiot|stupid|noob|trash/i);
        }
      }
    }
  });
});

describe('PokerBotBanterService', () => {
  beforeEach(() => {
    resetTableTalkForTesting();
    setPokerBotRegistryForTesting([
      { walletAddress: BOT_A, displayName: 'Brunson', personality: {} },
      { walletAddress: BOT_B, displayName: 'Selbst', personality: {} },
    ]);
  });
  afterAll(() => setPokerBotRegistryForTesting(null));

  it('welcomes a new human over WS + the public talk log, and stays read-only', async () => {
    let current: any = state([seat(0, BOT_A), seat(1, BOT_B)]);
    const game = { getTableState: jest.fn(async () => current), playerAction: jest.fn() };
    const pool = { query: jest.fn(async () => ({ rows: [{ table_id: 't1' }] })) } as any;
    const emit = jest.fn();
    const svc = new PokerBotBanterService(pool, game, emit, seq(0.2), { ...DEFAULT_BANTER_CONFIG, throwGapMs: 0 });
    await svc.tick(1_000_000);
    expect(emit).not.toHaveBeenCalled();
    current = state([seat(0, BOT_A), seat(1, BOT_B), seat(2, HUMAN)]);
    await svc.tick(1_000_000 + 30_000);
    expect(emit).toHaveBeenCalledWith('poker:table:t1', 'poker_quick_reaction', expect.objectContaining({ tableId: 't1', type: 'phrase', value: expect.stringContaining('Kyle') }));
    const talk = getTableTalk('t1', 1_000_000 + 30_000 + 1);
    expect(talk[0]).toMatchObject({ kind: 'say', bot: true });
    expect(game.playerAction).not.toHaveBeenCalled();
    expect(game.getTableState).toHaveBeenCalledWith('t1', null);
  });

  it('a failing table read never throws out of tick', async () => {
    const game = { getTableState: jest.fn(async () => { throw new Error('db down'); }) };
    const pool = { query: jest.fn(async () => ({ rows: [{ table_id: 't1' }] })) } as any;
    const svc = new PokerBotBanterService(pool, game, jest.fn());
    await expect(svc.tick()).resolves.toBeUndefined();
  });
});

describe('table talk log', () => {
  beforeEach(() => resetTableTalkForTesting());

  it('caps entries and drops old ones', () => {
    for (let i = 0; i < 20; i++) recordTableTalk('t', { kind: 'say', fromPosition: 0, text: `m${i}`, bot: true }, 1000 + i);
    const list = getTableTalk('t', 2000);
    expect(list).toHaveLength(12);
    expect((list[11] as any).text).toBe('m19');
    expect(getTableTalk('t', 1000 + 3 * 60_000)).toEqual([]);
  });

  it('human quick-chat is recorded for the stream', async () => {
    const svc = Object.create(WebSocketService.prototype) as any;
    svc.pokerGameService = { getTableState: jest.fn(async () => ({ seats: [{ playerAddress: HUMAN, displayName: 'Kyle' }] })) };
    svc.sendError = jest.fn();
    svc.broadcastToRoom = jest.fn();
    await svc.handlePokerQuickReaction({ playerAddress: HUMAN }, { payload: { tableId: 't9', type: 'phrase', value: 'gl all' } });
    expect(getTableTalk('t9')[0]).toMatchObject({ kind: 'say', fromPosition: 0, fromName: 'Kyle', text: 'gl all', bot: false });
  });
});
