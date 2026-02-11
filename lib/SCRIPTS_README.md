# Scripts reference

Commands are from the **repo root** unless noted. Set required env in `contracts/.env` (or root `.env`) as needed.

---

## Lottery (6-of-55)

| Script | Command | Notes |
|--------|---------|--------|
| Deploy lottery V2 | `cd contracts && npx hardhat run scripts/deploy-6of55-v2.js --network pulsechain` | Set KEEPER_WALLET etc. in .env |
| Keeper (buy tickets / finalize rounds) | `cd contracts && node scripts/lottery-keeper.js` | PRIVATE_KEY, LOTTERY_ADDRESS; runs every ~5 min |
| Legacy deploy (old) | `cd contracts && npx hardhat run scripts/legacy/deploy-6of55.js --network pulsechain` | Legacy script |

---

## Keno

| Script | Command | Notes |
|--------|---------|--------|
| Deploy CryptoKeno | `cd contracts && npx hardhat run scripts/deploy-keno.js --network pulsechain` | KENO_* env overrides |
| Deploy KenoStats | `cd contracts && npx hardhat run scripts/deploy-keno-stats.js --network pulsechain` | |
| Keeper (finalize / start next round) | `cd contracts && node scripts/keno-keeper-fixed.cjs` | PRIVATE_KEY, KENO_ADDRESS; KEEPER_START_NEXT optional |
| Start first round | `cd contracts && node scripts/start-first-round.js` | New deployment; set KENO_ADDRESS in script or env |
| Start next round | `cd contracts && node scripts/start-next-round.js` | |
| Check Keno contract | `cd contracts && node scripts/check-keno-contract.js` | |
| Check round | `cd contracts && node scripts/check-round.js` | |
| Check round state | `cd contracts && node scripts/check-round-state.js` | |
| Check round details | `cd contracts && node scripts/check-round-details.js` | |
| Check latest | `cd contracts && node scripts/check-latest.js` | |
| Check burn pending | `cd contracts && node scripts/check-burn-pending.js` | |
| Check correct contract | `cd contracts && node scripts/check-correct-contract.js` | |
| Check full accounting | `cd contracts && node scripts/check-full-accounting.js` | |
| Check historical totals | `cd contracts && node scripts/check-historical-totals.js` | |
| Check new contract | `cd contracts && node scripts/check-new-contract.js` | |

---

## Plinko

| Script | Command | Notes |
|--------|---------|--------|
| Deploy Plinko | `cd contracts && npx hardhat run scripts/deploy-plinko.js --network pulsechain` | PLINKO_* env overrides |
| Fund Plinko | `cd contracts && npx hardhat run scripts/fund-plinko.js --network pulsechain` | |
| Set max wager | `cd contracts && npx hardhat run scripts/set-max-wager.js --network pulsechain` | Owner only |
| Audit Plinko | `cd contracts && npx hardhat run scripts/audit-plinko.js --network pulsechain` | |
| Check Plinko state | `cd contracts && node scripts/check-plinko-state.cjs` | |
| Generate Plinko seeds | `node contracts/scripts/generate-plinko-seeds.js` | Long-running; writes seedDatabase.json |
| Generate Plinko seeds (CJS) | `cd contracts && node scripts/generate-plinko-seeds.cjs` | |
| Simulate Plinko | `cd contracts && npx hardhat run scripts/simulate-plinko.js --network pulsechain` | |

---

## BigWheel

| Script | Command | Notes |
|--------|---------|--------|
| Deploy BigWheel | `cd contracts && npx hardhat run scripts/deploy-bigwheel.js --network pulsechain` | BIGWHEEL_* env overrides |
| Fund BigWheel | `cd contracts && npx hardhat run scripts/fund-bigwheel.js --network pulsechain` | |

---

## Blackjack

| Script | Command | Notes |
|--------|---------|--------|
| Deploy Blackjack (V1) | `cd contracts && npx hardhat run scripts/deploy-blackjack.js --network pulsechain` | |
| Deploy Blackjack V2 | `cd contracts && npx hardhat run scripts/deploy-blackjack-v2.js --network pulsechain` | |
| Fund Blackjack | `cd contracts && npx hardhat run scripts/fund-blackjack.js --network pulsechain` | Optional: `--amount=5000` |
| Configure Blackjack | `cd contracts && npx hardhat run scripts/configure-blackjack.js --network pulsechain` | |
| Configure Blackjack owner | `cd contracts && npx hardhat run scripts/configure-blackjack-owner.js --network pulsechain` | |
| Configure Blackjack V2 fees | `cd contracts && npx hardhat run scripts/configure-blackjack-v2-fees.js --network pulsechain` | |
| Get server info | `cd contracts && npx hardhat run scripts/get-server-info.js --network pulsechain` | For server/configure step |
| Verify Blackjack functions | `cd contracts && npx hardhat run scripts/verify-blackjack-functions.js --network pulsechain` | ABI vs deployed |
| Emergency withdraw (legacy) | `cd contracts && npx hardhat run scripts/emergency-withdraw-blackjack.js --network pulsechain` | Owner/emergencyAdmin; set BLACKJACK_LEGACY_ADDRESS. Optional: DRY_RUN=1, BACKUP_PRIVATE_KEY |
| List legacy Blackjack reserves | `cd contracts && npx hardhat run scripts/list-legacy-blackjack-reserves.js --network pulsechain` | Uses BLACKJACK_LEGACY_ADDRESS, BLACKJACK_LEGACY_ADDRESS_2, BLACKJACK_ADDRESS. Optional: FROM_BLOCK, OUT_CSV |
| Clear pending (Blackjack) | `cd contracts && npx hardhat run scripts/clear-pending.js --network pulsechain` | |
| Debug setBetFee | `cd contracts && npx hardhat run scripts/debug-setBetFee.js --network pulsechain` | |
| Check Blackjack V2 | `cd contracts && npx hardhat run scripts/check-blackjack-v2.js --network pulsechain` | |

