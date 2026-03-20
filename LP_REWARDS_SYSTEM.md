# MORBlotto LP Holder Rewards System

## Overview

The LP Rewards system distributes MORBIUS tokens to anyone providing liquidity in a MORBIUS-paired pool on PulseChain — **no staking required**. Holders simply keep their LP tokens in their wallet and claim rewards after each epoch drop.

Rewards are weighted by the **MORBIUS value inside each LP position**, not by raw LP token count. This prevents gaming via low-MORBIUS pools and ensures fair allocation across all supported trading pairs.

---

## Contracts Involved

| Contract | Address | Purpose |
|---|---|---|
| **MORBIUS Token** | `0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1` | The reward token distributed to LP holders |
| **MerkleClaimLP** | `0x64Dd1c933027d757212E43725c99bD4402211A1A` | Holds the reward pool; users submit Merkle proofs to claim |

> **Funding MerkleClaimLP:** Transfer MORBIUS directly to `0x64Dd1c933027d757212E43725c99bD4402211A1A`. No approval or contract call needed — the contract reads its own `MORBIUS.balanceOf(address(this))`.

> **MorbiusLPStaking V3** (`0x742389696FB4C311cDDD30d3CEae6697c7d238AA`) was deployed but is not used by this system. LP providers do not need to stake anywhere.

---

## Supported LP Pairs

15 MORBIUS pairs are tracked in the database. 8 are active by default; the remainder can be enabled as liquidity grows. All are UniswapV2-style pairs (PulseX V1, PulseX V2, or 9mm).

### Active (included in snapshots)

| Label | DEX | Pair Address |
|---|---|---|
| MORBIUS/WPLS | PulseX V1 | `0x81acd0aa872675678a25fbb154992a2bad4f6cef` |
| MORBIUS/UFO | PulseX | `0x3484d2589bbd7957c217c04eb48837a5cde1434b` |
| MORBIUS/HEX | PulseX | `0x3208788cf9beaedf8107ebb321b3890a3bd72ce7` |
| MORBIUS/LBRTY | PulseX | `0xde5cda61eac2962e142db8f29e45254f916ad35c` |
| MORBIUS/EMIT | PulseX | `0xc71e3c8a6db933f827fcbbea174a79e088be2c5c` |
| MORBIUS/ZAP | PulseX | `0x5586956d3f1af639d54a7aca9992ac1a9449edc6` |
| MORBIUS/WPLS V2 | PulseX | `0xb876257c7550010f14a527d2bf8fda9360f8597b` |
| MORBIUS/WPLS | 9mm | `0x1f5374aee6d97ee8d39a9885f73475a49926bed9` |

### Inactive (low liquidity, can be enabled in admin)

| Label | DEX | Pair Address |
|---|---|---|
| MORBIUS/SCADA | PulseX | `0xa17bd0c64a2f3de9131c310ad6fd26bbc7af09dd` |
| pSSH/MORBIUS | PulseX | `0x05d35f5972f34218ca3a65ca246765e184542f71` |
| WICK/MORBIUS | 9mm | `0x922f5d2560a3addab83cc856161b8d04c8dcb093` |
| RICH/MORBIUS | PulseX | `0xdbed78e14e230158ec01e534749bd5ae5ed0816f` |
| DHEART/MORBIUS | PulseX | `0xa1c6c4d6a7d167b60cfd80cc29ca3e93aa60faf5` |
| MORBY/MORBIUS | PulseX | `0x6081ebffaf442d4e51f9dab689c7d66882edaa69` |
| NOAH/MORBIUS | PulseX | `0x3f5f5b5b1c6e15522b15ee6303a484ad6e235e29` |

Pairs can be added, enabled, disabled, or removed at any time via the Admin panel. Changes take effect at the next snapshot.

---

## Reward Formula

For each active LP pair at snapshot time:

```
morbiusEquivalent(wallet, pair) = lpBalance × morbiusReserve / totalLPSupply
```

Each wallet's equivalents are then summed across **all** active pairs:

```
walletMorbiusEquivalent = Σ morbiusEquivalent(wallet, pair)  for each active pair
```

Reward allocation:

```
walletReward = (walletMorbiusEquivalent / totalMorbiusEquivalent) × totalRewardPool
```

Where `totalRewardPool = newReward + rolledUpUnclaimedFromPriorEpochs`.

**Blocklisted addresses** (zero address, burn address) are excluded from snapshots and receive nothing.

---

## Epoch Lifecycle

Each reward drop is called an **epoch** and progresses through five stages:

```
pending → snapshot → calculated → finalized → published
```

### Stage 1 — Create Epoch (`pending`)
An admin creates a new epoch row in the database. Only one epoch can be in-progress at a time; a new one can only be created after the previous is `published` or `revoked`.

### Stage 2 — Take Snapshot (`snapshot`)
The server fetches LP token holders for **every active pair** from the PulseChain blockscout API:

```
GET https://api.scan.pulsechain.com/api/v2/tokens/{pairAddress}/holders
```

For each pair, it also reads on-chain:
- `token0()` — to determine which reserve is MORBIUS
- `getReserves()` — MORBIUS and paired-token reserve amounts
- `totalSupply()` — total LP tokens in circulation

