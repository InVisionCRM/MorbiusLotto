# Poker tournaments — audit and reference

This document describes how **Texas Hold’em Sit & Go (SNG)**–style tournaments work in MORBlotto, what “modes” exist, the main code paths, and remaining gaps. Currency is **MORBIUS** (off-chain balance for buy-ins and standard payouts unless a different global tournament path applies).

---

## Modes (what actually exists)

There is **one game type** in the database: `tournaments.game_type = 'poker'`. Within that, behavior splits by **start semantics**, not by a separate `tournament_mode` enum on the tournament row.

| Mode | How you get it | Start trigger |
| --- | --- | --- |
| **SNG (auto-start)** | Create without a future `scheduledStartAt`, or with a scheduled time **already in the past** | When registered count reaches `config.minPlayers`, the server sets the tournament to **`active`**, sets **`activated_at`**, and calls **`activateTournament`** from the join flow (after commit). |
| **Scheduled start** | Create with `scheduledStartAt` **in the future** | A row is inserted into `tournament_scheduled_events` with `event_type = 'poker_start'`. **`FreerollSchedulerService`** polls and calls **`PokerTournamentService.startScheduledPokerTournament`**: if registered count **&lt; `minPlayers`**, the event is **cancelled** and buy-ins **refunded**; otherwise **`activateTournament`** runs ( **`status → active`**, table created, first hand dealt). |

**Freeroll SNG (guaranteed pool):** `buy_in_amount = 0` with **`guaranteedPrizePool`** at create. Default: debit the **creator’s** `players.balance` and set **`prize_pool`**. Optional **`guaranteedPrizePoolSource = platform_promo`**: caller must be in **`ADMIN_WALLETS`**; server still debits the **creator’s** balance and leaves **`guaranteed_prize_funder_address`** null (cancel / under-min refunds go to the creator, same as default). Joins do **not** add to the pool. **`distributePrizes`** unchanged. Still `game_type = 'poker'`, not blackjack **`tournament_type = 'freeroll'`**.

**Not implemented for poker:** on-chain `MorbiusTournament` create/join for poker, custom prize tokens / escrow for poker, rebuys (`rebuy_config` is always `{ enabled: false }` on create), or multi-table merges.

---

## Core logic (server)

### Authoritative service

`server/src/services/poker-tournament.service.ts` — owns create, join, scheduled start, activation, per-hand sync, completion, cancel, and lobby summaries.

### Lifecycle

1. **Create** — Inserts into `tournaments` with `game_type = 'poker'`, `status = 'registration'`, `poker_config` JSON, buy-in, prize distribution type, fixed **2% creator / 3% platform** fee columns, **`prize_pool`** = **0** for paid buy-ins or **= `guaranteedPrizePool`** for **zero** buy-in (after debiting creator or promo wallet per **`guaranteedPrizePoolSource`**), optional **`guaranteed_prize_funder_address`**, optional `scheduled_start_at`, optional private PIN.
2. **Join** — In a DB transaction: validates registration, PIN, capacity; if **`buy_in_amount > 0`**, deducts it from `players.balance` and adds it to **`tournaments.prize_pool`**; inserts `tournament_entries` (status `playing`). If not a future scheduled start and `registeredCount >= minPlayers`, sets **`status = 'active'`** and **`activated_at`**, then after commit runs **`activateTournament`**.
3. **Activate** — Idempotent if a tournament table already exists. Sets **`active` + `activated_at`** when still in **`registration`**. Creates a `poker_tables` row with `tournament_id`, `tournament_mode = TRUE`, blinds scaled to on-table wei (`chip * 10^18`). Seats every entry via `PokerGameService.joinTableTournament`. Inserts `poker_tournament_seats` bridge rows. Starts the first hand. Broadcasts `poker_tournament_started` to room `poker_tournament:{id}`.
4. **Each completed hand** — `PokerGameService` post-hand callback invokes **`syncAfterHand(tableId, handNumber)`** (only while **`tournaments.status === 'active'`**):
   - Copies seat stacks from `poker_seats` into `tournament_entries.chips_remaining` (wei → integer chips).
   - Busts zero-stack players; broadcasts `poker_tournament_player_eliminated`.
   - Updates blinds: applies the **blind schedule** for `handNumber`, then multiplies **small_blind** and **big_blind** by **2^k** where **k** = number of players eliminated on that sync (speeds the SNG as the field shrinks). One **`poker_tournament_blind_level_up`** with the final chip amounts when anything changed.
   - **Nominal blinds vs short stacks:** **`@chevtek/poker-engine`** `Table.dealCards()` posts **all-in blinds** when nominal blinds exceed a stack (whole stack goes to `bet`). For **UX**, after schedule + elimination multiplier, **`syncAfterHand`** also **clamps** stored SB/BB so **nominal BB ≤ smallest eligible stack** (seats `active` / `in_hand`, not `sitting_out`), **only if** that smallest stack is **≥ 2 chips** (so SB can stay **&lt; BB** in chip units). If you bypass the server and set huge blinds in DB, the engine still deals (see **`11 - blinds vs short stacks`**). *(Tournament chip amounts are passed through the engine as JS numbers from wei-sized values — very large stacks can hit float precision limits; that is separate from the short-blind rule.)*
   - If at most one player remains **`playing`**, calls **`completeTournament`**.
