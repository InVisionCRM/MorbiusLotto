## Morbius Lottery Deployment (V2)

- Contract: `SuperStakeLottery6of55` (V2)
- Source: `contracts/SuperStakeLottery6of55V2.sol`
- Network: PulseChain mainnet
- Constructor args: `[pSSH_TOKEN_ADDRESS, WPLS_TOKEN_ADDRESS, PULSEX_ROUTER_ADDRESS, ROUND_DURATION, MEGA_MORBIUS_INTERVAL]`
- Deploy script: `contracts/scripts/deploy-6of55-v2.js`
- ABI export: `abi/lottery6of55-v2.json`
- After deploy: update `lib/contracts.ts` with address/block, regenerate frontend hooks if needed.



