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
  
  console.log('=== LIFETIME STATISTICS ===\n');
  
  const totalEverCollected = await lottery.totalMorbiusEverCollected();
  const totalEverClaimed = await lottery.totalMorbiusEverClaimed();
  const totalTicketsEver = await lottery.totalTicketsEver();
  
  console.log('Total Ever Collected:', ethers.formatUnits(totalEverCollected, 18), 'MORBIUS');
  console.log('Total Ever Claimed:', ethers.formatUnits(totalEverClaimed, 18), 'MORBIUS');
  console.log('Total Tickets Ever:', totalTicketsEver.toString());
  console.log('');
  
  console.log('Current Balance:', ethers.formatUnits(totalBalance, 18), 'MORBIUS');
  console.log('');

  // From total collected, calculate what SHOULD have happened:
  if (totalEverCollected > 0) {
    const shouldKeeperFee = (totalEverCollected * 500n) / 10000n; // 5%
    const shouldDeployerFee = (totalEverCollected * 500n) / 10000n; // 5%
    const shouldBurn = (totalEverCollected * 1000n) / 10000n; // 10%
    const shouldMega = (totalEverCollected * 1000n) / 10000n; // 10%
    const shouldWinners = (totalEverCollected * 7000n) / 10000n; // 70%
    
    console.log('=== EXPECTED DISTRIBUTION (from', ethers.formatUnits(totalEverCollected, 18), 'collected) ===\n');
    console.log('Should have SENT OUT:');
    console.log('  Keeper Fee (5%):', ethers.formatUnits(shouldKeeperFee, 18));
    console.log('  Deployer Fee (5%):', ethers.formatUnits(shouldDeployerFee, 18));
    console.log('  Total OUT:', ethers.formatUnits(shouldKeeperFee + shouldDeployerFee, 18));
    console.log('');
    console.log('Should have BURNED:');
    console.log('  Burn (10%):', ethers.formatUnits(shouldBurn, 18));
    console.log('');
    console.log('Should be in CONTRACT:');
    console.log('  MegaMorbius (10%):', ethers.formatUnits(shouldMega, 18));
    console.log('  Winners Pool (70%):', ethers.formatUnits(shouldWinners, 18));
    console.log('  Total IN:', ethers.formatUnits(shouldMega + shouldWinners, 18));
    console.log('');
    
    const netAfterSendouts = totalEverCollected - shouldKeeperFee - shouldDeployerFee;
    const netAfterClaims = netAfterSendouts - totalEverClaimed;
    
    console.log('=== ACTUAL vs EXPECTED ===\n');
    console.log('Expected in contract after sendouts:', ethers.formatUnits(netAfterSendouts, 18));
    console.log('Expected in contract after claims:', ethers.formatUnits(netAfterClaims, 18));
    console.log('Actual in contract:', ethers.formatUnits(totalBalance, 18));
    console.log('');
    console.log('Difference:', ethers.formatUnits(totalBalance - netAfterClaims, 18));
    console.log('');
    
    // Check current state
    const rollover = await lottery.rolloverReserve();
    const megaBank = await lottery.megaMorbiusBank();
    const currentPool = await lottery.currentRoundTotalMorbius();
    const pendingBurn = await lottery.pendingBurnMorbius();
    const totalClaimable = await lottery.totalMorbiusClaimableOutstanding();
    
    console.log('=== CURRENT STATE VARIABLES ===\n');
    console.log('Rollover Reserve:', ethers.formatUnits(rollover, 18));
    console.log('MegaMorbius Bank:', ethers.formatUnits(megaBank, 18));
    console.log('Current Round Pool:', ethers.formatUnits(currentPool, 18));
    console.log('Pending Burn:', ethers.formatUnits(pendingBurn, 18));
    console.log('Total Claimable:', ethers.formatUnits(totalClaimable, 18));
    console.log('---');
    console.log('Total Tracked:', ethers.formatUnits(rollover + megaBank + currentPool + pendingBurn + totalClaimable, 18));
  }
}

main().catch(console.error);
