import { decidePokerBotAction, estimateEquity, preflopStrength, normalizePersonality } from '../../lib/poker-bot-ai';

// Card encoding: idx = suit * 13 + rank, rank 0 = Two … 12 = Ace; suits 0..3 = c,d,h,s.
const R: Record<string, number> = { '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6, '9': 7, T: 8, J: 9, Q: 10, K: 11, A: 12 };
const S: Record<string, number> = { c: 0, d: 1, h: 2, s: 3 };
const c = (s: string): number => S[s[1]] * 13 + R[s[0]];
const cards = (s: string): number[] => s.split(' ').map(c);

/** Seeded LCG so Monte Carlo + bluff rolls are deterministic. */
function seeded(seed = 42): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

const neutral = { tightness: 0.5, aggression: 0.5, bluff: 0 };

describe('preflopStrength (rank 0 = Two, 12 = Ace)', () => {
  it('orders hands sensibly', () => {
    const aa = preflopStrength(cards('As Ah'));
    const kk = preflopStrength(cards('Ks Kh'));
    const aks = preflopStrength(cards('As Ks'));
    const t9s = preflopStrength(cards('Ts 9s'));
    const twos = preflopStrength(cards('2s 2h'));
    const sevenTwo = preflopStrength(cards('7c 2d'));
    expect(aa).toBeGreaterThan(kk);
    expect(kk).toBeGreaterThan(aks);
    expect(aks).toBeGreaterThan(t9s);
    expect(t9s).toBeGreaterThan(sevenTwo);
    expect(twos).toBeLessThan(kk);
    expect(aa).toBeCloseTo(1, 5);
    expect(sevenTwo).toBeLessThan(0.15);
  });

  it('regression: deuces are not scored as aces', () => {
    expect(preflopStrength(cards('2s 2h'))).toBeLessThan(preflopStrength(cards('As Ah')) - 0.4);
    expect(preflopStrength(cards('2s 7h'))).toBeLessThan(preflopStrength(cards('As 7h')));
  });
});

describe('estimateEquity', () => {
  it('AA vs one random hand ≈ 85%', () => {
    const eq = estimateEquity(cards('As Ah'), [], 1, 3000, seeded(1));
    expect(eq).toBeGreaterThan(0.8);
    expect(eq).toBeLessThan(0.9);
  });
  it('72o vs one random hand ≈ 35%', () => {
    const eq = estimateEquity(cards('7c 2d'), [], 1, 3000, seeded(2));
    expect(eq).toBeGreaterThan(0.28);
    expect(eq).toBeLessThan(0.4);
  });
  it('made nut flush on the flop is a big favourite even vs 3 opponents', () => {
    const eq = estimateEquity(cards('As Ks'), cards('2s 7s Ts'), 3, 1500, seeded(3));
    expect(eq).toBeGreaterThan(0.75);
  });
  it('air on a dry river is a big underdog', () => {
    const eq = estimateEquity(cards('3c 4d'), cards('Ks Kh 9d 8c As'), 1, 1500, seeded(4));
    expect(eq).toBeLessThan(0.15);
  });
});

describe('decidePokerBotAction — postflop is hand-strength driven', () => {
  const base = { pot: '1000', minRaise: '0', myStack: '5000', bigBlind: '50', myBet: '0', iterations: 600, personality: neutral };

  it('folds air to a pot-sized river bet', () => {
    const d = decidePokerBotAction({
      ...base, street: 'river', toCall: '1000', minRaise: '2000',
      myHoleCards: cards('3c 4d'), communityCards: cards('Ks Kh 9d 8c As'), numOpponents: 1, rng: seeded(5),
    });
    expect(d.action).toBe('fold');
  });

  it('never folds the nuts to a bet; raises it', () => {
    const d = decidePokerBotAction({
      ...base, street: 'flop', toCall: '500', minRaise: '1000',
      myHoleCards: cards('As Ks'), communityCards: cards('2s 7s Ts'), numOpponents: 1, rng: seeded(6),
    });
    expect(d.action).toBe('raise');
    const amt = BigInt(d.amount!);
    expect(amt).toBeGreaterThanOrEqual(1000n); // ≥ minRaise (raise-TO)
    expect(amt).toBeLessThanOrEqual(5000n); // ≤ stack + myBet
  });

  it('value-bets a strong hand when checked to, sized as a fraction of the pot (not a min-bet)', () => {
    const d = decidePokerBotAction({
      ...base, street: 'turn', toCall: '0',
      myHoleCards: cards('Ah Ad'), communityCards: cards('Ac 7d 2s 9h'), numOpponents: 1, rng: seeded(7),
    });
    expect(d.action).toBe('bet');
    expect(BigInt(d.amount!)).toBeGreaterThanOrEqual(500n);
  });

  it('checks back weak hands when bluff rate is 0', () => {
    const d = decidePokerBotAction({
      ...base, street: 'river', toCall: '0',
      myHoleCards: cards('3c 4d'), communityCards: cards('Ks Kh 9d 8c As'), numOpponents: 1, rng: seeded(8),
    });
    expect(d.action).toBe('check');
  });

  it('calls a small bet with a strong draw (pot odds)', () => {
    const d = decidePokerBotAction({
      ...base, street: 'flop', toCall: '200', minRaise: '400', personality: { tightness: 0.5, aggression: 0, bluff: 0 },
      myHoleCards: cards('Qs Js'), communityCards: cards('2s 7s Th'), numOpponents: 1, rng: seeded(9),
    });
    expect(['call', 'raise']).toContain(d.action);
  });

  it('goes all-in (raise to stack + myBet) when the target exceeds the stack', () => {
    const d = decidePokerBotAction({
      ...base, street: 'flop', myStack: '600', myBet: '0', toCall: '500', minRaise: '1000',
      myHoleCards: cards('As Ks'), communityCards: cards('2s 7s Ts'), numOpponents: 1, rng: seeded(10),
    });
    expect(d).toEqual({ action: 'raise', amount: '600' });
  });
});

describe('decidePokerBotAction — preflop', () => {
  const base = { street: 'preflop', pot: '75', minRaise: '100', myStack: '5000', bigBlind: '50', myBet: '0', personality: neutral, numOpponents: 5 };
  it('raises premiums', () => {
    const d = decidePokerBotAction({ ...base, toCall: '50', myHoleCards: cards('As Ah'), rng: seeded(11) });
    expect(d.action).toBe('raise');
    expect(BigInt(d.amount!)).toBeGreaterThanOrEqual(100n);
  });
  it('folds trash to a raise', () => {
    const d = decidePokerBotAction({ ...base, toCall: '300', minRaise: '550', myHoleCards: cards('7c 2d'), rng: seeded(12) });
    expect(d.action).toBe('fold');
  });
  it('checks trash in the big blind', () => {
    const d = decidePokerBotAction({ ...base, toCall: '0', minRaise: '100', myHoleCards: cards('7c 2d'), rng: seeded(13) });
    expect(d.action).toBe('check');
  });
});

describe('normalizePersonality', () => {
  it('clamps and defaults', () => {
    expect(normalizePersonality({ tightness: 2, aggression: -1, bluff: 0.9 })).toEqual({ tightness: 1, aggression: 0, bluff: 0.25 });
    expect(normalizePersonality(null)).toEqual({ tightness: 0.5, aggression: 0.5, bluff: 0.05 });
  });
});
