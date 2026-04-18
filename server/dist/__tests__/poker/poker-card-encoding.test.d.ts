/**
 * Poker Card Encoding Tests
 *
 * Tests intToCard / cardToInt roundtrip for all 52 cards,
 * and verifies compatibility between the game service encoding
 * and the hand evaluator's encoding.
 *
 * Game service encoding (poker-game.service.ts):
 *   int = suitIndex * 13 + rankIndex
 *   rankIndex: 0=2, 1=3, ..., 8=T, 9=J, 10=Q, 11=K, 12=A
 *   suitIndex: 0=clubs, 1=diamonds, 2=hearts, 3=spades
 *
 * Hand evaluator encoding (poker-hand-eval.ts):
 *   rank = (cardIndex % 13) + 1  → 1=Ace, 2=Two, ..., 13=King
 *   suit = floor(cardIndex / 13)
 *
 * Run: cd server && npm test -- poker-card-encoding
 */
export {};
//# sourceMappingURL=poker-card-encoding.test.d.ts.map