import { computeBroadcastFlags, formatElimination, ordinal, prizeForPlace, shapeTable } from '../../services/poker-bot-broadcast';

const base = { status: 'active', entrants: 100, playersLeft: 60, paidPlaces: 10, maxSeats: 10, lateRegOpen: false };

describe('computeBroadcastFlags', () => {
  it('no milestones mid-field', () => {
    expect(computeBroadcastFlags(base)).toEqual({ bubble: false, inTheMoney: false, finalTable: false, headsUp: false, finished: false });
  });
  it('bubble = paid + 1 left, but not while late reg is open', () => {
    expect(computeBroadcastFlags({ ...base, playersLeft: 11 }).bubble).toBe(true);
    expect(computeBroadcastFlags({ ...base, playersLeft: 11, lateRegOpen: true }).bubble).toBe(false);
    expect(computeBroadcastFlags({ ...base, playersLeft: 12 }).bubble).toBe(false);
  });
  it('in the money when players left <= paid places; final table at <= maxSeats', () => {
    const f = computeBroadcastFlags({ ...base, playersLeft: 10 });
    expect(f.inTheMoney).toBe(true);
    expect(f.finalTable).toBe(true);
    expect(f.bubble).toBe(false);
  });
  it('heads-up at 2 left; finished on completed', () => {
    expect(computeBroadcastFlags({ ...base, playersLeft: 2 }).headsUp).toBe(true);
    const f = computeBroadcastFlags({ ...base, status: 'completed', playersLeft: 1 });
    expect(f.finished).toBe(true);
    expect(f.headsUp).toBe(false);
  });
  it('a single-table daily game never flags final table / ITM', () => {
    const f = computeBroadcastFlags({ ...base, entrants: 8, playersLeft: 5, paidPlaces: 3 });
    expect(f.finalTable).toBe(false);
  });
  it('nothing flagged before the tournament starts', () => {
    expect(computeBroadcastFlags({ ...base, status: 'registration', playersLeft: 0 })).toEqual({ bubble: false, inTheMoney: false, finalTable: false, headsUp: false, finished: false });
  });
});

describe('elimination formatting', () => {
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 14, 21, 22, 23, 101, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '14th', '21st', '22nd', '23rd', '101st', '111th']);
  });
  it('unpaid and paid labels', () => {
    expect(formatElimination('GhostCall', 14, null)).toBe('GhostCall eliminated in 14th');
    expect(formatElimination('GhostCall', 7, 20006)).toBe('GhostCall eliminated in 7th — wins 20,006');
  });
  it('prizeForPlace', () => {
    const ladder = [{ place: 1, percent: 30, amount: 150045 }, { place: 2, percent: 20, amount: 100030 }];
    expect(prizeForPlace(ladder, 2)).toBe(100030);
    expect(prizeForPlace(ladder, 3)).toBeNull();
  });
});

describe('shapeTable', () => {
  const row = { id: 't1', table_seq: 4, is_final_table: false, max_seats: 10, seated: 9, stack_total: '45000', biggest_stack: '12000',
    hand_number: 31, pot: '3400', street: 'flop', runout_resolved_at: null, hand_completed_at: null };
  it('reports pot / phase / all-in from live flag', () => {
    const t = shapeTable(row, true, 0);
    expect(t).toMatchObject({ tableNumber: 4, pot: 3400, phase: 'flop', allIn: true, showdown: false, biggestStack: 12000 });
  });
  it('showdown + runout flags; no hand = zero pot', () => {
    expect(shapeTable({ ...row, street: 'showdown' }, false, 0).showdown).toBe(true);
    expect(shapeTable({ ...row, runout_resolved_at: new Date() }, false, 0)).toMatchObject({ allIn: true, showdown: true });
    expect(shapeTable({ ...row, hand_number: null, pot: null, street: null }, false, 2)).toMatchObject({ pot: 0, phase: null, handNumber: null, allIn: false });
  });
});
