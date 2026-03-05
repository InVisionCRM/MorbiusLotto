# Scripts reference

Commands are from the **repo root** unless noted. Set required env in `contracts/.env` (or root `.env`) as needed.

---

## Lottery (6-of-55)

| Script | Command | Notes |
|--------|---------|--------|
| Deploy lottery V2 | `cd contracts && npx hardhat run scripts/lottery/deploy/deploy-6of55-v2.js --network pulsechain` | Set KEEPER_WALLET etc. in .env |
| Keeper (buy tickets / finalize rounds) | `cd contracts && node scripts/lottery/other/lottery-keeper.js` | PRIVATE_KEY, LOTTERY_INSTANT_ADDRESS; runs every ~5 min |
| Legacy deploy (old) | `cd contracts && npx hardhat run scripts/legacy/deploy-6of55.js --network pulsechain` | Legacy script |

---

## Keno

| Script | Command | Notes |
|--------|---------|--------|
| Deploy CryptoKeno | `cd contracts && npx hardhat run scripts/keno/deploy/deploy-keno.js --network pulsechain` | KENO_* env overrides |
| Deploy KenoStats | `cd contracts && npx hardhat run scripts/keno/deploy/deploy-keno-stats.js --network pulsechain` | |
| Keeper (finalize / start next round) | `cd contracts && node scripts/keno/other/keno-keeper-fixed.cjs` | PRIVATE_KEY, KENO_ADDRESS; KEEPER_START_NEXT optional |
| Start first round | `cd contracts && node scripts/lottery/other/start-first-round.js` | New deployment; set KENO_ADDRESS in script or env |
| Start next round | `cd contracts && node scripts/lottery/other/start-next-round.js` | |
| Check Keno contract | `cd contracts && node scripts/keno/check/check-keno-contract.js` | |
| Check round | `cd contracts && node scripts/lottery/check/check-round.js` | |
| Check round state | `cd contracts && node scripts/lottery/check/check-round-state.js` | |
| Check round details | `cd contracts && node scripts/lottery/check/check-round-details.js` | |
| Check latest | `cd contracts && node scripts/lottery/check/check-latest.js` | |
| Check burn pending | `cd contracts && node scripts/lottery/check/check-burn-pending.js` | |
| Check correct contract | `cd contracts && node scripts/lottery/check/check-correct-contract.js` | |
| Check full accounting | `cd contracts && node scripts/lottery/check/check-full-accounting.js` | |
| Check historical totals | `cd contracts && node scripts/lottery/check/check-historical-totals.js` | |
| Check new contract | `cd contracts && node scripts/lottery/check/check-new-contract.js` | |

---

## Plinko

| Script | Command | Notes |
|--------|---------|--------|
| Deploy Plinko | `cd contracts && npx hardhat run scripts/plinko/deploy/deploy-plinko.js --network pulsechain` | PLINKO_* env overrides |
| Fund Plinko | `cd contracts && npx hardhat run scripts/plinko/fund/fund-plinko.js --network pulsechain` | |
| Set max wager | `cd contracts && npx hardhat run scripts/plinko/configure/set-max-wager.js --network pulsechain` | Owner only |
| Audit Plinko | `cd contracts && npx hardhat run scripts/plinko/test/audit-plinko.js --network pulsechain` | |
| Check Plinko state | `cd contracts && node scripts/plinko/test/check-plinko-state.cjs` | |
| Generate Plinko seeds | `node contracts/scripts/plinko/other/generate-plinko-seeds.js` | Long-running; writes seedDatabase.json |
| Generate Plinko seeds (CJS) | `cd contracts && node scripts/plinko/other/generate-plinko-seeds.cjs` | |
| Simulate Plinko | `cd contracts && npx hardhat run scripts/plinko/test/simulate-plinko.js --network pulsechain` | |

---

## BigWheel

| Script | Command | Notes |
|--------|---------|--------|
| Deploy BigWheel | `cd contracts && npx hardhat run scripts/bigwheel/deploy/deploy-bigwheel.js --network pulsechain` | BIGWHEEL_* env overrides |
| Fund BigWheel | `cd contracts && npx hardhat run scripts/bigwheel/fund/fund-bigwheel.js --network pulsechain` | |

