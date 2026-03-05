/**
 * Deploy MerkleClaimMorbius contract.
 *
 * Usage:
 *   cd contracts
 *   MORBIUS_TOKEN_ADDRESS=0x... npx hardhat run scripts/deploy-merkle-claim.js --network pulsechain
 *
 * Post-deployment:
 *   1. Update MERKLE_CLAIM_MORBIUS_ADDRESS in lib/contracts.ts
 *   2. Approve MORBIUS spend for this contract (frontend/admin flow)
 *   3. Run the backend snapshot + Merkle tree generation for the first epoch
 */

const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying MerkleClaimMorbius with account:', deployer.address);
  console.log('Account balance:', ethers.formatEther(await deployer.provider.getBalance(deployer.address)), 'PLS');

  const morbiusToken = process.env.MORBIUS_TOKEN_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
  console.log('MORBIUS Token:', morbiusToken);

  const MerkleClaimMorbius = await ethers.getContractFactory('MerkleClaimMorbius');
  const contract = await MerkleClaimMorbius.deploy(morbiusToken);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('\nMerkleClaimMorbius deployed to:', address);
  console.log('\nNext steps:');
  console.log('  1. Update lib/contracts.ts: MERKLE_CLAIM_MORBIUS_ADDRESS =', `'${address}'`);
  console.log('  2. Verify on PulseScan:');
  console.log(`     npx hardhat verify --network pulsechain ${address} "${morbiusToken}"`);
  console.log('  3. Update NEXT_PUBLIC_MERKLE_CLAIM_MORBIUS_ADDRESS in your env vars');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
