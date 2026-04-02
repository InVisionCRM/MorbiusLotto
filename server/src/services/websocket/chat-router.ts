export const CHAT_MESSAGE_HANDLER_MAP: Record<string, string> = {
  chat_message: 'handleChatMessage',
  set_display_name: 'handleSetDisplayName',
  get_profile: 'handleGetProfile',
  check_exclusion_status: 'handleCheckExclusionStatus',
  set_exclusion: 'handleSetExclusion',
  get_exclusion_history: 'handleGetExclusionHistory',
};

export const PUBLIC_MESSAGE_HANDLER_MAP: Record<string, string> = {
  join_room: 'handleJoinRoom',
  get_chat_history: 'handleGetChatHistory',
  recent_global_wins: 'handleRecentGlobalWins',
  poker_list_tables: 'handlePokerListTables',
  poker_tournament_list: 'handlePokerTournamentList',
  poker_tournament_get_state: 'handlePokerTournamentGetState',
  bj_multi_list_tables: 'handleBJMultiListTables',
};
