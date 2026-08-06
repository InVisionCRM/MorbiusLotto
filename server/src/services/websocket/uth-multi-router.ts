/**
 * Message → handler map for the shared Ultimate Hold'em felt.
 *
 * Sits between the other two in size, as the game does: craps needs no action
 * protocol at all, blackjack needs a turn protocol, and this needs a single
 * `act` that any seat may send whenever it still owes the street a decision.
 */
export const UTH_MULTI_MESSAGE_HANDLER_MAP: Record<string, string> = {
  uth_multi_join_table: 'handleUthMultiJoinTable',
  uth_multi_leave_table: 'handleUthMultiLeaveTable',
  uth_multi_post_ante: 'handleUthMultiPostAnte',
  uth_multi_act: 'handleUthMultiAct',
  uth_multi_get_state: 'handleUthMultiGetState',
  uth_multi_list_tables: 'handleUthMultiListTables',
  uth_multi_create_table: 'handleUthMultiCreateTable',
  uth_multi_delete_table: 'handleUthMultiDeleteTable',
  uth_multi_rotate_seed: 'handleUthMultiRotateSeed',
};

/** Room name a seated player subscribes to for table broadcasts. */
export function uthTableRoom(tableId: string): string {
  return `uth:table:${tableId}`;
}

export function isUthTableRoom(room: string): boolean {
  return room.startsWith('uth:table:');
}
