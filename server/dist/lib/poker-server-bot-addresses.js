"use strict";
/** Tournament table in-process bots: same wallet resolution as CLI `poker-bot.ts`. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePokerBotAddressCsv = parsePokerBotAddressCsv;
exports.getServerPokerBotAddressSet = getServerPokerBotAddressSet;
const poker_bot_wallet_pool_1 = require("./poker-bot-wallet-pool");
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
function parsePokerBotAddressCsv(input) {
    if (!input)
        return [];
    return [
        ...new Set(input
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean)
            .filter((a) => ADDRESS_RE.test(a))
            .map((a) => a.toLowerCase())),
    ];
}
/** Lowercase bot wallets — uses env chain + defaults (unless POKER_SERVER_BOT_STRICT_ADDRESSES). */
function getServerPokerBotAddressSet() {
    return new Set((0, poker_bot_wallet_pool_1.getPokerBotWalletAddressList)({ server: true }));
}
//# sourceMappingURL=poker-server-bot-addresses.js.map