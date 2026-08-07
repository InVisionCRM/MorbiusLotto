/**
 * Typed wrapper over the shared-roulette WebSocket protocol.
 *
 * Everything the felt shows arrives in one `roulette_multi_table_state`
 * payload — the client never derives a result, it renders whatever the table
 * says. The server is the only thing that knows where the ball landed.
 *
 * The bet shape is deliberately the SAME `Roulette2Bet` the solo felt already
 * speaks, so `RouletteBoard2` can be dropped onto a shared table without a
 * translation layer. The one thing that does need translating is the direction:
 * the board thinks in zone keys (`straight:17`), the server thinks in a bet
 * array, and `betsToAmounts` / `amountsKeyToBet` are the two-line bridge.
 */

import { zoneKey as boardZoneKey } from '@/components/StakeRoulette/RouletteBoard2';
import type { Roulette2Bet, Roulette2BetType } from '@/lib/roulette2-client';

export interface RouletteMultiSeat {
  position: number;
  playerAddress: string | null;
  status: 'active' | 'sitting_out';
  /** This seat's own chips, one entry per zone. */
  bets: Roulette2Bet[];
  atRisk: number;
  /** True when this seat's client seed feeds the next spin. */
  isSeedSeat: boolean;
  consecutiveTimeouts: number;
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: Record<string, unknown> | null;
  profileDisplayMode?: 'avatar' | 'photo';
  lastWin: number;
  lastLoss: number;
}

export interface RouletteMultiSpin {
  spinId: string;
  result: number;
  seedPosition: number | null;
  seedAddress: string | null;
}

export interface RouletteMultiTableState {
  tableId: string;
  status: 'waiting' | 'betting' | 'spinning';
  seedPosition: number | null;
  minBet: number;
  maxBet: number;
  maxTotalBet: number;
  seats: RouletteMultiSeat[];
  seatCount: number;
  serverSeedHash: string | null;
  seedEpoch: number;
  nonce: number;
  bettingStartedAt: string | null;
  spinStartedAt: string | null;
  bettingSeconds: number;
  spinSeconds: number;
  lastSpin: RouletteMultiSpin | null;
  spinHistory: number[];
  themeKind: string;
  themeId: string;
  themeConfig: Record<string, unknown> | null;
  stateVersion: number;
  viewerCount?: number;
}

export interface RouletteMultiSpinHistoryRow {
  spinId: string;
  seedEpoch: number;
  nonce: number;
  result: number;
  seedPosition: number | null;
  seedAddress: string | null;
  viewerStaked: number | null;
  viewerReturned: number | null;
  createdAt: string;
}

export interface RouletteMultiTableSummary {
  id: string;
  status: string;
  minBet: number;
  maxBet: number;
  seatedCount: number;
  emptySeats: number;
  themeKind: string;
  themeId: string;
  recent: number[];
}

/** The subset of the shared WS client this game needs. */
interface WsLike {
  sendRequest(type: string, payload: unknown): Promise<any>;
  on(event: string, handler: (payload: any) => void): void;
}

export const ROULETTE_MULTI_EVENTS = {
  tableState: 'roulette_multi_table_state',
  tableList: 'roulette_multi_table_list',
  betPlaced: 'roulette_multi_bet_placed',
  betCleared: 'roulette_multi_bet_cleared',
  seedRotated: 'roulette_multi_seed_rotated',
  spinHistory: 'roulette_multi_spin_history',
} as const;

// ── Board bridge ────────────────────────────────────────────────────────────

/** A bet array as the board wants it: total chips per zone key. */
export function betsToAmounts(bets: Roulette2Bet[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bets ?? []) {
    out[boardZoneKey(b.type, b.numbers)] = (out[boardZoneKey(b.type, b.numbers)] ?? 0) + Number(b.amount || 0);
  }
  return out;
}

/**
 * Sum every seat's chips per zone EXCEPT one.
 *
 * This is what turns a shared felt into a shared felt: at a real table you can
 * see what the rest of the rail is behind, and roulette chips are public by
 * nature. Excluding your own seat keeps the two readable separately — your
 * stake is the chip, everyone else's is the badge.
 */
export function railAmountsExcluding(
  seats: RouletteMultiSeat[] | null | undefined,
  myPosition: number | null,
): Record<string, { count: number; total: number }> {
  const out: Record<string, { count: number; total: number }> = {};
  for (const seat of seats ?? []) {
    if (!seat.playerAddress) continue;
    if (myPosition !== null && seat.position === myPosition) continue;
    for (const b of seat.bets ?? []) {
      const key = boardZoneKey(b.type, b.numbers);
      const cur = out[key] ?? { count: 0, total: 0 };
      out[key] = { count: cur.count + 1, total: cur.total + Number(b.amount || 0) };
    }
  }
  return out;
}

