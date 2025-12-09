# Crypto Keno (On-Chain Club Keno)

> A fast, on-chain, 20-of-80 Keno game inspired by state “Club Keno” products, redesigned for crypto.

---

## 1. High-Level Overview

### 1.1 What we’re cloning (Club Keno in the real world)

State “Club Keno” games (e.g. Michigan, Missouri) work roughly like this:

* Numbers **1–80** are available.
* Every **few minutes**, a drawing picks **20 unique numbers** from 1–80.
* Players choose **1–10 numbers (“spots”)** and a **wager per draw**, often with optional add-ons (multipliers, Bulls-Eye, progressive jackpots like *The Jack*).
* Payouts scale with:

  * Spot size (how many numbers you pick),
  * How many of your picks hit the 20 drawn,
  * Wager size,
  * Add-ons (multipliers / progressives).

Typical **house edge** is high by casino standards, often **~20–30%** depending on the paytable.

### 1.2 Our on-chain version

We’ll reproduce this structure on a blockchain:

* **Game:** 20-of-80 Keno, numbers 1–80, 20 unique numbers drawn each round.
* **Spots:** Players choose **1–10 numbers** to play (configurable up to 15 or 20 if desired).
* **Token:** Any ERC-20 (e.g. your pSSH token).
* **Draw cadence:** Every **X seconds** (e.g. 3–4 minutes like Club Keno, or 5–10 minutes if you want fewer rounds).
* **On-chain paytable:** Payouts defined per (spot size, hits), giving a **fixed RTP / house edge**.
* Optional **add-ons (all on-chain):**

  * Multiplier (like “The Kicker”),
  * Bulls-Eye (one drawn number treated as special),
  * Progressive jackpot (“The Pot” / “The Jack” style).

This README explains:

* Game logic & flow,
* The math (hypergeometric probabilities, odds, EV, house edge),
* Contract-level design,
* Add-on mechanics,
* Frontend sketches (Keno-monitor style UI).

---

## 2. Game Rules & Flow

### 2.1 Core rules

For every **round**:

1. The game has a **round ID** (integer).
2. Before the round closes, players can **buy tickets**:

   * Choose a **spot size** `s` (1–10).
   * Pick `s` distinct numbers from **1–80**.
   * Choose **wager per draw** (e.g. 1, 2, 5, 10 tokens).
   * Choose **number of consecutive draws** (e.g. 1–20).
   * Optionally enable **add-ons** (Multiplier, Bulls-Eye, Progressive).
3. When the round closes:

   * The contract generates **20 unique winning numbers** from 1–80.
   * Each ticket participating in that round is scored:

     * Let `hits` = number of player’s picks that appear in the 20 drawn numbers.
   * Payout is calculated based on:

     * Spot size `s`,
     * Hits `h`,
     * Wager,
     * Any add-ons.

### 2.2 Tickets & consecutive draws

A ticket is:

* `player`
* `spotSize` (s)
* `numbers[]` (s unique ints in [1,80])
* `wagerPerDraw`
* `drawsRemaining`
* `addonsFlags` (bitmask for Multiplier, Bulls-Eye, Progressive, etc.)

When you buy for **D draws**, you’re really pre-registering the same play for rounds `R, R+1, …, R+D-1`.

Each time a round `R` resolves:

* If the ticket has `drawsRemaining > 0` and includes round `R`, we:

  * Score and pay that ticket for `R`.
  * Decrease `drawsRemaining` by 1.
* Once `drawsRemaining == 0`, the ticket is inactive.

### 2.3 Round timing

Off-chain, you’ll display a countdown. On-chain, we can base it on:

* **Block time**:

  * For round `R`, define `startTimestamp` and `endTimestamp`.
  * New tickets allowed only while `block.timestamp < endTimestamp`.

Round finalization:

* When `block.timestamp >= endTimestamp` and someone calls:

  * `finalizeRound(R)` or `buyTicket(nextRoundId)`,
* Then the contract:

  * Confirms `R` not yet finalized,
  * Generates a randomness seed,
  * Draws 20 numbers,
  * Stores the winning combination,
  * Updates result state.

You can piggyback finalization onto `buyTicket` calls to avoid a separate keeper, or use a simple keeper bot.

---

## 3. On-Chain Architecture

### 3.1 Main contract responsibilities

**KenoGame.sol** (conceptually):

* Stores global config:

  * `NUMBERS = 80`
  * `DRAWN = 20`
  * `MAX_SPOT = 10` (configurable)
  * Timings, addresses, fee rates, etc.
