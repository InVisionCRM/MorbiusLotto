# SuperStake Lottery — Economic & Game Design

## TL;DR

- **Game type:** 6-of-55 lottery on PulseChain.  
- **Ticket:** Pick **6 unique numbers from 1 to 55**. Order does not matter.  
- **Rounds:** Time-based (testing: 10 minutes; mainnet: 24 hours).  
- **Token:** pSSH (SuperStake token).  
- **Per-round split of pSSH pot (`roundPot`):**
  - **55%** → paid out to winners across 6 prize brackets.
  - **25%** → sent directly to the existing **SuperStake stake address** (growing the core HEX stake).
  - **20%** → added to a **pSSH MegaMillions bank**.
- **MegaMillions:** Every **55th round**, the accumulated pSSH Mega bank is dropped into that round’s top prize brackets.
- **HEX overlay jackpot:**
  - All HEX that the contract accumulates over time builds up in a **HEX bank**.
  - Whenever someone hits **Bracket 6** (matches all 6 numbers),  
    - **70%** of the contract’s HEX is paid to those winners,  
    - **30%** is sent to the SuperStake HEX stake address.

---

## 1. Game Basics

### 1.1 Ticket format

- Each ticket consists of **6 distinct integers**:
  - `T = {t1, t2, t3, t4, t5, t6}`
  - Each `ti` is in the range **1–55**.
  - All `ti` must be unique (no duplicates on a single ticket).
- A player can buy multiple tickets per round.

### 1.2 Winning draw

- For each round, the protocol draws **6 distinct winning numbers**:
  - `W = {w1, w2, w3, w4, w5, w6}`
  - Each `wi` is in **1–55**, all unique, drawn at random.
- A ticket’s result is determined by how many of these 6 winning numbers it contains, **in any order**.

Formally:

> Let `m = |T ∩ W|`, the number of matching numbers between the ticket and the winning set.  
> `m` can be 0, 1, 2, 3, 4, 5, or 6.

### 1.3 Round timing

- **Testing phase:** rounds last **10 minutes**.
- **Mainnet phase:** rounds target **1 round per day** (e.g., 24 hours), configurable.
- Round `N` has:
  - `startTime_N`
  - `endTime_N = startTime_N + roundDuration`

When `block.timestamp >= endTime_N`, the round is **closed for new tickets** and waits to be finalized.

---

## 2. Ticket Purchase & Round Lifecycle

### 2.1 Buying tickets (OPEN state)

When round `N` is OPEN:

1. A user calls `buyTickets(N, tickets[])`, where `tickets[]` is a list of 6-number combinations.
2. The contract:
   - Verifies round `N` is currently OPEN and not expired.
   - Checks each ticket:
     - 6 numbers, all in [1, 55].
     - All 6 numbers are unique.
   - Charges `tickets.length * ticketPrice` in pSSH.
   - Records each ticket in storage, associated with:
     - `roundId = N`
     - `buyer = msg.sender`
     - `numbers = {t1..t6}`.

### 2.2 Closing & finalizing a round (LOCKED → FINALIZED)

- When `block.timestamp >= endTime_N`, round `N` becomes **LOCKED**:
  - No more ticket purchases.
  - Its closing block and metadata are recorded for randomness.

- The next time *any* user calls `buyTickets` after that:
  - The contract first **finalizes round N**:
    1. **Randomness**: derive a random seed from PulseChain block data + round info  
       (e.g., using a future blockhash relative to the closing block).
    2. **Draw winning numbers**:
       - Use the seed to sample 6 distinct numbers between 1 and 55.
    3. **Compute prize brackets** and allocate the 55% pool.
    4. **Send the 25% share** of `roundPot_N` to the SuperStake stake address in pSSH.
    5. **Add 20%** of `roundPot_N` to the **pSSH MegaMillions bank**.
    6. **Update free-ticket credits** for losing players.

  - Then it opens **round N+1** and processes the new `buyTickets` call as the first purchase in that round.

From the user’s perspective:  
> If a round has ended, the next ticket purchase both closes out the old round and starts the new one.

---

## 3. Prize Structure (Immediate Winners — 55% of roundPot)

For every round, let `roundPot` be the total pSSH collected from ticket sales.

- **55% of `roundPot`** is designated as the **immediate winners pool**.
- This 55% is split into 6 bracket pools based on `m = number of matches`.

### 3.1 Brackets

- **Bracket 6 (Jackpot):** `m = 6` (match all 6 numbers)
- **Bracket 5:** `m = 5`
- **Bracket 4:** `m = 4`
- **Bracket 3:** `m = 3`
- **Bracket 2:** `m = 2`
- **Bracket 1:** `m = 1`

