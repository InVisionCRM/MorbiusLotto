# Rock‑Paper‑Scissors — Table Mini‑Game Build Plan

A folded player challenges another folded player to RPS without leaving the felt. It **reuses the "throwables" (directed‑emote) system you just shipped** — same avatar radial, same player→player websocket pattern, same emoji‑toss animation — so this is mostly one new message type plus a dock panel, not a new system.

**The flow:** click a folded opponent's avatar → pick "Rock Paper Scissors" from the existing radial → they get an Accept / Deny prompt → on accept, both players get an RPS panel in the dock (scoreboard + 🪨 📄 ✂️) → each locks a pick → both emojis fling up over their seats *at the same time* → scoreboard updates → Play again / Close.

---

## v1 scope (assumptions — say the word to flip any)

- **Purely for fun — never for stakes.** No MORBIUS, chips, or anything of value is ever involved, by design. The scoreboard is just a running W–L for bragging rights.
- **Fully ephemeral — no database.** Match state lives in server memory for the life of the duel. (Persisting lifetime W–L is an optional nicety later — still no stakes.)
- **Both players must be out of the live hand** (folded, sitting out, or between hands). Your spec required the *challenged* player to be folded; I extended it to the *challenger* too — a player mid‑decision shouldn't be flicking RPS. Same goal: never disrupt live poker.
- **Open‑ended scoreboard.** No "first to N." Rounds continue until someone hits Close (or a new hand starts / a player stands up).

These keep it dead simple.

---

## Build status (handoff — updated 2026-06-05)

**Done — the categorized avatar wheel (declutter + RPS entry point), NOT yet type-checked:**
- `components/poker/PokerSeat.tsx` (desktop/landscape seat): the opponent avatar click now opens a paged wheel — top ring Emotes / Throw / Games / Player, each a sub-ring led by a `_back` wedge (reuses the existing `playerRadialPage` paging). Added `opponentRadialPage` state; `opponentMainMenuItems` / `opponentPlayerRingItems` / `opponentMenuItems` memos; module consts `POKER_EMOTE_KINDS` / `POKER_THROW_KINDS` / `OPPONENT_*_RING_ITEMS`; rewrote `handleOpponentEmoteSelect` to navigate pages or fire the leaf; added prop `onChallengeRps?: (toSeatIndex: number) => void`. Right-click menu (`onOpponentRadialAction`) untouched; the Player wedge reuses `onOpponentClick` + `onOpponentRadialAction`. Added imports `Gamepad2`, `Hand` and `POKER_DIRECTED_EMOTES`.
- `components/ui/radial-menu.tsx`: added `SLICE_HEX` colors for `cat:emotes`, `cat:throw`, `cat:games`, `cat:player`, `rps`. No structural change.
- `components/poker/PokerPortraitSeat.tsx` (mobile/portrait seat): kept the flat 7-item quick ring; added a single 🎮 Games wedge that launches RPS, gated by a new prop `onChallengeRps?: () => void`. Added `canChallenge` / `canOpenWheel`.

**Gating:** the Games wedge (desktop) and 🎮 wedge (mobile) only render when `onChallengeRps` is provided. Nothing wires it yet, so they stay hidden until the next batch — the desktop Emotes/Throw/Player declutter is live now.

**Verify first (sandbox was down last session, so edits were never compiled):**
`npx tsc --noEmit 2>&1 | grep -E 'PokerSeat\.tsx|radial-menu\.tsx|PokerPortraitSeat\.tsx'` → no output = clean. Then `npm run dev` and click an opponent avatar.

