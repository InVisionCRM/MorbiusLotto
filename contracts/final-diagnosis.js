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

  console.log('=== FINAL DIAGNOSIS ===\n');

  const totalTickets = await lottery.totalTicketsEver();
  const currentRound = await lottery.currentRoundId();

  console.log('Total Tickets Ever Sold:', totalTickets.toString());
  console.log('Current Round:', currentRound.toString());
  console.log('Rounds since MegaMillions (Round 80):', Number(currentRound) - 80);
  console.log('');

  let ticketsAfterRound80 = 0;
  let morbiusAfterRound80 = 0n;

  for (let i = 81; i <= Number(currentRound); i++) {
    try {
      const round = await lottery.rounds(i);
      if (round.totalTickets > 0) {
        ticketsAfterRound80 += Number(round.totalTickets);
        morbiusAfterRound80 += round.totalMorbiusCollected;
        const tickets = round.totalTickets;
        const collected = round.totalMorbiusCollected;
        console.log('Round ' + i + ': ' + tickets.toString() + ' tickets, collected: ' + ethers.formatUnits(collected, 18));
      }
    } catch (e) {
      // Round might not exist yet
    }
  }

  console.log('');
  console.log('Total tickets in rounds 81-' + currentRound.toString() + ':', ticketsAfterRound80);
  console.log('Total MORBIUS collected after round 80:', ethers.formatUnits(morbiusAfterRound80, 18));
  console.log('');

  if (ticketsAfterRound80 === 0 && morbiusAfterRound80 === 0n) {
    console.log('NO TICKETS were sold after round 80');
    console.log('All 7,500 MORBIUS was collected BEFORE round 80');
    console.log('MegaMillions round 80 cleared the megaMorbiusBank');
    console.log('');
    console.log('This explains why megaMorbiusBank = 0');
  } else {
    console.log('Tickets WERE sold after round 80');
    console.log('Expected megaMorbiusBank accumulation: ' + ethers.formatUnits((morbiusAfterRound80 * 1000n) / 10000n, 18));
    console.log('Actual megaMorbiusBank: 0');
    console.log('');
    console.log('CRITICAL BUG: Distribution logic not executing');
  }

  const megaBank = await lottery.megaMorbiusBank();
  const pendingBurn = await lottery.pendingBurnMorbius();

  console.log('');
  console.log('=== FINAL ANSWER ===');
  console.log('MegaMorbius Bank:', ethers.formatUnits(megaBank, 18));
  console.log('Pending Burn:', ethers.formatUnits(pendingBurn, 18));
}

main().catch(console.error);
