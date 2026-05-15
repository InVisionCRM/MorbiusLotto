# PokerFiles — Texas Hold'em on MORBlotto

Organized index of poker-related files plus current UI behavior notes for table/seat tuning. No code—reference only.

---

## Frontend — App routes

| File | Purpose |
| ---- | ------- |
| `app/poker-layout/page.tsx` | **Dev/reference**: visual map of `SEAT_ANCHOR_RING` + sampled slots for 2–10 seats (`/poker-layout`). Same data as `lib/poker-seat-layout.ts` / `PokerTable`. |
| `app/poker/page.tsx` | Lobby: **Cash games** (tables, create, join) and **Tournaments** (`PokerTournamentLobby`, SNG create/join); intro + WebSocket. Share link: `/poker?tab=tournaments`. Sidebar **Lobby** mirrors the two tabs. |
| `app/poker/[tableId]/page.tsx` | Table page: game state, PokerTable + PokerActions + PokerDepositModal; theme and layout. |

---

## Frontend — Components (`components/poker/`)

| File | Purpose |
| ---- | ------- |
| `PokerTable.tsx` | Main table container: authored `SEAT_ANCHOR_RING` (10-max) + ring mapping for fewer seats, board, pot, fold-to-center animation, sticky seat actions, showdown winner banner + chips slide. **All-in runout is driven by the server** (one broadcast per street). The client renders `hand.communityCards.length` and `hand.showdownHands` directly — no `setTimeout`-based staging here. |
| `PokerSeat.tsx` | Single seat: avatar, stack badge, acting timer ring, hole cards/card backs, role crescent (DEALER/SB/BB), winner crescent at showdown. |
| `PokerBoard.tsx` | Community cards and pot display (flop/turn/river + pot amount). |
| `PokerActions.tsx` | Action bar: fold / check / call / bet / raise with amount input; min-raise and to-call from server. |
| `CardDisplay.tsx` | Renders one card (index 0–51) or placeholder; pure CSS card faces (rank + suit text, no PNGs). Card backs still use branded PNG. |
| `PokerWinnerNotificationCard.tsx` | Showdown winner overlay: 3-column layout (amount won / WINNER name / hand rank), cards display, 15s countdown timer to next hand. Sized at `min(60vw, 480px)` to avoid covering player seats. |
| `PokerDepositModal.tsx` | Deposit/buy-in modal: PLS/MORBIUS, approval, Re-up; uses Blackjack escrow and WebSocket for add-chips. |
| `PokerThemeContext.tsx` | React context for current poker theme (classic / cyberpunk); `usePokerTheme()`. |
| `tournament/PokerTournamentLobby.tsx` | SNG list, create (paid / freeroll / scheduled / private), join, cancel; uses `usePokerTournament` + WebSocket. |
| `tournament/PokerTournamentHUD.tsx` | In-table overlay: blinds, prize pool, stacks, leaderboard; `usePokerTableTournamentHud` when `PokerTableState.tournamentId` or `?tournament=` is present. |

---

## Table UI conventions (current)

- **Seat callouts**: Use screen slot naming when discussing layout changes:
  - `S0` = hero/bottom center
  - `S1..S(n-1)` continue clockwise
  - Seats also expose `data-seat-slot` and `data-seat-position` in DOM for debugging.
- **Seat geometry**: `SEAT_ANCHOR_RING` in `PokerTable.tsx` defines **10** normalized `fx`/`fy` points — that is the canonical / max table. With **10** seats, display slots map **one-to-one** to those points. With **fewer than 10** seats in play, slots **sample** the same ring evenly (there is no alternate 6- or 8-seat coordinate table). `S1` and `S(n-1)` share hero `fy` after nudges when `n > 2`. Tuning: edit the ring and/or `SEAT_POSITION_NUDGE_PX` / `getSeatNudgePx`.
- **Role indicators** (`DEALER`, `SB`, `BB`): rendered as opaque inset crescents inside avatar circles (`PokerSeat.tsx`).
- **Winner indicator**: winner crescent appears only at resolved showdown (`street === showdown` and winners present), including split pots.
- **Action persistence**: seat action labels persist until that same seat acts again (sticky per-seat action state in `PokerTable.tsx`).
- **Fold visuals**: folded hole cards animate from seat to table center, then disappear and do not show at showdown.
- **Hand name badges**: compact cyan text badge between name/chips and action strip on each seat tag.
  - **Self badge**: always visible during a hand (flop onward shows best made hand, e.g. "Two Pair", "Flush"; preflop shows "Pair" for pocket pairs only). Computed client-side via `lib/poker-hand-eval.ts`.
  - **Showdown badges**: all revealed players show their final hand name at showdown. Winners use the server-provided `handName`; non-winners are evaluated client-side.
