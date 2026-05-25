# Holder batch disperse runbook

## Phase 0 — Local confidence

```bash
cd contracts && npx hardhat test test/MorbiusBatchDisperse.test.js
EPOCH_NUMBER=94 node contracts/scripts/merkle/disperse/preflight-disperse-epoch.js
```

## Phase 1 — Deploy (no MORBIUS at risk)

```bash
cd contracts
npx hardhat run scripts/merkle/deploy/deploy-morbius-batch-disperse.js --network pulsechain
```

Set `MORBIUS_BATCH_DISPERSE_ADDRESS` in `server/.env` and redeploy frontend if needed.

## Phase 2 — Pilot (1 MORBIUS per holder, DB unchanged)

Owner wallet must hold at least `239 × 1` MORBIUS (plus gas).

```bash
EPOCH_NUMBER=94 PILOT_MORBIUS=1 DRY_RUN=1 node contracts/scripts/merkle/disperse/pilot-disperse-epoch.js
EPOCH_NUMBER=94 PILOT_MORBIUS=1 node contracts/scripts/merkle/disperse/pilot-disperse-epoch.js
```

Check 2–3 holder wallets on PulseScan (+1 MORBIUS each).

**Note:** Full run sends snapshot amounts on top — each holder ends with `pilot + full reward` unless you skip pilot wallets (this runbook assumes +1 MORBIUS test overhead per holder).

## Phase 3 — Full payout

```bash
DRY_RUN=1 node contracts/scripts/merkle/disperse/rescue-merkle-vault.js
node contracts/scripts/merkle/disperse/rescue-merkle-vault.js

EPOCH_NUMBER=94 DRY_RUN=1 node contracts/scripts/merkle/disperse/disperse-merkle-epoch.js
EPOCH_NUMBER=94 MARK_CLAIMED=1 REVOKE_ROOT=1 node contracts/scripts/merkle/disperse/disperse-merkle-epoch.js
```

## Phase 4 — Verify

```bash
EPOCH_NUMBER=94 node contracts/scripts/merkle/disperse/preflight-disperse-epoch.js
```

Expect unclaimed in DB = 0; merkle root cleared if revoke succeeded.
