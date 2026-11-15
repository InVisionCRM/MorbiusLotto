/**
 * Offline preview data for the MTT broadcast overlay (STREAM_MOCK=mtt|daily, STREAM_ENABLED=0).
 * Produces the same /api/current shape the live worker serves (table state + MTT extras), so view.html
 * is exercised end-to-end without any API. Scenarios: early | bubble | itm-bust | final | headsup | daily.
 */
import { applyBroadcast, currentExtras } from './worker.mjs';

export const SCENARIOS = ['early', 'bubble', 'itm-bust', 'final', 'headsup', 'daily'];
const NAMES = ['GhostCall', 'RiverRat', 'NitKing', 'ChipDozer', 'Bluffasaurus', 'PulseWhale', 'SlowRollSam', 'AllInAnnie', 'TiltProof', 'MorbMaster',
  'DeadMansHand', 'FoldEquity', 'CoolerKid', 'SatelliteSue', 'HeroCall', 'BigSlickBob', 'Shortstack', 'ICMiss', 'RailBird', 'TankTim',
  'CBetCarl', 'OverPairOwen', 'GutshotGus', 'FlushDraw', 'SetMiner', 'NutsOnly', 'PotCommit', 'BadBeatBen', 'SnapCaller', 'LimpLarry',
  'PocketRox', 'KickerKate', 'DonkBet', 'Whaleboat', 'MuckIt', 'StraightEdge', 'TheGrinder', 'Jam4Fun', 'TurnCard', 'RiverGod',
  'QuadSquad', 'BoardWipe', 'Overbet', 'LagLord', 'Nutflush', 'BubbleBoy', 'ThinValue', 'CheckRaise', 'SlowPlay', 'FishHook'];
const hex = (n) => ('0x' + (n * 2654435761 >>> 0).toString(16).padStart(8, '0').repeat(5)).slice(0, 42);
const num = (n) => Math.round(n);

function ladder(pool = 500150) {
  return [30, 20, 14, 10, 8, 6, 4, 4, 2, 2].map((percent, i) => ({ place: i + 1, percent, amount: Math.floor(pool * percent / 100) }));
}
const ordinal = (n) => { const v = n % 100; return v >= 11 && v <= 13 ? `${n}th` : `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`; };

/** Per-scenario spec. tables: [{ n, seated, phase, pot, allIn?, showdown? }]. */
function spec(name, now) {
  const mk = (n, seated, phase, pot, extra = {}) => ({ n, seated, phase, pot, ...extra });
  const base = { entrants: 100, status: 'active', level: 2, sb: 100, bb: 200, nsb: 150, nbb: 300, nextIn: 161_000, lateEndsIn: null, busts: [], winner: null };
  switch (name) {
    case 'early': {
      const t = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => mk(n, n <= 6 ? 10 : 9, n % 3 === 0 ? null : 'preflop', 300 + n * 40));
      t[5] = mk(6, 10, 'turn', 14_200, { allIn: true });
      t[0] = mk(1, 10, null, 0);
      return { ...base, left: 96, tables: t, startedAgo: 8 * 60_000, lateEndsIn: 37 * 60_000 - 14_000, busts: [[97, 22_000], [98, 9_000], [99, 4_000]], focus: 1 };
    }
    case 'bubble':
      return { ...base, level: 9, sb: 1000, bb: 2000, nsb: 1500, nbb: 3000, nextIn: 98_000, left: 11, startedAgo: 70 * 60_000,
        tables: [mk(2, 6, 'flop', 5400), mk(3, 5, 'preflop', 1200)], busts: [[12, 14_000]], focus: 2, flagsBubble: true };
    case 'itm-bust':
      return { ...base, level: 10, sb: 1500, bb: 3000, nsb: 2000, nbb: 4000, nextIn: 211_000, left: 9, startedAgo: 80 * 60_000,
        tables: [mk(2, 9, 'river', 31_000)], busts: [[11, 33_000], [10, 3_000]], focus: 2 };
    case 'final':
      return { ...base, level: 11, sb: 2000, bb: 4000, nsb: 2500, nbb: 5000, nextIn: 140_000, left: 7, startedAgo: 95 * 60_000,
        tables: [mk(2, 7, 'turn', 46_000, { showdown: false })], busts: [[9, 40_000], [8, 4_000]], focus: 2 };
    case 'headsup':
      return { ...base, level: 13, sb: 4000, bb: 8000, nsb: 5000, nbb: 10_000, nextIn: 75_000, left: 2, startedAgo: 120 * 60_000,
        tables: [mk(2, 2, 'preflop', 12_000)], busts: [[3, 3_000]], focus: 2 };
    default: // daily
      return { ...base, entrants: 8, level: 1, sb: 25, bb: 50, nsb: 50, nbb: 100, nextIn: 120_000, left: 8, startedAgo: 12 * 60_000, daily: true,
        tables: [mk(1, 8, 'flop', 340)], busts: [], focus: 1 };
  }
}

