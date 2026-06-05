/**
 * Rock-Paper-Scissors table mini-game — pure resolver + in-memory match registry.
 *
 * Deliberately free of timers, sockets, and DB: the WebSocket handlers in
 * `websocket.service.impl.js` own the setTimeout scheduling and broadcasting and
 * call into this module for the deterministic state transitions. That keeps the
 * resolver and the state machine unit-testable without booting the server.
 *
 * Just-for-fun, never for stakes — the scoreboard is bragging rights only.
 * Fully ephemeral: nothing here is persisted (see RPS_MINIGAME_PLAN.md).
 */

export type RpsChoice = 'rock' | 'paper' | 'scissors';

export const RPS_CHOICES: readonly RpsChoice[] = ['rock', 'paper', 'scissors'];

export function isRpsChoice(x: unknown): x is RpsChoice {
  return typeof x === 'string' && (RPS_CHOICES as readonly string[]).includes(x);
}

/** What beats what. rock>scissors, scissors>paper, paper>rock. */
const BEATS: Record<RpsChoice, RpsChoice> = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock',
};

/**
 * Pure resolver. Returns 'a' if a beats b, 'b' if b beats a, null on a draw.
 */
export function resolveRps(a: RpsChoice, b: RpsChoice): 'a' | 'b' | null {
  if (a === b) return null;
  return BEATS[a] === b ? 'a' : 'b';
}

export type RpsStatus = 'pending' | 'active' | 'ended';

export interface RpsPlayerState {
  /** Lowercase 0x address. */
  address: string;
  seatIndex: number;
  pick: RpsChoice | null;
}

export interface RpsMatch {
  id: string;
  tableId: string;
  /** Challenger. */
  a: RpsPlayerState;
  /** Challenged. */
  b: RpsPlayerState;
  scoreA: number;
  scoreB: number;
  status: RpsStatus;
  /** Increments on each completed reveal; lets clients ignore stale frames. */
  round: number;
}

export interface RpsRevealResult {
  match: RpsMatch;
  aChoice: RpsChoice;
  bChoice: RpsChoice;
  /** 'a' | 'b' | null (draw). */
  winner: 'a' | 'b' | null;
  /** Seat index of the winner, or null on a draw. */
  winnerSeatIndex: number | null;
  scoreA: number;
  scoreB: number;
}

export interface RpsCreateInput {
  id: string;
  tableId: string;
  a: { address: string; seatIndex: number };
  b: { address: string; seatIndex: number };
}

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };
export type RpsResult<T> = Ok<T> | Err;

const lower = (a: string): string => a.toLowerCase();

/**
 * In-memory registry of live RPS matches. One active match per player address
 * (a player mid-duel can't be challenged again). No timers here — the caller
 * schedules expiry and invokes the matching transition.
 */
export class RpsRegistry {
  private matches = new Map<string, RpsMatch>();
  /** address (lowercase) -> matchId, both participants, for one-match-per-player. */
  private matchByAddr = new Map<string, string>();

  get(matchId: string): RpsMatch | undefined {
    return this.matches.get(matchId);
  }

  getMatchIdByAddress(address: string): string | undefined {
    return this.matchByAddr.get(lower(address));
  }

  hasActiveForAddress(address: string): boolean {
    return this.matchByAddr.has(lower(address));
  }

  /**
   * Register a new PENDING match. Fails if either player is already in a match
   * (busy). Addresses are stored lowercased.
   */
  create(input: RpsCreateInput): RpsResult<{ match: RpsMatch }> {
    const aAddr = lower(input.a.address);
    const bAddr = lower(input.b.address);
    if (aAddr === bAddr) return { ok: false, error: 'self' };
    if (this.matchByAddr.has(aAddr)) return { ok: false, error: 'challenger_busy' };
    if (this.matchByAddr.has(bAddr)) return { ok: false, error: 'busy' };
    const match: RpsMatch = {
      id: input.id,
      tableId: input.tableId,
      a: { address: aAddr, seatIndex: input.a.seatIndex, pick: null },
      b: { address: bAddr, seatIndex: input.b.seatIndex, pick: null },
      scoreA: 0,
      scoreB: 0,
      status: 'pending',
      round: 0,
    };
    this.matches.set(match.id, match);
    this.matchByAddr.set(aAddr, match.id);
    this.matchByAddr.set(bAddr, match.id);
    return { ok: true, match };
  }