- **Winner confetti**: gold/white confetti fires via `canvas-confetti` (direct call, not the `Confetti` component) when the current player wins at showdown. Two staggered bursts at z-index 200.
- **Winner notification card**: 3-column header (amount won with Morbius logo | WINNER + name | Hand Rank label). Bottom section shows cards and a 15-second animated countdown bar to next hand. Sized at `min(60vw, 480px)` so player seats remain visible.
- **Landscape mobile**: supported via CSS-only overrides in `globals.css` (scoped to `@media (orientation: landscape)`). Header compresses, bottom bar collapses. Seat **fractions** are aspect-agnostic; pixel nudges scale with table width (`seatNudgeScale` in `PokerTable.tsx`). Do NOT add JS-based orientation logic — see safety comments in the source files.

---

## All-in runout (server-driven)

When the last voluntary action leaves no one with chips to act (everyone all-in or only one player left), `@chevtek/poker-engine` cascades through `nextRound → showdown` **in a single synchronous tick** — the full board + winners are determined in memory before any broadcast goes out.

Rather than ship one consolidated showdown message and let the client fake a cinematic reveal (the previous approach, which had a preflop-all-in reconnect-heuristic bug), the server now **paces** the reveal by emitting separate broadcasts for each street the runout dealt.

### Server pacing (`scheduleRunout` in `poker-game.service.ts`)

| Step | Broadcast | DB writes | Wait before next |
| ---- | --------- | --------- | ---------------- |
| 0 | (runout begins) | `runout_resolved_at = NOW()`, `runout_final_community_cards = [c0..c4]`, seat stacks synced | `RUNOUT_STEP_DELAY_MS.toFlop` (2000 ms) |
| 1 | `street = 'flop'` with 3 cards | `poker_hands.street`, `community_cards` | `toTurn` (2000 ms) |
| 2 | `street = 'turn'` with 4 cards | `poker_hands.street`, `community_cards` | `toRiver` (1500 ms) |
| 3 | `street = 'river'` with 5 cards | `poker_hands.street`, `community_cards` | `toShowdown` (600 ms) |
| 4 | `street = 'showdown'` with winners, rake-adjusted stacks, full `result` | `completed_at = NOW()` via `persistShowdown` | (schedules next-hand timer) |

Steps already on the board pre-all-in are skipped (e.g. a turn all-in only emits river + showdown). A river all-in (no remaining streets) bypasses the chain entirely and `persistShowdown` runs inline.

### Hole-card exposure

