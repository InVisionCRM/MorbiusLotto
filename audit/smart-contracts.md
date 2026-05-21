# MORBlotto Smart Contract Audit

Scope: every `.sol` file in `contracts/contracts/` (15 production contracts + 2 test tokens). PulseChain (chainId 369). Solidity 0.8.28, OZ ^5.4 (Ownable, ReentrancyGuard, Pausable, SafeERC20, MerkleProof, EIP-2612 permit).

## TL;DR — money-at-risk findings

1. **All on-chain RNG is predictable / manipulable** (`Plinko`, `CryptoKeno`, `Roulette`, `BigWheel`, `InstantLottery6of55`). Entropy = `blockhash + block.timestamp + msg.sender + counter + tx.gasprice` (plus `block.prevrandao` in BigWheel). A miner / validator / sufficiently-funded MEV searcher with mempool visibility can pre-compute the outcome and only submit winning transactions (or sandwich-bundle to drop losing ones). On a small/young chain like PulseChain this is meaningfully cheaper than on Ethereum mainnet. This is the single largest exposure — the entire bankroll of every game contract is drainable by a player who controls a validator (or rents one for one block).
2. **`BigWheel` has a commented-out reserve check on payout** (`Plinko.sol`-style line was disabled "for testing"). Once liquidity exists in the contract, anyone can bet 10k MORBIUS and trigger a 40x payout (400k) regardless of whether the contract has the funds — the wrapped `safeTransfer` simply reverts if balance is low, but the `contractReserve` accounting is bypassed. Combined with `_processMorbiusPayment` being called twice in the PLS path (see SC-014), this is a critical accounting bug.
3. **PLS price-feed via PulseX spot price (single block, no TWAP)** is sandwich-attackable across all five PLS entrypoints. An attacker can move the MORBIUS/WPLS pool, get a favorable MORBIUS-equivalent wager credit, play the game, then unwind the pool — netting a free wager on the house bankroll.
4. **`MorbiusTournament.payout` allows the authorized server to pay out from the *prizePool* without restricting it to actual buy-in funds**, and `setActive` / `setCompleted` can move state in any direction with no checks. A compromised server key drains every active platform-MORBIUS tournament. There is no two-step ownership, no timelock, no operator multi-sig pattern, and no per-tournament prize cap.
5. **Tests cover only `TournamentPrizeEscrow` V5/V6** (`contracts/test/`). Zero on-chain tests for Plinko, Keno, Roulette, BigWheel, Blackjack, InstantLottery, MorbiusTournament, the staking contracts, the distributor, or the Merkle claims. **The single largest mitigation here is to gate the V6 deploy on writing a tournament adversarial suite and at least one round-trip test per game.**

## Severity legend

- **Critical** — funds drainable by a low-resourced attacker. Fix before any further deposits.
- **High** — funds drainable by a privileged or resourced attacker (validator/MEV/compromised server key), or funds locked.
- **Medium** — accounting drift, griefing, or a path that pushes losses to LPs / holders / treasury.
- **Low** — code-quality, missing event, soft DoS that doesn't risk principal.
- **Info** — design observation, no security implication on its own.

## Complexity legend (for fixes)

- **1** — single-line / single-function change, no migration.
- **2** — refactor inside one contract.
- **3** — multi-contract change OR storage layout change (redeploy + migrate).
- **4** — new contract / oracle / VRF integration; redeploy + state migration.
- **5** — architectural rewrite.

Note: every "redeploy" entry implies migrating reserves / open tournaments / open Blackjack reserves / Merkle epoch state to the successor contract address — non-trivial off-chain work.

## Contract inventory

