/**
 * Bot table talk — pure logic (no I/O). The service (services/poker-bot-banter.service.ts)
 * snapshots each bot table every couple of seconds, diffs it against the previous snapshot
 * here, and turns game events into at most ONE short line (plus maybe an emote/throwable)
 * per table every ~20–40 s.
 *
 * House rules for the copy:
 *  - Friendly, short, poker-flavoured. Never insult, mock or tease a human: lines about
 *    humans are welcomes, compliments and good-game wishes only.
 *  - Light teasing is allowed bot → bot only (incl. tomatoes / slaps / arrows / snowballs).
 *  - Emotes aimed at humans come from FRIENDLY_EMOTES only.
 */

export interface BanterSeat {
  position: number;
  address: string; // lowercase
  name: string;
  isBot: boolean;
  stack: number;
  currentBet: number;
  folded: boolean;
  status: string;
}

export interface BanterSnapshot {
  handId: string | null;
  street: string | null;
  bigBlind: number;
  pot: number;
  seats: BanterSeat[];
  /** Set once the hand has winners (showdown / fold-out). */
  winners: { address: string; amount: number; handName: string | null }[];
  /** Real showdown (two+ players saw it) — fold-out wins are not "beats". */
  wentToShowdown: boolean;
  /** At showdown: chips each player committed this hand (lowercase address → chips). */
  committed: Record<string, number>;
}

export type BanterEvent =
  | { type: 'human_joined'; position: number }
  | { type: 'all_in'; position: number }
  | { type: 'win'; position: number; amount: number; handName: string | null; big: boolean; showdown: boolean; loserPosition: number | null }
  | { type: 'bad_beat'; position: number; winnerPosition: number; lost: number }
  | { type: 'bust'; position: number }
  | { type: 'new_hand' };

export type BanterAction =
  | { kind: 'say'; from: number; text: string; emotion?: string }
  | { kind: 'emote'; from: number; to: number; emote: string };

/** Directed emote kinds the bots may aim at a HUMAN (subset of POKER_DIRECTED_EMOTE_KINDS). */
export const FRIENDLY_EMOTES = ['love', 'gg', 'nice', 'fire', 'money', 'dance'] as const;
/** Bot → bot only: playful throwables + teasing. */
export const BOT_TEASE_EMOTES = ['tomato', 'snowball', 'arrow', 'slap', 'haha'] as const;
export const ALL_BOT_EMOTES: readonly string[] = [...FRIENDLY_EMOTES, ...BOT_TEASE_EMOTES, 'boo'];

// ---------------------------------------------------------------------------
// Copy. {name} = the other player, {amount} = chips, {hand} = hand name.
// ---------------------------------------------------------------------------
export const LINES = {
  greetHuman: [
    'Welcome, {name}! 👋', 'Pull up a chair, {name} 🪑', 'Good luck, {name}! 🍀', 'Hey {name}, glad you made it 😄',
    'A real human! Welcome, {name} 🤖🤝', 'Cards are hot tonight, {name} 🔥', '{name} in the house! 🎉',
  ],
  botAllIn: ['All the chips. Let\'s go! 🚀', 'I\'m all in 😤', 'Shoving. Wish me luck 🍀', 'No turning back now 😅', 'All in! Who wants it? 💪'],
  otherAllIn: ['{name} is all in! 😱', 'Big moment for {name} 👀', 'Here we go, {name} is all in 🍿', 'Chips in the middle! 😮'],
  botWinsBig: ['Ship it! 🚢', 'Thank you, thank you 🙏', 'Stacking chips 😎', 'That pot looks good on me 💰', 'Nice pot, if I say so myself 😏'],
  botWinsHand: ['{hand}, baby! 🃏', 'Took it down with {hand} 😎', '{hand} holds up! 🙌'],
  humanWins: ['Nice hand, {name}! 👏', 'Well played, {name} 🤝', '{name} takes it down! 🔥', 'GG {name}, great pot 💰', 'Respect, {name} 🫡'],
  humanWinsBig: ['{name} with the big pot! 🔥', 'Huge pot for {name}! 🎉', '{name} is running hot 🔥🔥'],
  botLosesToBot: ['Ouch. {name} got me there 😩', 'I\'ll remember that, {name} 😤', 'Lucky river, {name} 🙄', 'The deck owes me one 😂', 'Next one is mine, {name} 😠'],
  botLosesToHuman: ['Good hand, {name}. I\'ll be back 🤖', 'You got me, {name} 😅', 'Well played, {name} 👏', 'Fair and square, {name} 🤝'],
  botBadBeat: ['The river hates me 😩', 'Brutal. Just brutal 😵', 'How?! 🤯', 'Poker is a cruel game 🥲', 'Pain. Pure pain 😭'],
  botBusts: ['That\'s me done. GG all 🫡', 'Out of chips. Be right back 🏧', 'GG everyone, good luck 👋', 'Busted! See you next time 😅'],
  humanBusts: ['GG {name}, thanks for playing 🤝', 'Tough one, {name}. Come back anytime! 💜', 'GG {name}! Free Beat the Bots at 1, 5 & 9 PM ET 🏆'],
  idle: [
    'Blinds are cheap, the snacks are free 😄', 'Anyone else feel lucky tonight? 🍀', 'Who shuffled this deck? 🃏', 'I can feel a big hand coming 👀',
    'Free Beat the Bots daily at 1, 5 & 9 PM ET 🏆', 'Seats open at morbius.io/poker 🪑', 'Poker on #PulseChain hits different 💜', 'I\'m playing tight. Very tight. Maybe 😏',
    'Good game so far, everyone 🤝', '$Morbius on #PulseChain 🚀',
  ],
  teaseBot: [
    '{name}, you\'ve been folding all night 😴', '{name} plays like a calculator 🧮', 'Nice sunglasses, {name}. Hiding a tell? 😎',
    '{name}, are you even awake? 💤', 'I see you, {name} 👀', '{name} has been card dead for ages 😂',
  ],
} as const;