* Tracks `Round` structs:

  * `id`, `startTime`, `endTime`,
  * `state` (OPEN, CLOSED, FINALIZED),
  * `winningNumbers[20]`,
  * `randomSeed`,
  * Pools / accounting (total wagers, total add-on wagers, etc.).
* Tracks `Ticket` structs:

  * Keyed by `(ticketId)` or `(player, roundRangeIndex)` etc.

**Key functions:**

* `buyTicket(roundId, numbers[], spotSize, draws, addonsFlags)`
* `finalizeRound(roundId)`
* `claim(roundId, ticketId)` if you’re not auto-crediting.

### 3.2 Randomness & fairness

In “real” Club Keno, balls are drawn physically or via licensed RNG. On-chain we need a cryptographic equivalent.

Best options (depending on chain):

1. **VRF (Verifiable Random Function)**, e.g. Chainlink VRF, if supported:

   * Request randomness when round closes,
   * VRF callback finalizes the round and stores winning numbers.

2. **Commit–reveal scheme**, if VRF not available:

   * The game (or an independent randomness provider) commits to a hash of a seed before round closes.
   * After closure, it reveals the seed.
   * Contract verifies the hash and uses the seed to draw 20 numbers.
   * Misbehavior (not revealing) can be penalized with slashed bonds.

3. **Blockhash-based fallback** (least secure but simple):

   * Use a blockhash from a future block relative to `endTime` as the seed:

     * `seed = keccak256(blockhash(targetBlock), roundId, totalTickets)`
   * Then derive 20 unique numbers from `seed` via deterministic sampling.

Drawing 20 unique numbers from 1–80:

* Start with a pseudo-random `seed`.
* For `i` from 0 to 19:

  * Compute `candidate = (uint256(keccak256(seed, i)) % 80) + 1`.
  * If candidate already used, iterate until you find an unused one (or use algorithmic sampling from a 80-element array).

---

## 4. Keno Math & Probabilities

### 4.1 Universe of outcomes

In standard Keno:

* There are **80** possible numbers (1–80).
* The game draws **20** unique numbers every round.
* Total number of possible draws (combinations of 20 from 80) is:

[
\binom{80}{20} = \frac{80!}{20! \cdot 60!}
]

This is about **3.5353×10¹⁸** possible draws.

### 4.2 Hypergeometric distribution for hits

If the player chooses **s** unique numbers (spot size) and the game draws 20 numbers, then:

* Let `H = number of hits` (how many of the s picks appear in the drawn 20).
* The probability of hitting **exactly h** numbers (0 ≤ h ≤ s) is given by the **hypergeometric** formula:

[
P(H = h) =
\frac{\binom{s}{h} \cdot \binom{80 - s}{20 - h}}
{\binom{80}{20}}
]

Explanation:

* Choose which `h` of the player’s `s` numbers will be in the drawn 20: (\binom{s}{h}).
* Choose the remaining `20 − h` numbers from the **80 − s** that the player didn’t pick: (\binom{80-s}{20-h}).
* Divide by total number of possible draws: (\binom{80}{20}).

### 4.3 Probability of “hitting all spots”

The chance of hitting **all s** spots (i.e. H = s) is:

[
P(H = s) =
\frac{\binom{s}{s} \cdot \binom{80 - s}{20 - s}}
{\binom{80}{20}}
= \frac{\binom{80 - s}{20 - s}}{\binom{80}{20}}
]

Example qualitative numbers (for a standard 20-of-80 Keno game):

* **1-spot:** match your 1 number → probability 1 in 4 (about 25%).
* **6-spot:** match all 6 → roughly 1 in 50,000–60,000.
* **10-spot:** match all 10 → around 1 in **8.9 million** (order of 10⁶–10⁷).

These are **approximate** and depend on the exact 20-of-80 assumptions; detailed tables are widely published in Keno odds guides and calculators.

### 4.4 Examples of hit distributions

For a given spot size `s`, we can compute:

* All possible `h` from 0..s,
* The probability `P(H=h)` via the hypergeometric formula,
* Then design a paytable with prize multipliers `M[h]`.

Useful references provide full tables for each `s` (1–15+) including P(H=h) and sample paytables, e.g. Wizard of Odds, Keno odds guides, and keno calculators.

---

## 5. Paytables, Expected Value & House Edge

### 5.1 Payout multipliers

Define a **multiplier table** for each spot size `s`:

* `pay[s][h] = multiplier` such that:

  * Player wager = `w`.
  * If they hit `h` numbers, base prize = `w * pay[s][h]`.

For non-winning outcomes, `pay[s][h] = 0`.

Example (not final numbers, just shape) for **10-spot**:

