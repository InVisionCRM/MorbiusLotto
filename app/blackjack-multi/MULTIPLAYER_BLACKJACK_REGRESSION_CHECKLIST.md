# Multiplayer Blackjack Regression Checklist

Use this checklist after multiplayer blackjack changes. Mark each item pass/fail with notes.

## Environment

- [ ] Use 2-3 distinct wallets/players.
- [ ] Confirm websocket connected on all clients.
- [ ] Confirm same table view on all clients before betting.

## Core Round Flow

- [ ] Betting opens with correct phase badge and min/max display.
- [ ] Player can place valid bet within table min/max limits.
- [ ] Invalid bet outside limits is blocked with clear message.
- [ ] Dealer and player cards render correctly on deal.
- [ ] Acting seat highlight appears only on current acting player.
- [ ] Action buttons only enabled for eligible actions.

## Dealer Blackjack / Reveal Flow

- [ ] Dealer natural blackjack path visibly shows dealer cards on table.
- [ ] Cards do not jump directly from hidden state to clear without visible reveal.
- [ ] Round complete state is visible before reset.
- [ ] Result hold window keeps completed cards/results on table before next betting clear.

## Player Identity / Tags

- [ ] Occupied seat always shows player identity tag.
- [ ] Player tag remains visible across hand transitions.
- [ ] Tag does not disappear when cards clear/reset.
- [ ] Clicking another player's tag opens profile modal.

## Split / Outcome Accuracy

- [ ] Split hand highlights active split hand correctly.
- [ ] Mixed split outcomes show `MIXED` label (not forced `WON`).
- [ ] History row result color and label match round outcome.
- [ ] Win payout labels match expected payout amounts.

## Timeout / Recovery

- [ ] Turn timeout auto-stand updates all clients.
- [ ] Betting timeout transition updates all clients.
- [ ] Idle warning counters increment and display correctly.
- [ ] Reconnect returns to consistent current table state.

## Synchronization / Stability

- [ ] No stale visual rewinds when rapid updates arrive.
- [ ] All clients converge to same round/phase within expected latency.
- [ ] No repeated console spam for known `bj_multi_*` events.

## Performance Sanity

- [ ] No visible UI stutter during betting countdown.
- [ ] Avatar dock timers update smoothly.
- [ ] Seat/dealer rendering remains responsive during rapid actions.

## Sign-off

- [ ] QA pass complete with notes attached.
- [ ] Any failed item has linked issue/ticket and reproduction steps.