| Contract | File | Purpose | 1-line risk note |
|---|---|---|---|
| Plinko | `contracts/Plinko.sol` | Variable-wager ball drop with risk-weighted multipliers, MORBIUS + PLS entry, reserve-funded payouts | Predictable RNG; PLS-path uses sandwich-able spot price; large `MAX_BALLS_PER_DROP=100` × max-wager × 200x = unbounded single-tx drain if reserve permits |
| CryptoKeno | `contracts/CryptoKeno.sol` | Instant 20-of-80 Keno, MORBIUS + PLS, reserve-funded, MAX_PAYOUT 2.5M MORBIUS | Predictable RNG; cap protects against catastrophic single hit but multiple plays in same block share same seed inputs |
| Roulette | `contracts/Roulette.sol` | European single-zero roulette, up to 15 simultaneous bets, MORBIUS + PLS | Predictable RNG; **fee-on-buy ratio scaling rounds in operator's favor by 1 wei × N**; `emergencyWithdraw` drains contractReserve to zero without per-game refund path |
| BigWheel | `contracts/BigWheel.sol` | Big-Six wheel, 7 segments equal probability, MORBIUS + PLS | **Reserve check commented out**, PLS path calls `_processMorbiusPayment` twice (double-transfer / double-burn), payout has no upper bound |
| InstantLottery6of55 | `contracts/InstantLottery6of55.sol` | Pick-6 of 55, instant resolve, MORBIUS + PLS, optional operator-resolved variant | Predictable RNG in on-chain mode; operator mode is sound *if* operator-side RNG is secure |
| BlackjackV2 | `contracts/BlackjackV2.sol` | Off-chain blackjack with on-chain reserve + EIP-712 signed payouts | Authorized server can sign unlimited withdrawals up to daily caps; cap is high (1M / user / day); `withdrawWithSignature` has no nonce range / TTL bounding on the server side |
| MorbiusTournament | `contracts/MorbiusTournament.sol` | On-chain tournament creation, join, MORBIUS prize-pool tracking | Authorized server can `payout()` arbitrary amounts from `prizePool`, `setActive`/`setCompleted` not guarded by state machine, no creator-reclaim path for platform-MORBIUS tournaments |
| TournamentPrizeEscrowV5 | `contracts/TournamentPrizeEscrowV5.sol` | Bytes32-keyed escrow for tournament prize pools (push + pull payout) | Reasonable design; `tournamentIds[]` is append-only and read in some views — gas creeps over time but no security impact |
| TournamentPrizeEscrowV6 | `contracts/TournamentPrizeEscrowV6.sol` | Gas-optimized V5 successor, identical surface + EIP-2612 permit variants | Same risk surface as V5 + uint128 cap (≈3.4e20 whole tokens — fine for MORBIUS, document for partners) |
| MorbiusStaking | `contracts/MorbiusStaking.sol` | Stake MORBIUS, claim proportional MORBIUS rewards, 5% unstake fee | Synthetix-style accounting; relies on `lastBalance` invariant being kept in sync — owner `rescueExcess` is safe, but any direct `MORBIUS_TOKEN.balanceOf(this)` mutation outside the contract's transfer functions silently corrupts `lastBalance` (no mitigation) |
| MorbiusLPStaking | `contracts/MorbiusLPStaking.sol` | Stake MORBIUS/WPLS PLP, earn MORBIUS rewards | Same Synthetix pattern; no unstake fee |
| MorbiusHolderDistributor | `contracts/MorbiusHolderDistributor.sol` | Reward-per-token for MORBIUS holders (circulating-based) | Hard-coded LP / contract list — every new game / LP requires owner intervention; minimum holding gate is recoverable |
| MerkleClaimMorbius | `contracts/MerkleClaimMorbius.sol` | Multi-epoch Merkle drop for MORBIUS holder rewards | `rescueTokens` can drain claimable tokens (no exclusion); owner-trust required |
| MerkleClaimLP | `contracts/MerkleClaimLP.sol` | Multi-epoch Merkle drop for LP rewards | Same `rescueTokens` exposure as MerkleClaimMorbius |
| KenoStats | `contracts/KenoStats.sol` | View-only helper for CryptoKeno | **Stale: ICryptoKeno interface no longer matches deployed CryptoKeno; every getter reverts** — dead contract that ABI-callers may still hit |
| TestToken / TestPermitToken | `contracts/test/` | Test fixtures | Public `mint` — must NEVER be deployed to PulseChain mainnet |

---

## Findings

### SC-001 — Predictable on-chain randomness across all casino games  **[Critical]**  · Complexity 4
**Contracts:** `Plinko`, `CryptoKeno`, `Roulette`, `BigWheel`, `InstantLottery6of55`

Each game derives its outcome from:
```solidity
keccak256(abi.encodePacked(
  blockhash(block.number - 1),
  block.timestamp,
  msg.sender,
  <some counter>,
  tx.gasprice
  // and block.prevrandao in BigWheel
))
```
Every input is either:
- Public at the time the transaction lands in the mempool (block hash of N-1, msg.sender, gasprice).
- Validator-controllable for the current block (block.timestamp, prevrandao on PoS Ethereum — PulseChain inherits the same primitive).
- Contract-state-derived from values that are also public reads (`totalDrops`, `globalTicketCount`, `globalSpinCount`).

A validator (or a player who pays a validator out-of-band) can:
1. Read mempool, simulate the outcome on every candidate inclusion order.
2. Include only the player's winning permutations and drop the losing ones (or re-bundle).
3. On Plinko, the player additionally controls the loop nonce by choosing `count` — a validator can pick a `count` that lands every ball on the 200x bucket.

PulseChain is small enough that solo/colluding-validator strategies are realistic in a way they aren't on Ethereum mainnet.

The `tx.gasprice` field is also user-controlled — it's a knob, not entropy.

`CryptoKeno.MAX_PAYOUT = 2.5M MORBIUS` mitigates a single-tx jackpot but does nothing for repeated single-block plays summing past the cap.

**Recommendation:** integrate a VRF (chainlink-style; if unavailable on PulseChain, run a commit-reveal scheme where the player commits a hash, server reveals after a fixed block delay, and outcome is `keccak256(playerSecret, serverSecret, futureBlockhash)`). For instant-play UX, route games through a server-resolved variant like `InstantLottery6of55.resolvePlay` — but only after that path has been verified to never use `Math.random()` server-side and the operator key is in an HSM.

