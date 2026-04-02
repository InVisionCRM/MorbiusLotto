# Blackjack Optimization Rules (SP + MP)

Use this document as a strict implementation guide for blackjack optimization work.

## 1) Scope Guardrails

- Keep money values as `bigint` end-to-end; only stringify at API/WS boundaries.
- Do not change lottery economics/contracts while working on blackjack.
- Treat PulseChain as standard EVM (no special chain handling unless code explicitly needs it).
- Avoid editing generated files (`server/dist/**`) unless build output is intentionally regenerated.

## 2) Shared vs Mode-Specific Architecture

- Create/confirm a shared **Blackjack UI Core** (dealer hand, player hand, card renderer, hand totals, outcome badges).
- Keep transport separate:
  - Multiplayer: websocket/room synchronization.
  - Single-player: local/API flow.
- Extract reusable helpers (`indexToCard`, totals formatting, timing constants) into shared utilities.
- Do not leak multiplayer-only assumptions into single-player components.

## 3) Visual State Machine (Both SP + MP)

- Implement explicit UI presentation phases:
  - `DealVisible` -> `Play` -> `DealerReveal` -> `ResultHold` -> `TableClear` -> `NextBetting`
- Enforce a minimum result-hold duration before clear/reset.
- Do not clear cards solely on raw phase flips if reveal/result UX has not completed.
- Ensure dealer-blackjack path still visibly reveals cards before round clear.

## 4) Component Decomposition

- Split seat/hand UI into focused components:
  - `IdentityLayer` (tag/avatar/name)
  - `HandLayer` (cards/totals)
  - `BetLayer` (bet chip/amount)
- Keep identity/tag visibility independent from hand reset.
- Prevent layout collapse when hands temporarily empty during transitions.

## 5) Turn & Action UX

- Add subtle active-turn indicator (border/glow) on acting player/hand.
- Add compact text cue (`Your turn` / `Acting`) where appropriate.
- If timer exists, show lightweight countdown tied to acting entity.
- Ensure cue disappears exactly when turn ownership changes.

## 6) Multiplayer-Specific Hardening

- Ensure `placeBet` response state and broadcast state cannot conflict for the same action.
- Guarantee timeout mutation paths always publish refreshed table state.
- Normalize WS payload shape consistency across direct reply vs room broadcast.
- Add all active `bj_multi_*` event types to known client message maps (avoid false unhandled warnings).
- Add snapshot ordering protection (ignore stale sequence/version updates).

## 7) Single-Player-Specific Hardening

- Reuse the shared presentation state machine from multiplayer.
- Keep split/double outcome labeling accurate (including mixed split outcomes).
- Ensure min/max bet validation uses configured limits, not hardcoded values.
- Align action availability strictly to authoritative game state.

## 8) Duplicate/Dead Code Cleanup

- Identify and remove unused blackjack-multi components or wire them properly (no parallel duplicate implementations).
- Eliminate duplicated helper logic across pages/components.
- Keep one source of truth per concern (identity rendering, hand rendering, action controls).

## 9) Performance & Stability

- Memoize heavy seat/dealer subtrees where safe.
- Reduce duplicate state-fetch/render passes in hot WS/API paths.
- Consolidate redundant timers/intervals.
- Keep expensive UI (charts/history) mounted only when necessary and with bounded updates.

## 10) Verification / Definition of Done

- Dealer natural blackjack always shows visible cards before clear.
- Cards persist through result hold and clear at deterministic timing.
- Player tags never disappear while seat is occupied.
- Turn indicator always matches actual acting player.
- No WS contract regressions (shape/type/stringified bigint correctness).
- Run a multi-hand regression pass:
  - normal win/loss/push
  - split mixed outcomes
  - timeout auto-stand
  - rapid consecutive rounds
  - reconnect/resubscribe (multiplayer)

## Execution Order (Required)

1. Backend/state consistency (`P0`)
2. UX reliability + turn indicator (`P1`)
3. Cleanup + de-duplication (`P1`)
4. Performance polish (`P2`)
5. Final regression verification and sign-off

