# The Weekly Drop — raffle jackpot spec

Status: **approved design, not yet built** (agreed with owner 2026-07-01, session: home/nav redesign).
The home page prototype (`public/home-nav-lab.html`) shows the corresponding UI module marked "lighting soon".

## Overview

A weekly raffle pot. Playing any game earns entries; the top 3 winners are drawn
every Sunday at 8:00 PM and paid automatically. Replaces the earlier "must-hit-by
progressive" concept.

## Decided parameters

| Parameter | Value |
|---|---|
| Base entry rate | 1 entry per 1,000 MORBIUS wagered, any game, win or lose |
| Entry reset | Entries reset to zero at every draw (weekly race) |
| Draw cadence | Weekly, Sunday 8:00 PM America/New_York (US Eastern, DST-aware; shown as countdown on home) |
| Pot funding | 0.5% of every settled bet, all games |
| Pot floor | House-guaranteed minimum 25,000 MORBIUS per draw |
| Winners | 3 per draw: 60% / 25% / 15% of the pot |
| Payout | Auto-credit to winner's reserve balance + notification |
| Winner cosmetic | Temporary avatar aura for the following week (flex item) |

## Entries

- **Public math stays simple**: "Every 1,000 MORBIUS you play is a ticket."
- **Per-game entry rates (internal)**: to prevent thin-edge farming (e.g. 98% RTP
  Dice wagered at huge volume to cheaply farm entries against the guaranteed pot),
  each game has an internal entry-rate weight roughly proportional to its house
  edge. Casual players never see this; the UI rounds to the simple public math.
  Weights live in config, reviewable per game.
- **Free daily entry**: 1 free entry per day for signing in, gated by:
  - SIWE-authenticated session (existing auth), and
  - account must have at least one lifetime settled wager (blocks multi-account farming).
- Fractional progress is tracked (e.g. 680/1,000 toward the next entry) and shown
  on the home module as a personal progress bar.

## Draw fairness (commit-reveal, no contract)

Same pattern as the poker provably-fair shuffle, applied server-side:

1. At entry close (Sunday 8:00 PM), freeze the entry list.
2. Publish `commitment = sha256(serverSeed || sha256(entryListCanonicalJSON))`
   **before** selecting winners.
3. Select the 3 winners by seeded deterministic sampling over the entry list
   (weighted by entry count, without replacement per player).
4. Publish `serverSeed` and the canonical entry list snapshot so anyone can
   recompute the winners.
5. `GET /api/drop/verify/:drawId` returns commitment, revealed seed, entry
   snapshot hash, and the selection recipe.

## Data model (sketch)

- `drop_draws` — id, opens_at, closes_at, pot_total, guaranteed_min, commitment,
  server_seed (null until reveal), status (open / drawn / paid).
- `drop_entries` — draw_id, player_address, entries, wager_progress, source
  (wager / daily_free), updated_at.
- `drop_winners` — draw_id, rank, player_address, amount, credited_at.
- Settlement hook: on every settled bet, add 0.5% of wager to the open draw's
  pot and accrue entry progress at that game's rate.

## API

- `GET /api/drop` — open pot total, countdown target, caller's entries +
  progress-to-next, last draw's top-3 winners (display name, avatar, amount).
- `GET /api/drop/verify/:drawId` — fairness data (above).
- Draw job: cron at Sunday 8:00 PM — close, commit, draw, credit, reveal, open next.

## Home page module (see prototype)

Pot number (rolling) · countdown clock · "Your entries: N — X MORBIUS to your
next one" personal bar · last week's top-3 winners as avatars (rank 1 highlighted)
· footer copy: funding + guarantee + "every draw is verifiable".

## Deferred (explicitly not in v1)

- VIP tier entry multiplier (revisit after launch; if added, cap at 1.5×).
- Net-loser entry boost (consolation weighting).
- Sponsored/branded drops (ties into branded-tables program) — strong candidate
  for v2 once a partner signs on.