If `m = 0`, the ticket does not win in that round (but may earn a free ticket credit — see Section 5).

### 3.2 Percentage allocation of `roundPot`

Within the **55% winners pool**, the suggested distribution is:

- **Bracket 6:** 25% of `roundPot`
- **Bracket 5:** 10% of `roundPot`
- **Bracket 4:** 8% of `roundPot`
- **Bracket 3:** 6% of `roundPot`
- **Bracket 2:** 4% of `roundPot`
- **Bracket 1:** 2% of `roundPot`

These sum to 55%:

> 25 + 10 + 8 + 6 + 4 + 2 = 55

### 3.3 Per-ticket payout by bracket

For each bracket `k ∈ {1..6}`:

- Let `pool_k` be the pSSH allocated to that bracket.
- Let `winnerCount_k` be the number of tickets whose highest match-count bracket is `k`.

If `winnerCount_k > 0`:

> `payoutPerTicket_k = pool_k / winnerCount_k`

If `winnerCount_k == 0`:

- `pool_k` is considered **leftover**:
  - For brackets 1–4, leftovers naturally roll forward to fatten future winners pools or may be added to a separate bonus pool.
  - For brackets 5–6, leftovers contribute to **free ticket funding** and the **pSSH MegaMillions bank** (see Section 4.3 and 5.2).

---

## 4. Token Flows: pSSH

### 4.1 Per-round pSSH split

Every round’s `roundPot` in pSSH is split as:

- **55%** → Immediate winners (Section 3).
- **25%** → Sent directly to the fixed **SuperStake stake address** in pSSH.
- **20%** → Added to the **pSSH MegaMillions bank**.

Formally:

- `winnersPool = 0.55 * roundPot`
- `superStakeAllocation = 0.25 * roundPot`
- `megaPsshBank += 0.20 * roundPot`

### 4.2 SuperStake stake address

- The lottery contract is not responsible for managing HEX staking itself.
- It simply forwards the **25% pSSH allocation** each round to the pre-existing **SuperStake stake address**, which is already set up to earn HEX based on SuperStake mechanics.

### 4.3 Leftover from high brackets (5 & 6)

If after paying bracket 5 or 6 winners there is still unallocated pSSH in `pool_5` or `pool_6`:

- Let `leftoverHigh = leftoverFromBracket5 + leftoverFromBracket6`.

This `leftoverHigh` is split as:

- **X%** → **Free Ticket Reserve** (funds free tickets for losing players).  
- **(100 − X)%** → **pSSH MegaMillions bank**.

A reasonable starting point:

- **40%** → Free Ticket Reserve
- **60%** → MegaMillions pSSH bank

So:

- `freeTicketReserve += 0.40 * leftoverHigh`
- `megaPsshBank += 0.60 * leftoverHigh`

---

## 5. Free Ticket Mechanics

### 5.1 Intuition

You want a system where:

> Any user who **does not win** in a round gets **1 ticket into the next round** until they do win (any bracket).

To keep this gas-safe, free tickets are handled as **credits**, redeemed when the player next buys tickets.

### 5.2 Logic

For each round `N`:

- For each wallet that bought at least 1 paid ticket:
  - If **none of their tickets** hit any bracket (all `m = 0`):
    - They earn **1 free ticket credit for round N+1**.
  - If **any ticket** they own in round N hits bracket `m ≥ 1`:
    - Their loss streak resets, and they do not get a free ticket for N+1.

When round `N+1` is OPEN and a wallet with a free ticket credit calls `buyTickets`:

- The contract:
  - Grants them **1 extra ticket** at **0 pSSH cost**.
  - That free ticket uses the same 6-of-55 format; they pick the numbers in the UI.
  - The cost of that free ticket is internally funded from `freeTicketReserve`.
  - After use, their **free ticket credit is reset**.

### 5.3 Solvency

- Free tickets are **capped** by the amount in `freeTicketReserve`.
- If `freeTicketReserve` is insufficient to cover all potential free tickets:
  - The protocol can:
    - Limit the number of free tickets per round, or
    - Reduce free tickets in proportion to available reserve.
- This ensures the system does not become undercollateralized by overly generous free ticket issuance.

---

## 6. pSSH MegaMillions (Every 55th Round)

### 6.1 MegaMillions bank

- The **pSSH MegaMillions bank (`megaPsshBank`)** grows from:
  - 20% of every round’s `roundPot`.
  - A share of leftover high-tier pools (brackets 5 & 6) as defined above.

### 6.2 MegaMillions schedule

