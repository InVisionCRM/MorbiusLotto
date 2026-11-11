import { Table } from '@chevtek/poker-engine';
import { othersCanRespond } from '../../services/poker-game.service';

// Regression: chevtek offers 'raise' when every other live player is all-in, and executing it
// loops forever (froze api.morbius.io on 2026-11-11). The server must detect that spot.
describe('othersCanRespond (chevtek raise-hang guard)', () => {
  it('is false when the only other live player is all-in and the rest folded', () => {
    const t = new Table(0, 25, 50);
    t.sitDown('a', 5000);
    t.sitDown('b', 40);
    t.sitDown('c', 5000);
    t.dealCards();
    let folded = false;
    while (t.currentActor) {
      const p = t.currentActor;
      if (othersCanRespond(t, p) === false) {
        expect(p.legalActions()).toContain('raise'); // the engine bug we guard against
        return;
      }
      if (p.id === 'b') p.callAction();
      else if (!folded) { folded = true; p.foldAction(); }
      else throw new Error('expected the no-responder spot');
    }
    throw new Error('never reached the no-responder spot');
  });

  it('is true in a normal multiway spot', () => {
    const t = new Table(0, 25, 50);
    t.sitDown('a', 5000);
    t.sitDown('b', 5000);
    t.sitDown('c', 5000);
    t.dealCards();
    expect(othersCanRespond(t, t.currentActor)).toBe(true);
  });
});
