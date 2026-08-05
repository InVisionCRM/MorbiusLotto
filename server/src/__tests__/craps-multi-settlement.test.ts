/**
 * The rules a shared craps felt has to get right.
 *
 * A multiplayer craps table makes exactly one dangerous promise: one throw
 * settles many players, and no player's money may affect another's — or the
 * table's. These tests pin that promise at the level where it is decidable
 * (the pure evaluator), which is where the service's per-seat loop gets its
 * answers from.
 */

import {
  CrapsBets,
  CrapsPhase,
  advanceCrapsPhase,
  evaluateRoll,
} from '../services/arcade-craps';

const POINT_NUMBERS = [4, 5, 6, 8, 9, 10];

const STATES: Array<{ phase: CrapsPhase; point: number | null }> = [
  { phase: 'COME_OUT', point: null },
  ...POINT_NUMBERS.map((p) => ({ phase: 'POINT' as CrapsPhase, point: p })),
];

/** Every (die1, die2) pair, including both orderings — 36 outcomes. */
function allDice(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) out.push([a, b]);
  return out;
}

/** A spread of felt layouts covering every zone the game offers. */
const LAYOUTS: Record<string, CrapsBets> = {
  empty: {},
  passOnly: { PASS: 100 },
  dontPassOnly: { DONT_PASS: 100 },
  fieldOnly: { FIELD: 40 },
  propsOnly: { ANY_7: 10, ANY_CRAPS: 10 },
  placesOnly: { PLACE_4: 50, PLACE_5: 50, PLACE_6: 60, PLACE_8: 60, PLACE_9: 50, PLACE_10: 50 },
  everything: {
    PASS: 33, DONT_PASS: 17, FIELD: 7, ANY_7: 3, ANY_CRAPS: 9,
    PLACE_4: 11, PLACE_5: 13, PLACE_6: 19, PLACE_8: 23, PLACE_9: 29, PLACE_10: 31,
  },
};

describe('the table advances on the dice alone', () => {
  it('never lets a phase transition depend on what anyone has bet', () => {
    // This is THE invariant a shared felt rests on. If it failed, two seats
    // could disagree about whether the point was made.
    for (const [d1, d2] of allDice()) {
      for (const st of STATES) {
        const seen = new Set(
          Object.values(LAYOUTS).map((bets) => {
            const r = evaluateRoll(d1, d2, st.phase, st.point, { ...bets });
            return JSON.stringify([r.phaseAfter, r.pointAfter, r.isPoint, r.isSevenOut]);
          }),
        );
        expect(seen.size).toBe(1);
      }
    }
  });

  it('agrees with the standalone transition helper on every throw', () => {
    for (const [d1, d2] of allDice()) {
      for (const st of STATES) {
        const viaEvaluator = evaluateRoll(d1, d2, st.phase, st.point, { PASS: 10 });
        const viaHelper = advanceCrapsPhase(d1 + d2, st.phase, st.point);
        expect(viaHelper.phaseAfter).toBe(viaEvaluator.phaseAfter);
        expect(viaHelper.pointAfter).toBe(viaEvaluator.pointAfter);
        expect(viaHelper.isPoint).toBe(viaEvaluator.isPoint);
        expect(viaHelper.isSevenOut).toBe(viaEvaluator.isSevenOut);
      }
    }
  });

  it('establishes the point on a come-out box number and leaves naturals alone', () => {
    for (const p of POINT_NUMBERS) {
      const chg = advanceCrapsPhase(p, 'COME_OUT', null);
      expect(chg.phaseAfter).toBe('POINT');
      expect(chg.pointAfter).toBe(p);
      expect(chg.isPoint).toBe(false);
    }
    for (const sum of [7, 11, 2, 3, 12]) {
      const chg = advanceCrapsPhase(sum, 'COME_OUT', null);
      expect(chg.phaseAfter).toBe('COME_OUT');
      expect(chg.pointAfter).toBe(null);
    }
  });

  it('clears the point when it is made and when the shooter sevens out', () => {
    const made = advanceCrapsPhase(6, 'POINT', 6);
    expect(made.phaseAfter).toBe('COME_OUT');
    expect(made.pointAfter).toBe(null);
    expect(made.isPoint).toBe(true);
    expect(made.isSevenOut).toBe(false);

    const out = advanceCrapsPhase(7, 'POINT', 6);
    expect(out.phaseAfter).toBe('COME_OUT');
    expect(out.pointAfter).toBe(null);
    expect(out.isSevenOut).toBe(true);
    expect(out.isPoint).toBe(false);
  });

  it('leaves the point standing on an indifferent throw', () => {
    // 5 with the point on 6 decides nothing about the cycle.
    const chg = advanceCrapsPhase(5, 'POINT', 6);
    expect(chg.phaseAfter).toBe('POINT');
    expect(chg.pointAfter).toBe(6);
    expect(chg.isPoint).toBe(false);
    expect(chg.isSevenOut).toBe(false);
  });
});

