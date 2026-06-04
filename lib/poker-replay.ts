/**
 * Poker hand replay reconstruction.
 *
 * A hand is a list of actions; the UI state at any playhead (board / pot / last action)
 * is DERIVED by walking the log — no stored snapshots. Past hands come from the public
 * provably-fair verify endpoint (`GET /api/poker/verify/:handId`), which exposes every
 * dealt-in player's hole cards, the board, the full action log, and the winners — so the
 * replay can show ALL showdown reveals + the winner, exactly like `public/poker-mobile-lab.html`.
 *
 * Card encoding (matches the verify endpoint + CardDisplay): 0–51, rank = idx % 13
 * (0=2 … 12=A), suit = floor(idx / 13) (0=♣, 1=♦, 2=♥, 3=♠).
 */

export type ReplayStep =
  | { kind: 'action'; street: string; name: string; action: string; amount: string; you?: boolean }
  | { kind: 'deal'; street: string; cards: number[] }
  | { kind: 'show'; name: string; cards: number[]; handName?: string; winner?: boolean }
  | { kind: 'result'; name: string; amount: string; handName?: string };

/** Shape returned by `GET /api/poker/verify/:handId` (subset we use). */
export interface VerifyHand {
  handId: string;
  handNumber: number;
  communityCards: number[];
  players: { address: string; seatPosition: number | null; holeCards: number[] }[];
  actions: { order: number; street: string; address: string; action: string; amount: string }[];
  result: { winners: { address: string; amount: string; handName?: string }[] } | null;
}

/** A hand summary for the picker (newest first). */
export interface ReplayHandSummary {
  handId: string;
  handNumber: number;
  /** e.g. "BluffKing wins 2,550" or "Uncontested". */
  label: string;
}

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['♣', '♦', '♥', '♠'];

export function cardFace(idx: number): { rank: string; suit: string; red: boolean } {
  const suit = Math.floor(idx / 13);
  return { rank: RANKS[idx % 13] ?? '?', suit: SUITS[suit] ?? '?', red: suit === 1 || suit === 2 };
}

export function streetTag(s?: string): string {
  const k = (s || 'preflop').toLowerCase();
  if (k === 'preflop' || k === 'pre') return 'PRE';
  if (k === 'showdown' || k === 'show') return 'SHOW';
  return k.toUpperCase();
}

/** Build a hand-summary label from a result payload. */
export function resultLabel(
  result: { winners: { address: string; amount: string; handName?: string }[] } | null,
  nameFor: (addr: string) => string,
): string {
  const w = result?.winners?.[0];
  if (!w) return 'Hand complete';
  const amt = w.amount && w.amount !== '0' ? ` wins ${Number(w.amount).toLocaleString()}` : ' wins';
  return `${nameFor(w.address)}${amt}`;
}

/** Live (in-progress) hand → action-only steps from the table's `recentActions`. No showdown yet. */
export function buildLiveSteps(
  actions: { position: number; action: string; amount: string; street?: string }[],
  nameForSeat: (position: number) => string,
): ReplayStep[] {
  return (actions ?? []).map((a) => ({
    kind: 'action' as const,
    street: a.street ?? 'preflop',
    name: nameForSeat(a.position),
    action: a.action,
    amount: a.amount,
  }));
}

const lc = (s: string) => (s || '').toLowerCase();

