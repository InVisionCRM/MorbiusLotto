/**
 * Deploy MorbiusBatchDisperse (owner-only batch ERC20 payouts).
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/merkle/deploy/deploy-morbius-batch-disperse.js --network pulsechain
 *
 * Post-deployment:
 *   1. Set MORBIUS_BATCH_DISPERSE_ADDRESS in lib/contracts.ts + server .env
 *   2. Run disperse script after rescue from MerkleClaimMorbius (see disperse-merkle-epoch.js)
 */

const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying MorbiusBatchDisperse with account:', deployer.address);
  console.log('Account balance:', ethers.formatEther(await deployer.provider.getBalance(deployer.address)), 'PLS');

  const Factory = await ethers.getContractFactory('MorbiusBatchDisperse');
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('\nMorbiusBatchDisperse deployed to:', address);
  console.log('\nNext steps:');
  console.log('  1. Add to lib/contracts.ts: MORBIUS_BATCH_DISPERSE_ADDRESS =', `'${address}'`);
  console.log('  2. Verify on PulseScan:');
  console.log(`     npx hardhat verify --network pulsechain ${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
