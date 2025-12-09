# Crypto Keno Guide

## 1. What This Page Does
- Lets you play on-chain Crypto Keno: pick numbers, add add-ons, and buy tickets.
- Shows a live draw board with animations, multiplier/plus-3 phases, and your tickets for the current round.
- Provides ticket history (My Tickets), sorting, pagination, and zoomed previews.
- Includes payout info (Prize Pool) and a mobile-friendly header with wallet/actions.

## 2. Buying a Ticket (PLAY Modal)
- Open the PLAY button in the sticky header to launch the ticket builder.
- Steps:
  - Choose spot count (1–10) and select numbers or use Quick Pick.
  - Set draws and wager per draw (presets or custom).
  - Toggle add-ons: Multiplier (Kicker), Bulls-Eye, Plus 3, Pulse Progressive.
- Summary shows total cost and allowance. Connect wallet, approve if needed, then buy.

## 3. Live Keno Board
- Appears when a round finalizes; minimized as a right-edge tag showing the next-draw timer.
- Two-column layout:
  - Left: 10×8 grid with live animations, drawn numbers list under the grid, plus3 and Bulls-Eye indicators, fades on completion.
  - Right: Carousel of your tickets for that round; updates each round.
- Collapsed tag is draggable; click to expand; close returns to collapsed.

## 4. My Tickets
- Accordion “My Tickets – N total”; sort by newest/oldest/active; 12 per page with pagination controls.
- Grid up to 4 columns; each ticket shows spots, numbers, add-ons, draws remaining, cumulative winnings across completed rounds, and purchase time.
- Hover “expand” control opens a zoomed overlay of the ticket with round-by-round match history.
- Loading state and empty state included.

## 5. Wallet, Claims, and Prize Info
- Header: Round + countdown (left), PLAY button (center), Prize Pool + Connect (desktop), Menu button (mobile).
- Mobile menu dialog: quick stats (unclaimed, total wagered, total P/L), links to Payout Info, My Tickets scroll, Claim (bulk when available), Round History placeholder, wallet section (copy/scan/disconnect or connect).
- Prize Pool accordion: pay tables for 1–10 spots, Bulls-Eye variants, and “The Jack,” with odds and payouts.
- Pulse Progressive card updates periodically; claims use `claimMultiple` when eligible.

