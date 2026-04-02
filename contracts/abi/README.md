# Contract ABIs (canonical location)

All ABI JSON files for the app and server live here. Generated from Hardhat artifacts or synced from `artifacts/`.

| File | Contract | Address (mainnet) |
|------|----------|-------------------|
| `blackjack-v2.json` | BlackjackV2 (BlackjackV2.sol) | `0xFCE49ab8b53366C397A0205c4c0CF42aE2B658A8` |
| `instant-lottery-6of55.json` | InstantLottery6of55 (InstantLottery6of55.sol) | `0x6CCecFd3165f4d911BA8D196eb5202cc80fEF8a8` |
| `plinko.json` | Plinko | — |
| `bigwheel.json` | BigWheel | — |
| `CryptoKeno.json` | CryptoKeno | — |

**Sync from Hardhat after contract changes:**

```bash
cp artifacts/contracts/contracts/Blackjack.sol/Blackjack.json contracts/abi/blackjack-v2.json
cp artifacts/contracts/contracts/InstantLottery6of55.sol/InstantLottery6of55.json contracts/abi/instant-lottery-6of55.json
```

Frontend: `abi/*.ts` re-exports from `../contracts/abi/*.json`.  
Server: imports from `../../../contracts/abi/*.json` (when run from repo root).
