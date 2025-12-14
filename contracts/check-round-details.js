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

  const currentRoundId = await lottery.currentRoundId();
  console.log('Current Round:', currentRoundId.toString());
  console.log('');

  // Check current round
  console.log('=== CURRENT ROUND (Round ' + currentRoundId + ') ===');
  const info = await lottery.getCurrentRoundInfo();
  console.log('State:', ['OPEN', 'FINALIZED'][Number(info[8])]);
  console.log('Total Collected:', ethers.formatUnits(info[3], 18), 'MORBIUS');
  console.log('Total Tickets:', info[4].toString());
  console.log('');

  // Check last 10 rounds for unclaimed prizes
  console.log('=== CHECKING LAST 10 ROUNDS FOR UNCLAIMED PRIZES ===');
  console.log('');

  let totalInPastRounds = 0n;
  const roundsToCheck = Math.max(0, Number(currentRoundId) - 10);

  for (let i = Number(currentRoundId) - 1; i >= roundsToCheck && i > 0; i--) {
    try {
      const round = await lottery.rounds(i);
      const roundId = round[0];
      const state = round[11]; // state is at index 11
      const totalCollected = round[6]; // totalMorbiusCollected

      if (totalCollected > 0) {
        console.log(`Round ${i}:`);
        console.log(`  State: ${['OPEN', 'FINALIZED'][Number(state)]}`);
        console.log(`  Total Collected: ${ethers.formatUnits(totalCollected, 18)} MORBIUS`);

        // Check if there are unclaimed prizes in brackets
        let roundTotal = 0n;
        for (let b = 0; b < 6; b++) {
          const bracket = round[9][b]; // brackets array at index 9
          const poolAmount = bracket[1];
          const winnerCount = bracket[2];
          if (poolAmount > 0) {
            roundTotal += poolAmount;
            console.log(`  Bracket ${b + 1}: ${ethers.formatUnits(poolAmount, 18)} MORBIUS, ${winnerCount.toString()} winners`);
          }
        }

        if (roundTotal > 0) {
          console.log(`  → Unclaimed in Round: ${ethers.formatUnits(roundTotal, 18)} MORBIUS`);
          totalInPastRounds += roundTotal;
        }
        console.log('');
      }
    } catch (e) {
      // Skip rounds that error
    }
  }

  console.log('=== SUMMARY ===');
  console.log('Total in Past Rounds (unclaimed):', ethers.formatUnits(totalInPastRounds, 18), 'MORBIUS');
}

main().catch(console.error);
