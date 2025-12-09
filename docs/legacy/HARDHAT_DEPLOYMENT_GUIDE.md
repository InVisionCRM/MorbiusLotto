# Hardhat Deployment Guide - SuperStakeLottery6of55

Since Remix is having issues with the IR compilation pipeline, use Hardhat instead. It's properly configured and more reliable.

## Quick Deploy

```bash
cd contracts
npm install
echo "PRIVATE_KEY=your_private_key_without_0x" > .env
npx hardhat run scripts/deploy-6of55.js --network pulsechain
```

Then update the contract address in `lib/contracts.ts`

See full guide in contracts directory or ask for detailed instructions.