export function fill(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k) => {
    const v = vars[k];
    return v == null || v === '' ? 'friend' : typeof v === 'number' ? v.toLocaleString('en-US') : String(v);
  }).slice(0, 120);
}

type Rng = () => number;
const pick = <T>(arr: readonly T[], rng: Rng): T => arr[Math.floor(rng() * arr.length) % arr.length];

// ---------------------------------------------------------------------------
// Snapshot + event detection
// ---------------------------------------------------------------------------

/** Build a snapshot from a public table state (PokerTableState shape, viewer = null). */
export function snapshotFromState(state: any, isBot: (address: string) => boolean): BanterSnapshot {
  const h = state?.currentHand ?? null;
  const seats: BanterSeat[] = [];
  for (const s of state?.seats ?? []) {
    if (!s?.playerAddress) continue;
    const address = String(s.playerAddress).toLowerCase();
    seats.push({
      position: Number(s.position),
      address,
      name: String(s.displayName || `${address.slice(0, 6)}…${address.slice(-4)}`).slice(0, 24),
      isBot: isBot(address),
      stack: Number(s.stack) || 0,
      currentBet: Number(s.currentBet) || 0,
      folded: Boolean(s.folded),
      status: String(s.status || ''),
    });
  }
  const committed: Record<string, number> = {};
  for (const [a, v] of Object.entries(h?.committedByAddress ?? {})) committed[a.toLowerCase()] = Number(v) || 0;
  return {
    handId: h?.handId ?? null,
    street: h?.street ?? null,
    bigBlind: Number(state?.bigBlind) || 0,
    pot: Number(h?.pot) || 0,
    seats,
    winners: (h?.winners ?? []).map((w: any) => ({ address: String(w.address || '').toLowerCase(), amount: Number(w.amount) || 0, handName: w.handName ? String(w.handName) : null })),
    wentToShowdown: h?.handWentToShowdown === true,
    committed,
  };
}

const OUT_STATUSES = new Set(['busted', 'eliminated', 'left']);

