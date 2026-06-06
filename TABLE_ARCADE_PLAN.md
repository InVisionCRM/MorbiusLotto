# Table Arcade — Shared Real-Time Mini-Game Engine + 4 Party Games

Fast, physical, no-thinking party games the whole table plays between hands. **Bragging-rights only — never any MORBIUS, chips, or stakes, by design** (same rule as RPS). Fully ephemeral: all state lives in server memory for the life of a round.

This is **one shared engine** with four tiny rule-sets plugged in. The engine handles the lifecycle, the server-authoritative tick, anti-cheat, and the spectator broadcast; each game just answers "what does a tap do" and "who won."

---

## The four games

| Game | Players | One-line rule |
|------|---------|---------------|
| **Tug-of-War** (`tug`) | 1v1 or two teams | Mash to pull the rope; first side past the line wins. |
| **Quick Draw** (`quickdraw`) | everyone | Wait for **GO**, first valid tap wins; tapping early = out. |
| **Mash Sprint** (`sprint`) | everyone | Mash to fill your bar 0→100; first to 100 wins. |
| **Hot Potato** (`potato`) | everyone | Tap to pass the bomb; whoever holds it when the hidden fuse blows is out — last one standing wins. |

---

## Shared engine (the part worth building well)

### Lifecycle (mirrors RPS)
`pending` (invite sent / open lobby) → `countdown` (3·2·1) → `active` (tick loop) → `ended` (winner + scoreboard). One arcade match per player at a time (you can't be in two).

- **1v1 games** (`tug` 1v1): challenge a specific seat → Accept/Deny, exactly like RPS.
- **Whole-table games**: the initiator opens a lobby; other seated players get a "Join the [game]?" prompt with a short window; everyone who joins is in. Minimum 2 to start.
- **Eligibility:** out of the live hand (folded / sitting out / between hands), same `rpsEligibility` gate — never disrupt live poker.

### Server-authoritative tick (the anti-cheat spine)
The **server is the judge**. Clients only send *intent* (`tap`); they never report scores or positions.

- While `active`, the WS service runs a **tick interval (~100 ms)** per match. Each tick: drain each player's buffered taps, apply them through the game's reducer **with a per-player rate cap**, advance state, check for a winner, and broadcast `arcade_state` to the **whole table room** so the rail sees it live.
- **Rate cap** kills autoclickers/macros: a player's taps are capped at `MAX_TAPS_PER_TICK` (e.g. 4 per 100 ms ≈ 40/s) — mashing faster than a human gains nothing. Buffered taps over the cap are discarded, not banked.
- The pure engine (`table-arcade.ts`) holds **no timers and no sockets** — it exposes `applyInput` / `tick(now)` / `computeWinner` as pure transitions (unit-testable). The WS service owns all `setInterval`/`setTimeout` and broadcasting, exactly like RPS splits `poker-rps.ts` vs the handlers.

### Delivery (apply the RPS lesson)
Live `arcade_state` frames go to the **room** (players + spectators see the same authoritative state). The **terminal `arcade_ended`** is *also* sent to each participant **by address** (`sendToPlayerAddress`), not room-only — so a winner/loser screen can never get stuck the way the RPS reveal did when a connection wasn't in the room set.

---

## Poker integration & timing (decided)

A mini-game must **finish** even if a new poker hand starts mid-game, and must **never disrupt live poker**. Cash and tournament reach that goal differently because tournaments can't sit out.

**Eligibility to *start* (both formats):** you must be out of the live hand — folded, sitting out, or between hands (the same `rpsEligibility` gate: `!currentHand || street === 'showdown' || seat.folded`). An invite still in the **invite/countdown** phase when a new hand is about to deal just **lapses** — we only protect a *live* game.

**Cash table — sit out, then sit back.**
- Joining/starting a game flags you **sitting out**, so the dealer skips you on the next hand(s); you finish the game uninterrupted at zero cost.
- Game ends → **auto sit back in**. Track an "auto-sat-out *by the arcade*" flag so we only restore players the arcade sat out (someone already sitting out stays out).

**Tournament — existing `away`, frictionless return.**
- You can't sit out (blinds are mandatory), so joining/starting flips you to the **existing `away` state** and its **normal check/fold auto-action** handles your hands — **no special auto-fold**:
  - **Check when there's no bet to call** (BB option, checked-around pots) — you stay in for free and can even win passively.
  - **Fold only when facing a bet.**
- Game ends → **auto-clear `away`, with NO "I'm back" click.** The return-click is a *liveness check*; an arcade player is provably present (tapping every ~0.5 s), so it's redundant — snap them straight back to manual play.
- Real cost is only the **blinds posted while away**, so add light guardrails in tournaments: a one-time **confirm** on launch, **block when short-stacked / on the bubble** (~≤ 8–10 BB or hand-for-hand), and a per-tournament **admin toggle**. Hot Potato's open-ended length is the one to **cap** (or restrict tournaments to the quick games).

| | Cash table | Tournament |
|---|---|---|
| Mechanism | Sit out (skip hands) | `away` (check/fold) |
| Cost | None — just miss hands | Blinds posted while away |
| Return | Auto sit back in | Auto-clear `away`, **no "I'm back" click** |
| Guardrails | Out-of-hand gate | + confirm, short-stack block, length cap, admin toggle |

### Overlay gating (per viewer, by hand state)
The arena/dock is a discrete layer shown or hidden **per viewer** based on whether *that viewer* is in the live hand:
- **In the live hand** → **never** the felt-covering arena; at most a tiny corner ticker (e.g. "💣 Pip vs Koa"). Their cards/pot/action UI stay unobstructed.
- **Arcade participant** (sat out / away) → full arena + mash button (they're not acting in poker).
- **Idle spectator** (out of hand, not playing) → full show.
- Hot Potato is seat-anchored, so for active players it **dims/shrinks** rather than flinging a bomb over live action.

---

## Protocol

**Client → server**
- `arcade_invite` `{ tableId, gameType, mode?, toSeatIndex? }` — start a 1v1 challenge (`toSeatIndex`) or open a table lobby.
- `arcade_respond` `{ matchId, accept }` — accept/deny a challenge or join/decline a lobby.
- `arcade_input` `{ matchId, kind }` — `kind: 'tap'` (mash / draw / pass). Server timestamps on receipt; client time is ignored.
- `arcade_leave` `{ matchId }` — bail out / close.

**Server → client**
- `arcade_invite` `{ matchId, tableId, gameType, mode, fromSeatIndex, fromName, players }` — prompt.
- `arcade_declined` `{ matchId, reason }` — `busy | in_hand | timeout | declined`.
- `arcade_countdown` `{ matchId, gameType, mode, players[], startsInMs }` — 3·2·1 begins; open the overlay.
- `arcade_state` `{ matchId, gameType, t, ...gameState }` — authoritative tick frame (rope position / per-seat progress / bomb holder / draw phase). Broadcast to room.
- `arcade_ended` `{ matchId, gameType, winnerSeatIndex | winnerTeam, scores, reason }` — terminal; also unicast to participants by address.

`arcade_*` events get added to `WS_KNOWN_EVENT_TYPES` (client) and the inbound list + `poker-router` map (server).

---

## Per-game reducers (the tiny part)

All operate on `match.game` (discriminated by `gameType`). `cap` = taps applied this tick after the rate cap.

- **tug**: `rope ∈ [-100, 100]` (0 = center). Left taps `rope -= PULL*cap`, right taps `rope += PULL*cap`. Win when `rope ≤ -100` (left) or `≥ 100` (right); on `maxMs` timeout the side past center wins (tie = draw). 1v1: A=left, B=right. Team: each player carries a side.
- **quickdraw**: phase `arming` until random `goAt` (1.5–4 s) → `go`. A tap before `goAt` ⇒ that seat `dq`. First non-dq tap after `goAt` wins (its `reactionMs` is the headline). All-dq / nobody taps in window ⇒ no winner.
- **sprint**: `progress[seat] ∈ [0,100]`, tap `+= STEP*cap`. First to `100` wins; `maxMs` timeout ⇒ highest progress wins.
- **potato**: `holderSeat`, hidden `fuseEndsAt`, `alive[]` seats in pass order. Holder's tap ⇒ pass to next alive seat (short re-pass cooldown). On `now ≥ fuseEndsAt`: holder eliminated; if >1 alive, re-arm a new random fuse and continue; else last alive wins. Clients see the holder + a generic "ticking" pulse (fuse length stays hidden).

---

## UI

- **Entry point:** the existing avatar-wheel **Games** wedge (where RPS lives) opens a small **game picker** (RPS · Tug-of-War · Quick Draw · Mash Sprint · Hot Potato). 1v1 games target the clicked seat; table games open a lobby.
- **Dock:** one `TableArcadeDock` (bottom-center, RPS-dock idiom — muted slate, single cyan accent, **no gold**) shows the countdown, the **mash button**, and the result. Big tap target; the whole dock is tappable during `active`.
- **On-felt overlays** (in `PokerTable`, reusing seat anchors like the RPS toss):
  - tug → a rope across the felt with a center marker that slides; both sides' avatars strain.
  - sprint → a lane per player with a progress pip racing across.
  - potato → a 💣 that hops to the holder's seat with a tension pulse; eliminated seats dim.
  - quickdraw → a big GO flash; the winner's seat pops.
- **Spectator:** the rail already receives every `arcade_state` frame (room broadcast), so watching is automatic — no separate path.

---

## Files (planned)

- `server/src/services/table-arcade.ts` *(new)* — pure registry + 4 reducers + lifecycle transitions.
- `server/src/__tests__/poker/table-arcade.unit.test.ts` *(new)* — reducer truth tables + lifecycle.
- `server/src/services/websocket.service.impl.js` — invite/respond/input/leave handlers, countdown + tick scheduling, broadcasts.
- `server/src/services/websocket/message-types.ts` + `poker-router.ts` — inbound `arcade_*`.
- `lib/websocket-message-types.ts` + `lib/websocket-client.ts` — outbound senders + known events.
- `app/poker/[tableId]/use-table-arcade.ts` *(new)* — client hook (match + spectator state, invite/respond/tap/leave).
- `components/poker/TableArcadeDock.tsx` *(new)* — the dock.
- `components/poker/PokerTable.tsx` — on-felt overlays.
- avatar wheel (`PokerSeat.tsx` / `PokerPortraitSeat.tsx`) — Games-wedge game picker.

---

## Build sequence

1. **Plan doc** (this file). ✅
2. **Engine** (`table-arcade.ts`) — registry + all four reducers as pure logic.
3. **Tug-of-War end-to-end** (WS handlers + tick + client hook + dock + rope overlay) — the proving ground; tune the mash feel here.
4. **Quick Draw / Mash Sprint / Hot Potato** — reducers already exist; add each one's overlay + dock state + picker entry.
5. **Verify** — `node --check`, `tsc --noEmit` (filtered), eslint; unit tests for the reducers.

> Tug-of-War is built first and shown before the other three are skinned, so the engine feel is tuned once before replicating.