---

## Tournament / Escrow

| Script | Command | Notes |
|--------|---------|--------|
| Deploy Tournament Prize Escrow | `cd contracts && AUTHORIZED_SERVER=0x... npx hardhat run scripts/deploy-tournament-prize-escrow.js --network pulsechain` | Set AUTHORIZED_SERVER (or TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS) |
| List escrow reserves | `cd contracts && npx hardhat run scripts/list-escrow-reserves.js --network pulsechain` | TOURNAMENT_PRIZE_ESCROW_ADDRESS. Optional: OUT_CSV |
| Reclaim escrow remainder | `cd contracts && TOURNAMENT_ID=<uuid> RECLAIM_TO=0x... npx hardhat run scripts/reclaim-escrow-remainder.js --network pulsechain` | Owner only. Or use TOURNAMENT_ID_BYTES32=0x... from list-escrow-reserves |

---

## Tokens / approvals / funding

| Script | Command | Notes |
|--------|---------|--------|
| Approve MORBIUS (Plinko) | `cd contracts && node scripts/approve-morbius.cjs` | PRIVATE_KEY; approves Plinko contract |
| Check all tokens | `cd contracts && node scripts/check-all-tokens.js` | |
| Check user balance | `cd contracts && node scripts/check-user-balance.js` | |
| Check balance | `cd contracts && node scripts/check-balance.js` | |
| Fund contract (generic) | `cd contracts && node scripts/fund-contract.js` | |
| Check PLS requirement | `cd contracts && node scripts/check-pls-requirement.cjs` | |
| Test PLS purchase | `cd contracts && node scripts/test-pls-purchase.cjs` | |

---

## Diagnostics / stuck funds / events

| Script | Command | Notes |
|--------|---------|--------|
| Check events (Plinko) | `cd contracts && npx hardhat run scripts/check-events.js --network pulsechain` | BallDropped topic hash / Plinko address in script |
| Check transaction | `cd contracts && node scripts/check-transaction.js` | |
| Check tx buckets | `cd contracts && node scripts/check-tx-buckets.cjs` | |
| Check tx events | `cd contracts && node scripts/check-tx-events.cjs` | |
| Check wallets | `cd contracts && node scripts/check-wallets.js` | |
| Diagnose stuck funds | `cd contracts && node scripts/diagnose-stuck-funds.js` | |
| Final diagnosis | `cd contracts && node scripts/final-diagnosis.js` | |
| Trace stuck funds | `cd contracts && node scripts/trace-stuck-funds.js` | |
| Systematic analysis | `cd contracts && node scripts/systematic-analysis.js` | |
| Test network | `cd contracts && npx hardhat run scripts/test-network.js --network pulsechain` | |

---

## Root-level scripts (not under contracts/)

| Script | Command | Notes |
|--------|---------|--------|
| Check events | `cd contracts && npx hardhat run ../check-events.js --network pulsechain` | Root copy of Plinko event check (different address); canonical: `contracts/scripts/check-events.js` |
| Simple deploy | `node simple-deploy.js` | MegaMORBIUSLottery deploy (ethers + dotenv; run from root) |
| Test burned | `node test-burned.js` | Fetches MORBIUS burned amount from PulseScan API (run from root) |

---

## Notes

- **Hardhat scripts**: Run from `contracts/` with `npx hardhat run scripts/<script>.js --network pulsechain`. From root: `cd contracts && npx hardhat run scripts/<script>.js --network pulsechain`.
- **Node-only scripts** (e.g. keeper, check-round): Often expect to be run from `contracts/` so `node scripts/<script>.js` or `node scripts/<script>.cjs`. From root: `cd contracts && node scripts/<script>.js`.
- **Env**: Most scripts read `contracts/.env` (Hardhat loads it when run from `contracts/`). Root scripts may use root `.env`.
- **Legacy**: `contracts/scripts/legacy/` contains older deploy scripts (e.g. deploy-6of55.js).
