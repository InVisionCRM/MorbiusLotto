/**
 * Poker Bot Script
 *
 * Spawns 1-10 AI bot opponents that join a poker table and play automatically.
 * Bots use a simple strategy: tight-aggressive preflop, semi-random postflop.
 *
 * Usage (from server/ directory):
 *   npx ts-node src/scripts/poker-bot.ts [tableId] [numBots]
 *
 * Tournament mode (register via poker_tournament_join, then play when table exists):
 *   npx ts-node src/scripts/poker-bot.ts --tournament <tournamentId> [numBots]
 *   POKER_BOT_TOURNAMENT_ID=<uuid> npm run poker:bot -- [numBots]
 *
 * If tableId is omitted (cash mode), the script lists tables and uses the first with empty seats,
 * or creates a new table. numBots is 1-10 (default 2).
 *
 * Or via npm script:
 *   npm run poker:bot -- [tableId] [numBots]
 *   npm run poker:bot -- --tournament <tournamentId> [numBots]
 *
 * Env:
 *   NEXT_PUBLIC_WEBSOCKET_URL or WS_URL - WebSocket URL
 *   DATABASE_URL - Required (unless POKER_BOT_SKIP_DB=1). Same DB as the server: upserts each bot into
 *     `players` with balance at least the needed buy-in floor, and ensures a placeholder `chat_display_names` row.
 *     Cash and tournament modes use the same POKER_BOT_ADDRESSES list — no separate tournament wallets.
 *   POKER_BOT_SKIP_DB - If 1/true, skip all DB writes (you must already have players + balance).
 *   POKER_BOT_BUY_IN - Buy-in amount in human chips (default: 1000)
 *   POKER_BOT_ADDRESSES - Comma-separated bot wallet addresses (preferred in production)
 *   POKER_BOT_TOURNAMENT_ID - UUID of poker tournament (alternative to --tournament)
 *   POKER_BOT_TOURNAMENT_PIN - PIN for private tournaments
 *   CYPRESS_POKER_TEST_PLAYERS / POKER_TEST_PLAYERS - fallback wallet list
 */
export {};
//# sourceMappingURL=poker-bot.d.ts.map