# PokerFiles — Texas Hold'em on MORBlotto

Organized index of poker-related files plus current UI behavior notes for table/seat tuning. No code—reference only.

---

## Frontend — App routes

| File | Purpose |
| ---- | ------- |
| `app/poker/page.tsx` | Lobby: **Cash games** (tables, create, join) and **Tournaments** (`PokerTournamentLobby`, SNG create/join); intro + WebSocket. Share link: `/poker?tab=tournaments`. Sidebar **Lobby** mirrors the two tabs. |
| `app/poker/[tableId]/page.tsx` | Table page: game state, PokerTable + PokerActions + PokerDepositModal; theme and layout. |

---

## Frontend — Components (`components/poker/`)

| File | Purpose |
| ---- | ------- |
| `PokerTable.tsx` | Main table container: computed seat anchors, board, pot, fold-to-center animation, sticky seat actions, showdown winner banner + chips slide. |
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
- **Role indicators** (`DEALER`, `SB`, `BB`): rendered as opaque inset crescents inside avatar circles (`PokerSeat.tsx`).
- **Winner indicator**: winner crescent appears only at resolved showdown (`street === showdown` and winners present), including split pots.
- **Action persistence**: seat action labels persist until that same seat acts again (sticky per-seat action state in `PokerTable.tsx`).
- **Fold visuals**: folded hole cards animate from seat to table center, then disappear and do not show at showdown.
- **Hand name badges**: compact cyan text badge between name/chips and action strip on each seat tag.
  - **Self badge**: always visible during a hand (flop onward shows best made hand, e.g. "Two Pair", "Flush"; preflop shows "Pair" for pocket pairs only). Computed client-side via `lib/poker-hand-eval.ts`.
  - **Showdown badges**: all revealed players show their final hand name at showdown. Winners use the server-provided `handName`; non-winners are evaluated client-side.
- **Winner confetti**: gold/white confetti fires via `canvas-confetti` (direct call, not the `Confetti` component) when the current player wins at showdown. Two staggered bursts at z-index 200.
- **Winner notification card**: 3-column header (amount won with Morbius logo | WINNER + name | Hand Rank label). Bottom section shows cards and a 15-second animated countdown bar to next hand. Sized at `min(60vw, 480px)` so player seats remain visible.
- **Landscape mobile**: supported via CSS-only overrides in `globals.css` (scoped to `@media (orientation: landscape)`). Header compresses, bottom bar collapses, seat anchors adapt to aspect ratio. Do NOT add JS-based orientation logic — see safety comments in the source files.

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

---

## Summary

- **UI**: `app/poker/*` + `components/poker/*` + `lib/poker-*.ts`, `lib/websocket-client.ts` (poker types/API).
- **Seat/board behavior**: primarily coordinated in `PokerTable.tsx` + `PokerSeat.tsx`.
- **Logic**: `server/src/services/poker-game.service.ts` + `poker-hand-eval.ts`; WebSocket in `websocket.service.ts`.
- **Data**: Migrations 036 (base), 052 (blind), 055 (last_raise_size), 056 (turn_started_at).
- **Tooling**: `server/src/scripts/poker-bot.ts` (bots).
- **Mobile/PWA**: landscape support via CSS in `globals.css`; PWA via `@serwist/next` (`app/sw.ts`, `next.config.ts` wrapper); manifest at `public/icons/site.webmanifest`.
