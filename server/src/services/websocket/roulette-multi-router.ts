/**
 * Message → handler map for the shared roulette wheel.
 *
 * The smallest protocol of the four, because the game is. There is no turn to
 * take and no role to hold: chips go down, anyone at the table may spin, and one
 * pocket settles everybody. `spin` carries no arguments at all — unlike the
 * craps `roll`, which has to name a shooter — since no seat owns the wheel.
 */
export const ROULETTE_MULTI_MESSAGE_HANDLER_MAP: Record<string, string> = {
  roulette_multi_join_table: 'handleRouletteMultiJoinTable',
  roulette_multi_leave_table: 'handleRouletteMultiLeaveTable',
  roulette_multi_place_bet: 'handleRouletteMultiPlaceBet',
  roulette_multi_clear_bet: 'handleRouletteMultiClearBet',
  roulette_multi_clear_all: 'handleRouletteMultiClearAll',
  roulette_multi_spin: 'handleRouletteMultiSpin',
  roulette_multi_get_state: 'handleRouletteMultiGetState',
  roulette_multi_spin_history: 'handleRouletteMultiSpinHistory',
  roulette_multi_list_tables: 'handleRouletteMultiListTables',
  roulette_multi_create_table: 'handleRouletteMultiCreateTable',
  roulette_multi_delete_table: 'handleRouletteMultiDeleteTable',
  roulette_multi_rotate_seed: 'handleRouletteMultiRotateSeed',
};

/** Room name a seated player subscribes to for table broadcasts. */
export function rouletteTableRoom(tableId: string): string {
  return `roulette:table:${tableId}`;
}

export function isRouletteTableRoom(room: string): boolean {
  return room.startsWith('roulette:table:');
}