**Done — RPS server core (✅ type-checked + 16 unit tests passing, 2026-06-05):**
- `server/src/services/poker-rps.ts` *(new)*: pure `resolveRps(a,b)` + `RpsRegistry` (timer-free, DB-free state machine: create/respond/pick/cancelRound/leave/leaveByAddress, one-match-per-address, server-authoritative reveal). Extracted so it's unit-testable without booting WS/DB.
- `server/src/__tests__/poker/poker-rps.unit.test.ts` *(new)*: resolver truth table + registry lifecycle (16 tests, all green).
- `server/src/services/websocket/message-types.ts` + `poker-router.ts`: added the 4 inbound `poker_rps_*` types + handler map.
- `server/src/services/websocket.service.impl.js`: `handlePokerRpsChallenge/Respond/Pick/Leave` mirroring `handlePokerDirectedEmote` + out-of-hand gate (`rpsEligibility`: `!currentHand || street==='showdown' || seat.folded`), per-connection 4 s cooldown, 20 s challenge / 15 s one-sided-pick timeouts, in-memory registry, targeted single-client send (`sendToPlayerAddress`) for the challenge, reveal broadcast to the table room. Disconnect + stand-up teardown via `endRpsMatchForAddress` (peer's dock closes).
- **Contract note / minor extension:** added one outbound type **`poker_rps_round_cancelled` `{ matchId, reason }`** (not in the original contract) for the one-sided-pick / pick-timeout case — the documented contract had no round-cancel event, only match-`ended`. The match stays ACTIVE after a cancelled round (matches the state-machine loop). Hand-start teardown is **client-driven** for v1: when a client sees itself un-folded in a new hand it should `poker_rps_leave` (no hook into `poker-game.service` needed).

**Done — client wiring + UI (✅ type-checked + lint clean, 2026-06-05):**
- WS plumbing: `lib/websocket-message-types.ts` (4 `pokerRps*` type keys + 7 outbound events in `WS_KNOWN_EVENT_TYPES`), `lib/websocket-client.ts` (`sendRpsChallenge/Respond/Pick/Leave`; respond carries optional `challenges_off` reason).
- `lib/poker-rps.ts` *(new)*: client choice constants (emoji/labels) + reveal duration.
- `hooks/use-poker-rps-challenges.ts` *(new)*: localStorage toggle `poker:rps-challenges:v1` (default on, cross-tab sync).
- `app/poker/[tableId]/use-poker-rps.ts` *(new)*: the client brain — subscribes to all 7 `poker_rps_*` events, holds the live match + incoming-challenge state + reveal flights, exposes `onChallengeRps`/accept/deny/pick/playAgain/leave, auto-declines when toggled off, fires the **sonner Accept/Deny prompt**, and does **client-driven hand-start teardown** (leaves when dealt back in).
- `onChallengeRps` threaded `page.tsx` → `PokerTableView` → `PokerTable` → **both** seat components (desktop `(idx)`, portrait bound to seat). `rps.revealFlights` threaded the same path.
- `components/poker/PokerRpsDock.tsx` *(new)*: floating dock — scoreboard + 🪨📄✂️ pick buttons (lock → "waiting…") + simultaneous result + Play again / Close. Muted-slate / single-cyan idiom (no gold — RPS has no chips); rendered beside `PokerShowdownDock` in `page.tsx`.
- Reveal animation: `PokerTable` renders `rpsRevealFlights` — each pick's emoji flings straight up over its seat at the same moment (mirrors the emote toss; rail sees it via the room broadcast).
- Settings: "Accept Rock-Paper-Scissors challenges" toggle added to `PokerTableSettingsModal.tsx` (Mini-games section).

**Status: feature-complete for v1, pending a real two-client playtest** (challenge → accept/deny → toggle-off auto-decline → both-pick reveal → pick timeout → new-hand cancel). Not yet visually verified in a running app — the dock/reveal need a live render + your eyes.

---

## Player experience (faithful to your spec)

1. **Initiate.** Click a folded opponent's avatar → the wheel opens → **Games → Rock paper scissors** (see *Avatar menu* below). Selecting it fires the challenge; a toast explains if either of you is still in the hand.
2. **Notify.** The opponent gets a `sonner` toast: **"{name} wants to play Rock Paper Scissors"** with **Accept** / **Deny**. If they've toggled challenges off, their client auto‑declines silently and the challenger sees "not accepting challenges."
3. **Play.** On Accept, **both** docks show the RPS panel: a **scoreboard (0–0)** and three buttons **🪨 📄 ✂️**.
4. **Lock.** Each player taps a choice. Their button locks and shows "waiting for opponent…". Neither pick is sent to the other client yet.
5. **Reveal (simultaneous).** Once the server has both picks, it reveals together: each chosen emoji **flings up over its seat at the same timestamp** (reusing the throwables emote‑toss animation). Winner resolves, **scoreboard increments**.
6. **Continue.** Panel shows the result with **Play again** / **Close**. Either Close ends the match.

---

## State machine

```
            challenge                 accept                 both picks in
 (idle) ───────────────▶ PENDING ───────────────▶ ACTIVE ───────────────▶ REVEAL
   ▲                        │ deny / timeout / off    │ pick timeout            │
   │                        ▼                         ▼                         │ score++
   └──────────── cancel ◀── (notify challenger) ◀──── (round cancelled) ◀───────┘
                                                                   Play again ─▶ ACTIVE
                                                                   Close / leave ─▶ idle
```

**Timeouts:** challenge auto‑declines after ~20 s of no response; a pick phase cancels the round (no score change) after ~15 s. Both mirror the timer patterns already used for projectile lifetimes / chat.

---

## Fairness

**Server‑authoritative simultaneous reveal**: each client sends its pick to the server, the server holds both and broadcasts the reveal only once both are in. No client ever sees the other's choice early. Since nothing of value is ever at stake, cryptographic commit‑reveal is unnecessary — the trusted server (it already holds everyone's hole cards) holding both picks is enough.