Each holder's MORBIUS-equivalent is computed and **aggregated per wallet** across all pairs. The result is stored in `merkle_lp_snapshots`.

### Stage 3 — Calculate Rewards (`calculated`)
The admin specifies a reward amount (in MORBIUS wei), or leaves it blank to auto-use the current contract balance. The service:

1. Reads unclaimed rewards from all prior **published** LP epochs (rollup)
2. Adds the new reward amount
3. Distributes the total proportionally across all snapshot wallets by `morbius_equivalent`
4. Updates each snapshot row with a `reward_amount`

### Stage 4 — Build Merkle Tree (`finalized`)
The service generates a Merkle tree using OpenZeppelin-compatible double-hashing:

```
leaf = keccak256( keccak256( abi.encodePacked(epochId, walletAddress, rewardAmount) ) )
```

The root and each wallet's proof are stored in the database.

### Stage 5 — Publish On-Chain (`published`)
The keeper wallet calls `MerkleClaimLP.setEpochRoot(epochId, merkleRoot, totalAmount)` on-chain. Once confirmed, users can claim.

At publish time, all prior epochs' snapshot rows that are being rolled up are marked `superseded_by_epoch_id`, so the frontend knows only the latest epoch requires a claim transaction.

---

## User Claim Flow

1. User visits the **Staking → Claims** tab on MORBlotto.
2. The frontend fetches `/api/merkle-lp/epochs` to get all published LP epochs.
3. For each epoch, it calls `/api/merkle-lp/claim/:epochNumber/:walletAddress` to retrieve the user's amount and Merkle proof (if eligible).
4. It calls `MerkleClaimLP.hasClaimed(epochId, walletAddress)` on-chain to check if already claimed.
5. If unclaimed, a **Claim LP Rewards** button appears showing the total claimable MORBIUS.
6. User clicks claim → wagmi triggers a wallet popup → transaction submitted to `MerkleClaimLP.claim(epochId, amount, proof[])`.
7. Upon confirmation, the UI updates to "All rewards claimed."

**Unclaimed rewards roll forward automatically.** If a user misses an epoch, their share is included in the next epoch's total — they never lose out, and they only need to submit one transaction.

---

## Admin Workflow

Managed via the **Admin → LP Staking** tab in the admin dashboard, or directly via the API.

### Typical Monthly Drop

```
1. Verify MerkleClaimLP MORBIUS balance (fund it if needed via direct transfer)
2. Admin panel → "New Epoch"
3. Admin panel → "Take Snapshot"
   (waits ~1-2 min to paginate all LP holders across all pairs)
4. Admin panel → "Calculate Rewards"
   (enter reward amount in MORBIUS wei, or leave blank to use contract balance)
5. Admin panel → "Build Merkle Tree"
6. Admin panel → "Publish On-Chain"
   (keeper wallet submits setEpochRoot transaction; ~10-30s to confirm)
7. Done — users can now claim
```

### Managing LP Pairs

- **Add a new pair:** Enter the LP token contract address, a label (e.g. `MORBIUS/TOKEN`), and the DEX name. Activate it immediately or later.
- **Disable a pair:** Excludes it from future snapshots without removing its history.
- **Remove a pair:** Deletes it from the database entirely (does not affect past snapshot data).

### Revoking an Epoch

If a bad snapshot or wrong reward amount was published, an admin can call `revoke` on the epoch. This calls `MerkleClaimLP.revokeEpoch()` on-chain, disabling claims for that epoch. The epoch can then be recreated with corrected data.

---

## Database Tables

All LP reward data lives in separate tables prefixed `merkle_lp_*` to avoid coupling with the MORBIUS holder drop system.

| Table | Purpose |
|---|---|
| `merkle_lp_pairs` | Supported LP pair contracts (address, label, DEX, active flag) |
| `merkle_lp_epochs` | One row per reward epoch with status, root, amounts, timestamps |
| `merkle_lp_snapshots` | One row per wallet per epoch (MORBIUS equivalent, reward, proof) |
| `merkle_lp_blocklist` | Addresses excluded from snapshots (zero address, burn, etc.) |
| `merkle_lp_settings` | Cron schedule config and defaults |

Migration: `server/migrations/046_merkle_lp_drops.sql`

---

## API Endpoints

### Public (no auth required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/merkle-lp/epochs` | List all published LP epochs |
| `GET` | `/api/merkle-lp/claim/:epochNumber/:walletAddress` | Get a wallet's amount and Merkle proof for an epoch |
| `GET` | `/api/merkle-lp/schedule` | Next drop time and countdown duration |

