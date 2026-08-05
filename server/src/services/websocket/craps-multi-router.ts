/**
 * Message → handler map for the shared craps felt.
 *
 * Notably shorter than the blackjack multi map, and that is the point: craps
 * has no acting player, so there is no per-turn action protocol. A seat places
 * or picks up chips whenever the window is open, and exactly one seat — the
 * shooter — throws.
 */
export const CRAPS_MULTI_MESSAGE_HANDLER_MAP: Record<string, string> = {
  craps_multi_join_table: 'handleCrapsMultiJoinTable',
  craps_multi_leave_table: 'handleCrapsMultiLeaveTable',
  craps_multi_place_bet: 'handleCrapsMultiPlaceBet',
  craps_multi_clear_bet: 'handleCrapsMultiClearBet',
  craps_multi_roll: 'handleCrapsMultiRoll',
  craps_multi_get_state: 'handleCrapsMultiGetState',
  craps_multi_list_tables: 'handleCrapsMultiListTables',
  craps_multi_create_table: 'handleCrapsMultiCreateTable',
  craps_multi_delete_table: 'handleCrapsMultiDeleteTable',
  craps_multi_rotate_seed: 'handleCrapsMultiRotateSeed',
};

/** Room name a seated player subscribes to for table broadcasts. */
export function crapsTableRoom(tableId: string): string {
  return `craps:table:${tableId}`;
}

export function isCrapsTableRoom(room: string): boolean {
  return room.startsWith('craps:table:');
}

export function crapsTableIdFromRoom(room: string): string {
  return room.slice('craps:table:'.length);
}
