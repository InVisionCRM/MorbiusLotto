# Multiplayer Blackjack Progress Log

This document tracks completed work and active implementation phases for multiplayer blackjack reliability improvements.

## Completed: Phase 1 (State Sync + Core UX Safety)

### Backend (`server/src/services/websocket.service.ts`)

- Fixed stale bettor state race in `handleBJMultiPlaceBet`:
  - now sends requester and room the same fresh `nextState`.
- Added safe handling for benign race on auto-start:
  - if round already advanced (`not in betting phase`), do not surface a false error.
- Hardened dealer tip parsing:
  - switched from raw `BigInt(amount)` to `toBigIntSafe(amount)`.
- Improved timer publication consistency:
  - after `autoStandTimedOut` and betting timeout handlers, now broadcasts refreshed table state.

### Frontend (`app/blackjack-multi/[tableId]/page.tsx`)

- Added dynamic table-based bet guardrails:
  - uses `state.minBet`/`state.maxBet` (wei) converted to whole MORBIUS for UI limits.
  - removed hardcoded 500/50000 controls for half/double/confirm eligibility.
- Added active-turn seat indicator:
  - subtle cyan border/glow for acting seat.
- Improved split outcome label behavior:
  - shows `MIXED` for mixed split outcomes instead of incorrectly forcing `WON`.
- Fixed dealer reveal dependency closure risk:
  - reveal effect now tracks required dependencies.

### WebSocket Client Types (`lib/websocket-message-types.ts`)

- Added missing known bj-multi event types to suppress false unhandled warnings:
  - `bj_multi_table_state`
  - `bj_multi_table_list`
  - `bj_multi_tip_notification`
  - `bj_multi_quick_reaction`
  - `bj_multi_avatar_emotion`

## Completed: Phase 2 (Visual Reliability + UI Structure)

### Delivered

- Added a visual snapshot pipeline in `app/blackjack-multi/[tableId]/page.tsx`:
  - authoritative gameplay state (`state`) remains real-time.
  - rendered table state (`visualState`) now holds completed rounds briefly before clearing.
  - controlled hold duration via `RESULT_HOLD_MS`.
- Updated websocket state application flow to use one entry point (`applyIncomingState`) for:
  - initial load
  - reconnect refresh
  - live `bj_multi_table_state` updates
- Switched dealer/seat render paths and phase badge to use visual state, preventing abrupt clear on immediate betting transition.
- Refactored seat identity tag placement:
  - player tag is now a stable block separate from the card stack overlay.
  - tag visibility is no longer coupled to hand container height changes.

## Completed: Phase 3 (Safety Cleanup Pass)

### Delivered

- Added stale snapshot protection in multiplayer table state ingestion:
  - incoming snapshots with older `stateVersion` are ignored.
  - newest version is tracked client-side for monotonic visual updates.
- Cleaned dead lobby code in `app/blackjack-multi/page.tsx`:
  - removed unused websocket/wagmi/router imports and unused router/address setup.

## Completed: Phase 4 (Performance Hardening Pass)

### Delivered

- Reduced timer churn in avatar dock:
  - replaced six independent countdown intervals (`turn0/1/2`, `bet0/1/2`) with one shared ticker (`useNowTick`).
  - derived per-seat countdown values from the shared time source.
- Reduced repeated seat lookup work on every render:
  - memoized `seatsByPosition` once per table snapshot.
  - reused this memoized tuple in both seat grid and avatar dock wiring.

## Completed: Phase 5 (De-dup + Regression Pack)

### Delivered

- De-duplicated seat-result classification logic in `app/blackjack-multi/[tableId]/page.tsx`:
  - added shared helpers `summarizeSeatHands` and `seatOutcomeLabelFromSummary`.
  - unified result handling for seat label rendering and history entries.
- Added mixed-result parity in history rendering:
  - history now uses consistent `mixed` classification and dedicated color.
- Added a dedicated QA runbook:
  - `MULTIPLAYER_BLACKJACK_REGRESSION_CHECKLIST.md` with multi-client, timeout, dealer blackjack, split/mixed, and sync checks.

## Current Status

- Phases 1-5 complete.