function cardsFor(seed, count) { const out = []; let x = seed * 7919 + 13; while (out.length < count) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; const c = (x >>> 8) % 52; if (!out.includes(c)) out.push(c); } return out; }

function buildTableState(sp, spT, now) {
  const maxSeats = 10;
  const cards = cardsFor(spT.n, 5 + 2 * spT.seated);
  const seats = [];
  const seatCount = spT.seated;
  const positions = seatCount <= 2 ? [0, 5] : Array.from({ length: seatCount }, (_, i) => Math.floor(i * maxSeats / seatCount));
  const streetActions = {};
  positions.forEach((pos, i) => {
    const gi = (spT.n * 10 + i) % NAMES.length;
    const stack = num(5000 * (0.35 + ((spT.n * 37 + i * 53) % 100) / 38) * (100 / Math.max(sp.left, 2)) ** 0.35);
    const folded = spT.phase && i % 4 === 2;
    const allIn = spT.allIn && (i === 1 || i === 4);
    seats.push({ position: pos, playerAddress: hex(spT.n * 100 + i + 1), displayName: NAMES[gi], stack: allIn ? 0 : stack, currentBet: allIn ? stack : (spT.phase && i === 3 ? 600 : 0),
      status: 'active', folded: Boolean(folded), isDealer: i === 0, isSmallBlind: i === 1, isBigBlind: i === 2, isActing: !spT.allIn && i === 5 % seatCount && Boolean(spT.phase) });
    if (allIn) streetActions[pos] = { action: 'all-in', amount: stack };
    else if (spT.phase && i === 3) streetActions[pos] = { action: 'raise', amount: 600 };
    else if (folded) streetActions[pos] = { action: 'fold', amount: 0 };
  });
  const ncomm = { flop: 3, turn: 4, river: 5, showdown: 5 }[spT.phase] ?? 0;
  const winners = spT.showdown ? [{ address: seats[0].playerAddress, amount: spT.pot, handName: 'Two Pair' }] : [];
  const showdownHands = {};
  if (spT.allIn) seats.filter((s) => s.stack === 0).forEach((s, k) => { showdownHands[s.playerAddress] = cardsFor(900 + k, 2); });
  return {
    tableId: `00000000-0000-4000-8000-${String(spT.n).padStart(12, '0')}`, smallBlind: sp.sb, bigBlind: sp.bb, maxSeats, handNumber: 40 + spT.n, seats,
    currentHand: spT.phase ? {
      handId: `h${spT.n}-${Math.floor(now / 30_000)}`, handNumber: 40 + spT.n, street: spT.phase, pot: spT.pot, communityCards: cards.slice(0, ncomm),
      actingPosition: seats.find((s) => s.isActing)?.position ?? null, turnStartedAt: new Date(now - 4000).toISOString(), streetActions, winners, showdownHands,
    } : null,
    myHoleCards: null,
    meta: { kind: 'tournament', actionSeconds: 15, seatsOpen: 0, cashTables: [{ tableId: 'c', smallBlind: 25, bigBlind: 50, seatsOpen: 4, maxSeats: 10 }],
      nextGame: { at: new Date(now + 3 * 3600_000).toISOString(), freeEntry: true, buyIn: '0', registrationOpen: false }, freeEntry: true,
      tournament: { name: sp.daily ? '#PulseChain Poker FreeRoll at 9pm EST' : 'The Morbius 100-Player Freeroll', status: 'active', freeEntry: true, entrants: sp.entrants, playersLeft: sp.left, prizePool: sp.daily ? 3500 : 500150,
        payouts: sp.daily ? [{ place: 1, percent: 60, amount: 2100 }, { place: 2, percent: 30, amount: 1050 }, { place: 3, percent: 10, amount: 350 }] : ladder(),
        lateRegMinutes: sp.lateEndsIn ? 45 : 0, startedAt: new Date(now - sp.startedAgo).toISOString(),
        blinds: { level: sp.level, smallBlind: sp.sb, bigBlind: sp.bb, nextLevelAt: new Date(now + sp.nextIn).toISOString(), nextSmallBlind: sp.nsb, nextBigBlind: sp.nbb } } },
    talk: [],
  };
}