5. **Complete** — **`distributePrizes`** first (requires **`active`** until it marks **`completed`**). On failure, **throws** so the **table is not removed** and the next post-hand sync can retry. On success: marks any remaining **`playing`** entries **`completed`**, syncs **`poker_tournament_seats.final_rank`** from **`tournament_entries`**, deletes the poker table, broadcasts `poker_tournament_completed`.
6. **Cancel** — Only from **`registration`**, only **creator**; refunds all `playing` entries’ buy-ins when **`buy_in_amount > 0`**; credits **`prize_pool`** to **`COALESCE(guaranteed_prize_funder_address, creator_address)`** for zero buy-in (paid tournaments unchanged: **creator**); sets tournament **`cancelled`**. Scheduled under-min uses the same rule and emits **`poker_tournament_cancelled`** with **`reason: 'insufficient_players'`**.

### Database objects

- **`poker_tables.tournament_mode`** — Cash vs tournament table behavior inside `PokerGameService`.
- **`poker_tournament_seats`** — Links `tournament_entries` to the single tournament table; stores elimination time and rank.
- **View `poker_tournament_registrations`** — Lobby list for `game_type = 'poker'` in `registration` or `active` (migrations **`063`**, **`064`**, **`093`** — **`093`** adds **`is_private`**).

### Prize math

Payouts use **`calculate_tournament_prizes(tournament_id)`** (see migration **`033`**) from **`prize_distribution_type`** and **`prize_pool`**. The JSONB **`prize_percentages`** written at create time is kept in sync with that function via **`getPrizePercentagesForType`** in `poker-tournament.service.ts`. **`calculate_tournament_prizes`** remains the source of truth for paid amounts.

---

## Frontend and WebSocket

**Lobby entry:** On `/poker`, open the **Tournaments** tab (or `/poker?tab=tournaments`). The sidebar under **Lobby** also switches **Cash games** vs **Tournaments**.

**Table HUD:** **`PokerTableState.tournamentId`** comes from **`poker_tables.tournament_id`**, so the HUD works on **`/poker/{tableId}`** even without a query string. The **`?tournament=`** param is still supported (and added after lobby join when applicable) so links stay explicit. The **`PokerTournamentHUD`** uses **`usePokerTableTournamentHud`**: room subscribe via **`poker_tournament_join`**, snapshot **`poker_tournament_get_state`**, refetch when the poker **`handId`** changes, and live updates from blind-up / elimination / complete / cancel events.

### Trace: display names (tournament HUD vs seat tags)

There is **one** canonical name field for humans: **`chat_display_names.display_name`** (per `wallet_address`). The legacy **`players`** row does not store a nickname.

