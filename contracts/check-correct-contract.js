const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');

const RPC_URL = 'https://rpc.pulsechain.com';
const LOTTERY_ADDRESS = '0x6A63CF27ecE3ce050932780f6357Bfa856060B7e';
const MORBIUS_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';

const artifact = JSON.parse(fs.readFileSync('../abi/lottery6of55-v2.json', 'utf8'));
const ABI = Array.isArray(artifact) ? artifact : artifact.abi;

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const lottery = new ethers.Contract(LOTTERY_ADDRESS, ABI, provider);
  const morbiusToken = new ethers.Contract(MORBIUS_ADDRESS, ERC20_ABI, provider);

  console.log('=== CONTRACT ANALYSIS ===');
  console.log('Contract Address:', LOTTERY_ADDRESS);
  console.log('');

  // Get total balance
  const totalBalance = await morbiusToken.balanceOf(LOTTERY_ADDRESS);
  console.log('📊 Total MORBIUS in Contract:', ethers.formatUnits(totalBalance, 18), 'MORBIUS');
  console.log('');

  // Get current round info
  const currentRoundId = await lottery.currentRoundId();
  console.log('🎲 Current Round ID:', currentRoundId.toString());

  const rolloverReserve = await lottery.rolloverReserve();
  console.log('💰 Rollover Reserve:', ethers.formatUnits(rolloverReserve, 18), 'MORBIUS');

  const megaBank = await lottery.megaMorbiusBank();
  console.log('🏦 MegaMorbius Bank:', ethers.formatUnits(megaBank, 18), 'MORBIUS');

  const currentRoundTotal = await lottery.currentRoundTotalMorbius();
  console.log('🎟️  Current Round Pool:', ethers.formatUnits(currentRoundTotal, 18), 'MORBIUS');

  // Check pending rounds
  console.log('');
  console.log('📅 Checking Future Rounds (pending allocations)...');
  let totalPending = 0n;
  for (let i = Number(currentRoundId) + 1; i <= Number(currentRoundId) + 20; i++) {
    try {
      const pending = await lottery.pendingRoundMorbius(i);
      if (pending > 0) {
        console.log(`   Round ${i}: ${ethers.formatUnits(pending, 18)} MORBIUS`);
        totalPending += pending;
      }
    } catch (e) {
      // ignore
    }
  }
  console.log('   Total Pending:', ethers.formatUnits(totalPending, 18), 'MORBIUS');

  // Calculate distribution
  console.log('');
  console.log('=== TOKEN DISTRIBUTION ===');
  console.log('');
  const accounted = rolloverReserve + megaBank + currentRoundTotal + totalPending;
  const unaccounted = totalBalance - accounted;

  console.log('Rollover Reserve:     ', ethers.formatUnits(rolloverReserve, 18));
  console.log('MegaMorbius Bank:     ', ethers.formatUnits(megaBank, 18));
  console.log('Current Round Pool:   ', ethers.formatUnits(currentRoundTotal, 18));
  console.log('Future Rounds Pending:', ethers.formatUnits(totalPending, 18));
  console.log('---');
  console.log('Total Accounted:      ', ethers.formatUnits(accounted, 18));
  console.log('Unaccounted/Other:    ', ethers.formatUnits(unaccounted, 18));
  console.log('---');
  console.log('Total Balance:        ', ethers.formatUnits(totalBalance, 18));

  // Diagnosis
  console.log('');
  console.log('=== DIAGNOSIS ===');
  console.log('');

  const percentInCurrent = totalBalance > 0 ? Number(currentRoundTotal * 10000n / totalBalance) / 100 : 0;
  const percentInMega = totalBalance > 0 ? Number(megaBank * 10000n / totalBalance) / 100 : 0;
  const percentInRollover = totalBalance > 0 ? Number(rolloverReserve * 10000n / totalBalance) / 100 : 0;
  const percentInPending = totalBalance > 0 ? Number(totalPending * 10000n / totalBalance) / 100 : 0;
  const percentUnaccounted = totalBalance > 0 ? Number(unaccounted * 10000n / totalBalance) / 100 : 0;

  console.log(`Current Round Pool: ${percentInCurrent.toFixed(2)}% of total`);
  console.log(`MegaMorbius Bank:   ${percentInMega.toFixed(2)}% of total`);
  console.log(`Rollover Reserve:   ${percentInRollover.toFixed(2)}% of total`);
  console.log(`Pending Future:     ${percentInPending.toFixed(2)}% of total`);
  console.log(`Other/Unaccounted:  ${percentUnaccounted.toFixed(2)}% of total`);

  if (percentUnaccounted > 5) {
    console.log('');
    console.log('⚠️  WARNING: Large portion of tokens are unaccounted for!');
    console.log('   This could be:');
    console.log('   - Tokens in finalized rounds waiting to be claimed');
    console.log('   - Unclaimed prizes from past rounds');
    console.log('   - Tokens allocated to historical rounds');
  }

  if (currentRoundTotal === 0n && rolloverReserve === 0n) {
    console.log('');
    console.log('❌ ISSUE: Both Current Round Pool and Rollover Reserve are ZERO!');
    console.log('   → Players cannot win anything in the current round');
    console.log('   → This usually happens after prizes are distributed');
  }

  if (megaBank > totalBalance / 2n) {
    console.log('');
    console.log('⚠️  Most tokens are in MegaMorbius Bank!');
    console.log('   → This is the jackpot pool for MegaMorbius rounds');
  }
}

main().catch(console.error);
