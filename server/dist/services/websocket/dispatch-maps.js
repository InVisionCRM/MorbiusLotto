"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BJ_MULTI_MESSAGE_HANDLER_MAP = exports.POKER_MESSAGE_HANDLER_MAP = exports.TOURNAMENT_MESSAGE_HANDLER_MAP = exports.CHAT_MESSAGE_HANDLER_MAP = exports.BLACKJACK_MESSAGE_HANDLER_MAP = exports.PUBLIC_MESSAGE_HANDLER_MAP = exports.AUTH_MESSAGE_HANDLER_MAP = void 0;
exports.AUTH_MESSAGE_HANDLER_MAP = {
    auth_response: 'handleAuthResponse',
    ping: 'handlePing',
};
exports.PUBLIC_MESSAGE_HANDLER_MAP = {
    join_room: 'handleJoinRoom',
    get_chat_history: 'handleGetChatHistory',
    recent_global_wins: 'handleRecentGlobalWins',
    poker_list_tables: 'handlePokerListTables',
    poker_tournament_list: 'handlePokerTournamentList',
    poker_tournament_get_state: 'handlePokerTournamentGetState',
    bj_multi_list_tables: 'handleBJMultiListTables',
};
exports.BLACKJACK_MESSAGE_HANDLER_MAP = {
    get_server_seed_hash: 'handleGetServerSeedHash',
    create_game: 'handleCreateGame',
    player_action: 'handlePlayerAction',
    get_game_state: 'handleGetGameState',
    sync_balance: 'handleSyncBalance',
    get_balance: 'handleGetBalance',
    tip_dealer: 'handleGenericTipDealer',
};
exports.CHAT_MESSAGE_HANDLER_MAP = {
    chat_message: 'handleChatMessage',
    set_display_name: 'handleSetDisplayName',
    get_profile: 'handleGetProfile',
    check_exclusion_status: 'handleCheckExclusionStatus',
    set_exclusion: 'handleSetExclusion',
    get_exclusion_history: 'handleGetExclusionHistory',
};
exports.TOURNAMENT_MESSAGE_HANDLER_MAP = {
    tournament_enter: 'handleTournamentEnter',
    tournament_leave: 'handleTournamentLeave',
    tournament_state: 'handleGetTournamentState',
    tournament_game_start: 'handleTournamentGameStart',
    tournament_player_action: 'handleTournamentPlayerAction',
    tournament_leaderboard: 'handleTournamentLeaderboard',
    tournament_leaderboard_by_id: 'handleTournamentLeaderboardById',
    tournament_info: 'handleGetTournamentInfo',
    tournament_create: 'handleTournamentCreate',
    create_freeroll: 'handleCreateFreeroll',
    tournament_list: 'handleTournamentList',
    tournament_join: 'handleTournamentJoin',
    tournament_unregister: 'handleTournamentUnregister',
    tournament_get_info: 'handleTournamentGetInfo',
    freeroll_list: 'handleFreerollList',
    freeroll_register: 'handleFreerollRegister',
    freeroll_join: 'handleFreerollJoin',
    tournament_entries_list: 'handleTournamentEntriesList',
    creator_tournaments: 'handleCreatorTournaments',
    creator_earnings: 'handleCreatorEarnings',
    tournament_cancel: 'handleTournamentCancel',
    tournament_reclaim: 'handleTournamentReclaim',
};
exports.POKER_MESSAGE_HANDLER_MAP = {
    poker_join_table: 'handlePokerJoinTable',
    poker_leave_table: 'handlePokerLeaveTable',
    poker_add_chips: 'handlePokerAddChips',
    poker_action: 'handlePokerAction',
    poker_get_state: 'handlePokerGetState',
    poker_create_table: 'handlePokerCreateTable',
    poker_update_table_logo: 'handlePokerUpdateTableLogo',
    poker_quick_reaction: 'handlePokerQuickReaction',
    poker_avatar_emotion: 'handlePokerAvatarEmotion',
    poker_tournament_list: 'handlePokerTournamentList',
    poker_tournament_create: 'handlePokerTournamentCreate',
    poker_tournament_join: 'handlePokerTournamentJoin',
    poker_tournament_get_state: 'handlePokerTournamentGetState',
    poker_tournament_cancel: 'handlePokerTournamentCancel',
};
exports.BJ_MULTI_MESSAGE_HANDLER_MAP = {
    bj_multi_join_table: 'handleBJMultiJoinTable',
    bj_multi_leave_table: 'handleBJMultiLeaveTable',
    bj_multi_place_bet: 'handleBJMultiPlaceBet',
    bj_multi_action: 'handleBJMultiAction',
    bj_multi_get_state: 'handleBJMultiGetState',
    bj_multi_create_table: 'handleBJMultiCreateTable',
    bj_multi_delete_table: 'handleBJMultiDeleteTable',
    bj_multi_table_history: 'handleBJMultiTableHistory',
    bj_multi_tip_dealer: 'handleBJMultiTipDealer',
    bj_multi_quick_reaction: 'handleBJMultiQuickReaction',
    bj_multi_avatar_emotion: 'handleBJMultiAvatarEmotion',
};
//# sourceMappingURL=dispatch-maps.js.map