`showdownHands` is populated as soon as `runout_resolved_at IS NOT NULL` — i.e. *immediately* when the all-in locks, before any flop/turn/river frame is published. This matches real-poker UX: cards face up first, dealer runs out the board next. Folded players are excluded from `showdownHands` during the runout (they're added back at the final showdown frame if `handWentToShowdown` is true).

### Mid-runout edge cases

- **Player leaves mid-runout** (`_leaveTable` / `leaveTableTournament`): `finalizeRunoutImmediately(tableId)` collapses any in-flight runout to the showdown frame *before* the seat row is deleted, so the leaving player's all-in winnings are credited to their seat balance and the cash-out reflects the real outcome. Remaining viewers see the runout collapse to showdown instantly — acceptable trade-off vs forfeiting committed pot share.
- **Server crash mid-runout** (between `runout_resolved_at` and `completed_at`): the existing self-healing sweep `recoverStuckPostHandTables` has a second clause that finds rows with `runout_resolved_at IS NOT NULL AND completed_at IS NULL AND runout_resolved_at < NOW() - INTERVAL '30 seconds'`, reconstructs the chevtek table, and calls `persistShowdown` to finalize. Threshold is well past the ~6s wall-clock budget for a normal preflop runout.
- **Reconnect mid-runout**: the WS client subscribes to `poker:table:{tableId}` and receives the *current* state on the next broadcast — whichever street the server has reached. No client-side reconciliation needed.

### Tests

- [`server/src/__tests__/poker/poker-server-runout.test.ts`](../../server/src/__tests__/poker/poker-server-runout.test.ts) verifies the per-street frame sequence, hole-card exposure during runout, timer-driven completion, and leaveTable mid-runout.
- The pacing collapses to a single inline `persistShowdown` call when `NODE_ENV === 'test'` (default) so existing showdown-completion tests keep their fast/synchronous assertions. Tests that *want* to observe the pacing call `pokerGameService.setRunoutDelaysForTesting(true)` in `beforeAll`.

---

## Provably-fair shuffle

Every hand's deck is deterministically derived from an HMAC-SHA256 Fisher-Yates shuffle of a per-hand `serverSeed` + `clientSeed`. Chevtek's `Math.random()` shuffle is bypassed — the deck is locked in at hand start, the commitment (hash) is recorded immediately, and the plaintext seed stays hidden until showdown. After the hand, any third party can independently re-run the same shuffle and verify the deal wasn't rigged.

### Protocol (per hand)

| When | What happens |
| ---- | ------------ |
| Hand start | `serverSeed = randomBytes(32)`, `serverSeedHash = SHA256(serverSeed)`, `clientSeed = randomBytes(16)`. Deck = `pfService.fisherYatesShuffle(serverSeed, clientSeed, 0)` — 52 ints (0–51). `table.newDeck` is overridden to return this deck before `dealCards()` is called. `poker_hands` is INSERTed with `server_seed_hash` + `client_seed`; `server_seed` stays NULL. Plaintext seed is INSERTed into `poker_hand_pending_seeds` in the **same transaction**. |
| During the hand | `poker_hands.server_seed` is NULL — even if the DB leaks, the plaintext lives only in `poker_hand_pending_seeds`. |
| Showdown (`persistShowdown`) | The plaintext is moved from `poker_hand_pending_seeds` → `poker_hands.server_seed`, and the pending row is deleted. Same transaction also sets `completed_at`. |
| After showdown | `GET /api/poker/verify/:handId` returns the full proof. |

### Card encoding

- `rank = idx % 13` where `0=2, 1=3, … 9=J, 10=Q, 11=K, 12=A`
- `suit = floor(idx / 13)` where `0=clubs, 1=diamonds, 2=hearts, 3=spades`

Chevtek pops from the **end** of the deck array, so `deck.indices[51]` is dealt first. The verify endpoint also returns `dealOrder` (the deck reversed) for human-readability.

### Verify endpoint

`GET /api/poker/verify/:handId` returns:

```jsonc
{
  "handId": "uuid",
  "handNumber": 42,
  "completedAt": "2026-…",
  "verifiable": true,
  "commitment": { "serverSeedHash": "sha256-hex" },
  "reveal":     { "serverSeed": "<plaintext>", "clientSeed": "…", "nonce": 0 },
  "deck":       { "indices": [42, 7, 51, …], "dealOrder": […], "encoding": "…" },
  "players":    [{ "address": "0x…", "holeCards": [42, 7] }, …],
  "communityCards": [4, 11, 25, 17, 33],
  "actions":    [{ "order": 1, "street": "preflop", "action": "blind", "amount": "10", … }, …],
  "result":     { "winners": [{ "address": "0x…", "amount": "200", "handName": "Two Pair" }] },
  "howToVerify": ["1. …", "2. …"]
}
```

Returns 404 with a clear message if the hand isn't complete, doesn't exist, or has no revealed seed.

### Reference implementation

Both the shuffle and the hash live in [`server/src/services/provably-fair.service.ts`](../../server/src/services/provably-fair.service.ts):

- `fisherYatesShuffle(serverSeed, clientSeed, nonce)` — the deck function.
- `createServerSeedHash(serverSeed)` — SHA256 hex (also used by blackjack).
- `hmacByteStream(...)` + `bytesToFloat(...)` — the underlying RNG primitives, Stake-style.

### Tests

[`server/src/__tests__/poker/poker-provably-fair.test.ts`](../../server/src/__tests__/poker/poker-provably-fair.test.ts) covers: plaintext hidden mid-hand, seed revealed at showdown, hash matches, full deck reproducible from the revealed seed, and the hole-card + community deal sequence matches the deck pop order.

### Anti-pattern warning

Do **not** call `table.dealCards()` without first overriding `table.newDeck`. The chevtek default uses `Math.random()` and produces a non-deterministic deck that breaks verification. New hand-start paths must route through `pfService.fisherYatesShuffle` the same way `startHand` does.

## Frontend — Shared / home (poker-related)

| File | Purpose |
| ---- | ------- |
| `components/home/FloatingPokerChips.tsx` | Marketing: floating animated poker chips on home/marketing. |
| `lib/poker-themes.ts` | Theme definitions and CSS variable names (classic, cyberpunk); used by poker components. |
| `lib/poker-layout.ts` | Layout types and helpers: table/seat/community/pot/actionBar/chat rects; `defaultPokerLayout` export. |
| `lib/websocket-client.ts` | WebSocket client: poker types (`PokerTableSummary`, `PokerSeatState`, `PokerCurrentHand`, `PokerTableState`) and API (`pokerListTables`, `pokerJoinTable`, `pokerLeaveTable`, `pokerAddChips`, `pokerAction`, `pokerGetState`, `pokerCreateTable`). |
| `lib/poker-hand-eval.ts` | Client-side Texas Hold'em hand evaluator (ported from server with plain enum). Used for live self-badge and showdown hand names. Exports `bestHand`, `handRankToName`, `evaluateHoleCards`. |
| `app/poker/[tableId]/PokerMobileZoomLock.ts` | Prevents pinch-zoom on mobile poker. Zoom only — does NOT handle orientation (see CSS). |

---

## Backend — Services

| File | Purpose |
| ---- | ------- |
| `server/src/services/poker-game.service.ts` | Game authority: table lifecycle, join/leave, deal, streets, actions (fold/check/call/bet/raise), showdown; DB reads/writes; hand progression and turn timer. |
| `server/src/services/poker-hand-eval.ts` | Texas Hold'em hand evaluation: rank 0–51 cards, HandRank enum, best hand, compare hands, winners (high card through straight flush). |
| `server/src/services/websocket.service.ts` | WebSocket server: routes poker messages (`poker_list_tables`, `poker_join_table`, `poker_leave_table`, `poker_add_chips`, `poker_action`, `poker_get_state`, `poker_create_table`), broadcasts `poker_table_state`. |

---

## Backend — Scripts

| File | Purpose |
| ---- | ------- |
| `server/src/scripts/poker-bot.ts` | CLI bot: join table(s), play automatically (tight-aggressive preflop, semi-random postflop); 1–5 bots; uses WebSocket and optional DB for balance. |

---

## Backend — Database migrations

| File | Purpose |
| ---- | ------- |
| `server/migrations/036_poker_tables.sql` | Base schema: `poker_tables`, `poker_seats`, `poker_hands`, hand actions, chip amounts as NUMERIC(78,0), card indices 0–51. |
| `server/migrations/052_poker_blind_action.sql` | Adds `blind` to `poker_hand_actions` action check (for SB/BB posting). |
| `server/migrations/055_poker_last_raise_size.sql` | Adds `last_raise_size` to `poker_hands` for min re-raise on current street. |
| `server/migrations/056_poker_turn_timer.sql` | Adds `turn_started_at` to `poker_hands` for server-side 30s turn timer. |
| `server/migrations/116_poker_hands_post_hand_processed_at.sql` | Adds `post_hand_processed_at` marker + partial index for `recoverStuckPostHandTables` (post-showdown sweep). |
| `server/migrations/118_poker_hands_runout_state.sql` | Adds `runout_resolved_at` + `runout_final_community_cards` to `poker_hands` for the server-driven all-in runout. Partial index `idx_poker_hands_runout_in_progress` keeps the recovery sweep cheap. |
| `server/migrations/119_poker_hand_pending_seeds.sql` | Adds `poker_hand_pending_seeds` table to hold the plaintext server seed during a live hand. Seed moves into `poker_hands.server_seed` at showdown — see "Provably-fair shuffle" above. |

---

## Summary

- **UI**: `app/poker/*` + `components/poker/*` + `lib/poker-*.ts`, `lib/websocket-client.ts` (poker types/API).
- **Seat/board behavior**: primarily coordinated in `PokerTable.tsx` + `PokerSeat.tsx`.
- **Logic**: `server/src/services/poker-game.service.ts` + `poker-hand-eval.ts`; WebSocket in `websocket.service.ts`.
- **Data**: Migrations 036 (base), 052 (blind), 055 (last_raise_size), 056 (turn_started_at), 116 (post_hand_processed_at), 118 (runout_resolved_at + runout_final_community_cards), 119 (poker_hand_pending_seeds).
- **Tooling**: `server/src/scripts/poker-bot.ts` (bots).
- **Mobile/PWA**: landscape support via CSS in `globals.css`; PWA via `@serwist/next` (`app/sw.ts`, `next.config.ts` wrapper); manifest at `public/icons/site.webmanifest`.
