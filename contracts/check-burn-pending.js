const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');

const RPC_URL = 'https://rpc.pulsechain.com';
const LOTTERY_ADDRESS = '0x6A63CF27ecE3ce050932780f6357Bfa856060B7e';
const MORBIUS_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';

const artifact = JSON.parse(fs.readFileSync('../abi/lottery6of55-v2.json', 'utf8'));
const ABI = Array.isArray(artifact) ? artifact : artifact.abi;

const ERC20_ABI = ['function balanceOf(address account) view returns (uint256)'];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const lottery = new ethers.Contract(LOTTERY_ADDRESS, ABI, provider);
  const morbius = new ethers.Contract(MORBIUS_ADDRESS, ERC20_ABI, provider);

  const totalBalance = await morbius.balanceOf(LOTTERY_ADDRESS);
  console.log('=== COMPLETE ACCOUNTING CHECK ===\n');
  console.log('Total Balance:', ethers.formatUnits(totalBalance, 18), 'MORBIUS\n');

  // Check all possible state variables
  const rollover = await lottery.rolloverReserve();
  const megaBank = await lottery.megaMorbiusBank();
  const currentPool = await lottery.currentRoundTotalMorbius();
  const pendingBurn = await lottery.pendingBurnMorbius();
  const burnThreshold = await lottery.burnThreshold();
  const totalClaimable = await lottery.totalMorbiusClaimableOutstanding();

  console.log('STATE VARIABLES:');
  console.log('  Rollover Reserve:', ethers.formatUnits(rollover, 18));
  console.log('  MegaMorbius Bank:', ethers.formatUnits(megaBank, 18));
  console.log('  Current Round Pool:', ethers.formatUnits(currentPool, 18));
  console.log('  Pending Burn:', ethers.formatUnits(pendingBurn, 18));
  console.log('  Burn Threshold:', ethers.formatUnits(burnThreshold, 18));
  console.log('  Total Claimable Outstanding:', ethers.formatUnits(totalClaimable, 18));
  console.log('');

  const total = rollover + megaBank + currentPool + pendingBurn + totalClaimable;
  const stuck = totalBalance - total;

  console.log('TOTALS:');
  console.log('  Accounted:', ethers.formatUnits(total, 18));
  console.log('  Stuck/Missing:', ethers.formatUnits(stuck, 18));
  console.log('');

  console.log('=== ISSUE FOUND ===\n');
  if (pendingBurn > 0) {
    console.log('💡 Pending Burn:', ethers.formatUnits(pendingBurn, 18), 'MORBIUS');
    console.log('   → This is fees waiting to be burned');
    if (pendingBurn < burnThreshold) {
      console.log('   → Below threshold, waiting for more fees to accumulate');
    }
  }

  if (totalClaimable > 0) {
    console.log('💡 Claimable Winnings:', ethers.formatUnits(totalClaimable, 18), 'MORBIUS');
    console.log('   → These are prizes players havent claimed yet');
  }

  if (stuck > ethers.parseUnits('100', 18)) {
    console.log('❌ STUCK FUNDS:', ethers.formatUnits(stuck, 18), 'MORBIUS');
    console.log('   → These funds are not tracked in any pool!');
  }
}

main().catch(console.error);
