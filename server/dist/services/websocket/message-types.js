"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_WS_MESSAGE_TYPE_SET = exports.ALL_WS_MESSAGE_TYPES = exports.WS_BJ_MULTI_MESSAGES = exports.WS_POKER_MESSAGES = exports.WS_TOURNAMENT_MESSAGES = exports.WS_CHAT_MESSAGES = exports.WS_BLACKJACK_MESSAGES = exports.WS_PUBLIC_MESSAGES = exports.WS_AUTH_MESSAGES = void 0;
exports.isKnownWebSocketMessageType = isKnownWebSocketMessageType;
exports.isPublicWebSocketMessage = isPublicWebSocketMessage;
exports.WS_AUTH_MESSAGES = ['auth_response', 'ping'];
exports.WS_PUBLIC_MESSAGES = [
    'join_room',
    'get_chat_history',
    'recent_global_wins',
    'poker_list_tables',
    'poker_tournament_list',
    'poker_tournament_get_state',
    'poker_tournament_registrants',
    'bj_multi_list_tables',
];
exports.WS_BLACKJACK_MESSAGES = [
    'get_server_seed_hash',
    'create_game',
    'player_action',
    'get_game_state',
    'sync_balance',
    'get_balance',
    'tip_dealer',
];
exports.WS_CHAT_MESSAGES = [
    'chat_message',
    'set_display_name',
    'get_profile',
    'check_exclusion_status',
    'set_exclusion',
    'get_exclusion_history',
];
exports.WS_TOURNAMENT_MESSAGES = [
    'tournament_enter',
    'tournament_leave',
    'tournament_state',
    'tournament_game_start',
    'tournament_player_action',
    'tournament_leaderboard',
    'tournament_leaderboard_by_id',
    'tournament_info',
    'tournament_create',
    'create_freeroll',
    'tournament_list',
    'tournament_join',
    'tournament_unregister',
    'tournament_get_info',
    'freeroll_list',
    'freeroll_register',
    'freeroll_join',
    'tournament_entries_list',
    'creator_tournaments',
    'creator_earnings',
    'tournament_cancel',
    'tournament_reclaim',
];
exports.WS_POKER_MESSAGES = [
    'poker_join_table',
    'poker_leave_table',
    'poker_add_chips',
    'poker_action',
    'poker_get_state',
    'poker_create_table',
    'poker_update_table_logo',
    'poker_purchase_table_logo',
    'poker_quick_reaction',
    'poker_avatar_emotion',
    'poker_tournament_create',
    'poker_tournament_join',
    'poker_tournament_cancel',
    'poker_tournament_list_reclaimable',
    'poker_tournament_list_claimable',
];
/** Multiplayer BJ: `bj_multi_place_bet` payload may include optional `clientSeed` (string, max 255). */
exports.WS_BJ_MULTI_MESSAGES = [
    'bj_multi_join_table',
    'bj_multi_leave_table',
    'bj_multi_place_bet',
    'bj_multi_action',
    'bj_multi_get_state',
    'bj_multi_create_table',
    'bj_multi_delete_table',
    'bj_multi_table_history',
    'bj_multi_tip_dealer',
    'bj_multi_quick_reaction',
    'bj_multi_avatar_emotion',
];
exports.ALL_WS_MESSAGE_TYPES = [
    ...exports.WS_AUTH_MESSAGES,
    ...exports.WS_PUBLIC_MESSAGES,
    ...exports.WS_BLACKJACK_MESSAGES,
    ...exports.WS_CHAT_MESSAGES,
    ...exports.WS_TOURNAMENT_MESSAGES,
    ...exports.WS_POKER_MESSAGES,
    ...exports.WS_BJ_MULTI_MESSAGES,
];
exports.ALL_WS_MESSAGE_TYPE_SET = new Set(exports.ALL_WS_MESSAGE_TYPES);
function isKnownWebSocketMessageType(type) {
    return exports.ALL_WS_MESSAGE_TYPE_SET.has(type);
}
function isPublicWebSocketMessage(type) {
    return exports.WS_AUTH_MESSAGES.includes(type) ||
        exports.WS_PUBLIC_MESSAGES.includes(type);
}
//# sourceMappingURL=message-types.js.map