/** Completed hand (verify payload) → full step list incl. board deals, showdown reveals, winner. */
export function buildReplaySteps(
  hand: VerifyHand,
  nameFor: (addr: string) => string,
  youAddr?: string | null,
): ReplayStep[] {
  const steps: ReplayStep[] = [];
  const board = hand.communityCards ?? [];
  const dealForStreet: Record<string, number[]> = {
    flop: board.slice(0, 3),
    turn: board.slice(3, 4),
    river: board.slice(4, 5),
  };
  const ordered = (hand.actions ?? []).slice().sort((a, b) => a.order - b.order);
  let curStreet = '';
  for (const a of ordered) {
    if (a.street !== curStreet) {
      const dealt = dealForStreet[a.street];
      if (dealt && dealt.length) steps.push({ kind: 'deal', street: a.street, cards: dealt });
      curStreet = a.street;
    }
    steps.push({
      kind: 'action',
      street: a.street,
      name: nameFor(a.address),
      action: a.action,
      amount: a.amount,
      you: youAddr ? lc(a.address) === lc(youAddr) : false,
    });
  }
  // Ensure the whole board is shown (e.g. an all-in runout where streets had no actions).
  for (const st of ['flop', 'turn', 'river'] as const) {
    if (dealForStreet[st]?.length && !steps.some((s) => s.kind === 'deal' && s.street === st)) {
      steps.push({ kind: 'deal', street: st, cards: dealForStreet[st] });
    }
  }

  const folded = new Set(hand.actions.filter((a) => /fold/i.test(a.action)).map((a) => lc(a.address)));
  const winners = hand.result?.winners ?? [];
  const winnerAddrs = new Set(winners.map((w) => lc(w.address)));
  const handNameBy: Record<string, string> = {};
  winners.forEach((w) => { if (w.handName) handNameBy[lc(w.address)] = w.handName; });

  // Showdown: every non-folded player with revealed hole cards (only when contested).
  const contested = hand.players.filter((p) => (p.holeCards?.length ?? 0) >= 2 && !folded.has(lc(p.address)));
  if (contested.length > 1) {
    for (const p of contested) {
      steps.push({
        kind: 'show',
        name: nameFor(p.address),
        cards: p.holeCards.slice(0, 2),
        handName: handNameBy[lc(p.address)],
        winner: winnerAddrs.has(lc(p.address)),
      });
    }
  }
  for (const w of winners) {
    steps.push({ kind: 'result', name: nameFor(w.address), amount: w.amount, handName: w.handName });
  }
  return steps;
}

/**
 * Derive the schematic mini-table state at a playhead: who's still in, who folded, the board,
 * the pot, the current actor, the winner, and any revealed hole cards. Seats are identified by
 * display name (stable across the hand) so the UI can keep persistent elements that glide.
 */
export function deriveMini(steps: ReplayStep[], pos: number): {
  participants: string[];
  folded: Set<string>;
  winners: Set<string>;
  shown: Record<string, number[]>;
  board: number[];
  pot: number;
  actingName: string | null;
} {
  const participants: string[] = [];
  for (const s of steps) {
    if ((s.kind === 'action' || s.kind === 'show') && !participants.includes(s.name)) participants.push(s.name);
  }
  const folded = new Set<string>();
  const winners = new Set<string>();
  const shown: Record<string, number[]> = {};
  let board: number[] = [];
  let pot = 0;
  let actingName: string | null = null;
  for (let i = 0; i <= pos && i < steps.length; i++) {
    const s = steps[i];
    if (s.kind === 'deal') { board = board.concat(s.cards); actingName = null; }
    else if (s.kind === 'action') {
      const amt = Number(s.amount || '0');
      if (Number.isFinite(amt) && amt > 0) pot += amt;
      actingName = s.name;
      if (/fold/i.test(s.action)) folded.add(s.name);
    } else if (s.kind === 'show') { shown[s.name] = s.cards; actingName = null; }
    else if (s.kind === 'result') { winners.add(s.name); actingName = null; }
  }
  return { participants, folded, winners, shown, board, pot, actingName };
}

/** Derive board / running pot / last step / street at a playhead by walking the steps. */
export function replayStateAt(steps: ReplayStep[], pos: number): { board: number[]; pot: number; last: ReplayStep | null; street: string } {
  let pot = 0;
  let board: number[] = [];
  let last: ReplayStep | null = null;
  let street = 'preflop';
  for (let i = 0; i <= pos && i < steps.length; i++) {
    const s = steps[i];
    if (s.kind === 'deal') { board = board.concat(s.cards); street = s.street; }
    else if (s.kind === 'action') { const amt = Number(s.amount || '0'); if (Number.isFinite(amt) && amt > 0) pot += amt; street = s.street; }
    else if (s.kind === 'show' || s.kind === 'result') { street = 'showdown'; }
    last = s;
  }
  return { board, pot, last, street };
}
