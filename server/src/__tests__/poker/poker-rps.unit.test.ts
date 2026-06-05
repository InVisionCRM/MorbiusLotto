import { resolveRps, RpsRegistry, RPS_CHOICES, isRpsChoice, type RpsChoice } from '../../services/poker-rps';

/**
 * Unit tests for the RPS resolver + in-memory registry (no WS/DB, no timers).
 */

const A = '0xAAAA000000000000000000000000000000000001';
const B = '0xBBBB000000000000000000000000000000000002';
const C = '0xCCCC000000000000000000000000000000000003';

const newMatch = (reg: RpsRegistry, id = 'm1') =>
  reg.create({ id, tableId: 't1', a: { address: A, seatIndex: 0 }, b: { address: B, seatIndex: 1 } });

describe('resolveRps', () => {
  it('all draws return null', () => {
    for (const c of RPS_CHOICES) expect(resolveRps(c, c)).toBeNull();
  });

  it('full win/lose truth table (a vs b)', () => {
    // rock>scissors, scissors>paper, paper>rock
    expect(resolveRps('rock', 'scissors')).toBe('a');
    expect(resolveRps('scissors', 'paper')).toBe('a');
    expect(resolveRps('paper', 'rock')).toBe('a');
    expect(resolveRps('scissors', 'rock')).toBe('b');
    expect(resolveRps('paper', 'scissors')).toBe('b');
    expect(resolveRps('rock', 'paper')).toBe('b');
  });

  it('isRpsChoice guards valid choices only', () => {
    expect(isRpsChoice('rock')).toBe(true);
    expect(isRpsChoice('lizard')).toBe(false);
    expect(isRpsChoice(3)).toBe(false);
    expect(isRpsChoice(null)).toBe(false);
  });
});

describe('RpsRegistry lifecycle', () => {
  it('create → accept → both pick → reveal increments the winner score', () => {
    const reg = new RpsRegistry();
    const created = newMatch(reg);
    expect(created.ok).toBe(true);
    expect(reg.get('m1')?.status).toBe('pending');

    const resp = reg.respond('m1', B, true);
    expect(resp.ok).toBe(true);
    expect(reg.get('m1')?.status).toBe('active');

    const firstPick = reg.pick('m1', A, 'rock');
    expect(firstPick.ok && firstPick.both).toBe(false);

    const secondPick = reg.pick('m1', B, 'scissors');
    expect(secondPick.ok).toBe(true);
    if (!secondPick.ok) throw new Error('unreachable');
    expect(secondPick.both).toBe(true);
    expect(secondPick.reveal?.winner).toBe('a');
    expect(secondPick.reveal?.winnerSeatIndex).toBe(0);
    expect(secondPick.reveal?.scoreA).toBe(1);
    expect(secondPick.reveal?.scoreB).toBe(0);
    // picks reset, round advanced, match still active for "play again"
    expect(reg.get('m1')?.round).toBe(1);
    expect(reg.get('m1')?.a.pick).toBeNull();
    expect(reg.get('m1')?.status).toBe('active');
  });

  it('a draw advances the round but no score changes', () => {
    const reg = new RpsRegistry();
    newMatch(reg);
    reg.respond('m1', B, true);
    reg.pick('m1', A, 'paper');
    const r = reg.pick('m1', B, 'paper');
    if (!r.ok) throw new Error('unreachable');
    expect(r.reveal?.winner).toBeNull();
    expect(r.reveal?.winnerSeatIndex).toBeNull();
    expect(r.reveal?.scoreA).toBe(0);
    expect(r.reveal?.scoreB).toBe(0);
    expect(reg.get('m1')?.round).toBe(1);
  });

  it('deny ends and forgets the match, freeing both players', () => {
    const reg = new RpsRegistry();
    newMatch(reg);
    const r = reg.respond('m1', B, false);
    expect(r.ok).toBe(true);
    expect(reg.get('m1')).toBeUndefined();
    expect(reg.hasActiveForAddress(A)).toBe(false);
    expect(reg.hasActiveForAddress(B)).toBe(false);
  });

  it('one match per player — second challenge to a busy player is rejected', () => {
    const reg = new RpsRegistry();
    newMatch(reg);
    const dup = reg.create({ id: 'm2', tableId: 't1', a: { address: C, seatIndex: 2 }, b: { address: B, seatIndex: 1 } });
    expect(dup.ok).toBe(false);
    if (dup.ok) throw new Error('unreachable');
    expect(dup.error).toBe('busy');
  });

  it('a busy challenger cannot start another match', () => {
    const reg = new RpsRegistry();
    newMatch(reg);
    const dup = reg.create({ id: 'm2', tableId: 't1', a: { address: A, seatIndex: 0 }, b: { address: C, seatIndex: 2 } });
    expect(dup.ok).toBe(false);
    if (dup.ok) throw new Error('unreachable');
    expect(dup.error).toBe('challenger_busy');
  });

  it('a locked player cannot change their pick mid-round', () => {
    const reg = new RpsRegistry();
    newMatch(reg);
    reg.respond('m1', B, true);
    reg.pick('m1', A, 'rock');
    const again = reg.pick('m1', A, 'paper');
    expect(again.ok).toBe(false);
    if (again.ok) throw new Error('unreachable');
    expect(again.error).toBe('already_picked');
  });

  it('cancelRound clears a one-sided pick without scoring', () => {
    const reg = new RpsRegistry();
    newMatch(reg);
    reg.respond('m1', B, true);
    reg.pick('m1', A, 'rock');
    expect(reg.hasPartialPick('m1')).toBe(true);
    const m = reg.cancelRound('m1');
    expect(m?.a.pick).toBeNull();
    expect(m?.scoreA).toBe(0);
    expect(reg.hasPartialPick('m1')).toBe(false);
    expect(reg.get('m1')?.status).toBe('active');
  });

  it('cannot pick before acceptance (pending) or in a non-existent match', () => {
    const reg = new RpsRegistry();
    newMatch(reg);
    const early = reg.pick('m1', A, 'rock');
    expect(early.ok).toBe(false);
    if (early.ok) throw new Error('unreachable');
    expect(early.error).toBe('not_active');
    const ghost = reg.pick('zzz', A, 'rock');
    expect(ghost.ok).toBe(false);
  });

  it('an outsider cannot pick into a match', () => {
    const reg = new RpsRegistry();
    newMatch(reg);
    reg.respond('m1', B, true);
    const r = reg.pick('m1', C, 'rock');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('not_in_match');
  });

  it('only the challenged player may respond', () => {
    const reg = new RpsRegistry();
    newMatch(reg);
    const r = reg.respond('m1', A, true);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toBe('not_responder');
  });

  it('leaveByAddress ends the match and frees the peer', () => {
    const reg = new RpsRegistry();
    newMatch(reg);
    reg.respond('m1', B, true);
    const removed = reg.leaveByAddress(A);
    expect(removed?.id).toBe('m1');
    expect(reg.hasActiveForAddress(A)).toBe(false);
    expect(reg.hasActiveForAddress(B)).toBe(false);
    expect(reg.get('m1')).toBeUndefined();
  });

  it('addresses are matched case-insensitively', () => {
    const reg = new RpsRegistry();
    newMatch(reg);
    reg.respond('m1', B.toUpperCase(), true);
    const r = reg.pick('m1', A.toUpperCase(), 'rock');
    expect(r.ok).toBe(true);
  });

  it('every choice is a valid RpsChoice constant', () => {
    const all: RpsChoice[] = ['rock', 'paper', 'scissors'];
    expect([...RPS_CHOICES].sort()).toEqual([...all].sort());
  });
});
