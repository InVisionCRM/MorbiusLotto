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
  const currentRoundTotal = await lottery.currentRoundTotalCollectedFromPlayers();

  console.log('=== FUND FLOW ANALYSIS ===\n');
  console.log('Total Balance in Contract:', ethers.formatUnits(totalBalance, 18));
  console.log('Total Collected from Players:', ethers.formatUnits(currentRoundTotal, 18));
  console.log('');

  // If player paid 100 MORBIUS per ticket:
  // - 5% keeper (5) should swap to PLS
  // - 5% deployer (5) should transfer out
  // - 10% burn (10) goes to burn accumulator
  // - 10% mega (10) stays in contract as megaMorbiusBank
  // - 70% winners (70) stays in contract as currentRoundTotalMorbius

  // So from 100 MORBIUS:
  // - 10 MORBIUS should leave via swap (keeper)
  // - 5 MORBIUS should leave via transfer (deployer)
  // - 85 MORBIUS stays in contract (10 burn pending + 10 mega + 70 winners + unclaimed)

  const rollover = await lottery.rolloverReserve();
  const megaBank = await lottery.megaMorbiusBank();
  const currentPool = await lottery.currentRoundTotalMorbius();
  const pendingBurn = await lottery.pendingBurnMorbius();
  const totalClaimable = await lottery.totalMorbiusClaimableOutstanding();

  console.log('TRACKED IN CONTRACT:');
  console.log('  Rollover Reserve:', ethers.formatUnits(rollover, 18));
  console.log('  MegaMorbius Bank:', ethers.formatUnits(megaBank, 18));
  console.log('  Current Round Pool (70%):', ethers.formatUnits(currentPool, 18));
  console.log('  Pending Burn (10%):', ethers.formatUnits(pendingBurn, 18));
  console.log('  Claimable Winnings:', ethers.formatUnits(totalClaimable, 18));
  console.log('  ---');
  
  const tracked = rollover + megaBank + currentPool + pendingBurn + totalClaimable;
  console.log('  Total Tracked:', ethers.formatUnits(tracked, 18));
  console.log('');

  const stuck = totalBalance - tracked;
  console.log('STUCK/UNTRACKED:', ethers.formatUnits(stuck, 18), 'MORBIUS');
  console.log('');

  // Calculate what should have been sent out
  if (currentRoundTotal > 0) {
    const shouldHaveSentKeeper = (currentRoundTotal * 500n) / 10000n; // 5%
    const shouldHaveSentDeployer = (currentRoundTotal * 500n) / 10000n; // 5%
    const totalShouldHaveSent = shouldHaveSentKeeper + shouldHaveSentDeployer;
    
    console.log('=== EXPECTED vs ACTUAL ===\n');
    console.log('From ticket sales of', ethers.formatUnits(currentRoundTotal, 18), 'MORBIUS:');
    console.log('');
    console.log('Should have SENT OUT:');
    console.log('  5% Keeper Fee (swap to PLS):', ethers.formatUnits(shouldHaveSentKeeper, 18));
    console.log('  5% Deployer Fee (transfer):', ethers.formatUnits(shouldHaveSentDeployer, 18));
    console.log('  Total should be GONE:', ethers.formatUnits(totalShouldHaveSent, 18));
    console.log('');
    console.log('STUCK amount:', ethers.formatUnits(stuck, 18));
    console.log('');

    if (stuck >= totalShouldHaveSent * 99n / 100n) {
      console.log('🔴 DIAGNOSIS: The keeper swap AND/OR deployer transfer are FAILING');
      console.log('   → Tokens meant to leave the contract are stuck inside');
      console.log('   → Neither the swap to PLS nor the transfer to deployer is working');
    } else if (stuck >= shouldHaveSentKeeper * 99n / 100n) {
      console.log('🔴 DIAGNOSIS: The keeper fee swap to PLS is FAILING');
      console.log('   → Deployer transfers may be working');
      console.log('   → But the PLS swap is not executing properly');
    }
  }
}

main().catch(console.error);
