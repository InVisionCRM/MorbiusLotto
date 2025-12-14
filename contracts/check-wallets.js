const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');

const RPC_URL = 'https://rpc.pulsechain.com';
const LOTTERY_ADDRESS = '0x6A63CF27ecE3ce050932780f6357Bfa856060B7e';

const artifact = JSON.parse(fs.readFileSync('../abi/lottery6of55-v2.json', 'utf8'));
const ABI = Array.isArray(artifact) ? artifact : artifact.abi;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const lottery = new ethers.Contract(LOTTERY_ADDRESS, ABI, provider);

  console.log('=== CONTRACT CONFIGURATION ===\n');

  const keeperWallet = await lottery.keeperWallet();
  const deployerWallet = await lottery.deployerWallet();
  const owner = await lottery.owner();

  console.log('Keeper Wallet:', keeperWallet);
  console.log('Deployer Wallet:', deployerWallet);
  console.log('Owner:', owner);
  console.log('');

  // Check if wallets are set to zero address
  const zeroAddress = '0x0000000000000000000000000000000000000000';
  
  console.log('=== ISSUES ===\n');
  
  if (keeperWallet === zeroAddress) {
    console.log('❌ Keeper wallet is ZERO ADDRESS!');
    console.log('   → Keeper fee swaps will FAIL');
    console.log('   → Tokens will be stuck in contract');
  }
  
  if (deployerWallet === zeroAddress) {
    console.log('❌ Deployer wallet is ZERO ADDRESS!');
    console.log('   → Deployer fee transfers will FAIL');
    console.log('   → Tokens will be stuck in contract');
  }

  if (keeperWallet !== zeroAddress && deployerWallet !== zeroAddress) {
    console.log('✅ Both wallets are configured');
    console.log('   → But fees might still be failing for other reasons');
  }

  // Check fee percentages
  const keeperFeePct = await lottery.KEEPER_FEE_PCT();
  const deployerFeePct = await lottery.DEPLOYER_FEE_PCT();
  const burnPct = await lottery.BURN_PCT();
  const megaBankPct = await lottery.MEGA_BANK_PCT();

  console.log('\n=== FEE STRUCTURE ===\n');
  console.log('Keeper Fee:', (Number(keeperFeePct) / 100).toFixed(1) + '%');
  console.log('Deployer Fee:', (Number(deployerFeePct) / 100).toFixed(1) + '%');
  console.log('Burn:', (Number(burnPct) / 100).toFixed(1) + '%');
  console.log('MegaMorbius Bank:', (Number(megaBankPct) / 100).toFixed(1) + '%');
  console.log('Winners Pool: 70.0%');
  console.log('');
  console.log('Total Fees (non-winners):', (Number(keeperFeePct + deployerFeePct + burnPct + megaBankPct) / 100).toFixed(1) + '%');
}

main().catch(console.error);
