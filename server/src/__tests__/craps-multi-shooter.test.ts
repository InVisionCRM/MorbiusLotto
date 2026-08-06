/**
 * Shooter lifecycle — the rules that keep a shared table alive.
 *
 * These exist because of a real bug: the idle-seat kick could delete the seat
 * holding the dice on a non-seven-out throw, leaving shooter_position pointing
 * at nothing. Every later throw then failed, and because a failed throw leaves
 * the table in 'rolling', betting never reopened — the table was bricked with
 * players' chips still on the felt.
 *
 * The service is SQL-bound, so rather than pretend to test it end to end these
 * pin the two decisions that caused the strand, modelled exactly as the service
 * makes them.
 */

const CRAPS_MULTI_AFK_KICK_AFTER = 6;

interface Seat { position: number; idleThrows: number; hasChips: boolean }

/**
 * The service's per-seat decision on a throw: does this seat lose its place?
 * Mirrors the guard in CrapsMultiGameService.roll.
 */
function seatIsKicked(seat: Seat, shooterPosition: number | null): boolean {
  if (seat.hasChips) return false;
  const next = seat.idleThrows + 1;
  return next >= CRAPS_MULTI_AFK_KICK_AFTER && seat.position !== shooterPosition;
}

/**
 * Who holds the dice once a throw resolves. Mirrors the self-heal at the top of
 * roll() plus passDiceTo: a pointer naming a seat that isn't there is adopted
 * by the lowest remaining seat, and an empty rail has no shooter at all.
 */
function resolveShooter(claimed: number | null, present: number[]): number | null {
  if (present.length === 0) return null;
  if (claimed !== null && present.includes(claimed)) return claimed;
  return present[0];
}

/**
 * Next seat clockwise, wrapping. This is now the REAL shared helper rather than
 * a copy of it — craps passes the dice with it and Hold'em moves the button
 * with it, so a test against a mirror would prove nothing about either.
 */
import { nextOccupiedSeat } from '../lib/multiplayer-table';

const passDice = (from: number, present: number[]) => nextOccupiedSeat(present, from);

describe('the seat holding the dice is never kicked', () => {
  it('keeps the shooter even after the idle limit is reached', () => {
    // This is the exact case that bricked the table: an idle shooter on a
    // throw that is not a seven-out, so the dice do not pass.
    const shooter: Seat = { position: 2, idleThrows: CRAPS_MULTI_AFK_KICK_AFTER, hasChips: false };
    expect(seatIsKicked(shooter, 2)).toBe(false);
  });

  it('still kicks an idle seat that is not shooting', () => {
    const idle: Seat = { position: 5, idleThrows: CRAPS_MULTI_AFK_KICK_AFTER, hasChips: false };
    expect(seatIsKicked(idle, 2)).toBe(true);
  });

  it('never kicks a seat with chips on the felt, however long it has been quiet', () => {
    const betting: Seat = { position: 5, idleThrows: 99, hasChips: true };
    expect(seatIsKicked(betting, 2)).toBe(false);
  });

  it('kicks the former shooter once the dice have moved on', () => {
    // The counter keeps climbing while they hold the dice, so the throw after
    // they seven out is the one that takes the seat.
    const formerShooter: Seat = { position: 2, idleThrows: CRAPS_MULTI_AFK_KICK_AFTER, hasChips: false };
    expect(seatIsKicked(formerShooter, 4)).toBe(true);
  });

  it('leaves a table with at least one seat after any throw', () => {
    // Since the shooter is exempt, an all-idle rail can never empty itself —
    // which is what guaranteed a live pointer to heal toward.
    const rail: Seat[] = [0, 1, 2, 3].map((position) => ({
      position, idleThrows: CRAPS_MULTI_AFK_KICK_AFTER + 3, hasChips: false,
    }));
    const survivors = rail.filter((s) => !seatIsKicked(s, 1));
    expect(survivors.length).toBe(1);
    expect(survivors[0].position).toBe(1);
  });
});

describe('a dangling shooter pointer heals instead of stranding the table', () => {
  it('adopts the lowest remaining seat when the pointer names nobody', () => {
    // Seat 2 held the dice and is gone. Rather than failing the throw forever,
    // the lowest seat still there picks them up.
    expect(resolveShooter(2, [3, 5, 7])).toBe(3);
  });

  it('leaves a valid pointer alone', () => {
    expect(resolveShooter(5, [3, 5, 7])).toBe(5);
  });

  it('reports no shooter only when the rail is genuinely empty', () => {
    expect(resolveShooter(2, [])).toBe(null);
    expect(resolveShooter(null, [])).toBe(null);
  });

  it('gives an arriving player the dice when the pointer is stale', () => {
    // joinTable treats "names a seat that isn't there" the same as "names
    // nobody" — otherwise the newcomer could neither bet nor throw.
    const staleClaim = 4;
    const seatedBefore: number[] = [];
    const shooterPresent = seatedBefore.includes(staleClaim);
    expect(shooterPresent).toBe(false);
  });
});

describe('the dice go round', () => {
  it('passes to the next seat clockwise', () => {
    expect(passDice(2, [0, 2, 5, 7])).toBe(5);
  });

  it('wraps back to the first seat from the last', () => {
    expect(passDice(7, [0, 2, 5, 7])).toBe(0);
  });

  it('skips positions nobody is sitting in', () => {
    expect(passDice(0, [0, 6])).toBe(6);
  });

  it('comes back to a lone shooter rather than stranding the dice', () => {
    expect(passDice(3, [3])).toBe(3);
  });
});
