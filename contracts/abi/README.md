# Contract ABIs (canonical location)

All ABI JSON files for the app and server live here. Generated from Hardhat artifacts or synced from `artifacts/`.

| File | Contract | Address (mainnet) |
|------|----------|-------------------|
| `blackjack-v2.json` | BlackjackV2 (BlackjackV2.sol) | `0xFCE49ab8b53366C397A0205c4c0CF42aE2B658A8` |
| `lottery6of55-v2.json` | MegaMorbiusLottery (SuperStakeLottery6of55V2.sol) | `0xD66b4489fbfF99A8d62f969203899840F2ec69c5` |
| `plinko.json` | Plinko | — |
| `bigwheel.json` | BigWheel | — |
| `CryptoKeno.json` | CryptoKeno | — |

**Sync from Hardhat after contract changes:**

```bash
cp artifacts/contracts/contracts/Blackjack.sol/Blackjack.json contracts/abi/blackjack-v2.json
cp artifacts/contracts/contracts/SuperStakeLottery6of55V2.sol/MegaMorbiusLottery.json contracts/abi/lottery6of55-v2.json
```

Frontend: `abi/*.ts` re-exports from `../contracts/abi/*.json`.  
Server: imports from `../../../contracts/abi/*.json` (when run from repo root).
