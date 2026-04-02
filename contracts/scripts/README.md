# Contract scripts layout

Scripts are grouped by **game** (or subsystem), then by **job** (deploy, fund, pause-unpause, withdraw, configure, verify, check, test, etc.).

Run from **contracts/** directory:

- **Hardhat**: `npx hardhat run scripts/<game>/<job>/<script>.js --network pulsechain`
- **Node**: `node scripts/<game>/<job>/<script>.js` or `node scripts/<game>/other/<script>.cjs`

Example:
```bash
cd contracts
npx hardhat run scripts/blackjack/deploy/deploy-blackjack-v2.js --network pulsechain
node scripts/keno/other/keno-keeper-fixed.cjs
```

## Structure

| Folder | Contents |
|--------|----------|
| **blackjack/** | deploy, fund, pause-unpause, withdraw, configure, verify, check |
| **plinko/** | deploy, fund, withdraw, configure, test, other (seeds) |
| **keno/** | deploy, withdraw, check, other (keeper) |
| **bigwheel/** | deploy, fund |
| **lottery/** | deploy, fund, verify, configure, withdraw, check |
| **merkle/** | deploy (claim + claim-lp) |
| **staking/** | deploy (morbius + LP staking) |
| **tournament/** | deploy, verify, withdraw (escrow) |
| **distributor/** | deploy, check, configure |
| **utils/** | fund, check, test, debug (shared/network scripts) |

Full command reference: see **lib/SCRIPTS_README.md** in the repo root.