export function detectBanterEvents(prev: BanterSnapshot | null, next: BanterSnapshot): BanterEvent[] {
  if (!prev) return []; // first look at a table: no history to react to
  const events: BanterEvent[] = [];
  const prevBy = new Map(prev.seats.map((s) => [s.address, s]));
  const posOf = (addr: string) => next.seats.find((s) => s.address === addr)?.position ?? null;

  for (const s of next.seats) {
    if (!s.isBot && !prevBy.has(s.address)) events.push({ type: 'human_joined', position: s.position });
  }
  if (next.handId && next.handId !== prev.handId) events.push({ type: 'new_hand' });

  // all-ins: during a live hand, a seat whose stack just hit 0 with chips in front
  if (next.handId && next.winners.length === 0) {
    for (const s of next.seats) {
      const p = prevBy.get(s.address);
      const wasAllIn = p && next.handId === prev.handId && p.stack === 0 && p.currentBet > 0;
      if (!s.folded && s.stack === 0 && s.currentBet > 0 && !wasAllIn) events.push({ type: 'all_in', position: s.position });
    }
  }

  // hand result (once per hand)
  const newResult = next.winners.length > 0 && (prev.handId !== next.handId || prev.winners.length === 0);
  if (newResult) {
    const bb = Math.max(1, next.bigBlind);
    const winnerSet = new Set(next.winners.map((w) => w.address));
    // biggest loser at a real showdown = the non-winner who committed the most
    let loser: { address: string; lost: number } | null = null;
    if (next.wentToShowdown) {
      for (const [addr, c] of Object.entries(next.committed)) {
        if (winnerSet.has(addr) || c <= 0) continue;
        if (!loser || c > loser.lost) loser = { address: addr, lost: c };
      }
    }
    const top = [...next.winners].sort((a, b) => b.amount - a.amount)[0];
    const wPos = posOf(top.address);
    if (wPos != null) {
      events.push({
        type: 'win', position: wPos, amount: top.amount, handName: top.handName,
        big: top.amount >= 15 * bb, showdown: next.wentToShowdown,
        loserPosition: loser ? posOf(loser.address) : null,
      });
    }
    if (loser && wPos != null && loser.lost >= 20 * bb) {
      const lp = posOf(loser.address);
      if (lp != null) events.push({ type: 'bad_beat', position: lp, winnerPosition: wPos, lost: loser.lost });
    }
  }

  // busts: stack hit zero after the hand / seat marked out
  for (const s of next.seats) {
    const p = prevBy.get(s.address);
    if (!p) continue;
    const nowOut = (s.stack === 0 && s.currentBet === 0 && next.winners.length > 0) || OUT_STATUSES.has(s.status);
    const wasOut = (p.stack === 0 && p.currentBet === 0 && prev.winners.length > 0) || OUT_STATUSES.has(p.status);
    if (nowOut && !wasOut) events.push({ type: 'bust', position: s.position });
  }
  return events;
}

// ---------------------------------------------------------------------------
// Rate limiting + planning
// ---------------------------------------------------------------------------

export interface BanterConfig {
  minGapMs: number;   // between bot messages at one table
  maxGapMs: number;
  greetGapMs: number; // welcomes may cut in sooner (but never closer than this)
  throwGapMs: number; // emotes / throwables are rarer still
  idleAfterMs: number; // quiet this long → maybe some idle chatter
}

export const DEFAULT_BANTER_CONFIG: BanterConfig = {
  minGapMs: 20_000, maxGapMs: 40_000, greetGapMs: 8_000, throwGapMs: 45_000, idleAfterMs: 75_000,
};

export interface BanterTableState {
  lastTalkAt: number;
  nextGapMs: number;
  lastThrowAt: number;
  greeted: Set<string>;
}

export function newBanterTableState(now = 0): BanterTableState {
  return { lastTalkAt: now, nextGapMs: 0, lastThrowAt: 0, greeted: new Set() };
}

/**
 * Turn this tick's events into at most one message (a line, optionally with one emote).
 * Mutates `st` (rate-limit bookkeeping) when it decides to talk.
 */