- Rounds are numbered: 1, 2, 3, ...
- When `roundId % 55 == 0`, that round is a **MegaMillions round**.

### 6.3 What happens in a MegaMillions round

On a MegaMillions round `R`:

1. The contract takes the **current `megaPsshBank`**.
2. It deposits most of it into that round’s high brackets, for example:
   - **80% → bracket 6 pool** for round `R`.
   - **20% → bracket 5 pool** for round `R`.
3. After allocation, `megaPsshBank` is reset to 0:
   - `megaPsshBank = 0`

Effect:

- Every 55th round has a **massive boosted top prize**, backed by all previous rounds’ Mega contributions.
- If nobody hits those high brackets that round, leftoverHigh logic (Section 4.3) kicks in and starts the cycle again.

---

## 7. HEX Flows & Overlay Jackpot

### 7.1 HEX accumulation

- Because the lottery contract and/or its associated pSSH balances participate in SuperStake mechanics, the contract address will gradually **receive HEX**.
- All HEX held directly by the lottery contract is treated as the **HEX bank**:
  - `hexBank = total HEX balance of the lottery contract`.

### 7.2 HEX overlay trigger

- Anytime a ticket hits **Bracket 6 (m = 6)** in any round:
  - This is a **HEX overlay event**.

At that moment:

1. Compute:
   - `hexPrize = 70% of hexBank`
   - `hexToSuperStake = 30% of hexBank`
2. Distribute:
   - `hexPrize` is split across all bracket 6 winning tickets for that round (pro rata or equally).
   - `hexToSuperStake` is sent to the **SuperStake HEX stake address**.
3. After distribution:
   - `hexBank` is effectively reset (only future incoming HEX rebuilds it).

### 7.3 Combined effect

- The longer the system runs without a bracket 6 winner, the larger the **HEX overlay jackpot** grows.
- A MegaMillions round where someone also hits 6/6 numbers will be absurdly explosive:
  - They get the normal 25% jackpot share of `roundPot`,
  - The MegaMillions boosted pool if it’s a 55th round,
  - And **70% of all accumulated HEX** in the contract.

---

## 8. Randomness & Fairness (PulseChain-Friendly)

### 8.1 No external oracle

- PulseChain currently does not have a production-ready on-chain VRF oracle like Chainlink VRF.
- Therefore, randomness uses a **deterministic, best-effort on-chain scheme** based on block data and round state.
- Standard lotteries use purely mechanical randomness; on-chain lotteries often rely on VRF or blockhash-based techniques.   

### 8.2 Example scheme

1. On round close:
   - Store `closingBlockNumber`.
2. On finalization:
   - Use a future blockhash relative to `closingBlockNumber` as input:
     - `seed = keccak256( blockhash(closingBlockNumber + K), roundId, totalTickets )`
     - Where `K` is some offset (e.g., 5–20) to reduce simple manipulation.
3. Derive six unique numbers between 1 and 55 from this seed:
   - `W1..W6` are sampled from the range [1, 55] without replacement using deterministic hashing.

This scheme is:
- **Transparent & verifiable**: anyone can recompute the draw.
- Not as secure as a true VRF, but acceptable given pot sizes and the game’s transparent nature.

---

## 9. Odds Snapshot (6-of-55 Structure)

For a 6-of-N lotto, the number of possible combinations is `C(N, 6)`.

- For SuperStake Lottery:
  - `N = 55`
  - Total combinations: `C(55, 6) = 28,989,675`
- So the **jackpot odds** (match all 6) are **1 in 28,989,675** per ticket.
- This is in the same ballpark as traditional 6-of-49 lotteries (1 in ~14 million) but slightly harder due to the larger pool.   

Lower brackets have much better odds, which is why their per-winner payouts are smaller — consistent with the design of major lotteries like Powerball and Mega Millions, which also spread prizes across many tiers.   

---

## 10. Player Experience Summary

When a user plays SuperStake Lottery, they get:

1. **Daily 6-of-55 action** with:
   - Multiple prize brackets,
   - User-chosen “lucky numbers,”
   - Short rounds (or daily draws).
2. **Built-in progression**:
   - Free ticket credit whenever they whiff completely in a round,
   - Reset once they hit any win.
3. **Deep protocol alignment**:
   - 25% of every pot and 30% of all HEX overlay events grow the core SuperStake HEX stake.
4. **Two types of massive jackpots**:
   - **pSSH MegaMillions** (every 55th round from the Mega bank),
   - **HEX overlay jackpot** (detonates whenever someone finally hits 6/6).

All of this runs on-chain, is fully auditable, and is powered by SuperStake’s existing HEX-based yield engine.