/**
 * Rebuild a bet from a board zone key.
 *
 * The board hands back the key it generated, and clearing a zone server-side
 * needs the bet it came from — same type, same numbers. Splitting the key is
 * exact rather than a lookup because the key IS the identity.
 */
export function amountsKeyToBet(key: string): Roulette2Bet | null {
  const [type, nums] = key.split(':');
  if (!type) return null;
  const numbers = nums ? nums.split('-').map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [];
  return { type: type as Roulette2BetType, amount: 0, numbers };
}

// ── Requests ────────────────────────────────────────────────────────────────

export async function listRouletteTables(ws: WsLike): Promise<RouletteMultiTableSummary[]> {
  const res = await ws.sendRequest('roulette_multi_list_tables', {});
  return res?.tables ?? [];
}

export async function getRouletteTableState(ws: WsLike, tableId: string): Promise<RouletteMultiTableState> {
  return ws.sendRequest('roulette_multi_get_state', { tableId });
}

export async function joinRouletteTable(
  ws: WsLike,
  tableId: string,
  seatPosition: number,
  clientSeed?: string,
): Promise<RouletteMultiTableState> {
  return ws.sendRequest('roulette_multi_join_table', { tableId, seatPosition, clientSeed });
}

export async function leaveRouletteTable(ws: WsLike, tableId: string): Promise<RouletteMultiTableState> {
  return ws.sendRequest('roulette_multi_leave_table', { tableId });
}

export async function placeRouletteMultiBet(
  ws: WsLike,
  tableId: string,
  bet: Roulette2Bet,
): Promise<{ bets: Roulette2Bet[]; chipBalance: string }> {
  return ws.sendRequest('roulette_multi_place_bet', { tableId, bet });
}

export async function clearRouletteMultiBet(
  ws: WsLike,
  tableId: string,
  bet: Roulette2Bet,
): Promise<{ bets: Roulette2Bet[]; chipBalance: string }> {
  return ws.sendRequest('roulette_multi_clear_bet', { tableId, bet });
}

export async function clearAllRouletteMultiBets(
  ws: WsLike,
  tableId: string,
): Promise<{ bets: Roulette2Bet[]; chipBalance: string }> {
  return ws.sendRequest('roulette_multi_clear_all', { tableId });
}

/** Turn the wheel. Any seated player may — there is no shooter to be. */
export async function spinRouletteMulti(ws: WsLike, tableId: string): Promise<RouletteMultiTableState> {
  return ws.sendRequest('roulette_multi_spin', { tableId });
}

export async function fetchRouletteSpinHistory(
  ws: WsLike,
  tableId: string,
  limit = 25,
): Promise<RouletteMultiSpinHistoryRow[]> {
  const res = await ws.sendRequest('roulette_multi_spin_history', { tableId, limit });
  return res?.spins ?? [];
}

export async function rotateRouletteMultiSeed(
  ws: WsLike,
  tableId: string,
): Promise<{ ok: boolean; error?: string }> {
  return ws.sendRequest('roulette_multi_rotate_seed', { tableId });
}

// ── Admin ───────────────────────────────────────────────────────────────────
// Both are refused server-side for anyone outside ADMIN_WALLETS. The check that
// matters lives there; the UI simply doesn't offer the buttons.

export async function createRouletteTable(
  ws: WsLike,
  minBet?: number,
  maxBet?: number,
): Promise<{ id: string }> {
  return ws.sendRequest('roulette_multi_create_table', { minBet, maxBet });
}

export async function deleteRouletteTable(ws: WsLike, tableId: string): Promise<{ ok: boolean }> {
  return ws.sendRequest('roulette_multi_delete_table', { tableId });
}

// ── Helpers the felt shares with craps ──────────────────────────────────────

export function rouletteSeatOf(
  state: RouletteMultiTableState | null,
  address?: string | null,
): RouletteMultiSeat | null {
  if (!state || !address) return null;
  const addr = address.toLowerCase();
  return state.seats.find((s) => s.playerAddress?.toLowerCase() === addr) ?? null;
}

export function rouletteSeatLabel(seat: RouletteMultiSeat): string {
  if (seat.displayName) return seat.displayName;
  if (!seat.playerAddress) return 'Open';
  return `${seat.playerAddress.slice(0, 6)}…${seat.playerAddress.slice(-4)}`;
}

/** Seconds left on whichever clock the table is currently running. */
export function rouletteClockRemaining(
  state: RouletteMultiTableState | null,
  nowMs: number,
): number | null {
  if (!state) return null;
  if (state.status === 'betting' && state.bettingStartedAt) {
    const end = new Date(state.bettingStartedAt).getTime() + state.bettingSeconds * 1000;
    return Math.max(0, Math.ceil((end - nowMs) / 1000));
  }
  if (state.status === 'spinning' && state.spinStartedAt) {
    const end = new Date(state.spinStartedAt).getTime() + state.spinSeconds * 1000;
    return Math.max(0, Math.ceil((end - nowMs) / 1000));
  }
  return null;
}
