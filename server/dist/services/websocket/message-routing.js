"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyWebSocketMessageType = classifyWebSocketMessageType;
const message_types_1 = require("./message-types");
const POKER_PUBLIC_TYPES = new Set([
    'poker_tournament_list',
    'poker_tournament_get_state',
]);
function classifyWebSocketMessageType(type) {
    if (message_types_1.WS_AUTH_MESSAGES.includes(type))
        return 'auth';
    if (message_types_1.WS_PUBLIC_MESSAGES.includes(type))
        return 'public';
    if (message_types_1.WS_BLACKJACK_MESSAGES.includes(type))
        return 'blackjack';
    if (message_types_1.WS_CHAT_MESSAGES.includes(type))
        return 'chat';
    if (message_types_1.WS_TOURNAMENT_MESSAGES.includes(type))
        return 'tournament';
    if (message_types_1.WS_POKER_MESSAGES.includes(type) || POKER_PUBLIC_TYPES.has(type))
        return 'poker';
    if (message_types_1.WS_BJ_MULTI_MESSAGES.includes(type))
        return 'bj_multi';
    return 'unknown';
}
//# sourceMappingURL=message-routing.js.map