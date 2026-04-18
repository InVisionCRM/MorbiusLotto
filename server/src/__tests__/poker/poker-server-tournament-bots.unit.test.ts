/**
 * Pure unit tests — no DATABASE_URL / setup.ts DB seed.
 *
 * Run: cd server && npm test -- poker-server-tournament-bots.unit
 */

import { decidePokerBotAction, pokerAmountToBigInt } from '../../lib/poker-bot-ai';
import { getServerPokerBotAddressSet, parsePokerBotAddressCsv } from '../../lib/poker-server-bot-addresses';

const SAMPLE_BOT = '0x000000000000000000000000000000000000beef';

describe('poker-server-bot-ai (unit)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('decidePokerBotAction checks when no bet preflop with weak cards', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const d = decidePokerBotAction({
      street: 'preflop',
      pot: '75',
      toCall: '0',
      minRaise: '50',
      myStack: '5000',
      myHoleCards: [0, 14],
    });
    expect(d.action).toBe('check');
  });

  it('decidePokerBotAction uses postflop check when can check', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const d = decidePokerBotAction({
      street: 'flop',
      pot: '200',
      toCall: '0',
      minRaise: '50',
      myStack: '4800',
      myHoleCards: [0, 14],
    });
    expect(d.action).toBe('check');
  });

  it('parsePokerBotAddressCsv trims and lowercases', () => {
    const a = '0x1111111111111111111111111111111111111111';
    const b = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const list = parsePokerBotAddressCsv(` ${a} , ${b} , bad , 0x123 `);
    expect(list).toEqual([a.toLowerCase(), b.toLowerCase()]);
  });

  it('pokerAmountToBigInt handles scientific notation strings', () => {
    expect(pokerAmountToBigInt('4.95e+21')).toBe(4950000000000000000000n);
    expect(pokerAmountToBigInt(4.95e21)).toBeGreaterThan(0n);
  });

  it('getServerPokerBotAddressSet reads POKER_BOT_ADDRESSES', () => {
    const prev = process.env.POKER_BOT_ADDRESSES;
    process.env.POKER_BOT_ADDRESSES = SAMPLE_BOT;
    try {
      const set = getServerPokerBotAddressSet();
      expect(set.has(SAMPLE_BOT.toLowerCase())).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.POKER_BOT_ADDRESSES;
      else process.env.POKER_BOT_ADDRESSES = prev;
    }
  });
});
