/**
 * Deploy MerkleClaimLP contract (LP staker Merkle drop).
 *
 * MORBIUS is funded by sending tokens directly to the contract address —
 * no transferFrom approval required.
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/deploy-merkle-claim-lp.js --network pulsechain
 *
 * Post-deployment:
 *   1. Update MERKLE_CLAIM_LP_ADDRESS in lib/contracts.ts
 *   2. Add the contract address to server/.env as MERKLE_CLAIM_LP_ADDRESS
 *   3. To fund: send MORBIUS directly to the contract address (no approval needed)
 *   4. Run the backend LP snapshot + Merkle tree generation for the first epoch
 */

const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying MerkleClaimLP with account:', deployer.address);
  console.log('Account balance:', ethers.formatEther(await deployer.provider.getBalance(deployer.address)), 'PLS');

  const morbiusToken = process.env.MORBIUS_TOKEN_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
  console.log('MORBIUS Token:', morbiusToken);

  const MerkleClaimLP = await ethers.getContractFactory('MerkleClaimLP');
  const contract = await MerkleClaimLP.deploy(morbiusToken);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('\nMerkleClaimLP deployed to:', address);
  console.log('\nNext steps:');
  console.log('  1. Update lib/contracts.ts: MERKLE_CLAIM_LP_ADDRESS =', `'${address}'`);
  console.log('  2. Add to server/.env: MERKLE_CLAIM_LP_ADDRESS=' + address);
  console.log('  3. Verify on PulseScan:');
  console.log(`     npx hardhat verify --network pulsechain ${address} "${morbiusToken}"`);
  console.log('  4. Fund: send MORBIUS directly to', address, '(no approval needed)');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
