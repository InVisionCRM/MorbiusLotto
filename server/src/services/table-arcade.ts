/**
 * Table Arcade — shared real-time mini-game engine (pure logic + in-memory registry).
 *
 * Four bragging-rights party games the whole table plays between hands: Tug-of-War,
 * Quick Draw, Mash Sprint, Hot Potato. Just-for-fun, never for stakes; fully
 * ephemeral (nothing here is persisted — see TABLE_ARCADE_PLAN.md).
 *
 * Like `poker-rps.ts`, this module is deliberately free of timers and sockets: the
 * WebSocket handlers own all setInterval/setTimeout scheduling and broadcasting and
 * call into these pure transitions (`applyInput` / `tick`). That keeps the rules
 * unit-testable without booting the server. The SERVER is always the judge —
 * clients only ever send a `tap` intent; positions/scores are computed here.
 */

export type ArcadeGameType = 'tug' | 'quickdraw' | 'sprint' | 'potato';
export type ArcadeStatus = 'pending' | 'countdown' | 'active' | 'ended';
export type ArcadeMode = 'duel' | 'table';
export type ArcadeTeam = 'left' | 'right';

export interface ArcadePlayer {
  /** Lowercase 0x address. */
  address: string;
  seatIndex: number;
  /** Tug-of-War only: which side this player pulls for. */
  team?: ArcadeTeam;
}

// ---- per-game state (discriminated by `kind`) --------------------------------

export interface TugState {
  kind: 'tug';
  /** Rope marker in [-100, 100]; 0 = center. Left wins at -100, right at +100. */
  rope: number;
}
export interface QuickDrawState {
  kind: 'quickdraw';
  phase: 'arming' | 'go';
  /** When the GO signal fires (ms epoch). Not serialized while arming. */
  goAt: number;
  /** Seats that jumped the gun (tapped before GO) — disqualified. */
  dq: number[];
  /** Winner's reaction time in ms (set when the round resolves). */
  reactionMs: number | null;
}
export interface SprintState {
  kind: 'sprint';
  /** seatIndex -> progress in [0, 100]. */
  progress: Record<number, number>;
}
export interface PotatoState {
  kind: 'potato';
  holderSeat: number;
  /** Hidden fuse expiry (ms epoch) — never serialized to clients. */
  fuseEndsAt: number;
  /** Seats still in, in pass order. */
  alive: number[];
  /** Full seat order for next-holder rotation. */
  order: number[];
  lastPassAt: number;
  /** Seat eliminated on the most recent blow (for a client flash). */
  lastEliminated: number | null;
}
export type ArcadeGameState = TugState | QuickDrawState | SprintState | PotatoState;

export interface ArcadeMatch {
  id: string;
  tableId: string;
  gameType: ArcadeGameType;
  mode: ArcadeMode;
  players: ArcadePlayer[];
  status: ArcadeStatus;
  game: ArcadeGameState;
  /** countdown → active boundary (ms epoch). */
  countdownEndsAt: number;
  /** hard time cap for the active phase (ms epoch). */
  maxEndsAt: number;
  /** Buffered taps since the last tick, per seatIndex (drained each tick). */
  taps: Record<number, number>;
  winnerSeatIndex: number | null;
  winnerTeam: ArcadeTeam | null;
  endedReason: string | null;
}

export interface ArcadeCreateInput {
  id: string;
  tableId: string;
  gameType: ArcadeGameType;
  mode: ArcadeMode;
  players: { address: string; seatIndex: number; team?: ArcadeTeam }[];
}

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };
export type ArcadeResult<T> = Ok<T> | Err;

export interface TickOutcome {
  /** Visible state changed — caller should re-broadcast. */
  changed: boolean;
  /** countdown → active flipped this tick. */
  activated: boolean;
  /** Match resolved this tick. */
  ended: boolean;
}

// ---- tunables ----------------------------------------------------------------

export const ARCADE_COUNTDOWN_MS = 3000;
const MAX_TAPS_PER_TICK = 4; // ~40 taps/s ceiling — autoclickers gain nothing past this
const TUG_PULL = 1.4; // rope units per applied tap
const TUG_WIN = 100;
const TUG_MAX_MS = 20000;
const SPRINT_STEP = 2.2; // progress per applied tap
const SPRINT_MAX_MS = 25000;
const QUICKDRAW_ARM_MIN_MS = 1500;
const QUICKDRAW_ARM_MAX_MS = 4000;
const QUICKDRAW_WINDOW_MS = 6000; // after GO, give up if nobody taps
const POTATO_PASS_COOLDOWN_MS = 220;
const POTATO_FUSE_MIN_MS = 3500;
const POTATO_FUSE_MAX_MS = 8000;
const POTATO_SAFETY_MS = 180000;

