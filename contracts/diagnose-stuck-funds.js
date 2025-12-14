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
  const currentRoundId = await lottery.currentRoundId();

  console.log('=== STUCK FUNDS DIAGNOSIS ===\n');
  console.log('Total MORBIUS Balance:', ethers.formatUnits(totalBalance, 18));
  console.log('Current Round:', currentRoundId.toString());
  console.log('');

  // Read contract state
  const rollover = await lottery.rolloverReserve();
  const megaBank = await lottery.megaMorbiusBank();
  const currentPool = await lottery.currentRoundTotalMorbius();

  console.log('WHERE THE FUNDS SHOULD BE:');
  console.log('  Rollover Reserve:', ethers.formatUnits(rollover, 18));
  console.log('  MegaMorbius Bank:', ethers.formatUnits(megaBank, 18));
  console.log('  Current Round Pool:', ethers.formatUnits(currentPool, 18));
  console.log('  Total Accounted:', ethers.formatUnits(rollover + megaBank + currentPool, 18));
  console.log('');
  console.log('  Missing/Stuck:', ethers.formatUnits(totalBalance - rollover - megaBank - currentPool, 18), 'MORBIUS');
  console.log('');

  console.log('=== LIKELY CAUSES ===\n');
  console.log('1. Tokens stuck in past finalized rounds (unclaimed prizes)');
  console.log('2. Round was finalized but rollover wasnt properly transferred');
  console.log('3. Distribution error during last round finalization');
  console.log('4. Tokens never properly allocated to any pool');
  console.log('');
  console.log('=== RECOMMENDED ACTIONS ===\n');
  console.log('You need to either:');
  console.log('  A) Manually seed the current round pool (if owner has a function for this)');
  console.log('  B) Withdraw stuck funds and re-add them properly');
  console.log('  C) Check if there\'s a "rescueStuckFunds" or similar owner function');
  console.log('  D) Contact the contract owner/deployer to resolve this');
}

main().catch(console.error);