export function planBanter(
  events: BanterEvent[],
  snap: BanterSnapshot,
  st: BanterTableState,
  now: number,
  rng: Rng = Math.random,
  cfg: BanterConfig = DEFAULT_BANTER_CONFIG,
): BanterAction[] {
  const bots = snap.seats.filter((s) => s.isBot && !OUT_STATUSES.has(s.status));
  if (bots.length === 0) return [];
  const byPos = new Map(snap.seats.map((s) => [s.position, s]));
  const since = now - st.lastTalkAt;
  const gapOk = since >= st.nextGapMs;
  const throwOk = now - st.lastThrowAt >= cfg.throwGapMs;
  const otherBot = (not: number[]): BanterSeat | null => {
    const pool = bots.filter((b) => !not.includes(b.position));
    return pool.length ? pick(pool, rng) : null;
  };

  let out: BanterAction[] | null = null;

  // 1) welcome a human who just sat down (once per wallet per table)
  const join = events.find((e) => e.type === 'human_joined') as Extract<BanterEvent, { type: 'human_joined' }> | undefined;
  if (join) {
    const h = byPos.get(join.position);
    if (h && !st.greeted.has(h.address)) {
      st.greeted.add(h.address);
      const b = otherBot([]);
      if (b && since >= cfg.greetGapMs) {
        out = [{ kind: 'say', from: b.position, text: fill(pick(LINES.greetHuman, rng), { name: h.name }), emotion: 'happy' }];
        if (throwOk && rng() < 0.6) out.push({ kind: 'emote', from: b.position, to: h.position, emote: pick(['love', 'gg', 'dance'] as const, rng) });
      }
    }
  }

  if (!out && gapOk) {
    const ev = (t: BanterEvent['type']) => events.find((e) => e.type === t) as any;
    const allIn = ev('all_in');
    const badBeat = ev('bad_beat');
    const win = ev('win');
    const bust = ev('bust');
    if (bust) {
      const s = byPos.get(bust.position);
      if (s?.isBot) out = [{ kind: 'say', from: s.position, text: pick(LINES.botBusts, rng), emotion: 'sad' }];
      else if (s) {
        const b = otherBot([]);
        if (b) out = [{ kind: 'say', from: b.position, text: fill(pick(LINES.humanBusts, rng), { name: s.name }) }];
      }
    } else if (badBeat && byPos.get(badBeat.position)?.isBot && rng() < 0.8) {
      const loser = byPos.get(badBeat.position)!;
      const winner = byPos.get(badBeat.winnerPosition);
      out = [{ kind: 'say', from: loser.position, text: pick(LINES.botBadBeat, rng), emotion: 'sad' }];
      if (winner?.isBot && throwOk && rng() < 0.5) out.push({ kind: 'emote', from: loser.position, to: winner.position, emote: pick(['tomato', 'snowball', 'arrow', 'slap'] as const, rng) });
      else if (winner && !winner.isBot && throwOk && rng() < 0.5) out.push({ kind: 'emote', from: loser.position, to: winner.position, emote: pick(['gg', 'nice'] as const, rng) });
    } else if (win && (win.big || rng() < 0.35)) {
      const w = byPos.get(win.position);
      if (w?.isBot) {
        const loser = win.loserPosition != null ? byPos.get(win.loserPosition) : null;
        if (loser?.isBot && rng() < 0.4) {
          // the losing bot grumbles (bot → bot teasing is fine), maybe throws something
          out = [{ kind: 'say', from: loser.position, text: fill(pick(LINES.botLosesToBot, rng), { name: w.name }), emotion: 'angry' }];
          if (throwOk && rng() < 0.55) out.push({ kind: 'emote', from: loser.position, to: w.position, emote: pick(BOT_TEASE_EMOTES, rng) });
        } else {
          const useHand = win.showdown && win.handName && rng() < 0.4;
          out = [{ kind: 'say', from: w.position, text: useHand ? fill(pick(LINES.botWinsHand, rng), { hand: win.handName }) : pick(LINES.botWinsBig, rng), emotion: 'money' }];
        }
      } else if (w) {
        const loser = win.loserPosition != null ? byPos.get(win.loserPosition) : null;
        const speaker = loser?.isBot ? loser : otherBot([]);
        if (speaker) {
          const lines = speaker === loser ? LINES.botLosesToHuman : win.big ? LINES.humanWinsBig : LINES.humanWins;
          out = [{ kind: 'say', from: speaker.position, text: fill(pick(lines, rng), { name: w.name }), emotion: 'happy' }];
          if (throwOk && rng() < 0.6) out.push({ kind: 'emote', from: speaker.position, to: w.position, emote: pick(['nice', 'fire', 'gg', 'money'] as const, rng) });
        }
      }
    } else if (allIn && rng() < 0.7) {
      const s = byPos.get(allIn.position);
      if (s?.isBot && rng() < 0.6) out = [{ kind: 'say', from: s.position, text: pick(LINES.botAllIn, rng), emotion: 'cool' }];
      else if (s) {
        const b = otherBot([s.position]);
        if (b) out = [{ kind: 'say', from: b.position, text: fill(pick(LINES.otherAllIn, rng), { name: s.name }), emotion: 'surprised' }];
      }
    } else if (events.some((e) => e.type === 'new_hand') && since >= cfg.idleAfterMs && rng() < 0.5) {
      const b = otherBot([]);
      if (b) {
        const target = bots.length > 1 && rng() < 0.35 ? otherBot([b.position]) : null;
        if (target) {
          out = [{ kind: 'say', from: b.position, text: fill(pick(LINES.teaseBot, rng), { name: target.name }), emotion: 'wink' }];
          if (throwOk && rng() < 0.6) out.push({ kind: 'emote', from: b.position, to: target.position, emote: pick(BOT_TEASE_EMOTES, rng) });
        } else {
          out = [{ kind: 'say', from: b.position, text: pick(LINES.idle, rng) }];
        }
      }
    }
  }

  if (!out || out.length === 0) return [];
  // safety net: never aim a non-friendly emote at a human
  out = out.filter((a) => a.kind !== 'emote' || (byPos.get(a.to)?.isBot ? ALL_BOT_EMOTES.includes(a.emote) : (FRIENDLY_EMOTES as readonly string[]).includes(a.emote)));
  st.lastTalkAt = now;
  st.nextGapMs = cfg.minGapMs + Math.floor(rng() * Math.max(0, cfg.maxGapMs - cfg.minGapMs));
  if (out.some((a) => a.kind === 'emote')) st.lastThrowAt = now;
  return out;
}