| Step | Seat tags (poker table) | Tournament sidebar HUD |
| --- | --- | --- |
| 1 | `PokerGameService` builds seats, then calls **`DatabaseService.getProfiles(seatAddresses)`** (`poker-game.service.ts`). | **`PokerTournamentService.getTournamentState`** runs SQL on **`tournament_entries`** with **`LEFT JOIN chat_display_names cdn ON LOWER(cdn.wallet_address) = LOWER(te.player_address)`** (`poker-tournament.service.ts`). |
| 2 | Each seat gets **`seat.displayName = profile?.displayName ?? null`**. | Each player object includes **`displayName`** from **`cdn.display_name`** (trimmed; empty → `null`). |
| 3 | WS **`poker_table_state`** sends the full table payload to the client. | Client calls **`sendRequest('poker_tournament_get_state')`**; server answers with **`type: 'poker_tournament_state'`** and **`payload`** = full snapshot (`websocket.service.impl.js` → **`handlePokerTournamentGetState`**). |
| 4 | **`lib/websocket-client.ts`**: `sendRequest` resolves the promise with **`message.payload`** (same object that also emits **`poker_tournament_state`** to listeners). | Same. |
| 5 | **`PokerSeat`** shows **`seat.displayName?.trim() || shortAddr(...)`** (or **You** for self). | **`PokerTournamentHUD`** uses **`playerDisplayLabel`**: **`p.displayName?.trim()`** then **`shortAddr`**. |

So both surfaces read the **same DB column**. If the HUD shows addresses but seats show names, typical causes are: **stale server** (snapshot without `displayName`), **empty `display_name`** in DB (avatar-only row from **`setDefaultAvatarIfNull`** uses `''`), or **inspecting cached/old client state**. **`getProfiles`** now keys its result map by **normalized lowercase** so lookups always match **`normalizeAddress`** even if a legacy **`chat_display_names.wallet_address`** row used mixed case.

**Blind increase:** On `poker_tournament_blind_level_up`, the table page shows **`TournamentBlindIncreaseOverlay`**: large centered white type, no background, `pointer-events-none` (full UI stays clickable), fade in / slow fade out via `poker-tournament-blind-banner` in `app/globals.css`.

| Area | Location |
| --- | --- |
| Lobby UI | `components/poker/tournament/PokerTournamentLobby.tsx` |
| Client hook | `hooks/use-poker-tournament.ts` |
| WS message names | `lib/websocket-message-types.ts` (`poker_tournament_*`) |
| Server handler map | `server/src/services/websocket/poker-router.ts` |

**Subscribed room:** `poker_tournament:{tournamentId}` for started / blind-up / elimination / completed / cancelled events.

---

## Remaining gaps / follow-ups

- **On-chain / escrow poker** — not wired; all buy-ins are off-chain `players.balance`.
- **`lib/tournament-types.ts`** — PRIZE_PRESETS copy is for blackjack-style UI; payout splits are defined in SQL + server helpers.
- **Rebuys, multi-table** — not supported.

---

## Related files (quick index)

| Layer | Files |
| --- | --- |
| Service | `server/src/services/poker-tournament.service.ts` |
| Scheduler | `server/src/services/tournament.service.ts` (`executeScheduledEvent`, `poker_start` → `startScheduledPokerTournament`) |
| Poll loop | `server/src/services/freeroll-scheduler.service.ts` |
| Poker table behavior | `server/src/services/poker-game.service.ts` |
| Shared payout | `server/src/services/tournament.service.ts` (`distributePrizes`) |
| Schema | `063`, `064`, **`093`** (`poker_tournament_registrations` + `is_private`) |

---

## Operational notes

- Run migrations in order: `node server/run-migration.js migrations/<file>.sql` from repo root.
- Integration tests need `DATABASE_URL` in `server/.env` and migrations **through 093** for lobby fields (see `server/src/__tests__/README.md`).
