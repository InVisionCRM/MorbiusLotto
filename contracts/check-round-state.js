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
  const megaInterval = await lottery.megaMillionsInterval();
  const currentRoundState = await lottery.currentRoundState();
  
  console.log('Current Round ID:', currentRoundId.toString());
  console.log('MegaMillions Interval:', megaInterval.toString());
  console.log('Current Round State:', currentRoundState.toString(), currentRoundState === 0n ? '(OPEN)' : '(FINALIZED)');
  console.log('');
  
  // Check which rounds were MegaMillions
  console.log('Recent MegaMillions rounds:');
  const interval = Number(megaInterval);
  for (let i = interval; i <= Number(currentRoundId); i += interval) {
    console.log('  Round', i, '(MegaMillions)');
  }
  console.log('');
  
  // Check if megaBank was cleared in round 60
  if (currentRoundId >= 60n) {
    const round60 = await lottery.rounds(60);
    console.log('Round 60 (MegaMillions):');
    console.log('  State:', round60.state === 0n ? 'OPEN' : 'FINALIZED');
    console.log('  Is MegaMillions Round:', round60.isMegaMillionsRound);
  }
  
  console.log('');
  console.log('If megaMorbiusBank is 0, it means:');
  console.log('  - It was cleared in round', Math.floor(Number(currentRoundId) / interval) * interval);
  console.log('  - OR line 329 (megaMorbiusBank += megaContribution) never executed for tickets after that round');
}

main().catch(console.error);