### Admin (requires `x-admin-key` header)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/merkle-lp/epochs` | List all epochs (all statuses) |
| `POST` | `/api/admin/merkle-lp/epoch/create` | Create a new epoch |
| `GET` | `/api/admin/merkle-lp/epoch/:id` | Get epoch details |
| `POST` | `/api/admin/merkle-lp/epoch/:id/snapshot` | Take LP holder snapshot |
| `POST` | `/api/admin/merkle-lp/epoch/:id/calculate` | Calculate reward allocations |
| `POST` | `/api/admin/merkle-lp/epoch/:id/finalize` | Build Merkle tree |
| `POST` | `/api/admin/merkle-lp/epoch/:id/publish` | Publish root on-chain |
| `POST` | `/api/admin/merkle-lp/epoch/:id/revoke` | Revoke a published epoch |
| `GET` | `/api/admin/merkle-lp/epoch/:id/snapshot` | View snapshot data for an epoch |
| `GET` | `/api/admin/merkle-lp/pairs` | List all LP pairs |
| `POST` | `/api/admin/merkle-lp/pairs` | Add a new LP pair |
| `PATCH` | `/api/admin/merkle-lp/pairs/:id` | Enable/disable a pair |
| `DELETE` | `/api/admin/merkle-lp/pairs/:id` | Remove a pair |
| `GET` | `/api/admin/merkle-lp/blocklist` | View blocklist |
| `POST` | `/api/admin/merkle-lp/blocklist` | Add address to blocklist |
| `DELETE` | `/api/admin/merkle-lp/blocklist/:address` | Remove from blocklist |
| `GET` | `/api/admin/merkle-lp/settings` | View schedule/cron settings |
| `POST` | `/api/admin/merkle-lp/settings` | Update settings |

---

## Source Files

| File | Role |
|---|---|
| `server/migrations/046_merkle_lp_drops.sql` | DB migration — creates all `merkle_lp_*` tables and seeds initial pairs |
| `abi/merkle-claim-lp.ts` | Frontend ABI for MerkleClaimLP (wagmi reads + claim transaction) |
| `server/src/abi/merkle-claim-lp.ts` | Server-side ABI (hasClaimed, setEpochRoot, revokeEpoch) |
| `server/src/utils/merkle-claim-lp.ts` | On-chain helpers: contract reads, setEpochRoot tx, pair reserve calc, LP holder fetch |
| `server/src/services/merkle-lp-drops.service.ts` | Full epoch lifecycle service (snapshot → calculate → Merkle → publish) |
| `server/src/server.ts` | Express routes wiring (`/api/merkle-lp/*` and `/api/admin/merkle-lp/*`) |
| `hooks/use-merkle-claims-lp.ts` | React hook — fetches epochs/proofs, reads hasClaimed, executes claim tx |
| `components/staking/MerkleClaimsLPPanel.tsx` | User-facing LP rewards panel (claim button, pool balance, countdown) |
| `app/claim/page.tsx` | Claims page — renders LP panel alongside MORBIUS holder panel (`/staking` redirects here) |
| `components/admin/AdminLPStakingTab.tsx` | Admin panel — epoch lifecycle controls + LP pair management |

---

## Setup Checklist

### First-Time Setup

```bash
# 1. Run the DB migration
node server/run-migration.js migrations/046_merkle_lp_drops.sql

# 2. Ensure env vars are set in server/.env
MERKLE_CLAIM_LP_ADDRESS=0x64Dd1c933027d757212E43725c99bD4402211A1A
MERKLE_KEEPER_PRIVATE_KEY=0x...   # keeper wallet that calls setEpochRoot
# (or SETTLEMENT_PRIVATE_KEY as fallback)

# 3. Fund MerkleClaimLP by sending MORBIUS to the contract address directly
# No contract call needed — just a standard MORBIUS transfer

# 4. (Optional) Enable automatic cron drops
MERKLE_LP_DROP_CRON_ENABLED=true
```

### Ongoing — Each Drop Cycle

```bash
# Manual trigger via admin panel, or automated via cron if enabled.
# Cron settings (schedule_type, schedule_day, schedule_hour_utc) are
# configurable in the admin panel under Settings.
```

---

## Frequently Asked Questions

**Do users need to stake their LP tokens anywhere?**
No. Simply holding LP tokens from a supported MORBIUS pair in your wallet qualifies. Check the active pairs list above.

**What if I provide liquidity in multiple pools?**
Your MORBIUS-equivalent is summed across all active pairs. You receive a single claim covering your total share.

**What if I miss a drop?**
Your unclaimed rewards carry forward automatically into the next epoch. You will never lose your allocation.

**How does the MORBIUS-equivalent weighting work?**
For a given pair: if MORBIUS constitutes 50% of the pool by value, and you hold 1% of the LP tokens, your equivalent is 1% × the MORBIUS reserve. This makes rewards fairly reflect your MORBIUS contribution regardless of which pair you use.

**Can new pairs be added after launch?**
Yes. Any UniswapV2-compatible MORBIUS pair on PulseChain can be added via the Admin → LP Staking panel. It will be included from the next snapshot onward.

**How is the MerkleClaimLP contract funded?**
By sending MORBIUS directly to `0x64Dd1c933027d757212E43725c99bD4402211A1A`. There is no `depositRewards` function — the contract reads its own token balance automatically.

**What is the keeper wallet?**
A server-side wallet (private key stored in `MERKLE_KEEPER_PRIVATE_KEY`) that signs the `setEpochRoot` transaction when an epoch is published. It needs enough PLS for gas but holds no MORBIUS.
