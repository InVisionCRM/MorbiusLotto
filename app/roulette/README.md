# Roulette (MORBlotto)

European single-zero roulette (pockets **0–36**) on **PulseChain** (chain ID 369). Players wager **MORBIUS** (ERC-20) or pay with **PLS** (native), which the contract swaps via PulseX. Settlement and RNG happen **on-chain in one transaction**; the UI animates the wheel after the `Spun` event is parsed from the receipt.

This file is the **map of the codebase** for the feature.

---

## User-facing route

| What | Where |
|------|--------|
| Next.js page | [`page.tsx`](./page.tsx) |
| URL | `/roulette` |

The page wires together the wheel, betting table, action panel (chip + payment + spin), result overlay, recent spins tabs, inline “How to Play”, and [`GameFAQ`](../../components/shared/GameFAQ.tsx) with `game="roulette"`.

---

## UI components (`components/Roulette/`)

| File | Role |
|------|------|
| [`RouletteWheel.tsx`](../../components/Roulette/RouletteWheel.tsx) | Animated wheel (lazy `react-casino-roulette`); spins when `lastResult` arrives |
| [`RouletteBettingTable.tsx`](../../components/Roulette/RouletteBettingTable.tsx) | Interactive layout (lazy `react-casino-roulette` `RouletteTable`); builds `RouletteBet[]` |
| [`RouletteActionPanel.tsx`](../../components/Roulette/RouletteActionPanel.tsx) | Chip size, MORBIUS vs PLS, spin / approve flow |
| [`RouletteResultOverlay.tsx`](../../components/Roulette/RouletteResultOverlay.tsx) | Post-spin summary overlay |
| [`RouletteRecentPlays.tsx`](../../components/Roulette/RouletteRecentPlays.tsx) | “Recent Spins” / “My Spins” lists (chain-backed; see hooks) |
| [`roulette-constants.ts`](../../components/Roulette/roulette-constants.ts) | Wheel order, red/black sets, grid rows, `getPocketColor` |

---

## Hooks

| File | Role |
|------|------|
| [`hooks/useRoulettePlayFlow.ts`](../../hooks/useRoulettePlayFlow.ts) | Wagmi writes: MORBIUS `approve` + `spin`, or `spinWithPLS`; decodes `Spun` from receipt; exports `BetType`, `RouletteBet`, `RouletteSpinResult` |
| [`hooks/use-roulette-results.ts`](../../hooks/use-roulette-results.ts) | Subscribes to `Spun` via `useWatchContractEvent`; backfills recent logs from RPC (`ROULETTE_DEPLOY_BLOCK` … latest); helpers for top players / player stats (aggregated client-side from events) |

---

## Config, ABI, and shared addresses

| File | Role |
|------|------|
| [`lib/contracts.ts`](../../lib/contracts.ts) | `ROULETTE_ADDRESS`, `ROULETTE_DEPLOY_BLOCK`, plus shared tokens/router used for PLS quotes (`MORBIUS_TOKEN_ADDRESS`, `WPLS_TOKEN_ADDRESS`, `PULSEX_V1_ROUTER_ADDRESS`, …) |
| [`lib/roulette-abi.ts`](../../lib/roulette-abi.ts) | ABI consumed by the frontend (Viem/Wagmi) |

---

## Smart contract & tooling (`contracts/`)

| Path | Role |
|------|------|
| [`contracts/contracts/Roulette.sol`](../../contracts/contracts/Roulette.sol) | Source: bet types, fees (5% split aligned with Keno/Plinko), `spin` / `spinWithPLS`, `Spun` event, reserve / admin |
| [`contracts/abi/roulette.json`](../../contracts/abi/roulette.json) | Compiled ABI (JSON) |
| [`contracts/abi/roulette.ts`](../../contracts/abi/roulette.ts) | TS export of ABI (if used elsewhere) |
| [`contracts/scripts/roulette/deploy/deploy-roulette.js`](../../contracts/scripts/roulette/deploy/deploy-roulette.js) | Hardhat deploy script; prints reminders to update `lib/contracts.ts` |
| [`contracts/scripts/roulette/fund/fund-roulette.js`](../../contracts/scripts/roulette/fund/fund-roulette.js) | Approve + fund contract MORBIUS reserve |

After deploy, update **`ROULETTE_ADDRESS`** and **`ROULETTE_DEPLOY_BLOCK`** in `lib/contracts.ts` (the deploy script echoes this).

---

## Database

| File | Role |
|------|------|
| [`server/migrations/092_roulette_spins.sql`](../../server/migrations/092_roulette_spins.sql) | Creates `roulette_spins` for cached history; migration comment notes intended population by a **chain-analytics** indexer |

The **current** “Recent Spins” / “My Spins” UI does **not** read this table; it uses **on-chain events** via `use-roulette-results.ts`. Apply the migration when you wire analytics or APIs to Postgres:

```bash
node server/run-migration.js migrations/092_roulette_spins.sql
```

---

## Copy / FAQ

| Location | Role |
|----------|------|
| [`components/shared/GameFAQ.tsx`](../../components/shared/GameFAQ.tsx) | `roulette` entry: rules, fees, RNG note, contract FAQ slot |
| [`app/roulette/page.tsx`](./page.tsx) | Short “How to Play” card above the footer |

---

## NPM dependency

The table and wheel visuals use **`react-casino-roulette`** (see [`RouletteBettingTable.tsx`](../../components/Roulette/RouletteBettingTable.tsx) / [`RouletteWheel.tsx`](../../components/Roulette/RouletteWheel.tsx) for dynamic imports and bundled CSS).

---

## Quick mental model

1. **Bets** — `RouletteBettingTable` updates `RouletteBet[]` on the page; types mirror Solidity (`BetType` 0–9, `param`, `wager`, `numbers[]`).
2. **Spin** — `useRoulettePlayFlow` sends `spin` (MORBIUS) or `spinWithPLS` (PLS value from router quote + buffers), then parses **`Spun`** from logs.
3. **Animation** — Page sets `wheelResult` from `lastResult`; `RouletteWheel` runs; on complete, overlay can show payout summary.
4. **History** — `useRouletteResults` listens and scans logs for the global / per-wallet lists.

---

## PulseChain mainnet (as checked in repo)

- **Roulette:** `ROULETTE_ADDRESS` in [`lib/contracts.ts`](../../lib/contracts.ts)  
- **Deploy block:** `ROULETTE_DEPLOY_BLOCK` (used to bound `getContractEvents` scans)

Explorer: [scan.pulsechain.com](https://scan.pulsechain.com) (search the contract address).