* `h=10` → 10,000×
* `h=9` → 1,000×
* `h=8` → 100×
* `h=7` → 20×
* `h=6` → 5×
* `h=5` → 2×
* `h<5` → 0×

You’ll calibrate these multipliers so that:

* Big hits are **life-changing** multiples of the wager (like real Keno).
* Lower hits give enough small wins to keep players engaged.

### 5.2 Expected value per bet

For a given **spot size s** and **wager w**, the expected return (EV) is:

[
\text{EV}(s, w) = \sum_{h=0}^{s} P(H=h) \cdot (w \cdot \text{pay}[s][h])
]

Divide by the wager to get **return-to-player (RTP)**:

[
\text{RTP}(s) = \frac{\text{EV}(s, w)}{w} = \sum_{h=0}^{s} P(H=h) \cdot \text{pay}[s][h]
]

Note: `w` cancels out.

The **house edge** for spot size `s` is:

[
\text{houseEdge}(s) = 1 - \text{RTP}(s)
]

Typical Keno games target RTP in the **70–80%** range (house edge 20–30%), depending on spot size.

You can:

* Fix **one RTP** for all spot sizes (e.g. 75%), or
* Let RTP vary slightly by spot size as many casinos/lotteries do.

### 5.3 Designing a concrete paytable

Typical workflow:

1. Pick a target **RTP**, e.g. 75%.

2. For each `s`:

   * Use known “classic” paytables as a starting point (from casino Keno guides).
   * Adjust multipliers (especially top prizes) to hit the desired RTP.

3. Validate:

   * Compute P(H=h) using the hypergeometric formula.
   * Compute EV & RTP.
   * Confirm edge across all spot sizes is within desired range.

Because these are pure arithmetic formulas, you can write a small script (off-chain) to search for multipliers that give “nice” integer payouts and hit your target RTP to within a tolerance.

---

## 6. Add-On Mechanics

We can mirror Club Keno’s add-ons in a crypto-native way.

### 6.1 Multiplier

**Idea:** Player pays extra; a random multiplier is drawn each round; if their ticket wins, prize is multiplied.

* Config:

  * `multiplierCostFactor` (e.g. 1x extra wager),
  * Distribution over multipliers, e.g.

    | Multiplier | Probability |
    | ---------: | :---------- |
    |         1× | 60%         |
    |         2× | 25%         |
    |         3× | 10%         |
    |         5× | 4%          |
    |        10× | 1%          |

* For each round, after drawing 20 numbers:

  * Draw a global `multiplier` from the distribution (using the same random seed).

* For a ticket with Multiplier on:

  * `payout = basePrize * multiplier`.

You can tune the distribution and extra cost so that:

* The **effective RTP** for Multiplier tickets is similar to base tickets,
* Or slightly lower/higher depending on your design.

IRL, add-on multipliers like “The Kicker” typically **multiply non-jackpot prizes up to 5× or 10×**, while **doubling ticket cost**.

### 6.2 Bulls-Eye

**Idea:** Among the 20 drawn numbers, mark one as **Bulls-Eye**. If the player has that number and bought Bulls-Eye, they can win enhanced payouts.

Implementation:

* After drawing 20 numbers, sample one index `i` from 0–19 as the **Bulls-Eye** index.
* Let `bullsEyeNumber = winningNumbers[i]`.
* For any ticket with Bulls-Eye enabled:

  * If it contains `bullsEyeNumber`, apply a separate `payBullsEye[spot][hits]` table or multiplicative bonus.

Real lotteries (e.g. Missouri Club Keno) use Bulls-Eye and Double Bulls-Eye options for extra cost and bigger prize tiers.

### 6.3 Progressive Jackpot (“The Pot” / “The Jack”)

**Idea:** A separate jackpot funded by small fixed add-on fees per draw.

* Progressive pool `progressivePool` starts at a base seed (e.g. 100,000 tokens).
* For every progressive add-on:

  * Player pays +1 token per draw.
  * Some % (e.g. 80–90%) of that goes to `progressivePool`.
* Progressive win condition:

  * E.g. each progressive ticket gets 9 specific random extra numbers (or uses a specific pattern on the main 20 numbers).
  * If a player’s pattern matches the special progressive criteria, they win `progressivePool`.

This copies the style of Michigan’s “The Jack”, which is an add-on to Club Keno that builds a separate jackpot starting at $10k and growing until someone matches the special pattern.

On win:

* Winner (or winners) split `progressivePool`.
* Pool resets to base seed.

---

## 7. Tokenomics & Fees

### 7.1 Ticket pricing and fee split

For a single ticket:

