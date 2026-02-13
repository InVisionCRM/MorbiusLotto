/**
 * Blackjack house-edge simulation using the same V2 RNG as production.
 *
 * Uses:
 * - ProvablyFairService.fisherYatesShuffle(serverSeed, clientSeed, nonce) for deck
 * - ProvablyFairService.calculateHandTotalV2 / isNaturalBlackjackV2 for totals and BJ
 * - Same deal order as server: player, dealer, player, dealer (deck indices 0,1,2,3)
 * - Dealer hits soft 17; blackjack pays 3:2; win 1:1, push return stake
 *
 * Player strategy: basic strategy hit/stand only (no split/double). So house
 * edge will be higher than full basic strategy (~0.5%); expect ~3–4% with
 * hit/stand only.
 *
 * Run from server directory:
 *   npm run simulate:blackjack [numHands]
 *   npx ts-node src/scripts/simulate-blackjack-house-edge.ts [numHands]
 * Default 100_000 hands. Example:
 *   npm run simulate:blackjack -- 500000
 */
export {};
//# sourceMappingURL=simulate-blackjack-house-edge.d.ts.map