function buildBroadcast(sp, now) {
  const payouts = sp.daily ? [{ place: 1, percent: 60, amount: 2100 }, { place: 2, percent: 30, amount: 1050 }, { place: 3, percent: 10, amount: 350 }] : ladder();
  const tables = sp.tables.map((t) => ({ tableId: `00000000-0000-4000-8000-${String(t.n).padStart(12, '0')}`, tableNumber: t.n, seated: t.seated, maxSeats: 10, pot: t.phase ? t.pot : 0,
    phase: t.phase, handNumber: t.phase ? 40 + t.n : null, allIn: Boolean(t.allIn), showdown: Boolean(t.showdown), biggestStack: 9000 + t.n * 700, isFinalTable: false }));
  const total = 500_000;
  const leaderboard = Array.from({ length: 10 }, (_, i) => {
    const stack = num((total / sp.left) * (4.2 - i * 0.33));
    const t = sp.tables[i % sp.tables.length];
    return { rank: i + 1, address: hex(7000 + i), name: NAMES[(i * 7 + 3) % NAMES.length], stack, tableNumber: t.n };
  }).filter((_, i) => i < Math.min(10, sp.left));
  const lateRegOpen = sp.lateEndsIn != null;
  const eliminations = sp.busts.map(([place, ageMs], i) => {
    const prize = payouts.find((p) => p.place === place)?.amount ?? null;
    const name = NAMES[(place * 5 + 11) % NAMES.length];
    return { address: hex(8000 + place), name, place, at: new Date(now - ageMs).toISOString(), prize, label: `${name} eliminated in ${ordinal(place)}${prize ? ` — wins ${prize.toLocaleString('en-US')}` : ''}` };
  });
  const paid = payouts.length;
  const flags = { bubble: sp.left === paid + 1 && !lateRegOpen, inTheMoney: !sp.daily && sp.left <= paid, finalTable: !sp.daily && sp.left <= 10, headsUp: sp.left === 2, finished: false };
  return {
    tournamentId: 'mock', generatedAt: new Date(now).toISOString(),
    tournament: { name: sp.daily ? '#PulseChain Poker FreeRoll at 9pm EST' : 'The Morbius 100-Player Freeroll', status: 'active', entrants: sp.entrants, playersLeft: sp.left, avgStack: num(total / sp.left),
      prizePool: sp.daily ? 3500 : 500150, payouts, paidPlaces: paid, lateReg: { open: lateRegOpen, endsAt: lateRegOpen ? new Date(now + sp.lateEndsIn).toISOString() : null },
      startedAt: new Date(now - sp.startedAgo).toISOString(),
      blinds: { level: sp.level, smallBlind: sp.sb, bigBlind: sp.bb, nextLevelAt: new Date(now + sp.nextIn).toISOString(), nextSmallBlind: sp.nsb, nextBigBlind: sp.nbb }, actionSeconds: 15 },
    tables, leaderboard, eliminations, winner: null, flags,
  };
}

const sessions = new Map(); // scenario -> { cur }

/** The /api/current body for a scenario (stateful per scenario so the picker's dwell/hold rules run for real). */
export function mockCurrent(scenario = 'early', now = Date.now()) {
  const name = SCENARIOS.includes(scenario) ? scenario : 'early';
  const sp = spec(name, now);
  let s = sessions.get(name);
  if (!s) {
    // start on the "boring" table 1 (or the focus table) long enough ago that dwell has expired -> exercises a real switch
    const first = sp.tables.find((t) => t.n === sp.focus) ?? sp.tables[0];
    s = { cur: { tournamentId: 'mock', slotKey: '2026-11-15 21:00 America/New_York', feature: { tableId: `00000000-0000-4000-8000-${String(first.n).padStart(12, '0')}`, since: now - 60_000, tableNumber: first.n, reason: 'initial', chip: null, switchedAt: null } } };
    sessions.set(name, s);
  }
  const bc = buildBroadcast(sp, now);
  s.cur.name = bc.tournament.name;
  applyBroadcast(s.cur, bc, now);
  const f = s.cur.feature;
  const spT = !f ? sp.tables[0] : sp.tables.find((t) => t.tableId === f.tableId || `00000000-0000-4000-8000-${String(t.n).padStart(12, '0')}` === f.tableId) ?? sp.tables[0];
  const st = buildTableState(sp, spT, now);
  return { ...st, ...currentExtras(s.cur, now) };
}