---

### SC-002 — BigWheel reserve check disabled; double-process in PLS path; no payout cap  **[Critical]**  · Complexity 2
**Contract:** `BigWheel`

In `_processMorbiusPayment`:
```solidity
// TESTING: Skip reserve check - just pay from contract balance
// if (contractReserve < payout) revert InsufficientContractBalance();
// contractReserve -= payout;
MORBIUS_TOKEN.safeTransfer(msg.sender, payout);
```
`contractReserve` is never decremented on payout. The accounting variable diverges from real balance every time a player wins. There is no upper bound on `payout` either — max bet × max multiplier = 10,000 × 40 = 400,000 MORBIUS per spin, all from contract balance.

`_processPLSPayment` ends by calling `_processMorbiusPayment(betAmount, payout)` *after* having already swapped PLS → MORBIUS into the contract. This means the **bet is paid out twice**: once implicitly by the swap (contract holds the bet's worth of MORBIUS), and once explicitly inside `_processMorbiusPayment` which transfers the player's stated bet amount *again*. The 10% burn fee also fires twice.

Additionally `BURN_FEE_BPS = 1000` (10%) — this contradicts the project's standard "5% total" fee split. Either BigWheel has a different model or it predates the standard; either way the inline comment "// Fee distribution (basis points) - just like Plinko" is incorrect.

`emergencyWithdraw(uint256 amount)` takes any amount without bound, no `nonReentrant`. (Lower risk because only owner.)

`block.prevrandao` is added to the seed input — see SC-001 for why this isn't sufficient.

**Recommendation:** uncomment the reserve check, remove the double-call in PLS path, decide on the canonical fee model, add `nonReentrant` to `emergencyWithdraw`. If BigWheel is not yet live with material liquidity, redeploy. If it is, pause it now.

---

### SC-003 — `MorbiusTournament.payout` lets the server drain prize pools  **[High]**  · Complexity 2
**Contract:** `MorbiusTournament`

```solidity
function payout(uint256 tournamentId, address winner, uint256 amount) external onlyAuthorizedServer nonReentrant {
    // ...
    require(amount <= t.prizePool, "Exceeds pool");
    t.prizePool -= amount;
    MORBIUS_TOKEN.safeTransfer(winner, amount);
}
```
There is no requirement that:
- The winner ever joined the tournament (`hasJoined[tournamentId][winner]` not checked).
- The tournament has completed (`t.status` allows Active or Completed; Active means a single live game).
- Anyone other than the server has signed off on the result.

A compromised `authorizedServer` (or simply a bug in the server-side payout logic) can drain every platform-MORBIUS tournament prize pool to any address, at any time.

`setActive` and `setCompleted` likewise have no state-machine constraint: server can call `setCompleted` on an Open tournament and then `payout()` before any games run. `cancelTournament` has no balance check before flipping status — leaving `refund()` callable, but `refund` doesn't decrement entryCount safely if `t.buyInAmount > t.prizePool` (under-counted prize pool from earlier `payout()`).

**Recommendation:**
1. Add `require(t.status == TournamentStatus.Completed, "Not completed")` to `payout`.
2. Require `hasJoined[tournamentId][winner]` OR explicit operator signature including a winner attestation.
3. State machine: Open → Active → Completed; Completed → Payout. No reverse transitions.
4. Add a max-per-winner cap of `t.prizePool` at completion time.

---

### SC-004 — PulseX spot price has no slippage protection or TWAP across all PLS entrypoints  **[High]**  · Complexity 3
**Contracts:** `Plinko.buyBallsWithPLSAndDrop`, `CryptoKeno.playKenoWithPLS`, `Roulette.spinWithPLS`, `InstantLottery6of55.playLotteryWithPLSWithPLS`, `BlackjackV2.deposit`

Every PLS entrypoint queries `IPulseXRouter.getAmountsOut(msg.value, [WPLS, MORBIUS])` to convert PLS → MORBIUS equivalent — a single-block spot quote with no TWAP or oracle.

A sandwich attack:
1. Attacker front-runs the player's tx: swap large amount of MORBIUS → WPLS, depressing MORBIUS price (so the pool quotes *more* MORBIUS per PLS).
2. Player's tx lands; the contract credits the player with the inflated MORBIUS equivalent.
3. Attacker back-runs: swap WPLS → MORBIUS to restore the pool plus profit.

The economic damage depends on pool depth, but on a project token's own pool it's typically very large. For Blackjack the attacker credits themselves with a free over-funded reserve. For Plinko / Keno / Roulette / Lottery the over-credited wager size pushes them past `minWager` while the *actual* PLS sent was tiny — and the payout then comes from the contract reserve at the inflated rate.

Note: in `Plinko.buyBallsWithPLSAndDrop`, payouts are pulled from `plsTreasury` not from `contractReserve`. The treasury must have approved this contract for MORBIUS. So a compromised treasury approval bound by a one-shot `approve(MAX_UINT256)` is the worst case.

**Recommendation:** use a TWAP-based oracle (PulseX V2 reserves snapshot averaged over ≥5 minutes), or have the server (off-chain) sign a price commitment and pass it via EIP-712. Alternatively, cap the per-tx MORBIUS-equivalent at a fixed PLS multiplier so sandwich profitability is bounded.

---

### SC-005 — `Plinko.buyBallsAndDrop` single-tx drain via MAX_BALLS_PER_DROP × 200x  **[High]**  · Complexity 1
**Contract:** `Plinko`

`MAX_BALLS_PER_DROP = 100`; `maxWagerPerBall` is owner-settable with no upper bound; `HIGH_RISK_MULTIPLIERS` peaks at 20000 bps = 200x.

If the owner sets `maxWagerPerBall = 10_000e18`, a single tx can produce `100 × 10_000 × 200 = 200,000,000 MORBIUS` gross payout (200M MORBIUS). The contract reverts only on `contractReserve < totalPayout`, so a single lucky drop within the configured ceiling can drain the bankroll.

Combined with SC-001 (predictable RNG), a validator can guarantee this outcome.

**Recommendation:** add a per-tx maximum gross payout (like `CryptoKeno.MAX_PAYOUT = 2.5M`), or cap the total `count * wagerPerBall * maxMultiplier` at a fraction of `contractReserve` (e.g., 5%).

---

### SC-006 — `Roulette.emergencyWithdraw` resets contractReserve to zero unconditionally  **[High]**  · Complexity 1
**Contract:** `Roulette`

```solidity
function emergencyWithdraw() external onlyOwner {
    uint256 balance = token.balanceOf(address(this));
    contractReserve = 0;
    token.safeTransfer(msg.sender, balance);
}
```
No `whenPaused`, no `nonReentrant`, no event-emit (event declared but not used). If the contract has active spins that paid into reserve but haven't paid out, this is fine because the spin is atomic. But it does mean the owner can drain at any moment without preconditions — the contract has no time-lock or pause-gate around emergencyWithdraw.

Compare `BlackjackV2.emergencyWithdraw`: that one requires `emergencyPaused` and protects `totalReserves`. Roulette has no equivalent protection.

**Recommendation:** require `_pause()` to have been called first; emit the existing `EmergencyWithdraw` event.

---

### SC-007 — `MorbiusTournament` allows custom-token tournaments that bypass escrow accounting  **[High]**  · Complexity 2
**Contract:** `MorbiusTournament`

For `prizeToken != address(0)` (custom token) tournaments:
```solidity
} else {
    MORBIUS_TOKEN.safeTransferFrom(msg.sender, platformFeeWallet, t.buyInAmount);
}
```
Buy-ins for *custom-token* tournaments go to the platform fee wallet, but the contract still increments `t.entryCount`. There is no requirement that the corresponding prize-token amount has been deposited to `TournamentPrizeEscrow`. A user can join, pay MORBIUS to platform, and find the prize doesn't exist. Refunds via `cancelTournament` cannot recover the funds (they went to platform, not back to the contract). The `refund()` function explicitly excludes custom-token tournaments: "Custom token: use escrow creatorReclaim" — but the platform-bound MORBIUS is unrecoverable.

**Recommendation:** for custom-token tournaments, require an on-chain link to a funded escrow pool (call `TournamentPrizeEscrowV6.getRemainingBalance(...)`) at create-time, AND route buy-ins back to the player on cancel. Alternatively, drop custom-token tournaments entirely until escrow integration is bidirectional.

---

### SC-008 — `Roulette` proportional fee scaling rounds against the player by ≥ 1 wei per bet  **[Medium]**  · Complexity 2
**Contract:** `Roulette._validateAndSpin`

```solidity
uint256 feeRatio = (morbiusWagered > 0) ? netWagered * 1e18 / morbiusWagered : 0;
for (uint256 i = 0; i < bets.length; i++) {
    uint256 netBetWager = bets[i].wager * feeRatio / 1e18;
    // ...
}
```
Two division operations stacked — each rounds down. With 15 bets per spin and unfavorable inputs, the player can lose 1 wei × 15 = 15 wei in implied wager per spin. Negligible per spin, but observable in aggregate and on the *house's* side of the ledger (the missing wei stays in `contractReserve`). Also note `_distributeFees` for PLS path pulls a `feeDist + feeBurn + feePlatform + feeLp` total — and then pulls `netWagered` separately — so the integer truncation of `_computeFees` is conserved (sums back to `morbiusWagered`). The fee-vs-house ratio is consistent, but the per-bet scaling is not. Off-chain expected-value calculations for players will be slightly optimistic.

Minor — flag but not urgent.

---

### SC-009 — `Plinko` BUCKET_THRESHOLDS uses non-uniform distribution but multiplier RTP claims are stale  **[Medium]**  · Complexity 1 (docs) / 3 (re-tune)
**Contract:** `Plinko`

The inline comments claim "LOW RISK ~97% RTP", "MEDIUM RISK ~97% RTP", "HIGH RISK ~97.4% RTP". Given the binomial bucket distribution (center is 19.6%, edges 0.0015%) and the multiplier arrays, none of these claims have been algebraically verified in the codebase. The default multipliers may not deliver the stated RTP. A miscalibrated paytable that pays > 100% RTP would bleed reserve. A miscalibrated paytable that pays < 90% would be a regulatory/marketing problem.

Recommendation: write a unit test that computes `Σ probability(bucket) × multiplier(bucket) / 100` for each risk level and asserts the RTP is within tolerance of the stated number.

---

### SC-010 — `setBucketMultipliers` allows owner to push RTP arbitrarily  **[Medium]**  · Complexity 1
**Contract:** `Plinko`

```solidity
if (newMultipliers[i] > 100000) revert InvalidMultipliers(); // Max 1000x
```
Bounded per-bucket, but not bounded *in aggregate*. Owner can set all 17 buckets to 1000x and players win 1000x every drop — direct bankroll drain by owner action. Conversely, owner can set all to 1x and effectively halt payouts. Same concern for `setBucketThresholds`: owner can rebalance probabilities at will, and existing in-flight expectations break.

**Recommendation:** add an RTP guard: compute Σ p_i × multiplier_i and require ≤ 10000 (100% RTP) and ≥ 7000 (70% — sanity floor). Or, time-lock multiplier changes 24h.

---

### SC-011 — `BlackjackV2` daily caps are weak; settleGame max-multiplier × 3 is permissive  **[Medium]**  · Complexity 2
**Contract:** `BlackjackV2`

- `MAX_DAILY_WITHDRAWAL = 1_000_000e18` per-user. A single user with N addresses can rotate through; no rate limit per `tx.origin` or per `block.number`.
- `dailyWithdrawalTotals[today] <= MAX_DAILY_WITHDRAWAL * 10` — 10M MORBIUS/day global. With a $0.01 token price, that's a $100k/day exfil cap. Healthy enough at low prices, dangerous if token climbs.
- `settleGame` checks `totalPayout <= pendingGame.betAmount * 3`. Blackjack max payout is 2.5x (blackjack 3:2 + double = 2.5x). 3x leaves headroom but allows server bugs (e.g., paying double-bet on top of bet) to land within bounds.

`withdrawWithSignature` does not constrain `expiryTimestamp` upper bound — a server could sign a withdrawal with `expiryTimestamp = type(uint256).max`, valid forever. If that signature is leaked the player can withdraw any time after the fact. Cap to e.g. `block.timestamp + 1 hour` server-side.

The `revealServerSeed` function is open to anyone but only emits an event — it's an honest-broker mechanism and has no fund-moving effect, so safe. But a third party can grief-front-run a server reveal by submitting a phony seed first — except `keccak256(serverSeed)` would not match, so the actual contract effect is benign.

---

### SC-012 — `KenoStats` references a stale interface and will revert on every call  **[Medium]**  · Complexity 1
**Contract:** `KenoStats`

`ICryptoKeno` declares fields (`firstRoundId`, `draws`, `wagerPerDraw`, `drawsRemaining`) and methods (`paytable(uint8, uint8)`, `claimed(uint256, uint256)`, `rounds(uint256)`, `currentRoundId()`, `roundDuration()`, `pendingBurnToken()`) that **do not exist** in the current `CryptoKeno.sol` (which is instant-play and has `Ticket` with `winningNumbers`, `hits`, `grossPayout`, etc.). Every getter in KenoStats will revert with "function selector not recognized" the moment it's called against the real Keno contract.

If anything in the frontend or off-chain tooling routes through KenoStats, it will be silently broken. No security impact in itself, but it's evidence that the on-chain surface is not actively validated against the off-chain consumers.

**Recommendation:** delete this contract OR rewrite to match the current `CryptoKeno` interface. If it's already deployed, mark it as legacy and stop linking it from `lib/contracts.ts`.

---

### SC-013 — `MerkleClaim*` `rescueTokens` can drain claimable funds  **[Medium]**  · Complexity 1
**Contracts:** `MerkleClaimMorbius`, `MerkleClaimLP`

```solidity
function rescueTokens(address token, uint256 amount) external onlyOwner {
    IERC20(token).safeTransfer(msg.sender, amount);
    emit TokensRescued(token, amount);
}
```
No restriction on which token, no check that pulling MORBIUS leaves enough for outstanding epoch claims. An owner key compromise drains all unclaimed rewards across all open epochs. Both contracts permit this. This is the classic "I'm the owner so I rescue everything" foot-gun.

**Recommendation:** when `token == address(morbiusToken)`, require `amount <= contractBalance - Σ epochUnclaimedAmount(...)`. Cannot enumerate epochs cheaply in the current design — add an `epochIds[]` array on epoch creation, or pass the array of active epochIds to `rescueTokens`.

---

### SC-014 — `BigWheel` PLS-path double payment + missing refund handling  **[High]**  · Complexity 2
**Contract:** `BigWheel._processPLSPayment`

Already covered by SC-002 but worth its own ID. Specifically:

1. `WPLS.deposit{value: msg.value}` — contract now holds WPLS for full msg.value.
2. `WPLS.approve(router, msg.value)` then `swapExactTokensForTokens(msg.value, betAmount, …)` — contract now holds at least `betAmount` MORBIUS plus may still hold excess WPLS.
3. `_processMorbiusPayment(betAmount, payout)` — this calls `MORBIUS_TOKEN.safeTransferFrom(msg.sender, address(this), totalCost)` **even though the player only sent PLS**. Will revert if the player has no MORBIUS approved (good — entrypoint is effectively dead under that contract). If the player *does* approve MORBIUS, they pay twice: once in PLS (already swapped) and once directly in MORBIUS.

There is *also* a "refund excess WPLS" path that withdraws WPLS to PLS and `payable(msg.sender).transfer(excessWpls)` — using `.transfer` with a 2300 gas limit, which can fail for contract-account players.

The whole `placeBetWithPLS` flow is broken. It either reverts (good for player, bad for UX) or charges double (bad for player). Given there's no test for it, it's likely that the flow has never actually been exercised end-to-end on chain.

**Recommendation:** rewrite to match the Plinko / Keno / Roulette pattern (PLS → treasury, MORBIUS pulled from treasury). Or delete the PLS path if BigWheel isn't a priority game.

---

### SC-015 — `MorbiusStaking.lastBalance` corruption if anyone calls `MORBIUS_TOKEN.transfer(staking, X)` without `updatePool()`  **[Low]**  · Complexity 1
**Contract:** `MorbiusStaking`, `MorbiusLPStaking`

Both contracts derive new rewards from `MORBIUS.balanceOf(this) - lastBalance`. If MORBIUS is sent and someone then calls `stake()` (which calls `updatePool()` first, *good*), the new rewards are correctly attributed. But `unstake` and `claim` also call `updatePool()` first — so the new rewards get attributed before the user's balance changes — *good*.

The fragile part: `rescueExcess` decrements `lastBalance` by `unallocatedRewards` then transfers the amount. The amount transferred *also* reduces `balanceOf(this)`. So after `rescueExcess`, both sides drop by the same amount — balanced. Tested by inspection.

Where this can break: a token with a fee-on-transfer or rebasing mechanic would diverge `lastBalance` from actuals. MORBIUS itself is stated as non-fee-on-transfer, so OK in practice — but consider an `assert(MORBIUS_TOKEN.balanceOf(this) == lastBalance + totalStaked - totalPaidOut)` invariant in tests if you add any.

Also note: there's no test for either staking contract. The accounting is non-trivial; recommend adding at least a "stake, send rewards, two users claim, sum equals rewards" round-trip test.

---

### SC-016 — `MorbiusHolderDistributor` hardcodes addresses; circulating supply quietly degrades  **[Low]**  · Complexity 1
**Contract:** `MorbiusHolderDistributor`

Burn, LP, and game-contract addresses are constants. Whenever a new game launches (Roulette, BigWheel weren't in the constants list and would be missed), the distributor's `getCirculating()` overcounts circulating supply — every holder claims slightly more than their true pro-rata share, draining the contract slightly faster than designed.

`addExcludedAddress` lets the owner patch this, but only if someone remembers to call it. There's no automated discovery and the function does no verification (e.g., the added address actually holds MORBIUS).

**Recommendation:** add a deploy checklist and a runtime assertion that the sum of excluded balances < totalSupply.

The `lastBalance` accounting in `claim()` also recalculates `lastBalance = MORBIUS_TOKEN.balanceOf(address(this)) - amount` *after* a transfer — that's the post-transfer balance, correct.

---

### SC-017 — `InstantLottery6of55.resolvePlay` relies on operator off-chain RNG with no commit-reveal  **[Medium]**  · Complexity 3
**Contract:** `InstantLottery6of55`

The operator-resolved variant is intended to be the secure RNG path (the on-chain `playLottery` variant inherits SC-001). But the operator simply passes `winningNumbers` as calldata — there is no on-chain commitment proving the numbers were generated before the player's wager. A compromised or dishonest operator can pick winning numbers that miss the player's pick after seeing the wager.

The `playId` replay guard derives from `keccak256(player, wager, playerNumbers, nonce)` — replay protected, but does not bind to a server-issued commitment.

**Recommendation:** make the operator commit `keccak256(winningNumbers, salt)` on-chain *before* the player's `playLottery` tx, then `resolvePlay` includes both the numbers and salt — contract verifies hash matches the commitment. Or, operator signs an EIP-712 message containing the play parameters and the contract verifies the signature so we have an after-the-fact attestation.

---

### SC-018 — Single-step ownership (Ownable, not Ownable2Step) across all contracts  **[Low]**  · Complexity 1
**Contracts:** all

Every contract uses `OZ Ownable`. A single `transferOwnership` to a wrong address (typo, compromised key) is irrecoverable. With OZ 5.4 available, `Ownable2Step` is a drop-in replacement that requires the new owner to call `acceptOwnership`. Strongly recommended given the privileged surface (every contract has `emergencyWithdraw` or equivalent).

---

### SC-019 — Authorized-server pattern has no key rotation / multi-sig structure  **[Medium]**  · Complexity 2-4
**Contracts:** `BlackjackV2`, `MorbiusTournament`, `TournamentPrizeEscrowV5/V6`

The `authorizedServer` address signs/calls payouts. A single key:
- Has unbounded payout authority within daily caps (Blackjack) or per-pool (tournaments).
- Cannot be rotated without an `onlyOwner` tx (acceptable, but no time-lock).
- Has no nonce/sequencing besides per-game hash uniqueness.

Recommendation: deploy a `Gnosis Safe` multi-sig as the server address. Or implement a threshold signature scheme. For tournament payouts, require 2-of-N signatures on every payout via an EIP-712 multi-sig.

---

### SC-020 — `InstantLottery6of55.playLotteryWithPLS` returns no fee tracking, double pull of MORBIUS from treasury  **[Low]**  · Complexity 1
**Contract:** `InstantLottery6of55`

`playLotteryWithPLS` pulls `totalFee` from treasury, distributes fees, then *separately* pulls `grossPayout` (which is from `netWager`) from treasury and transfers to player. Two distinct `safeTransferFrom(plsTreasury, ...)` calls in the same tx. If the treasury's MORBIUS allowance is tight, the second call can revert mid-execution, leaving fees distributed but the player un-paid. The wager (PLS) was already forwarded to treasury — player loses PLS without playing.

Also note: this entrypoint *does not* update `totalDistributionFeesCollected` / `totalBurnFeesCollected` / etc. counters that the MORBIUS path tracks. (Wait — checking carefully — yes, these counters don't exist in `InstantLottery6of55`, but the MORBIUS path `_distributeWagerFees` doesn't track them either. Consistent. Not a bug.)

Recommendation: pull `totalFee + grossPayout` in one transferFrom; or wrap both calls + the player transfer behind a single try/catch + revert on the player-transfer to be atomic.

---

### SC-021 — `Roulette` PLS path includes `receive() external payable {}` with no validation  **[Low]**  · Complexity 1
**Contract:** `Roulette`

```solidity
receive() external payable {}
```
Anything can send PLS to the contract; the PLS just sits there (no `balanceOf(this)` accounting). Compare `Plinko.receive() { revert(...) }` and `BlackjackV2.receive() { revert(...) }` which actively prevent it. CryptoKeno has `receive() external payable {}` too — same finding.

Lost PLS has no recovery path (Roulette `emergencyWithdraw` only handles MORBIUS). Owner cannot extract trapped PLS without redeploying or adding a sweep function.

**Recommendation:** either revert `receive()` (consistent with Plinko/Blackjack), or add a `sweepPLS(to)` onlyOwner function.

---

### SC-022 — `TournamentPrizeEscrowV6` `addToPrizePool` slot-0 init does separate writes  **[Info]**  · Complexity 1
**Contract:** `TournamentPrizeEscrowV6._deposit`

In the first-write branch, `pool.token = token; pool.depositedAt = uint64(block.timestamp);` — each is a separate SSTORE because they're in different mappings under the hood (slot 0 of the same struct, but Solidity emits the writes serially unless the values are combined as a struct write). Marginal gas, not a security issue. The contract claims "first write: slot 0 in one SSTORE" — that's only true if you combine into a struct literal, which the current code doesn't.

Solidity 0.8.28 + viaIR may merge these into a single SSTORE; verify with `forge inspect ... storageLayout` if gas matters.

---

### SC-023 — `MorbiusTournament` has no `nonReentrant` on `createTournament`  **[Info]**  · Complexity 1
**Contract:** `MorbiusTournament`

`createTournament` makes no external calls and only writes storage, so reentrancy is moot — but tournament creation is open to anyone. There's no cost to creating a tournament. A spammer can fill `tournamentCounter` with junk, and the off-chain backend has to filter. Mild griefing; mitigated by `tournaments[id].creator != address(0)` checks but spammer can DoS the backend's tournament-list pagination.

**Recommendation:** charge a small MORBIUS fee to create, OR require msg.sender to have approved a min stake.

---

### SC-024 — `MorbiusStaking.unstake` does not enforce `whenNotPaused` (by design) but bypasses the `whenNotPaused` guarantee  **[Info]**  · Complexity 0
**Contract:** `MorbiusStaking`

By design, `unstake` and `claim` work when paused so users can exit. This is the right call. Mentioned only to note it's deliberate — not a bug.

The unstake fee (5%, half to platform, half retained in pool) does mean a paused contract drains 2.5% on every exit, which could be a feature or a bug depending on perspective. The retained-in-pool half is allocated to *remaining* stakers since `lastBalance` is decremented by `userReceives + platformShare`, not by `userReceives + fee` — leaving `fee/2` in the contract for later attribution. Correct.

---

### SC-025 — `TestToken` / `TestPermitToken` have unprotected public `mint`  **[Critical-if-deployed-to-mainnet]**  · Complexity 0 (operational)
**Contracts:** `contracts/test/TestToken.sol`, `contracts/test/TestPermitToken.sol`

```solidity
function mint(address to, uint256 amount) external {
    _mint(to, amount);
}
```
Anyone can mint unlimited supply. Test fixtures only — they must never be deployed to PulseChain mainnet. Add a Hardhat deploy script guard, or move these files to `contracts/contracts/test-only/` and exclude from the production verification path. (Currently they're in `contracts/contracts/test/` which IS inside the `sources` path.)

Recommendation: gate by `process.env.NODE_ENV === "test"` in deploy scripts; or rename folder to `mock/` and add a `.solhintignore` / build skip.

---

## Cross-cutting observations

- **Solidity 0.8.28 + viaIR + optimizer runs=200**: sensible.
- **Sourcify enabled, Etherscan/PulseScan configured**: good.
- **No proxy / upgradeability** (immediate-deploy contracts). For lottery / Plinko / Keno where a multiplier bug means redeploy + bankroll migration, this is a notable design choice — not wrong, but emphasizes the importance of getting RTP / payouts right pre-deploy.
- **OZ 5.4 used consistently**: no custom Ownable / Pausable / ReentrancyGuard implementations.
- **Fee constants check out arithmetically**: 125 + 50 + 175 + 150 = 500 bps = 5% — matches the CLAUDE.md spec for Plinko / Keno / Roulette / InstantLottery / Blackjack withdrawal. BigWheel uses a different 10% burn + everything-else model (SC-002).
- **No `unchecked` blocks anywhere in production contracts** — overflow protection is on. Good.
- **`tx.gasprice` as entropy** appears in five game contracts. This isn't entropy — it's a user-controllable knob. Cosmetic, since it doesn't make RNG worse, but it's misleading in code comments.
- **No event for `MorbiusTournament.setActive` / `setCompleted`** — frontend has to poll or log-scrape another event. Minor.
- **`MorbiusHolderDistributor` references hardcoded contract addresses from `lib/contracts.ts`** at deploy time, so the source tree and the deployed contract drift apart over time. Document this dependency in a deploy runbook.

## Things that look fine

- `TournamentPrizeEscrowV5` and `V6` are the cleanest pieces of the codebase. The `addToPrizePool`-doesn't-set-`depositor` design correctly prevents creator-reclaim drains of multi-funder pools. The V6 packing into 3 slots is sensible. Pull-payout fallback via `setUnclaimedShares` + `claim` is a nice belt-and-braces. The test suite for these two contracts (372 lines, V6) exercises the right adversarial corners: token mismatch, double-deposit, `Exceeds pool`, pull-payout split, creator-not-depositor reclaim attempt.
- `MerkleClaim*` Merkle leaf hashing uses OZ's double-hash leaf encoding (`keccak256(bytes.concat(keccak256(...)))`) — correct, prevents second-preimage attacks.
- `BlackjackV2` `withdrawWithSignature` correctly uses EIP-712 (typed domain separator, type hash, nonce, expiry). Signature verification path is clean.
- `BlackjackV2.placeBet` / `settleGame` is a sensible reserve-locked design — the `pendingGames` mapping plus the `betAmount * 3` cap on payout multipliers is straightforward.
- All `SafeERC20` usage is consistent. No raw `transfer` / `transferFrom` of ERC-20 anywhere.
- `nonReentrant` is applied broadly — every state-mutating function that touches tokens has the guard.

---

## Recommendation summary

Pre-V6 deploy checklist:
1. **Write a tournament-and-game adversarial test suite.** Cover server-key compromise paths, exceeds-pool, multi-funder reclaim attempts (existing), unauthorized payout attempts, and at least one happy-path per game contract.
2. **Decide on a randomness strategy.** Either VRF, commit-reveal, or operator-attested. Document the choice. The current state is incompatible with a real on-chain casino at scale.
3. **Add slippage protection** to every PLS entrypoint (cap or TWAP).
4. **Fix BigWheel** (SC-002, SC-014) or remove it from `lib/contracts.ts`.
5. **Migrate Ownable → Ownable2Step** across the board.
6. **Multi-sig the authorized-server role** for Blackjack, MorbiusTournament, and TournamentPrizeEscrow.
7. **Delete or fix KenoStats** (SC-012).
8. **Verify TestToken / TestPermitToken** never enter a mainnet deploy path.
