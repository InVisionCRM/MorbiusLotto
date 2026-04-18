"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBLIC_MESSAGE_HANDLER_MAP = exports.CHAT_MESSAGE_HANDLER_MAP = void 0;
exports.CHAT_MESSAGE_HANDLER_MAP = {
    chat_message: 'handleChatMessage',
    set_display_name: 'handleSetDisplayName',
    get_profile: 'handleGetProfile',
    check_exclusion_status: 'handleCheckExclusionStatus',
    set_exclusion: 'handleSetExclusion',
    get_exclusion_history: 'handleGetExclusionHistory',
};
exports.PUBLIC_MESSAGE_HANDLER_MAP = {
    join_room: 'handleJoinRoom',
    get_chat_history: 'handleGetChatHistory',
    recent_global_wins: 'handleRecentGlobalWins',
    poker_list_tables: 'handlePokerListTables',
    poker_tournament_list: 'handlePokerTournamentList',
    poker_tournament_get_state: 'handlePokerTournamentGetState',
    poker_tournament_registrants: 'handlePokerTournamentRegistrants',
    bj_multi_list_tables: 'handleBJMultiListTables',
};
//# sourceMappingURL=chat-router.js.map