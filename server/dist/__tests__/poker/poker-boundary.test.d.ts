/**
 * Poker Wei/Chip Boundary Tests
 *
 * Tests the MORBIUS (wei) ↔ chip-int conversion at the trust boundary:
 *   1. Cash join: buy-in wei debits balance; seat stack stores chips (wei / 10^18).
 *   2. Cash leave: seat stack chips credit balance as wei (chips × 10^18).
 *   3. Rake accumulation: DB-stored rake per hand is chip-int; sum matches the
 *      total rake across multiple hands.
 *   4. Blind display integrity: values stored in poker_tables (small_blind,
 *      big_blind) come back unchanged via getTableState — no hidden ×10^18.
 *
 * Run: cd server && npm test -- poker-boundary
 * Requires: server/.env with DATABASE_URL
 */
export {};
//# sourceMappingURL=poker-boundary.test.d.ts.map