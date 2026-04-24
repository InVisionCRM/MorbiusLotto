/**
 * Backfill poker_hand_players rows for existing completed hands.
 *
 * Reconstructs per-player denormalized stats from poker_hand_actions +
 * poker_hands.result. starting_stack / ending_stack / rake_paid cannot be
 * reconstructed for historical hands — those are left at 0. Everything else
 * (contributed, VPIP, PFR, 3-bet, per-street counts, fold street, won flag,
 * hand_name) is derived from the action log.
 *
 * Safe to re-run: uses ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   node server/scripts/backfill-poker-hand-players.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const STREETS = ['preflop', 'flop', 'turn', 'river'];
const zeroCounts = () => ({ bets: 0, raises: 0, calls: 0, checks: 0 });

async function backfillHand(client, hand) {
  const handId = hand.id;
  const buttonPos = Number(hand.button_position);

  const actionsRes = await client.query(
    `SELECT player_address, street, action, amount, "order"
       FROM poker_hand_actions
      WHERE hand_id = $1
      ORDER BY "order" ASC`,
    [handId]
  );
  const actions = actionsRes.rows;
  if (actions.length === 0) return 0;

  // Derive SB / BB positions from blind actions (preflop, action='blind', first two).
  // We don't know seat positions from actions alone, so fetch current seat map.
  // Note: if players left/re-seated, the derived seat_position may be stale.
  // That's acceptable for historical backfill.
  const seatsRes = await client.query(
    `SELECT position, player_address FROM poker_seats WHERE table_id = $1`,
    [hand.table_id]
  );
  const seatByAddr = new Map();
  for (const s of seatsRes.rows) {
    seatByAddr.set(String(s.player_address).toLowerCase(), Number(s.position));
  }

  // Blinds: first blind action = SB, second = BB
  const blindActions = actions.filter((a) => a.action === 'blind');
  const sbAddr = blindActions[0] ? String(blindActions[0].player_address).toLowerCase() : null;
  const bbAddr = blindActions[1] ? String(blindActions[1].player_address).toLowerCase() : null;

  // Collect set of players who participated in this hand.
  const players = new Set();
  for (const a of actions) players.add(String(a.player_address).toLowerCase());

  // Winners
  const winnersByAddr = new Map();
  const result = hand.result || {};
  const winners = Array.isArray(result.winners) ? result.winners : [];
  for (const w of winners) {
    if (w && w.address) {
      winnersByAddr.set(String(w.address).toLowerCase(), {
        amount: String(w.amount ?? '0'),
        handName: w.handName ?? null,
      });
      players.add(String(w.address).toLowerCase());
    }
  }

  const aggByAddr = new Map();
  for (const addr of players) {
    aggByAddr.set(addr, {
      contributed: 0n,
      folded: false,
      foldedStreet: null,
      saw: { preflop: true, flop: false, turn: false, river: false },
      counts: {
        preflop: zeroCounts(),
        flop: zeroCounts(),
        turn: zeroCounts(),
        river: zeroCounts(),
      },
      vpip: false,
      pfr: false,
      threeBet: false,
    });
  }

  let preflopRaiseCount = 0;
  for (const a of actions) {
    const addr = String(a.player_address).toLowerCase();
    const agg = aggByAddr.get(addr);
    if (!agg) continue;
    const street = a.street;
    const action = a.action;
    const amount = BigInt(a.amount ?? '0');

    agg.contributed += amount;

    if (action === 'fold') {
      agg.folded = true;
      agg.foldedStreet = street;
      continue;
    }
    if (action === 'blind') continue;

    if (street === 'preflop') {
      if (action === 'call' || action === 'bet' || action === 'raise') agg.vpip = true;
      if (action === 'raise' || action === 'bet') {
        agg.pfr = true;
        if (preflopRaiseCount >= 1) agg.threeBet = true;
        preflopRaiseCount += 1;
      }
    }

    const c = agg.counts[street];
    if (action === 'bet') c.bets += 1;
    else if (action === 'raise') c.raises += 1;
    else if (action === 'call') c.calls += 1;
    else if (action === 'check') c.checks += 1;
  }

  for (const agg of aggByAddr.values()) {
    for (let i = 0; i < STREETS.length; i++) {
      const s = STREETS[i];
      if (agg.folded && agg.foldedStreet && STREETS.indexOf(agg.foldedStreet) < i) {
        agg.saw[s] = false;
      } else {
        agg.saw[s] = true;
      }
    }
  }

  const nonFoldedCount = Array.from(aggByAddr.values()).filter((a) => !a.folded).length;
  const handWentToShowdown = nonFoldedCount >= 2;

  let inserted = 0;
  for (const addr of players) {
    const agg = aggByAddr.get(addr);
    const winnerMeta = winnersByAddr.get(addr);
    const won = !!winnerMeta && BigInt(winnerMeta.amount || '0') > 0n;
    const wonAmount = winnerMeta ? winnerMeta.amount : '0';
    const seatPos = seatByAddr.has(addr) ? seatByAddr.get(addr) : -1;
    const sawShowdown = !agg.folded && handWentToShowdown;
    const c = agg.counts;

    const res = await client.query(
      `INSERT INTO poker_hand_players (
         hand_id, player_address, seat_position,
         is_button, is_small_blind, is_big_blind,
         starting_stack, ending_stack, contributed, won_amount, rake_paid,
         saw_flop, saw_turn, saw_river, saw_showdown,
         folded, folded_street, won, hand_name,
         vpip, pfr, three_bet,
         preflop_bets, preflop_raises, preflop_calls, preflop_checks,
         flop_bets, flop_raises, flop_calls, flop_checks,
         turn_bets, turn_raises, turn_calls, turn_checks,
         river_bets, river_raises, river_calls, river_checks
       )
       VALUES (
         $1,$2,$3,
         $4,$5,$6,
         $7::NUMERIC,$8::NUMERIC,$9::NUMERIC,$10::NUMERIC,$11::NUMERIC,
         $12,$13,$14,$15,
         $16,$17,$18,$19,
         $20,$21,$22,
         $23,$24,$25,$26,
         $27,$28,$29,$30,
         $31,$32,$33,$34,
         $35,$36,$37,$38
       )
       ON CONFLICT (hand_id, player_address) DO NOTHING`,
      [
        handId,
        addr,
        seatPos,
        seatPos === buttonPos,
        sbAddr !== null && addr === sbAddr,
        bbAddr !== null && addr === bbAddr,
        '0',
        '0',
        agg.contributed.toString(),
        wonAmount,
        '0',
        agg.saw.flop, agg.saw.turn, agg.saw.river, sawShowdown,
        agg.folded, agg.foldedStreet, won, winnerMeta ? winnerMeta.handName : null,
        agg.vpip, agg.pfr, agg.threeBet,
        c.preflop.bets, c.preflop.raises, c.preflop.calls, c.preflop.checks,
        c.flop.bets, c.flop.raises, c.flop.calls, c.flop.checks,
        c.turn.bets, c.turn.raises, c.turn.calls, c.turn.checks,
        c.river.bets, c.river.raises, c.river.calls, c.river.checks,
      ]
    );
    inserted += res.rowCount || 0;
  }
  return inserted;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('Counting completed hands without poker_hand_players rows...');
    const countRes = await client.query(`
      SELECT COUNT(*)::INT AS n
      FROM poker_hands h
      WHERE h.completed_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM poker_hand_players p WHERE p.hand_id = h.id
        )
    `);
    const total = countRes.rows[0].n;
    console.log(`Found ${total} hands to backfill.`);
    if (total === 0) return;

    const batchSize = 500;
    let processed = 0;
    let inserted = 0;
    while (processed < total) {
      const batch = await client.query(
        `SELECT h.id, h.table_id, h.button_position, h.result
           FROM poker_hands h
          WHERE h.completed_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM poker_hand_players p WHERE p.hand_id = h.id
            )
          ORDER BY h.completed_at ASC
          LIMIT $1`,
        [batchSize]
      );
      if (batch.rows.length === 0) break;

      for (const hand of batch.rows) {
        try {
          const n = await backfillHand(client, hand);
          inserted += n;
        } catch (err) {
          console.error(`Hand ${hand.id} failed:`, err.message);
        }
        processed += 1;
      }
      console.log(`Progress: ${processed}/${total} hands, ${inserted} rows inserted`);
    }
    console.log(`Done. Backfilled ${inserted} rows across ${processed} hands.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
