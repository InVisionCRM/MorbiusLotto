const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');

const RPC_URL = 'https://rpc.pulsechain.com';
const LOTTERY_ADDRESS = '0xbC21f1228f3D2cb3867Ea504D4007C3ce2dc5CE2';

const artifact = JSON.parse(fs.readFileSync('../abi/lottery6of55-v2.json', 'utf8'));
const ABI = Array.isArray(artifact) ? artifact : artifact.abi;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const lottery = new ethers.Contract(LOTTERY_ADDRESS, ABI, provider);
  
  // Get current round info
  const info = await lottery.getCurrentRoundInfo();
  console.log('=== CURRENT ROUND INFO ===');
  console.log('Round ID:', info[0].toString());
  console.log('State:', ['OPEN', 'LOCKED', 'FINALIZED'][Number(info[8])]);
  console.log('Total Tickets:', info[4].toString());
  console.log('Total MORBIUS:', ethers.formatUnits(info[3], 18));
  
  // Try to get the previous round (27) details
  const currentRoundId = Number(info[0]);
  console.log('\n=== CHECKING ROUND', currentRoundId - 1, '===');
  try {
    const prevRound = await lottery.getRound(currentRoundId - 1);
    console.log('State:', ['OPEN', 'LOCKED', 'FINALIZED'][Number(prevRound.state)]);
    console.log('Winning Numbers:', prevRound.winningNumbers.map(n => n.toString()).join(', '));
    console.log('Total Tickets:', prevRound.totalTickets.toString());
    console.log('Closing Block:', prevRound.closingBlock.toString());
  } catch (err) {
    console.log('Error fetching round:', err.message);
  }
  
  // Also check current round
  console.log('\n=== CHECKING CURRENT ROUND', currentRoundId, '===');
  try {
    const currRound = await lottery.getRound(currentRoundId);
    console.log('State:', ['OPEN', 'LOCKED', 'FINALIZED'][Number(currRound.state)]);
    console.log('Winning Numbers:', currRound.winningNumbers.map(n => n.toString()).join(', '));
    console.log('Total Tickets:', currRound.totalTickets.toString());
    if (currRound.closingBlock > 0) {
      console.log('Closing Block:', currRound.closingBlock.toString());
    }
  } catch (err) {
    console.log('Error fetching round:', err.message);
  }
}

main().catch(console.error);