---

## Avatar menu: categorized wheel

The opponent menu is overloaded (emotes + throwables + profile ≈ 12 flat wedges), so **before** adding RPS we reorganize it into a **two‑level wheel** — the exact paging your own‑player menu already uses (`playerRadialPage: 'main' | 'expressions'` + a `_back` wedge). No new component: `RadialMenuFloating` is stateless and just renders whatever `menuItems` array it's handed; "paging" is swapping that array.

**Top ring (4 wedges):**
- 😀 **Emotes** → sub‑ring of reactions (haha, love, gg, nice, boo, fire, dance, money)
- 🎯 **Throw** → sub‑ring of throwables (arrow, snowball, tomato, slap)
- 🎮 **Games** → sub‑ring of mini‑games (Rock paper scissors; room to grow)
- 👤 **Player** → profile / follow / gift

Each sub‑ring leads with a `_back` wedge (mirrors the existing `emotionMenuWithBack`). This also **folds today's right‑click menu** (`OPPONENT_RADIAL_ITEMS`: profile/follow/gift) into the Player wedge — one entry point instead of click‑vs‑right‑click.

**Mechanism (mirrors the player paging in `PokerSeat.tsx`):**
- add `opponentRadialPage` state: `'main' | 'emotes' | 'throw' | 'games' | 'player'`
- `menuItems` = a map from page → item array (top ring, or a sub‑ring prefixed with `_back`)
- in the select handler: `_back` → page `'main'`; a category id → set that page (don't close); a leaf id → fire the action (`onSendDirectedEmote` / `onOpponentClick` / `sendRpsChallenge`) and close
- top ring uses `showLabels` (4 big labeled wedges); sub‑rings keep the current emote‑ring styling
- add the new wedge ids to `SLICE_HEX` in `radial-menu.tsx` so each category gets its own hue (new ids currently fall back to the default yellow)

**RPS eligibility:** `RadialMenuItem` has no `disabled` field, so the Games → RPS wedge is always present; tapping it while either player is in the live hand fires a `sonner` toast ("you can play once you're both out of the hand") instead of a challenge. One code path, no disabled‑state styling.

---

## Build map (exact integration points)

### Client

| File | Change |
|---|---|
| `lib/websocket-message-types.ts` | Add type constants: `poker_rps_challenge`, `poker_rps_respond`, `poker_rps_pick`, `poker_rps_leave`. |
| `lib/websocket-client.ts` | Add `sendRpsChallenge(tableId, toSeatIndex)`, `sendRpsRespond(matchId, accept)`, `sendRpsPick(matchId, choice)`, `sendRpsLeave(matchId)` — mirror existing `sendPokerDirectedEmote`. |
| `components/poker/PokerSeat.tsx` | Reorganize the opponent wheel into categories (see *Avatar menu* above) via a new `opponentRadialPage` state, and add **Rock paper scissors** to the Games sub‑ring. On select → `sendRpsChallenge` (or a `sonner` toast if either player is still in the hand). |
| `components/ui/radial-menu.tsx` | Add the four category ids + `rps` to `SLICE_HEX` for distinct wedge colors. No structural change — the component already renders any `menuItems` array. |
| `app/poker/[tableId]/PokerSeatOverlays.ts` (or new `PokerRps.ts` hook) | Subscribe to the `poker_rps_*` events (mirror the `onDirectedEmote` listener ~L166–216); hold client match state; trigger the reveal animation. |
| `components/poker/PokerRpsDock.tsx` *(new)* | The dock panel: opponent name, **scoreboard**, 🪨 📄 ✂️ buttons, locked/waiting state, result, Play again / Close. Render beside `PokerShowdownDock` in `app/poker/[tableId]/page.tsx`. |
| incoming‑challenge prompt | `sonner` toast with `action` (Accept) + a Deny button (`toast(msg, { action, cancel, duration })`). |
| `hooks/use-poker-rps-challenges.ts` *(new)* | localStorage toggle `poker:rps-challenges:v1` (default on), following `use-poker-sounds.ts`. When off, auto‑respond `{accept:false, reason:'challenges_off'}` and suppress the prompt. Add the toggle to `PokerTableSettingsModal.tsx`. |
| reveal animation | Reuse the Framer‑Motion emote‑bubble path in `PokerTable.tsx` (~L1521–1542) to toss `🪨/📄/✂️` up from each seat at the same time. |

### Server

| File | Change |
|---|---|
| `server/src/services/websocket/message-types.ts` | Add the four inbound types to `WS_POKER_MESSAGES`. |
| `server/src/services/websocket/poker-router.ts` | Map them to handlers in `POKER_MESSAGE_HANDLER_MAP`. |
| `server/src/services/websocket.service.impl.js` | Add `handlePokerRpsChallenge / Respond / Pick / Leave`. Reuse the `handlePokerDirectedEmote` validation (sender seated via `ws.playerAddress`, target occupied, not self) and **add the out‑of‑hand gate + rate limit**. Hold an in‑memory match registry. Send the challenge to the **target only**; broadcast the **reveal to the table room** (`broadcastToRoom('poker:table:'+tableId, …)`) for spectacle. |

**In‑memory state (server):**
```js
RpsMatch { id, tableId,
  a: { address, seatIndex, pick: null },
  b: { address, seatIndex, pick: null },
  scoreA, scoreB, status, timers }
matches      = Map<matchId, RpsMatch>
matchByAddr  = Map<address, matchId>   // enforce one active match per player
```

**Out‑of‑hand gate (server, authoritative):**
```js
const st  = await pokerGameService.getTableState(tableId, null);
const seat = st.seats.find(s => s.playerAddress?.toLowerCase() === addr);
const eligible = !!seat && (seat.folded || /* no hand in progress */ st.isIdle);
```

**Rate limit:** per‑connection cooldown (`ws.lastRpsChallengeAt`, ~4 s) + per‑address sliding window (reuse the chat limiter, e.g. 10/min).

### Database

**None in v1.** (See deferred phases.)

---

## WebSocket event contract

**Inbound (client → server)**
- `poker_rps_challenge` `{ tableId, toSeatIndex }`
- `poker_rps_respond` `{ matchId, accept }`
- `poker_rps_pick` `{ matchId, choice: 'rock'|'paper'|'scissors' }`
- `poker_rps_leave` `{ matchId }`

**Outbound (server → client)**
- `poker_rps_challenge` → *target only* `{ matchId, tableId, fromSeatIndex, fromName }`
- `poker_rps_declined` → *challenger* `{ matchId, reason: 'declined'|'busy'|'challenges_off'|'timeout' }`
- `poker_rps_started` → *both* `{ matchId, aSeatIndex, bSeatIndex, scoreA, scoreB }`
- `poker_rps_picked` → *both* `{ matchId, seatIndex }` (ack only — choice not leaked)
- `poker_rps_reveal` → *both + table room* `{ matchId, aSeatIndex, aChoice, bSeatIndex, bChoice, winnerSeatIndex|null, scoreA, scoreB }`
- `poker_rps_ended` → *both + room* `{ matchId, reason }`

---

## Edge cases & anti‑abuse

- **Invalid targets:** self, empty seat, or a player in the live hand → server rejects; radial item hidden client‑side.
- **One match per player:** a new challenge while busy returns `declined: busy`.
- **Decline / timeout / challenges‑off:** challenger gets a clean toast.
- **Hand starts / player stands up / disconnects mid‑match:** server cancels (`ended: hand_started` / `peer_left`) and the dock closes — necessary because `folded` resets every hand.
- **One‑sided pick:** if only one player picks within the window, the round is cancelled with no score change.
- **Spam:** the cooldown + sliding window stop challenge flooding.

---

## Build checklist (in order)

1. Message‑type constants (client + server).
2. Server handlers + in‑memory registry + timers + out‑of‑hand gate + rate limit. **Unit‑test the resolver** (rock→scissors→paper→rock; draws).
3. Client WS methods + listeners + client match state.
4. `PokerRpsDock.tsx` panel (scoreboard + pick buttons + result).
5. Radial item (eligibility‑gated) + `sonner` Accept/Deny prompt.
6. Reveal animation (reuse emote toss).
7. Settings toggle (`use-poker-rps-challenges` + modal).
8. **Two‑client playtest:** challenge, accept, deny, toggle‑off, both‑pick reveal, pick timeout, new‑hand cancel.

---

## Optional later (still just for fun)

- **Persistent bragging rights.** If you ever want lifetime / head‑to‑head W–L to survive past a single sitting, add `server/migrations/146_rps_matches.sql` (idempotent, `IF NOT EXISTS`; players keyed by `wallet_address`), write one row per round via `database.service.ts`, and surface the record in `PokerStatsModal`. Still no stakes — just a scoreboard with memory.

---

## Confirm at implementation time

- The exact **"hand in progress / table idle"** field on `getTableState` for the out‑of‑hand gate. `seat.folded` is confirmed; the between‑hands flag needs a quick check (it likely lives on the table phase/street).
- The **single‑player targeted send** helper — filter `roomToClients.get('poker:table:'+tableId)` by `playerAddress` to deliver the challenge to just the target (the reveal uses the existing `broadcastToRoom`).