  /**
   * Challenged player accepts or denies. Only `b` may respond, only while
   * pending. Deny removes the match.
   */
  respond(matchId: string, responder: string, accept: boolean): RpsResult<{ match: RpsMatch }> {
    const match = this.matches.get(matchId);
    if (!match) return { ok: false, error: 'no_match' };
    if (match.status !== 'pending') return { ok: false, error: 'not_pending' };
    if (lower(responder) !== match.b.address) return { ok: false, error: 'not_responder' };
    if (!accept) {
      this.remove(matchId);
      match.status = 'ended';
      return { ok: true, match };
    }
    match.status = 'active';
    return { ok: true, match };
  }

  /**
   * Lock a player's pick for the current round. Picks are hidden until both are
   * in. A player who already picked this round is locked (rejected). When the
   * second pick lands, the round resolves: score increments, picks clear, round
   * advances, and the reveal is returned.
   */
  pick(matchId: string, address: string, choice: RpsChoice): RpsResult<{ both: boolean; match: RpsMatch; reveal?: RpsRevealResult }> {
    const match = this.matches.get(matchId);
    if (!match) return { ok: false, error: 'no_match' };
    if (match.status !== 'active') return { ok: false, error: 'not_active' };
    const addr = lower(address);
    const side: 'a' | 'b' | null = addr === match.a.address ? 'a' : addr === match.b.address ? 'b' : null;
    if (!side) return { ok: false, error: 'not_in_match' };
    const player = match[side];
    if (player.pick !== null) return { ok: false, error: 'already_picked' };
    player.pick = choice;

    if (match.a.pick === null || match.b.pick === null) {
      return { ok: true, both: false, match };
    }

    const aChoice = match.a.pick;
    const bChoice = match.b.pick;
    const winner = resolveRps(aChoice, bChoice);
    if (winner === 'a') match.scoreA += 1;
    else if (winner === 'b') match.scoreB += 1;
    match.round += 1;
    match.a.pick = null;
    match.b.pick = null;

    const reveal: RpsRevealResult = {
      match,
      aChoice,
      bChoice,
      winner,
      winnerSeatIndex: winner === 'a' ? match.a.seatIndex : winner === 'b' ? match.b.seatIndex : null,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
    };
    return { ok: true, both: true, match, reveal };
  }

  /**
   * Cancel the in-flight round without scoring (pick timeout / one-sided pick).
   * The match stays active so players can pick again.
   */
  cancelRound(matchId: string): RpsMatch | null {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'active') return null;
    match.a.pick = null;
    match.b.pick = null;
    return match;
  }

  /** True when exactly one side has locked a pick this round (one-sided). */
  hasPartialPick(matchId: string): boolean {
    const match = this.matches.get(matchId);
    if (!match) return false;
    return (match.a.pick === null) !== (match.b.pick === null);
  }

  /** End + forget a match by id. Returns the removed match (for peer notify). */
  leave(matchId: string): RpsMatch | null {
    const match = this.matches.get(matchId);
    if (!match) return null;
    this.remove(matchId);
    match.status = 'ended';
    return match;
  }

  /**
   * End + forget whatever match an address is in (disconnect / stand up / hand
   * start). Returns the removed match so the caller can notify the peer.
   */
  leaveByAddress(address: string): RpsMatch | null {
    const matchId = this.matchByAddr.get(lower(address));
    if (!matchId) return null;
    return this.leave(matchId);
  }

  private remove(matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    this.matches.delete(matchId);
    this.matchByAddr.delete(match.a.address);
    this.matchByAddr.delete(match.b.address);
  }
}
