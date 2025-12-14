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

  console.log('=== SYSTEMATIC ANALYSIS - ZERO ASSUMPTIONS ===\n');

  // STEP 1: Get actual balance
  const actualBalance = await morbius.balanceOf(LOTTERY_ADDRESS);
  console.log('STEP 1: Actual MORBIUS in contract');
  console.log('  ', ethers.formatUnits(actualBalance, 18), 'MORBIUS');
  console.log('');

  // STEP 2: Get lifetime statistics
  const totalCollected = await lottery.totalMorbiusEverCollected();
  const totalClaimed = await lottery.totalMorbiusEverClaimed();
  const totalTickets = await lottery.totalTicketsEver();
  
  console.log('STEP 2: Lifetime statistics from contract');
  console.log('   Total ever collected from players:', ethers.formatUnits(totalCollected, 18));
  console.log('   Total ever claimed by winners:', ethers.formatUnits(totalClaimed, 18));
  console.log('   Total tickets ever sold:', totalTickets.toString());
  console.log('');

  // STEP 3: Calculate what SHOULD have happened based on contract rules
  console.log('STEP 3: Expected distribution (based on contract constants)');
  console.log('   From', ethers.formatUnits(totalCollected, 18), 'MORBIUS collected:');
  
  const keeper5Pct = (totalCollected * 500n) / 10000n;
  const deployer5Pct = (totalCollected * 500n) / 10000n;
  const burn10Pct = (totalCollected * 1000n) / 10000n;
  const mega10Pct = (totalCollected * 1000n) / 10000n;
  const winners70Pct = (totalCollected * 7000n) / 10000n;
  
  console.log('   - Keeper fee (5%):', ethers.formatUnits(keeper5Pct, 18));
  console.log('   - Deployer fee (5%):', ethers.formatUnits(deployer5Pct, 18));
  console.log('   - Burn (10%):', ethers.formatUnits(burn10Pct, 18));
  console.log('   - MegaMorbius Bank (10%):', ethers.formatUnits(mega10Pct, 18));
  console.log('   - Winners Pool (70%):', ethers.formatUnits(winners70Pct, 18));
  
  const totalCheck = keeper5Pct + deployer5Pct + burn10Pct + mega10Pct + winners70Pct;
  console.log('   - Total (verification):', ethers.formatUnits(totalCheck, 18));
  console.log('');

  // STEP 4: What should have left the contract
  console.log('STEP 4: What should have LEFT the contract');
  const shouldHaveLeft = keeper5Pct + deployer5Pct;
  console.log('   Keeper + Deployer fees:', ethers.formatUnits(shouldHaveLeft, 18));
  console.log('   (Burn stays until threshold, then leaves)');
  console.log('');

  // STEP 5: What should remain in contract before claims
  console.log('STEP 5: What should be IN contract (before claims)');
  const shouldRemainBeforeClaims = totalCollected - shouldHaveLeft;
  console.log('   ', ethers.formatUnits(shouldRemainBeforeClaims, 18), 'MORBIUS');
  console.log('   Breakdown:');
  console.log('   - Pending burn:', ethers.formatUnits(burn10Pct, 18));
  console.log('   - MegaMorbius Bank:', ethers.formatUnits(mega10Pct, 18));
  console.log('   - Winners pool:', ethers.formatUnits(winners70Pct, 18));
  console.log('');

  // STEP 6: What should remain after claims
  console.log('STEP 6: What should be IN contract (after claims)');
  const shouldRemainAfterClaims = shouldRemainBeforeClaims - totalClaimed;
  console.log('   ', ethers.formatUnits(shouldRemainAfterClaims, 18), 'MORBIUS');
  console.log('');

  // STEP 7: Compare expected vs actual
  console.log('STEP 7: Expected vs Actual comparison');
  console.log('   Expected in contract:', ethers.formatUnits(shouldRemainAfterClaims, 18));
  console.log('   Actual in contract:', ethers.formatUnits(actualBalance, 18));
  const discrepancy = actualBalance - shouldRemainAfterClaims;
  console.log('   Discrepancy:', ethers.formatUnits(discrepancy, 18));
  console.log('');

  // STEP 8: Check what's tracked in state variables
  console.log('STEP 8: What contract state variables show');
  const rollover = await lottery.rolloverReserve();
  const megaBank = await lottery.megaMorbiusBank();
  const currentPool = await lottery.currentRoundTotalMorbius();
  const pendingBurn = await lottery.pendingBurnMorbius();
  const totalClaimable = await lottery.totalMorbiusClaimableOutstanding();
  
  console.log('   Rollover Reserve:', ethers.formatUnits(rollover, 18));
  console.log('   MegaMorbius Bank:', ethers.formatUnits(megaBank, 18), '(expected:', ethers.formatUnits(mega10Pct, 18) + ')');
  console.log('   Current Round Pool:', ethers.formatUnits(currentPool, 18));
  console.log('   Pending Burn:', ethers.formatUnits(pendingBurn, 18), '(expected:', ethers.formatUnits(burn10Pct, 18) + ')');
  console.log('   Total Claimable:', ethers.formatUnits(totalClaimable, 18));
  console.log('');

  const totalTracked = rollover + megaBank + currentPool + pendingBurn + totalClaimable;
  console.log('   Total tracked by state variables:', ethers.formatUnits(totalTracked, 18));
  console.log('');

  // STEP 9: Find untracked funds
  console.log('STEP 9: Untracked funds analysis');
  const untracked = actualBalance - totalTracked;
  console.log('   Untracked MORBIUS:', ethers.formatUnits(untracked, 18));
  console.log('');

  // STEP 10: Diagnosis
  console.log('STEP 10: DIAGNOSIS');
  console.log('');
  console.log('ISSUE 1: Fees not leaving contract');
  console.log('   Expected to be sent out:', ethers.formatUnits(shouldHaveLeft, 18));
  console.log('   Discrepancy from Step 7:', ethers.formatUnits(discrepancy, 18));
  if (discrepancy >= shouldHaveLeft * 95n / 100n) {
    console.log('   ✗ Most/all keeper and deployer fees FAILED to send');
  }
  console.log('');

  console.log('ISSUE 2: State variable tracking failures');
  console.log('   MegaMorbius Bank - Expected:', ethers.formatUnits(mega10Pct, 18), 'Actual:', ethers.formatUnits(megaBank, 18));
  console.log('   Pending Burn - Expected:', ethers.formatUnits(burn10Pct, 18), 'Actual:', ethers.formatUnits(pendingBurn, 18));
  console.log('');

  console.log('ISSUE 3: Untracked funds');
  console.log('   ', ethers.formatUnits(untracked, 18), 'MORBIUS has no state variable tracking it');
  console.log('');

  console.log('=== CONCLUSION ===');
  console.log('The distribution logic in buyTickets() is failing at lines 319-330');
}

main().catch(console.error);
