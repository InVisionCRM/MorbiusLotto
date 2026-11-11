/**
 * Pure unit tests — no DATABASE_URL / setup.ts DB seed.
 *
 * Run: cd server && npm test -- poker-server-tournament-bots.unit
 */

import { decidePokerBotAction, pokerAmountToBigInt } from '../../lib/poker-bot-ai';
import {
  PokerBotRegistryNotLoadedError,
  getPokerBotAccount,
  getPokerBotAddressSet,
  isPokerBotWallet,
  listPokerBotAccounts,
  setPokerBotRegistryForTesting,
} from '../../lib/poker-bot-registry';
import { getPokerBotBankrollWallet } from '../../lib/poker-bot-bankroll';

const BOT_1 = '0x000000000000000000000000000000000000b071';
const BOT_2 = '0x000000000000000000000000000000000000B072'; // mixed case on purpose
const HUMAN = '0x000000000000000000000000000000000000beef';

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

  it('pokerAmountToBigInt handles scientific notation strings', () => {
    expect(pokerAmountToBigInt('4.95e+21')).toBe(4950000000000000000000n);
    expect(pokerAmountToBigInt(4.95e21)).toBeGreaterThan(0n);
  });
});

describe('poker-bot-registry (unit)', () => {
  afterEach(() => {
    setPokerBotRegistryForTesting(null);
  });

  it('throws PokerBotRegistryNotLoadedError before the registry is loaded (fail-fast, no env fallback)', () => {
    setPokerBotRegistryForTesting(null);
    expect(() => isPokerBotWallet(BOT_1)).toThrow(PokerBotRegistryNotLoadedError);
    expect(() => getPokerBotAddressSet()).toThrow(PokerBotRegistryNotLoadedError);
    expect(() => listPokerBotAccounts()).toThrow(PokerBotRegistryNotLoadedError);
  });

  it('recognises registered bots case-insensitively and rejects humans', () => {
    setPokerBotRegistryForTesting([
      { walletAddress: BOT_1, displayName: 'Brunson', personality: {} },
      { walletAddress: BOT_2, displayName: 'Hellmuth', personality: { aggro: 0.7 } },
    ]);
    expect(isPokerBotWallet(BOT_1)).toBe(true);
    expect(isPokerBotWallet(BOT_2)).toBe(true);
    expect(isPokerBotWallet(BOT_2.toLowerCase())).toBe(true);
    expect(isPokerBotWallet(HUMAN)).toBe(false);

    const set = getPokerBotAddressSet();
    expect(set.size).toBe(2);
    expect(set.has(BOT_2.toLowerCase())).toBe(true);
    expect(set.has(BOT_2)).toBe(false); // always lowercase

    expect(getPokerBotAccount(BOT_2)?.displayName).toBe('Hellmuth');
    expect(getPokerBotAccount(BOT_2)?.personality).toEqual({ aggro: 0.7 });
    expect(getPokerBotAccount(HUMAN)).toBeNull();
  });

  it('an empty registry means "no bots", not an error', () => {
    setPokerBotRegistryForTesting([]);
    expect(isPokerBotWallet(BOT_1)).toBe(false);
    expect(getPokerBotAddressSet().size).toBe(0);
  });

  it('accepts plain display names (no _bot suffix since migration 201) and rejects empty ones', () => {
    setPokerBotRegistryForTesting([{ walletAddress: BOT_1, displayName: 'Brunson', personality: {} }]);
    expect(getPokerBotAccount(BOT_1)?.displayName).toBe('Brunson');
    expect(getPokerBotAccount(BOT_1)?.role).toBe('tournament');
    expect(() =>
      setPokerBotRegistryForTesting([{ walletAddress: BOT_1, displayName: '  ', personality: {} }]),
    ).toThrow(/display_name/);
  });

  it('filters by role', () => {
    setPokerBotRegistryForTesting([
      { walletAddress: BOT_1, displayName: 'Brunson', personality: {} },
      { walletAddress: BOT_2, displayName: 'Chan', personality: {}, role: 'cash' },
    ]);
    expect(listPokerBotAccounts('tournament').map((b) => b.displayName)).toEqual(['Brunson']);
    expect(listPokerBotAccounts('cash').map((b) => b.displayName)).toEqual(['Chan']);
    expect(listPokerBotAccounts()).toHaveLength(2);
  });

  it('rejects malformed addresses', () => {
    expect(() =>
      setPokerBotRegistryForTesting([{ walletAddress: '0x1234', displayName: 'Short', personality: {} }]),
    ).toThrow(/wallet_address/);
  });
});

describe('poker-bot-bankroll wallet config (unit)', () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.POKER_BOT_BANKROLL_WALLET;
    setPokerBotRegistryForTesting([{ walletAddress: BOT_1, displayName: 'Brunson', personality: {} }]);
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.POKER_BOT_BANKROLL_WALLET;
    else process.env.POKER_BOT_BANKROLL_WALLET = prev;
    setPokerBotRegistryForTesting(null);
  });

  it('returns null (self-funded bots) when POKER_BOT_BANKROLL_WALLET is unset', () => {
    delete process.env.POKER_BOT_BANKROLL_WALLET;
    expect(getPokerBotBankrollWallet()).toBeNull();
  });

  it('throws when POKER_BOT_BANKROLL_WALLET is not an address', () => {
    process.env.POKER_BOT_BANKROLL_WALLET = 'not-an-address';
    expect(() => getPokerBotBankrollWallet()).toThrow(/POKER_BOT_BANKROLL_WALLET/);
  });

  it('throws when the bankroll wallet is itself a bot', () => {
    process.env.POKER_BOT_BANKROLL_WALLET = BOT_1;
    expect(() => getPokerBotBankrollWallet()).toThrow(/must not be a bot/);
  });

  it('returns the lowercase bankroll wallet when valid', () => {
    process.env.POKER_BOT_BANKROLL_WALLET = '0x00000000000000000000000000000000000000AA';
    expect(getPokerBotBankrollWallet()).toBe('0x00000000000000000000000000000000000000aa');
  });
});