* `baseWagerPerDraw = w` (e.g. 1 token)
* `numDraws = D`
* `addonsCost = costMultiplier + costBullsEye + costProgressive`

Total paid:

[
\text{gross} = D \times (w + \text{addonsCost})
]

Split:

* `protocolFee = gross * feeRate` (e.g. 5–10%)
* `prizePoolContribution = gross - protocolFee`

Within `prizePoolContribution`:

* Some portion funds **base paytables** (guaranteed payouts).
* Some portion feeds **multiplier fund** (if needed) and **progressivePool**.

### 7.2 Integrating with your ecosystem (optional)

If this is plugged into an existing token ecosystem (e.g. SuperStake / HEX):

* Protocol fee can be used to:

  * buy and lock pSSH,
  * feed HEX stakes,
  * or pay yield to stakers.
* Progressive pools and special jackpots can optionally pay partly in:

  * The main token (e.g. pSSH),
  * A secondary asset (e.g. HEX earned by protocol-owned stakes),
  * Or a combination.

---

## 8. Gas, Storage & Performance

### 8.1 Storage design for tickets

To keep gas reasonable:

* Don’t store each ticket as a huge struct keyed by round; instead:

  * Store compressed numbers:

    * Convert sorted picks to a packed 256-bit integer, or
    * Fixed-length `uint8[10]` if you cap spot size at 10 (each 1–80 fits in `uint8`).
* Maintain:

  * `ticketsByRound[roundId]` as an array of `ticketId`s, or
  * `ticketsByPlayer[player]` with references to ticket ranges.

### 8.2 Scoring & payout

You can choose between:

1. **“Pull” claims**:

   * Contract stores the winning 20 numbers and minimal aggregate stats.
   * Players call `claim(roundId, ticketId)` to:

     * Prove their ticket,
     * Compute hits,
     * Compute payout,
     * Mark ticket as claimed.
   * Gas cost is pushed to the claimer.

2. **Batch scoring** (less scalable):

   * Finalization loops over all tickets and pre-stores `hits` / `prize`.
   * Expensive if there are many tickets.

In a busy on-chain game, **pull-based** claiming is usually more scalable.

---

## 9. Security & Trust

* **Immutable paytable** (or carefully governed):

  * Store paytables on-chain, read-only after initialization.
  * Or allow updates only by governance with a delay and announcements.
* **Randomness verification**:

  * If using VRF, verify proofs.
  * If using commit–reveal, enforce slash / penalties for failing reveals.
* **Audits**:

  * Contracts should be professionally audited, especially:

    * Randomness logic,
    * Progressive pool handling,
    * Arithmetic (prevent overflow / rounding bugs).

---

## 10. Example Round Walkthrough

1. **Welcome screen** shows:

   * Round #4821, time to next draw,
   * Current jackpots and progressive pool.
2. Player chooses:

   * Spot size `s = 8`,
   * Numbers: `{3, 7, 13, 17, 23, 27, 33, 37}`,
   * Wager: 1 token per draw,
   * Draws: 5,
   * Add-ons: Multiplier ON, Progressive ON.
3. Ticket cost:

   * Base: `1 * 5 = 5` tokens,
   * Multiplier: `+1 * 5 = 5` tokens,
   * Progressive: `+1 * 5 = 5` tokens,
   * Gross = 15 tokens.
4. Round closes, randomness is drawn, 20 numbers generated.
5. For one of the draws:

   * Say the 20 numbers include `{3, 7}` plus 18 others.
   * Ticket hits `2` of the `8` picks (2/8).
   * Refer to paytable: 2/8 might pay, say, 1× base wager.
   * Suppose the multiplier for this round is 3×.
   * Base prize = `1 * 1 = 1` token; final prize = `1 * 3 = 3` tokens.
6. Player can claim their 3 tokens (or have them auto-credited).

---

## 11. Appendix: UI Wireframe Sketches (Club Keno dApp)

Below is a condensed version of 10 UI concept sketches for the frontend.

### 1. Monitor-Style Home Screen

* Shows:

  * Next draw countdown,
  * Last draw’s 20 numbers,
  * Current pot, multiplier range, progressive pool,
  * “Buy Tickets” + “My Tickets” buttons.

### 2. Ticket Builder – Basic

* Steps:

  1. Pick spot size (1–10).
  2. Pick numbers from a clickable 1–80 grid (Quick Pick available).
  3. Choose wager per draw.
  4. Choose number of consecutive draws.
  5. Toggle add-ons (Multiplier, Bulls-Eye, Progressive).
* Summary section shows total cost and estimated max win.

### 3. Multi-Ticket Playslip View

