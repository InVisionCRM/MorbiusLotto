"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BLACKJACK_MESSAGE_HANDLER_MAP = void 0;
exports.BLACKJACK_MESSAGE_HANDLER_MAP = {
    get_server_seed_hash: 'handleGetServerSeedHash',
    create_game: 'handleCreateGame',
    player_action: 'handlePlayerAction',
    get_game_state: 'handleGetGameState',
    sync_balance: 'handleSyncBalance',
    get_balance: 'handleGetBalance',
    tip_dealer: 'handleGenericTipDealer',
};
//# sourceMappingURL=blackjack-router.js.map