---

## Blackjack

| Script | Command | Notes |
|--------|---------|--------|
| Deploy Blackjack (V1) | `cd contracts && npx hardhat run scripts/blackjack/deploy/deploy-blackjack.js --network pulsechain` | |
| Deploy Blackjack V2 | `cd contracts && npx hardhat run scripts/blackjack/deploy/deploy-blackjack-v2.js --network pulsechain` | |
| Fund Blackjack | `cd contracts && npx hardhat run scripts/blackjack/fund/fund-blackjack.js --network pulsechain` | Optional: `--amount=5000` |
| Configure Blackjack | `cd contracts && npx hardhat run scripts/blackjack/configure/configure-blackjack.js --network pulsechain` | |
| Configure Blackjack owner | `cd contracts && npx hardhat run scripts/blackjack/configure/configure-blackjack-owner.js --network pulsechain` | |
| Configure Blackjack V2 fees | `cd contracts && npx hardhat run scripts/blackjack/configure/configure-blackjack-v2-fees.js --network pulsechain` | Defaults: 2.5% distribution, 2.5% platform, 1.5% PLS deposit. Set PLATFORM_FEE_WALLET in .env |
| Get server info | `cd contracts && npx hardhat run scripts/utils/check/get-server-info.js --network pulsechain` | For server/configure step |
| Verify Blackjack functions | `cd contracts && npx hardhat run scripts/blackjack/verify/verify-blackjack-functions.js --network pulsechain` | ABI vs deployed |
| Emergency withdraw (legacy) | `cd contracts && npx hardhat run scripts/blackjack/withdraw/emergency-withdraw-blackjack.js --network pulsechain` | Owner/emergencyAdmin; set BLACKJACK_LEGACY_ADDRESS. Optional: DRY_RUN=1, BACKUP_PRIVATE_KEY |
| Unpause legacy (re-enable withdrawals) | `cd contracts && npx hardhat run scripts/blackjack/pause-unpause/unpause-legacy-blackjack.js --network pulsechain` | emergencyAdmin only; run after emergency-withdraw so players can withdraw again |
| List legacy Blackjack reserves | `cd contracts && npx hardhat run scripts/blackjack/check/list-legacy-blackjack-reserves.js --network pulsechain` | Uses BLACKJACK_LEGACY_ADDRESS, _2, _3, BLACKJACK_ADDRESS. Optional: FROM_BLOCK, OUT_CSV |
| Clear pending (Blackjack) | `cd contracts && npx hardhat run scripts/utils/debug/clear-pending.js --network pulsechain` | |
| Check Blackjack V2 | `cd contracts && npx hardhat run scripts/blackjack/check/check-blackjack-v2.js --network pulsechain` | distributionFeeBps, burnFeeBps, totalDistributionFeesCollected, totalBurned |
| Set legacy 3 after redeploy | Set `NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_3=<old_blackjack_address>` in .env | So users can withdraw MORBIUS from the previous contract in DepositWithdrawModal |
| Simulate house edge (V2 RNG) | `cd server && npm run simulate:blackjack [numHands]` | Uses same Fisher-Yates deck as production; default 100k hands. Hit/stand only, so ~3–4% house edge. |

---

## Tournament / Escrow

