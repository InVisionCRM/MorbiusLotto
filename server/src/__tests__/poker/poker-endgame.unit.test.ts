/**
 * Beat the Bots end game: heads-up bots must not trade blinds forever (the 9 PM game on
 * 2026-11-11 had 60 blind-walks in 65 heads-up hands), and scheduled bot games shorten blind
 * levels once heads-up / bot-only.
 */
import { decidePokerBotAction } from '../../lib/poker-bot-ai';
import { endgameBlindIntervalMinutes } from '../../services/poker-tournament.service';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
function foldRate(inp: Record<string, unknown>, n = 1500): number {
  const rng = seeded(42);
  let folds = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(rng() * 52);
    let b = a; while (b === a) b = Math.floor(rng() * 52);
    const d = decidePokerBotAction({ ...(inp as any), myHoleCards: [a, b], iterations: 20, rng });
    if (d.action === 'fold') folds++;
  }
  return folds / n;
}

describe('heads-up bot preflop', () => {
  it('small blind plays most hands heads-up (was ~70% folds)', () => {
    const r = foldRate({ street: 'preflop', pot: '1500', toCall: '500', minRaise: '2000', myStack: '29500', myBet: '500', bigBlind: '1000', numOpponents: 1 });
    expect(r).toBeLessThan(0.3);
  });
  it('big blind defends a min-raise heads-up', () => {
    const r = foldRate({ street: 'preflop', pot: '3000', toCall: '1000', minRaise: '3000', myStack: '29000', myBet: '1000', bigBlind: '1000', numOpponents: 1 });
    expect(r).toBeLessThan(0.3);
  });
  it('full-ring early position stays tight', () => {
    const r = foldRate({ street: 'preflop', pot: '1500', toCall: '1000', minRaise: '2000', myStack: '50000', myBet: '0', bigBlind: '1000', numOpponents: 5 });
    expect(r).toBeGreaterThan(0.65);
  });
});

describe('endgameBlindIntervalMinutes', () => {
  const base = 5;
  it('unchanged for normal tournaments', () => {
    expect(endgameBlindIntervalMinutes(base, { fastEndgame: false, alive: 2, humansAlive: 0, lateRegOpen: false })).toBe(5);
  });
  it('unchanged while 3+ players and a human remain', () => {
    expect(endgameBlindIntervalMinutes(base, { fastEndgame: true, alive: 4, humansAlive: 1, lateRegOpen: false })).toBe(5);
  });
  it('2-minute levels heads-up', () => {
    expect(endgameBlindIntervalMinutes(base, { fastEndgame: true, alive: 2, humansAlive: 1, lateRegOpen: false })).toBe(2);
  });
  it('1-minute levels once no human is left and late reg is closed', () => {
    expect(endgameBlindIntervalMinutes(base, { fastEndgame: true, alive: 5, humansAlive: 0, lateRegOpen: false })).toBe(1);
  });
  it('no bot-only speed-up while humans can still late-register', () => {
    expect(endgameBlindIntervalMinutes(base, { fastEndgame: true, alive: 7, humansAlive: 0, lateRegOpen: true })).toBe(5);
  });
});