* Spreadsheet-style lines:

  * One row per ticket.
  * Global controls: spot size, default wager, default draws applied to new lines.
  * Tools: quick pick per line, copy line, clear line.
* Good for power users buying 10–50 lines at once.

### 4. “My Plays” Screen

* Tabs:

  * **Active** (current & upcoming draws),
  * **History** (past draws and outcomes),
  * **Progressive** (tickets that opted into the progressive).
* Each entry shows:

  * Spot size, numbers, draws left, wager, add-ons chosen.

### 5. Draw Result Modal

* After round finalization:

  * Show winning 20 numbers.
  * List each of the user’s tickets in that draw:

    * Hits count, bracket, base prize, multiplier, final prize.
  * Option to claim (if not automatic).

### 6. Odds & Paytables Panel

* Tabs per spot size (1-spot, 4-spot, 8-spot, 10-spot).
* For selected spot size:

  * Table of `hits` vs `payout multiplier`.
  * Approximate odds for key outcomes.
  * Summary of RTP and house edge for that spot.

### 7. Add-Ons Config View

* For each add-on:

  * Description,
  * Cost per draw,
  * How it affects payouts,
  * Toggle for default ON/OFF.
* Gives a clear explanation similar to “The Kicker / Bulls-Eye / The Jack” sections in state lottery guides.

### 8. Mobile Ticket Picker

* Compact layout:

  * Dropdown for spot size,
  * Number grid 1–80 in scrollable rows,
  * Selected numbers shown at top,
  * Big “Quick Pick” and “Buy” buttons.
* Mirrors the desktop logic but optimized for thumbs.

### 9. Live Draw Animation

* Animated board where 20 balls light up one by one.
* Side panel summarizing:

  * Player’s tickets,
  * How many hits each has so far (real-time feel).

### 10. Operator / Analytics Dashboard

* Internal/admin tool:

  * Current round stats (tickets sold, volume, projected payouts),
  * Pool balances (main pool, multiplier fund, progressive pool),
  * Historical round list with key stats,
  * Safe controls (pause, configuration, export).

---

This README should give you (and devs/auditors) a complete picture of:

* The **logic** (game rules, flows),
* The **math** (probabilities, paytables, house edge),
* The **on-chain design** (randomness, storage, payout),
* And the **UX concept** (how users actually interact with crypto Keno).

If you’d like next, we can draft **concrete paytables** per spot size with target RTP (e.g. 75%) and then translate this into Solidity interfaces & data structures.







Prize Payout
The following are the results from: Wednesday, December 3rd 2025


Win Conditions	Shares	Prize
10 Spot Game - Match 10	0	$100,000
10 Spot Game - Match 9	0	$5,000
10 Spot Game - Match 8	2	$500
10 Spot Game - Match 7	104	$50
10 Spot Game - Match 6	562	$10
10 Spot Game - Match 5	2,162	$2
10 Spot Game - Match 0	1,732	$5
9 Spot Game - Match 9	0	$25,000
9 Spot Game - Match 8	0	$2,000
9 Spot Game - Match 7	14	$100
9 Spot Game - Match 6	41	$20
9 Spot Game - Match 5	328	$5
9 Spot Game - Match 4	947	$2
8 Spot Game - Match 8	0	$10,000
8 Spot Game - Match 7	8	$300
8 Spot Game - Match 6	127	$50
8 Spot Game - Match 5	634	$15
8 Spot Game - Match 4	2,725	$2
7 Spot Game - Match 7	0	$2,000
7 Spot Game - Match 6	43	$100
7 Spot Game - Match 5	394	$11
7 Spot Game - Match 4	2,368	$5
7 Spot Game - Match 3	7,154	$1
6 Spot Game - Match 6	4	$1,100
6 Spot Game - Match 5	106	$57
6 Spot Game - Match 4	1,102	$7
6 Spot Game - Match 3	5,074	$1
5 Spot Game - Match 5	174	$410
5 Spot Game - Match 4	3,491	$18
5 Spot Game - Match 3	23,865	$2
4 Spot Game - Match 4	767	$72
4 Spot Game - Match 3	10,857	$5
4 Spot Game - Match 2	53,750	$1
3 Spot Game - Match 3	2,392	$27
3 Spot Game - Match 2	21,785	$2
2 Spot Game - Match 2	12,062	$11
1 Spot Game - Match 1	315	$2
The Jack - Match 9 of 9	0	Jackpot
The Jack - Match 8 of 9	0	$1,000
The Jack - Match 7 of 9	5	$100
The Jack - Match 6 of 9	52	$10
The Jack - Match 5 of 9	287	$5
The Jack - Match 0 of 9	529	$1