describe('one throw settles every seat independently', () => {
  it('gives a seat the same result whoever else is at the table', () => {
    // Models what CrapsMultiGameService.roll does: take the table's phase and
    // point ONCE, then walk the seats settling each against them. A seat's
    // payout must not shift because of who it is sitting next to, and the order
    // the service happens to walk the rail in must not matter either.
    const settleRail = (
      rail: CrapsBets[],
      d1: number, d2: number, phase: CrapsPhase, point: number | null,
    ) => rail.map((bets) => evaluateRoll(d1, d2, phase, point, { ...bets }));

    const layouts = Object.values(LAYOUTS);

    for (const [d1, d2] of allDice()) {
      for (const st of STATES) {
        // What each layout is owed with nobody else on the felt.
        const solo = layouts.map((bets) => evaluateRoll(d1, d2, st.phase, st.point, { ...bets }));

        // The same layouts sharing one table.
        const fullRail = settleRail(layouts, d1, d2, st.phase, st.point);
        fullRail.forEach((seat, i) => {
          expect(seat.wins).toBe(solo[i].wins);
          expect(seat.losses).toBe(solo[i].losses);
          expect(JSON.stringify(seat.betsAfter)).toBe(JSON.stringify(solo[i].betsAfter));
        });

        // And again with the rail walked back-to-front.
        const reversed = settleRail([...layouts].reverse(), d1, d2, st.phase, st.point);
        reversed.forEach((seat, i) => {
          const soloIdx = layouts.length - 1 - i;
          expect(seat.wins).toBe(solo[soloIdx].wins);
          expect(seat.losses).toBe(solo[soloIdx].losses);
        });
      }
    }
  });

  it('pays a shared throw correctly when every seat wants a different thing', () => {
    // Come-out 7: a natural. PASS wins, DONT_PASS loses, FIELD loses, ANY_7
    // hits at 4:1 — all off the same two dice, at the same table, at once.
    const phase: CrapsPhase = 'COME_OUT';
    const rail = {
      pass: evaluateRoll(3, 4, phase, null, { PASS: 100 }),
      dont: evaluateRoll(3, 4, phase, null, { DONT_PASS: 100 }),
      field: evaluateRoll(3, 4, phase, null, { FIELD: 40 }),
      any7: evaluateRoll(3, 4, phase, null, { ANY_7: 10 }),
    };

    expect(rail.pass.wins).toBe(200);    // stake + even money
    expect(rail.pass.losses).toBe(0);
    expect(rail.dont.wins).toBe(0);
    expect(rail.dont.losses).toBe(100);
    expect(rail.field.wins).toBe(0);
    expect(rail.field.losses).toBe(40);
    expect(rail.any7.wins).toBe(50);     // stake + 4:1
    expect(rail.any7.losses).toBe(0);

    // One throw, one story about where the table now stands.
    for (const r of Object.values(rail)) {
      expect(r.phaseAfter).toBe('COME_OUT');
      expect(r.pointAfter).toBe(null);
    }
  });

  it('does not mutate the bets object it was handed', () => {
    // The service passes each seat's persisted JSONB straight in. If the
    // evaluator wrote through, one seat's settlement would corrupt the row
    // that is about to be written back for another.
    const original: CrapsBets = { PASS: 100, PLACE_6: 60, FIELD: 25 };
    const snapshot = JSON.stringify(original);
    evaluateRoll(3, 4, 'POINT', 6, original);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('settles a seven-out across a full rail — line bets die, dont pass collects', () => {
    // Point is 6. A 7 ends it: PASS loses, DONT_PASS wins, place bets come down.
    const passSeat = evaluateRoll(3, 4, 'POINT', 6, { PASS: 100 });
    expect(passSeat.wins).toBe(0);
    expect(passSeat.losses).toBe(100);
    expect(passSeat.isSevenOut).toBe(true);

    const dontSeat = evaluateRoll(3, 4, 'POINT', 6, { DONT_PASS: 100 });
    expect(dontSeat.wins).toBe(200);   // stake back plus even money
    expect(dontSeat.losses).toBe(0);

    const placeSeat = evaluateRoll(3, 4, 'POINT', 6, { PLACE_6: 60, PLACE_8: 60 });
    expect(placeSeat.wins).toBe(0);
    expect(placeSeat.losses).toBe(120);
    expect(placeSeat.betsAfter.PLACE_6).toBe(undefined);

    // Every seat saw the same seven-out.
    for (const r of [passSeat, dontSeat, placeSeat]) {
      expect(r.phaseAfter).toBe('COME_OUT');
      expect(r.pointAfter).toBe(null);
    }
  });

  it('keeps place bets working on a hot roll while the point stands', () => {
    // Point 8, shooter throws a 6: PLACE_6 pays 7:6 profit and STAYS up.
    const r = evaluateRoll(3, 3, 'POINT', 8, { PLACE_6: 60, PASS: 50 });
    expect(r.wins).toBe(70);              // floor(60 * 7/6) profit only
    expect(r.betsAfter.PLACE_6).toBe(60); // still working
    expect(r.betsAfter.PASS).toBe(50);    // untouched
    expect(r.phaseAfter).toBe('POINT');
    expect(r.pointAfter).toBe(8);
  });

  it('an empty seat neither wins nor loses on any throw', () => {
    for (const [d1, d2] of allDice()) {
      for (const st of STATES) {
        const r = evaluateRoll(d1, d2, st.phase, st.point, {});
        expect(r.wins).toBe(0);
        expect(r.losses).toBe(0);
      }
    }
  });
});

describe('the shooter genuinely changes the dice', () => {
  it('derives different throws for different client seeds at the same nonce', () => {
    // The table's server seed is fixed; the SHOOTER supplies the client seed.
    // If these matched, holding the dice would be pure decoration.
    const { ProvablyFairService } = require('../services/provably-fair.service');
    const { rollDiceFromSeeds } = require('../services/arcade-craps');
    const pf = new ProvablyFairService();
    const serverSeed = 'a'.repeat(64);

    const seen = new Set<string>();
    for (let i = 0; i < 24; i++) {
      seen.add(rollDiceFromSeeds(pf, serverSeed, `shooter-${i}`, 0).join(','));
    }
    // 24 different shooters on the same nonce must not all throw the same dice.
    expect(seen.size).toBeGreaterThan(1);
  });

  it('is deterministic — the same shooter, seed and nonce reproduce the throw', () => {
    const { ProvablyFairService } = require('../services/provably-fair.service');
    const { rollDiceFromSeeds } = require('../services/arcade-craps');
    const pf = new ProvablyFairService();
    const a = rollDiceFromSeeds(pf, 'b'.repeat(64), 'shooter-seed', 7);
    const b = rollDiceFromSeeds(pf, 'b'.repeat(64), 'shooter-seed', 7);
    expect(a.join(',')).toBe(b.join(','));
    expect(a[0]).toBeGreaterThan(0);
    expect(a[0]).toBeLessThan(7);
    expect(a[1]).toBeGreaterThan(0);
    expect(a[1]).toBeLessThan(7);
  });
});
