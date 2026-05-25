/**
 * Rescue entire MORBIUS balance from MerkleClaimLP to owner wallet.
 *
 *   DRY_RUN=1 node contracts/scripts/merkle/disperse/rescue-merkle-lp-vault.js
 *   node contracts/scripts/merkle/disperse/rescue-merkle-lp-vault.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../../server/.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const { ethers } = require('ethers');
const { getTxOverrides, waitForReceipt } = require('./tx-utils');

const MORBIUS = process.env.MORBIUS_TOKEN_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
const MERKLE_LP = process.env.MERKLE_CLAIM_LP_ADDRESS || '0x64Dd1c933027d757212E43725c99bD4402211A1A';
const RPC = process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com';

const merkleAbi = ['function rescueTokens(address token, uint256 amount) external'];
const erc20Abi = ['function balanceOf(address account) view returns (uint256)'];

async function main() {
  const pk = process.env.MERKLE_OWNER_PRIVATE_KEY;
  if (!pk && process.env.DRY_RUN !== '1') throw new Error('MERKLE_OWNER_PRIVATE_KEY required');

  const provider = new ethers.JsonRpcProvider(RPC, 369);
  const token = new ethers.Contract(MORBIUS, erc20Abi, provider);
  const merkleBal = await token.balanceOf(MERKLE_LP);

  console.log('LP merkle vault:', MERKLE_LP);
  console.log('MORBIUS balance to rescue:', ethers.formatEther(merkleBal), 'MORBIUS');

  if (merkleBal === 0n) {
    console.log('Nothing to rescue.');
    return;
  }

  if (process.env.DRY_RUN === '1') {
    console.log('DRY_RUN — no transaction.');
    return;
  }

  const wallet = new ethers.Wallet(pk, provider);
  console.log('Owner wallet:', wallet.address);
  const merkle = new ethers.Contract(MERKLE_LP, merkleAbi, wallet);
  const overrides = await getTxOverrides(provider);
  const tx = await merkle.rescueTokens(MORBIUS, merkleBal, overrides);
  console.log('rescueTokens tx:', tx.hash);
  await waitForReceipt(provider, tx.hash);
  console.log('Rescue complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
