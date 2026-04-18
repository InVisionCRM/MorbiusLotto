"use strict";
/** Same wallet list as `poker-bot.ts` / env docs — used to run turns in-process on tournament tables. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePokerBotAddressCsv = parsePokerBotAddressCsv;
exports.getServerPokerBotAddressSet = getServerPokerBotAddressSet;
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
/** Lowercase 0x addresses from `POKER_BOT_ADDRESSES` (game server env). */
function getServerPokerBotAddressSet() {
    const raw = String(process.env.POKER_BOT_ADDRESSES ?? '').trim();
    return new Set(parsePokerBotAddressCsv(raw || undefined));
}
//# sourceMappingURL=poker-server-bot-addresses.js.map