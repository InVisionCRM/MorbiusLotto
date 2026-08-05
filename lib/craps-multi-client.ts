/**
 * Typed wrapper over the shared-craps WebSocket protocol.
 *
 * Everything the felt shows arrives in one `craps_multi_table_state` payload —
 * the client never derives game state, it renders whatever the table says. The
 * server is the only thing that knows what the dice did.
 */

import type { BetType, Phase } from '@/lib/craps-types';

export interface CrapsMultiSeat {
  position: number;
  playerAddress: string | null;
  status: 'active' | 'sitting_out';
  /** This seat's own chips, per zone. */
  bets: Record<string, number>;
  atRisk: number;
  isShooter: boolean;
  consecutiveTimeouts: number;
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: Record<string, unknown> | null;
  profileDisplayMode?: 'avatar' | 'photo';
  lastWin: number;
  lastLoss: number;
}

export interface CrapsMultiRoll {
  rollId: string;
  die1: number;
  die2: number;
  sum: number;
  phaseBefore: Phase;
  phaseAfter: Phase;
  pointBefore: number | null;
  pointAfter: number | null;
  isPoint: boolean;
  isSevenOut: boolean;
  dicePassed: boolean;
  shooterPosition: number | null;
  shooterAddress: string | null;
}

export interface CrapsMultiTableState {
  tableId: string;
  status: 'waiting' | 'betting' | 'rolling';
  phase: Phase;
  point: number | null;
  shooterPosition: number | null;
  minBet: number;
  maxBet: number;
  seats: CrapsMultiSeat[];
  seatCount: number;
  serverSeedHash: string | null;
  seedEpoch: number;
  nonce: number;
  bettingStartedAt: string | null;
  rollStartedAt: string | null;
  bettingSeconds: number;
  rollSeconds: number;
  lastRoll: CrapsMultiRoll | null;
  rollHistory: number[];
  themeKind: string;
  themeId: string;
  themeConfig: Record<string, unknown> | null;
  stateVersion: number;
  viewerCount?: number;
}

export interface CrapsMultiTableSummary {
  id: string;
  status: string;
  phase: Phase;
  point: number | null;
  minBet: number;
  maxBet: number;
  seatedCount: number;
  emptySeats: number;
  themeKind: string;
  themeId: string;
}

/** The subset of the shared WS client this game needs. */
interface WsLike {
  sendRequest(type: string, payload: unknown): Promise<any>;
  on(event: string, handler: (payload: any) => void): void;
}

export const CRAPS_MULTI_EVENTS = {
  tableState: 'craps_multi_table_state',
  tableList: 'craps_multi_table_list',
  betPlaced: 'craps_multi_bet_placed',
  betCleared: 'craps_multi_bet_cleared',
  seedRotated: 'craps_multi_seed_rotated',
} as const;

export async function listCrapsTables(ws: WsLike): Promise<CrapsMultiTableSummary[]> {
  const res = await ws.sendRequest('craps_multi_list_tables', {});
  return res?.tables ?? [];
}

export async function getCrapsTableState(ws: WsLike, tableId: string): Promise<CrapsMultiTableState> {
  return ws.sendRequest('craps_multi_get_state', { tableId });
}

export async function joinCrapsTable(
  ws: WsLike,
  tableId: string,
  seatPosition: number,
  clientSeed?: string,
): Promise<CrapsMultiTableState> {
  return ws.sendRequest('craps_multi_join_table', { tableId, seatPosition, clientSeed });
}

export async function leaveCrapsTable(ws: WsLike, tableId: string): Promise<CrapsMultiTableState> {
  return ws.sendRequest('craps_multi_leave_table', { tableId });
}

export async function placeCrapsMultiBet(
  ws: WsLike,
  tableId: string,
  betType: BetType,
  amount: number,
): Promise<{ bets: Record<string, number>; chipBalance: string }> {
  return ws.sendRequest('craps_multi_place_bet', { tableId, betType, amount });
}

export async function clearCrapsMultiBet(
  ws: WsLike,
  tableId: string,
  betType: BetType,
): Promise<{ bets: Record<string, number>; chipBalance: string }> {
  return ws.sendRequest('craps_multi_clear_bet', { tableId, betType });
}

/** Throw the dice. Only the shooter's request is accepted. */
export async function rollCrapsMulti(ws: WsLike, tableId: string): Promise<CrapsMultiTableState> {
  return ws.sendRequest('craps_multi_roll', { tableId });
}

export async function rotateCrapsMultiSeed(
  ws: WsLike,
  tableId: string,
): Promise<{ ok: boolean; error?: string }> {
  return ws.sendRequest('craps_multi_rotate_seed', { tableId });
}

// ── Helpers the felt uses ───────────────────────────────────────────────────

/** Seconds left on whichever clock is running, or null when none is. */
export function crapsClockRemaining(state: CrapsMultiTableState | null, nowMs: number): number | null {
  if (!state) return null;
  if (state.status === 'betting' && state.bettingStartedAt) {
    const started = new Date(state.bettingStartedAt).getTime();
    return Math.max(0, Math.ceil((started + state.bettingSeconds * 1000 - nowMs) / 1000));
  }
  if (state.status === 'rolling' && state.rollStartedAt) {
    const started = new Date(state.rollStartedAt).getTime();
    return Math.max(0, Math.ceil((started + state.rollSeconds * 1000 - nowMs) / 1000));
  }
  return null;
}

export function crapsSeatOf(
  state: CrapsMultiTableState | null,
  address: string | null | undefined,
): CrapsMultiSeat | null {
  if (!state || !address) return null;
  const lower = address.toLowerCase();
  return state.seats.find((s) => s.playerAddress === lower) ?? null;
}

/** Short label for a seat — display name, else a truncated address. */
export function crapsSeatLabel(seat: CrapsMultiSeat): string {
  if (seat.displayName) return seat.displayName;
  if (!seat.playerAddress) return 'Open';
  return `${seat.playerAddress.slice(0, 6)}…${seat.playerAddress.slice(-4)}`;
}
