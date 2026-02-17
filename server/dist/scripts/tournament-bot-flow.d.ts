/**
 * Tournament Bot Flow Script
 *
 * Creates a tournament, adds all bots, and plays through to completion.
 * Uses off-chain tournaments only (no contract calls).
 *
 * Modes:
 *   standard (default) - Buy-in tournament, 5000 chips, 25 hands
 *   freeroll - Chip-count freeroll, 5000 chips, 25 hands
 *
 * Prerequisites:
 * - Server running (or use production WebSocket URL)
 * - standard: Bot addresses in players table with sufficient balance (1000 MORBIUS each)
 * - freeroll: No balance needed
 *
 * Run from server directory:
 *   npm run tournament:bot
 *   TOURNAMENT_BOT_MODE=freeroll npm run tournament:bot
 *
 * Env:
 *   NEXT_PUBLIC_WEBSOCKET_URL (or WS_URL) - WebSocket URL
 *   TOURNAMENT_BOT_ADDRESSES - comma-separated addresses
 *   TOURNAMENT_BOT_MODE - standard | freeroll (default: standard)
 */
export {};
//# sourceMappingURL=tournament-bot-flow.d.ts.map