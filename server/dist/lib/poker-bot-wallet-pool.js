"use strict";
/**
 * Canonical list of poker bot wallet addresses for CLI `poker-bot.ts` and in-server
 * `tickServerTournamentBots` (tournament tables only). Keeps resolution order in one place.
 *
 * Resolution: POKER_BOT_ADDRESSES → CYPRESS_POKER_TEST_PLAYERS → POKER_TEST_PLAYERS → built-in Cypress defaults.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CYPRESS_DEFAULT_POKER_BOT_ADDRESSES = void 0;
exports.parsePokerBotWalletCsv = parsePokerBotWalletCsv;
exports.getPokerBotWalletAddressList = getPokerBotWalletAddressList;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
/** Default list mirrors Cypress poker real-backend players (same as legacy poker-bot.ts). */
exports.CYPRESS_DEFAULT_POKER_BOT_ADDRESSES = [
    '0x2775dd8242c4f589536113475b7c80f42ab4a70a',
    '0x70444750eedf1b2c9b777cbf096a5919a14895e5',
    '0xEdEe8515897281CcF27999a121A90d76E3Cde016',
    '0x41682815B05fE6b54a6C0f8813bB99423EE0309D',
    '0x031E727436173278B92Dad7405fc94FBfc4A18a6',
    '0x33cedDc21b78414b1a59ba70Ede0B27761FfA556',
    '0x1b9894ddEf9c19b9a971FBE9fba85135B9348Db0',
    '0x2D6f6a61cFDc7C7d000C9279bD7a743D277736bB',
    '0x7aC342321a814c66A0cc38E997DBEC46b8dE8372',
    '0xaA899ca4658C17B9fFa52490219540c9d49AA86f',
    '0x8f6Dc8FD8A5115fdec3CCbE36BE6cf9B28635F2e',
    '0xAfd3Cc199167B396be71911637fcb30bAF22cC67',
];
function parsePokerBotWalletCsv(input) {
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
/**
 * All bot-capable wallets (lowercase). CLI: same as legacy `poker-bot.ts` startup.
 * Server (`server: true`): same, unless strict env requires explicit `POKER_BOT_ADDRESSES`.
 */
function getPokerBotWalletAddressList(opts) {
    const strict = opts?.server === true &&
        ['1', 'true', 'yes'].includes(String(process.env.POKER_SERVER_BOT_STRICT_ADDRESSES ?? '').toLowerCase());
    const envPreferred = parsePokerBotWalletCsv(process.env.POKER_BOT_ADDRESSES);
    if (envPreferred.length > 0) {
        return envPreferred;
    }
    if (strict) {
        return [];
    }
    const cypressFallback = parsePokerBotWalletCsv(process.env.CYPRESS_POKER_TEST_PLAYERS);
    const genericFallback = parsePokerBotWalletCsv(process.env.POKER_TEST_PLAYERS);
    const fallback = cypressFallback.length > 0 ? cypressFallback : genericFallback;
    if (fallback.length > 0) {
        return fallback;
    }
    return exports.CYPRESS_DEFAULT_POKER_BOT_ADDRESSES.map((a) => a.toLowerCase());
}
//# sourceMappingURL=poker-bot-wallet-pool.js.map