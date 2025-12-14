const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');

const RPC_URL = 'https://rpc.pulsechain.com';
const LOTTERY_ADDRESS = '0xbC21f1228f3D2cb3867Ea504D4007C3ce2dc5CE2';
const MORBIUS_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';

const artifact = JSON.parse(fs.readFileSync('./morbius_lotto/abi/lottery6of55-v2.json', 'utf8'));
const ABI = Array.isArray(artifact) ? artifact : artifact.abi;

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const lottery = new ethers.Contract(LOTTERY_ADDRESS, ABI, provider);
  const morbiusToken = new ethers.Contract(MORBIUS_ADDRESS, ERC20_ABI, provider);

  console.log('=== FULL CONTRACT ACCOUNTING ===\n');

  // Get total balance
  const totalBalance = await morbiusToken.balanceOf(LOTTERY_ADDRESS);
  console.log('📊 Total MORBIUS in Contract:', ethers.formatUnits(totalBalance, 18), 'MORBIUS');
  console.log('   Raw:', totalBalance.toString(), '\n');

  // Get current round info
  const currentRoundId = await lottery.currentRoundId();
  console.log('🎲 Current Round:', currentRoundId.toString());

  const rolloverReserve = await lottery.rolloverReserve();
  console.log('💰 Rollover Reserve:', ethers.formatUnits(rolloverReserve, 18), 'MORBIUS');

  const megaBank = await lottery.megaMorbiusBank();
  console.log('🏦 MegaMorbius Bank:', ethers.formatUnits(megaBank, 18), 'MORBIUS');

  const currentRoundTotal = await lottery.currentRoundTotalMorbius();
  console.log('🎟️  Current Round Total:', ethers.formatUnits(currentRoundTotal, 18), 'MORBIUS');

  // Check pending rounds
  console.log('\n📅 Checking Future Rounds (pending allocations)...');
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
  console.log('\n=== TOKEN DISTRIBUTION ===\n');
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
  console.log('\n=== DIAGNOSIS ===\n');

  const percentInCurrent = Number(currentRoundTotal * 10000n / totalBalance) / 100;
  const percentInMega = Number(megaBank * 10000n / totalBalance) / 100;
  const percentInPending = Number(totalPending * 10000n / totalBalance) / 100;
  const percentUnaccounted = Number(unaccounted * 10000n / totalBalance) / 100;

  console.log(`Current Round Pool: ${percentInCurrent.toFixed(2)}% of total`);
  console.log(`MegaMorbius Bank:   ${percentInMega.toFixed(2)}% of total`);
  console.log(`Pending Future:     ${percentInPending.toFixed(2)}% of total`);
  console.log(`Other/Unaccounted:  ${percentUnaccounted.toFixed(2)}% of total`);

  if (percentUnaccounted > 5) {
    console.log('\n⚠️  WARNING: Large portion of tokens are unaccounted for!');
    console.log('   This could be:');
    console.log('   - Tokens in finalized rounds waiting to be claimed');
    console.log('   - Tokens allocated to historical rounds');
    console.log('   - Unclaimed prizes from past rounds');
  }

  if (currentRoundTotal < ethers.parseUnits('1000', 18)) {
    console.log('\n⚠️  Current round pool is very low!');
  }

  if (megaBank > ethers.parseUnits('100', 18)) {
    console.log('\n✅ MegaMorbius Bank has a good balance');
  }
}

main().catch(console.error);
