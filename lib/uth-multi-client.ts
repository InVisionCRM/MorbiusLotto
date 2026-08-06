/**
 * Typed wrapper over the shared Ultimate Hold'em protocol.
 *
 * As with the craps felt, the client derives nothing: the street, the visible
 * board, whose cards you may see and what you are allowed to do all arrive from
 * the server. In particular `holeCards` is null for other players until
 * showdown because the SERVER withheld it — never because the client chose not
 * to draw it.
 */

import type { UthAction, UthStage } from '@/lib/ultimate-holdem-client';

export interface UthMultiSeat {
  position: number;
  playerAddress: string | null;
  status: 'active' | 'sitting_out';
  pendingAnte: number;
  pendingTrips: number;
  consecutiveTimeouts: number;
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: Record<string, unknown> | null;

  inRound: boolean;
  /** Yours always; everyone else's only once the hand is over. */
  holeCards: number[] | null;
  ante: number;
  blind: number;
  trips: number;
  play: number;
  folded: boolean;
  acted: boolean;
  result: string | null;
  totalPayout: number;
  playerCategory: string | null;
}

export interface UthMultiTableState {
  tableId: string;
  status: 'waiting' | 'betting' | 'dealing';
  minBet: number;
  maxBet: number;
  seats: UthMultiSeat[];
  seatCount: number;
  roundId: string | null;
  roundNumber: number;
  stage: UthStage;
  board: number[];
  dealerCards: number[];
  serverSeedHash: string | null;
  seedEpoch: number;
  nonce: number;
  bettingStartedAt: string | null;
  streetStartedAt: string | null;
  bettingSeconds: number;
  streetSeconds: number;
  legalActions: UthAction[];
  stateVersion: number;
}

export interface UthMultiTableSummary {
  id: string;
  status: string;
  minBet: number;
  maxBet: number;
  seatedCount: number;
  emptySeats: number;
  stage: UthStage | null;
}

interface WsLike {
  sendRequest(type: string, payload: unknown): Promise<any>;
  on(event: string, handler: (payload: any) => void): void;
}

export const UTH_MULTI_EVENTS = {
  tableState: 'uth_multi_table_state',
  tableList: 'uth_multi_table_list',
  seedRotated: 'uth_multi_seed_rotated',
} as const;

export async function listUthTables(ws: WsLike): Promise<UthMultiTableSummary[]> {
  const res = await ws.sendRequest('uth_multi_list_tables', {});
  return res?.tables ?? [];
}

export async function getUthTableState(ws: WsLike, tableId: string): Promise<UthMultiTableState> {
  return ws.sendRequest('uth_multi_get_state', { tableId });
}

export async function joinUthTable(
  ws: WsLike, tableId: string, seatPosition: number, clientSeed?: string,
): Promise<UthMultiTableState> {
  return ws.sendRequest('uth_multi_join_table', { tableId, seatPosition, clientSeed });
}

export async function leaveUthTable(ws: WsLike, tableId: string): Promise<UthMultiTableState> {
  return ws.sendRequest('uth_multi_leave_table', { tableId });
}

/** Stage an ante for the next round. Nothing is debited until it deals. */
export async function postUthAnte(
  ws: WsLike, tableId: string, ante: number, trips = 0,
): Promise<UthMultiTableState> {
  return ws.sendRequest('uth_multi_post_ante', { tableId, ante, trips });
}

export async function actUthMulti(
  ws: WsLike, tableId: string, action: UthAction,
): Promise<UthMultiTableState> {
  return ws.sendRequest('uth_multi_act', { tableId, action });
}

export async function rotateUthSeed(
  ws: WsLike, tableId: string,
): Promise<{ ok: boolean; error?: string }> {
  return ws.sendRequest('uth_multi_rotate_seed', { tableId });
}

// ── Helpers the felt uses ───────────────────────────────────────────────────

/** Seconds left on whichever clock is running, or null when none is. */
export function uthClockRemaining(state: UthMultiTableState | null, nowMs: number): number | null {
  if (!state) return null;
  if (state.status === 'betting' && state.bettingStartedAt) {
    const started = new Date(state.bettingStartedAt).getTime();
    return Math.max(0, Math.ceil((started + state.bettingSeconds * 1000 - nowMs) / 1000));
  }
  if (state.stage !== 'settled' && state.streetStartedAt) {
    const started = new Date(state.streetStartedAt).getTime();
    return Math.max(0, Math.ceil((started + state.streetSeconds * 1000 - nowMs) / 1000));
  }
  return null;
}

export function uthSeatOf(
  state: UthMultiTableState | null,
  address: string | null | undefined,
): UthMultiSeat | null {
  if (!state || !address) return null;
  const lower = address.toLowerCase();
  return state.seats.find((s) => s.playerAddress === lower) ?? null;
}

export function uthSeatLabel(seat: UthMultiSeat): string {
  if (seat.displayName) return seat.displayName;
  if (!seat.playerAddress) return 'Open';
  return `${seat.playerAddress.slice(0, 6)}…${seat.playerAddress.slice(-4)}`;
}

/** Human label for the street, used in the felt header. */
export function uthStageLabel(stage: UthStage): string {
  if (stage === 'preflop') return 'Pre-flop';
  if (stage === 'flop') return 'Flop';
  if (stage === 'river') return 'River';
  return 'Showdown';
}