| Script | Command | Notes |
|--------|---------|--------|
| Deploy MorbiusTournament | `cd contracts && npx hardhat run scripts/tournament/deploy/deploy-morbius-tournament.js --network pulsechain` | uint256 IDs; uses MORBIUS_TOKEN, AUTHORIZED_SERVER, PLATFORM_FEE_WALLET |
| Verify MorbiusTournament | `cd contracts && npx hardhat run scripts/tournament/verify/verify-morbius-tournament.js --network pulsechain` | Uses programmatic verify |
| Deploy Tournament Prize Escrow V3 | `cd contracts && npx hardhat run scripts/tournament/deploy/deploy-tournament-prize-escrow-v3.js --network pulsechain` | uint256 IDs; works with MorbiusTournament |
| Verify Tournament Prize Escrow V3 | `cd contracts && npx hardhat run scripts/tournament/verify/verify-tournament-escrow-v3.js --network pulsechain` | Uses programmatic verify (avoids bytecode mismatch) |
| Deploy Tournament Prize Escrow (V1) | `cd contracts && AUTHORIZED_SERVER=0x... npx hardhat run scripts/tournament/deploy/deploy-tournament-prize-escrow.js --network pulsechain` | bytes32 IDs (legacy) |
| Deploy Tournament Prize Escrow V2 | `cd contracts && npx hardhat run scripts/tournament/deploy/deploy-tournament-prize-escrow-v2.js --network pulsechain` | bytes32 IDs; creator tracking, cancel |
| List escrow reserves | `cd contracts && npx hardhat run scripts/tournament/withdraw/list-escrow-reserves.js --network pulsechain` | TOURNAMENT_PRIZE_ESCROW_ADDRESS. Optional: OUT_CSV |
| Reclaim escrow remainder | `cd contracts && TOURNAMENT_ID=<uuid> RECLAIM_TO=0x... npx hardhat run scripts/tournament/withdraw/reclaim-escrow-remainder.js --network pulsechain` | Owner only. V1/V2: use TOURNAMENT_ID_BYTES32. V3: use uint256 |

---

## Distribution addresses (1.25% holder / 1.5% LP)

Canonical addresses live in **`lib/contracts.ts`** (MerkleClaimMorbius, MerkleClaimLP). Keep these in sync everywhere:

| Env (contracts deploy) | Purpose |
|------------------------|---------|
| `DISTRIBUTION_RECIPIENT` | 1.25% MORBIUS holder fee — set to **MERKLE_CLAIM_MORBIUS_ADDRESS** (from lib/contracts) when deploying Plinko, Keno, Blackjack, Instant Lottery |
| `LP_DISTRIBUTION_RECIPIENT` | 1.5% LP staker fee — set to **MERKLE_CLAIM_LP_ADDRESS** (from lib/contracts) |

| Env (server) | Purpose |
|--------------|---------|
| `MERKLE_CLAIM_MORBIUS_ADDRESS` | Server merkle-claim.ts (epoch roots, balance). Defaults to same as lib/contracts if unset. |
| `MERKLE_CLAIM_LP_ADDRESS` | Server merkle-claim-lp.ts. Defaults to same as lib/contracts if unset. |

| Env (frontend, optional) | Purpose |
|--------------------------|---------|
| `NEXT_PUBLIC_MERKLE_CLAIM_MORBIUS_ADDRESS` | Override lib/contracts MERKLE_CLAIM_MORBIUS_ADDRESS |
| `NEXT_PUBLIC_MERKLE_CLAIM_LP_ADDRESS` | Override lib/contracts MERKLE_CLAIM_LP_ADDRESS |

After redeploying MerkleClaim or MerkleClaimLP: update **lib/contracts.ts** and **server/.env** (and optionally root .env for NEXT_PUBLIC_).

---

## Merkle claims

| Script | Command | Notes |
|--------|---------|--------|
| Deploy MerkleClaimMorbius | `cd contracts && npx hardhat run scripts/merkle/deploy/deploy-merkle-claim.js --network pulsechain` | MORBIUS_TOKEN_ADDRESS env override |
| Deploy MerkleClaimLP | `cd contracts && npx hardhat run scripts/merkle/deploy/deploy-merkle-claim-lp.js --network pulsechain` | |
| Configure Plinko fees (distribution) | `cd contracts && npx hardhat run scripts/plinko/configure/configure-plinko-fees.js --network pulsechain` | Sets distributionRecipient (default: MERKLE_CLAIM_MORBIUS_ADDRESS) |
| Configure Blackjack V2 fees (distribution) | `cd contracts && npx hardhat run scripts/blackjack/configure/configure-blackjack-v2-fees.js --network pulsechain` | Sets distributionRecipient (default: MERKLE_CLAIM_MORBIUS_ADDRESS) |

---

## Staking

| Script | Command | Notes |
|--------|---------|--------|
| Deploy Morbius staking | `cd contracts && npx hardhat run scripts/staking/deploy/deploy-morbius-staking.js --network pulsechain` | |
| Deploy Morbius LP staking | `cd contracts && npx hardhat run scripts/staking/deploy/deploy-morbius-lp-staking.js --network pulsechain` | |