const lower = (a: string): string => a.toLowerCase();
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const randMs = (lo: number, hi: number): number => lo + Math.floor(Math.random() * (hi - lo + 1));

/** Min players to run a given game. */
function minPlayers(_gameType: ArcadeGameType): number {
  return 2;
}

function initialGameState(gameType: ArcadeGameType, players: ArcadePlayer[]): ArcadeGameState {
  switch (gameType) {
    case 'tug':
      return { kind: 'tug', rope: 0 };
    case 'quickdraw':
      return { kind: 'quickdraw', phase: 'arming', goAt: 0, dq: [], reactionMs: null };
    case 'sprint': {
      const progress: Record<number, number> = {};
      for (const p of players) progress[p.seatIndex] = 0;
      return { kind: 'sprint', progress };
    }
    case 'potato': {
      const order = players.map((p) => p.seatIndex);
      return { kind: 'potato', holderSeat: order[0], fuseEndsAt: 0, alive: [...order], order, lastPassAt: 0, lastEliminated: null };
    }
  }
}

/** Next seat after `current` in `order` that is still in `alive` (cyclic). */
function nextAlive(order: number[], alive: number[], current: number): number {
  if (alive.length === 0) return current;
  const aliveSet = new Set(alive);
  let idx = order.indexOf(current);
  if (idx < 0) idx = 0;
  for (let i = 1; i <= order.length; i++) {
    const cand = order[(idx + i) % order.length];
    if (aliveSet.has(cand)) return cand;
  }
  return current;
}

/**
 * In-memory registry of live arcade matches. One match per player address (a player
 * in a match can't be pulled into another). No timers here — the caller schedules
 * the countdown + tick loop and invokes these transitions.
 */
export class ArcadeRegistry {
  private matches = new Map<string, ArcadeMatch>();
  /** address (lowercase) -> matchId, for one-match-per-player. */
  private matchByAddr = new Map<string, string>();

  get(matchId: string): ArcadeMatch | undefined {
    return this.matches.get(matchId);
  }
  getMatchIdByAddress(address: string): string | undefined {
    return this.matchByAddr.get(lower(address));
  }
  hasActiveForAddress(address: string): boolean {
    return this.matchByAddr.has(lower(address));
  }

  /** Register a new PENDING match. Fails if any player is already in a match. */
  create(input: ArcadeCreateInput): ArcadeResult<{ match: ArcadeMatch }> {
    // A duel is exactly two; a table lobby may open with just the host and fill via addPlayer.
    const need = input.mode === 'duel' ? 2 : 1;
    if (input.players.length < need) return { ok: false, error: 'not_enough_players' };
    if (input.mode === 'duel' && input.players.length !== 2) return { ok: false, error: 'duel_needs_two' };
    const players: ArcadePlayer[] = input.players.map((p) => ({
      address: lower(p.address),
      seatIndex: p.seatIndex,
      team: p.team,
    }));
    const seen = new Set<string>();
    for (const p of players) {
      if (seen.has(p.address)) return { ok: false, error: 'duplicate_player' };
      seen.add(p.address);
      if (this.matchByAddr.has(p.address)) return { ok: false, error: 'busy' };
    }
    const match: ArcadeMatch = {
      id: input.id,
      tableId: input.tableId,
      gameType: input.gameType,
      mode: input.mode,
      players,
      status: 'pending',
      game: initialGameState(input.gameType, players),
      countdownEndsAt: 0,
      maxEndsAt: 0,
      taps: {},
      winnerSeatIndex: null,
      winnerTeam: null,
      endedReason: null,
    };
    this.matches.set(match.id, match);
    for (const p of players) this.matchByAddr.set(p.address, match.id);
    return { ok: true, match };
  }

  /** Add a late joiner to a still-pending table-lobby match. */
  addPlayer(matchId: string, address: string, seatIndex: number): ArcadeResult<{ match: ArcadeMatch }> {
    const match = this.matches.get(matchId);
    if (!match) return { ok: false, error: 'no_match' };
    if (match.status !== 'pending') return { ok: false, error: 'not_pending' };
    if (match.mode !== 'table') return { ok: false, error: 'not_lobby' };
    const addr = lower(address);
    if (this.matchByAddr.has(addr)) return { ok: false, error: 'busy' };
    if (match.players.some((p) => p.seatIndex === seatIndex)) return { ok: false, error: 'seat_taken' };
    match.players.push({ address: addr, seatIndex });
    if (match.game.kind === 'sprint') match.game.progress[seatIndex] = 0;
    if (match.game.kind === 'potato') {
      match.game.order.push(seatIndex);
      match.game.alive.push(seatIndex);
    }
    this.matchByAddr.set(addr, match.id);
    return { ok: true, match };
  }

