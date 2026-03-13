/**
 * Poker Bot Script
 *
 * Spawns 1-5 AI bot opponents that join a poker table and play automatically.
 * Bots use a simple strategy: tight-aggressive preflop, semi-random postflop.
 *
 * Usage (from server/ directory):
 *   npx ts-node src/scripts/poker-bot.ts [tableId] [numBots]
 *
 * If tableId is omitted, the script lists tables and uses the first with empty seats,
 * or creates a new table. numBots is 1-5 (default 2).
 *
 * Or via npm script:
 *   npm run poker:bot -- [tableId] [numBots]
 *
 * Env:
 *   NEXT_PUBLIC_WEBSOCKET_URL or WS_URL - WebSocket URL
 *   DATABASE_URL - PostgreSQL connection string (to give bots balance)
 *   POKER_BOT_BUY_IN - Buy-in amount in human chips (default: 1000)
 */
export {};
//# sourceMappingURL=poker-bot.d.ts.map