---

## Distributor

| Script | Command | Notes |
|--------|---------|--------|
| Deploy holder distributor | `cd contracts && npx hardhat run scripts/distributor/deploy/deploy-morbius-holder-distributor.js --network pulsechain` | |
| Check distributor state | `cd contracts && npx hardhat run scripts/distributor/check/check-distributor-state.js --network pulsechain` | |
| Add Blackjack V2 to excluded | `cd contracts && npx hardhat run scripts/distributor/configure/add-blackjackv2-to-distributor-excluded.js --network pulsechain` | |

---

## Tokens / approvals / funding

| Script | Command | Notes |
|--------|---------|--------|
| Approve MORBIUS (Plinko) | `cd contracts && node scripts/utils/fund/approve-morbius.cjs` | PRIVATE_KEY; approves Plinko contract |
| Check all tokens | `cd contracts && node scripts/utils/check/check-all-tokens.js` | |
| Check user balance | `cd contracts && node scripts/utils/check/check-user-balance.js` | |
| Check balance | `cd contracts && node scripts/utils/check/check-balance.js` | |
| Fund contract (generic) | `cd contracts && node scripts/utils/fund/fund-contract.js` | |
| Check PLS requirement | `cd contracts && node scripts/utils/check/check-pls-requirement.cjs` | |
| Test PLS purchase | `cd contracts && node scripts/utils/test/test-pls-purchase.cjs` | |

---

## Diagnostics / stuck funds / events

| Script | Command | Notes |
|--------|---------|--------|
| Check events (Plinko) | `cd contracts && npx hardhat run scripts/lottery/check/check-events.js --network pulsechain` | BallDropped topic hash / Plinko address in script |
| Check transaction | `cd contracts && node scripts/lottery/check/check-transaction.js` | |
| Check tx buckets | `cd contracts && node scripts/plinko/test/check-tx-buckets.cjs` | |
| Check tx events | `cd contracts && node scripts/lottery/check/check-tx-events.cjs` | |
| Check wallets | `cd contracts && node scripts/utils/check/check-wallets.js` | |
| Diagnose stuck funds | `cd contracts && node scripts/utils/debug/diagnose-stuck-funds.js` | |
| Final diagnosis | `cd contracts && node scripts/utils/debug/final-diagnosis.js` | |
| Trace stuck funds | `cd contracts && node scripts/utils/debug/trace-stuck-funds.js` | |
| Systematic analysis | `cd contracts && node scripts/utils/debug/systematic-analysis.js` | |
| Test network | `cd contracts && npx hardhat run scripts/utils/test/test-network.js --network pulsechain` | |
| Cancel stuck txs | `cd contracts && npx hardhat run scripts/utils/debug/cancel-stuck-txs.js --network pulsechain` | |

---

## Root-level scripts (not under contracts/)

| Script | Command | Notes |
|--------|---------|--------|
| Check events | `cd contracts && npx hardhat run scripts/lottery/check/check-events.js --network pulsechain` | Plinko BallDropped / event check; canonical location in scripts |
| Simple deploy | `node simple-deploy.js` | MegaMORBIUSLottery deploy (ethers + dotenv; run from root) |
| Test burned | `node test-burned.js` | Fetches MORBIUS burned amount from PulseScan API (run from root) |

---

## Notes

- **Layout**: Scripts are under `contracts/scripts/<game>/<job>/` (e.g. `blackjack/deploy/`, `plinko/fund/`, `lottery/check/`). See `contracts/scripts/README.md` for the full structure.
- **Hardhat scripts**: Run from `contracts/` with `npx hardhat run scripts/<path>.js --network pulsechain`.
- **Node-only scripts**: Run from `contracts/` with `node scripts/<path>.js` or `node scripts/<path>.cjs`.
- **Env**: Most scripts read `contracts/.env` (Hardhat loads it when run from `contracts/`). Root scripts may use root `.env`.
- **Legacy**: `contracts/scripts/legacy/` contains older deploy scripts (e.g. deploy-6of55.js).