  /** Move a pending match into its 3·2·1 countdown. */
  beginCountdown(matchId: string, now: number, countdownMs = ARCADE_COUNTDOWN_MS): ArcadeMatch | null {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'pending') return null;
    if (match.players.length < minPlayers(match.gameType)) return null;
    match.status = 'countdown';
    match.countdownEndsAt = now + countdownMs;
    return match;
  }

  /** Buffer / apply a player's tap. Mash games buffer (applied on tick); Quick Draw
   *  and Hot Potato resolve immediately (reaction / pass are instantaneous). */
  applyInput(matchId: string, address: string, now: number): ArcadeResult<{ match: ArcadeMatch; ended: boolean; changed: boolean }> {
    const match = this.matches.get(matchId);
    if (!match) return { ok: false, error: 'no_match' };
    if (match.status !== 'active') return { ok: false, error: 'not_active' };
    const addr = lower(address);
    const player = match.players.find((p) => p.address === addr);
    if (!player) return { ok: false, error: 'not_in_match' };
    const seat = player.seatIndex;
    const g = match.game;

    if (g.kind === 'tug' || g.kind === 'sprint') {
      match.taps[seat] = (match.taps[seat] ?? 0) + 1;
      return { ok: true, match, ended: false, changed: false };
    }
    if (g.kind === 'quickdraw') {
      if (match.winnerSeatIndex != null) return { ok: true, match, ended: false, changed: false };
      if (g.phase === 'arming') {
        if (!g.dq.includes(seat)) g.dq.push(seat);
        return { ok: true, match, ended: false, changed: true };
      }
      // phase 'go' — first valid (non-dq) tap wins.
      if (g.dq.includes(seat)) return { ok: true, match, ended: false, changed: false };
      g.reactionMs = Math.max(0, now - g.goAt);
      this.finish(match, seat, null, 'win');
      return { ok: true, match, ended: true, changed: true };
    }
    // potato — only the current holder can pass, with a small cooldown.
    if (g.holderSeat !== seat) return { ok: true, match, ended: false, changed: false };
    if (now - g.lastPassAt < POTATO_PASS_COOLDOWN_MS) return { ok: true, match, ended: false, changed: false };
    g.holderSeat = nextAlive(g.order, g.alive, seat);
    g.lastPassAt = now;
    return { ok: true, match, ended: false, changed: true };
  }

  /**
   * Advance time. Flips countdown→active, applies buffered mash taps with the rate
   * cap, fires Quick Draw's GO, blows the Hot Potato fuse, and resolves winners.
   */
  tick(matchId: string, now: number): ArcadeResult<{ match: ArcadeMatch } & TickOutcome> {
    const match = this.matches.get(matchId);
    if (!match) return { ok: false, error: 'no_match' };
    let changed = false;
    let activated = false;

    if (match.status === 'countdown') {
      if (now < match.countdownEndsAt) return { ok: true, match, changed: false, activated: false, ended: false };
      this.activate(match, now);
      activated = true;
      changed = true;
    }
    if (match.status !== 'active') {
      return { ok: true, match, changed, activated, ended: false };
    }

    const g = match.game;
    switch (g.kind) {
      case 'tug': {
        for (const p of match.players) {
          const t = Math.min(match.taps[p.seatIndex] ?? 0, MAX_TAPS_PER_TICK);
          if (t > 0) {
            g.rope = clamp(g.rope + (p.team === 'right' ? 1 : -1) * TUG_PULL * t, -TUG_WIN, TUG_WIN);
            changed = true;
          }
        }
        match.taps = {};
        if (g.rope <= -TUG_WIN) { this.finishTeam(match, 'left'); return done(match, changed); }
        if (g.rope >= TUG_WIN) { this.finishTeam(match, 'right'); return done(match, changed); }
        if (now >= match.maxEndsAt) {
          const side: ArcadeTeam | null = g.rope < 0 ? 'left' : g.rope > 0 ? 'right' : null;
          if (side) this.finishTeam(match, side, 'timeout');
          else this.finish(match, null, null, 'draw');
          return done(match, true);
        }
        break;
      }
      case 'sprint': {
        let best = -1;
        let bestSeat: number | null = null;
        for (const p of match.players) {
          const t = Math.min(match.taps[p.seatIndex] ?? 0, MAX_TAPS_PER_TICK);
          if (t > 0) {
            g.progress[p.seatIndex] = clamp((g.progress[p.seatIndex] ?? 0) + SPRINT_STEP * t, 0, 100);
            changed = true;
          }
          const prog = g.progress[p.seatIndex] ?? 0;
          if (prog > best) { best = prog; bestSeat = p.seatIndex; }
        }
        match.taps = {};
        if (best >= 100 && bestSeat != null) { this.finish(match, bestSeat, null, 'win'); return done(match, true); }
        if (now >= match.maxEndsAt && bestSeat != null) { this.finish(match, bestSeat, null, 'timeout'); return done(match, true); }
        break;
      }
      case 'quickdraw': {
        if (g.phase === 'arming' && now >= g.goAt) { g.phase = 'go'; changed = true; }
        if (g.phase === 'go' && match.winnerSeatIndex == null && now >= g.goAt + QUICKDRAW_WINDOW_MS) {
          this.finish(match, null, null, 'nobody'); return done(match, true);
        }
        break;
      }
      case 'potato': {
        if (now >= g.fuseEndsAt) {
          const blown = g.holderSeat;
          g.alive = g.alive.filter((s) => s !== blown);
          g.lastEliminated = blown;
          changed = true;
          if (g.alive.length <= 1) {
            this.finish(match, g.alive[0] ?? null, null, 'last_standing');
            return done(match, true);
          }
          g.holderSeat = nextAlive(g.order, g.alive, blown);
          g.fuseEndsAt = now + randMs(POTATO_FUSE_MIN_MS, POTATO_FUSE_MAX_MS);
        }
        if (now >= match.maxEndsAt) { this.finish(match, g.alive[0] ?? null, null, 'timeout'); return done(match, true); }
        break;
      }
    }
    return { ok: true, match, changed, activated, ended: false };
  }

  private activate(match: ArcadeMatch, now: number): void {
    match.status = 'active';
    const g = match.game;
    switch (g.kind) {
      case 'tug': match.maxEndsAt = now + TUG_MAX_MS; break;
      case 'sprint': match.maxEndsAt = now + SPRINT_MAX_MS; break;
      case 'quickdraw':
        g.goAt = now + randMs(QUICKDRAW_ARM_MIN_MS, QUICKDRAW_ARM_MAX_MS);
        match.maxEndsAt = g.goAt + QUICKDRAW_WINDOW_MS;
        break;
      case 'potato':
        g.holderSeat = g.order[0];
        g.alive = [...g.order];
        g.fuseEndsAt = now + randMs(POTATO_FUSE_MIN_MS, POTATO_FUSE_MAX_MS);
        g.lastPassAt = now;
        match.maxEndsAt = now + POTATO_SAFETY_MS;
        break;
    }
  }

  private finish(match: ArcadeMatch, winnerSeatIndex: number | null, winnerTeam: ArcadeTeam | null, reason: string): void {
    match.status = 'ended';
    match.winnerSeatIndex = winnerSeatIndex;
    match.winnerTeam = winnerTeam;
    match.endedReason = reason;
  }

  /** Resolve a tug winner by team; in a 1v1 duel also surface the winning seat. */
  private finishTeam(match: ArcadeMatch, team: ArcadeTeam, reason = 'win'): void {
    let seat: number | null = null;
    if (match.mode === 'duel') seat = match.players.find((p) => p.team === team)?.seatIndex ?? null;
    this.finish(match, seat, team, reason);
  }

  /** End + forget a match by id. Returns the removed match (for peer notify). */
  leave(matchId: string): ArcadeMatch | null {
    const match = this.matches.get(matchId);
    if (!match) return null;
    this.remove(matchId);
    if (match.status !== 'ended') {
      match.status = 'ended';
      match.endedReason = match.endedReason ?? 'left';
    }
    return match;
  }

  /** End whatever match an address is in (disconnect / stand up / hand start). */
  leaveByAddress(address: string): ArcadeMatch | null {
    const matchId = this.matchByAddr.get(lower(address));
    if (!matchId) return null;
    return this.leave(matchId);
  }

  private remove(matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    this.matches.delete(matchId);
    for (const p of match.players) this.matchByAddr.delete(p.address);
  }

  /**
   * Client-facing snapshot for an `arcade_state` / `arcade_ended` broadcast. Hides
   * secrets (Quick Draw's goAt while arming, the Hot Potato fuse length).
   */
  serialize(match: ArcadeMatch): Record<string, unknown> {
    const base = {
      matchId: match.id,
      gameType: match.gameType,
      mode: match.mode,
      status: match.status,
      players: match.players.map((p) => ({ seatIndex: p.seatIndex, team: p.team ?? null })),
      winnerSeatIndex: match.winnerSeatIndex,
      winnerTeam: match.winnerTeam,
      endedReason: match.endedReason,
    };
    const g = match.game;
    switch (g.kind) {
      case 'tug':
        return { ...base, rope: Math.round(g.rope * 10) / 10 };
      case 'quickdraw':
        return { ...base, phase: g.phase, dq: g.dq, reactionMs: g.reactionMs };
      case 'sprint':
        return { ...base, progress: g.progress };
      case 'potato':
        return { ...base, holderSeat: g.holderSeat, alive: g.alive, lastEliminated: g.lastEliminated };
    }
  }
}

function done(match: ArcadeMatch, changed: boolean): ArcadeResult<{ match: ArcadeMatch } & TickOutcome> {
  return { ok: true, match, changed, activated: false, ended: match.status === 'ended' };
}
