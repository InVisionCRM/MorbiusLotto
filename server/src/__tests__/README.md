# Poker Tournament Integration Tests

These are **real-database integration tests** — they run against your actual Neon PostgreSQL instance, not mocks. Every test cleans up after itself.

---

## Prerequisites

1. Migrations 063, 064, and **093** applied (`poker_tables.tournament_mode`, `tournaments.game_type`, `poker_tournament_seats`, `poker_tournament_registrations` view including **`is_private`**)
2. `server/.env` exists with a valid `DATABASE_URL`

```
# server/.env
DATABASE_URL=postgresql://...
```

---

## Running the tests

```bash
# From the repo root
cd server && npm test

# Watch mode (reruns on file save)
cd server && npm run test:watch

# Coverage report
cd server && npm run test:coverage

# Run a single suite by name
cd server && npm test -- --testNamePattern="auto-start"

# Run with verbose output (see each test name)
cd server && npm test -- --verbose
```

---

## What the tests cover

| Suite | What it tests |
|---|---|
| **1 — createPokerTournament** | DB row has `game_type=poker`, `status=registration`, correct `poker_config`, `min/max_players`. Rejects bad configs. |
| **2 — joinPokerTournament** | Buy-in deducted from balance, entry created with correct chips, prize pool updated. Rejects duplicate join, full tournament, wrong status, insufficient balance. |
| **3 — auto-start** | First join does NOT start. Second join (minPlayers reached) auto-starts: status→active, poker table created with `tournament_mode=TRUE`, all players seated, bridge rows written, tournament table hidden from cash lobby. |
| **4 — computeBlindLevel** | Pure function. Correct level for hands 1, 10, 11, 20, 21, 9999. Works with DEFAULT_BLIND_SCHEDULE (8 levels). |
| **5 — syncAfterHand chip sync** | `tournament_entries.chips_remaining` matches updated seat stacks. `hands_played` increments. |
| **6 — player elimination** | 0-chip player gets `status=busted`, seat removed from `poker_seats`, `final_rank` assigned correctly. |
| **7 — prize distribution** | After `syncAfterHand` triggers completion, winner balance increases, tournament status is `completed`. |
| **8 — full 2-player E2E** | End-to-end: create → join ×2 → auto-start → simulate hand result → bust player → verify prizes paid, ranks assigned, tournament completed. |
| **9 — scheduled poker start** | Below `minPlayers` at start time → cancelled + refunded. At or above `minPlayers` → `status=active` and tournament table created. |
| **10 — regression** | Blackjack `createTournament` still defaults to `game_type=blackjack`. Cash game tables still appear in `listTables`. `poker_tournament_registrations` filters `game_type=poker`. `cancelPokerTournament` refunds all players. |

---

## How cleanup works

- **`beforeAll`**: Seeds 6 test players (`0xtest100...001` through `...006`) with 10M MORBIUS each.
- **`beforeEach`**: Resets all test player balances to 10M (so balance-dependent tests start clean).
- **`afterAll`**: Deletes all tournaments and poker tables created during the run (cascade handles entries and seats), then deletes test players.

Tests that need isolation within a suite use `withRollback()` — a helper that wraps mutations in a transaction and always rolls back.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `DATABASE_URL is not set` | Add `DATABASE_URL=...` to `server/.env` |
| `relation "poker_tournament_seats" does not exist` | Run migration 063: `node server/run-migration.js migrations/063_poker_tournaments.sql` |
| `relation "poker_tournament_registrations" does not exist` or column error | Run migrations 064 then **093**: `064_poker_tournament_view_scheduled_start.sql`, `093_poker_tournament_view_is_private.sql` |
| Test timeout (>30s) | Check DB connection — Neon cold starts can be slow. Timeout is set to 30s in `jest.config.ts`. |
| Leftover test data | Tests track created IDs and delete in `afterAll`. If a run crashes mid-test, manually delete: `DELETE FROM tournaments WHERE name LIKE '%Test SNG%' OR name LIKE '%E2E Test SNG%'` |
