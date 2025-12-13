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
  
  const info = await lottery.getCurrentRoundInfo();
  console.log('Round ID:', info[0].toString());
  console.log('Total MORBIUS Collected:', ethers.formatUnits(info[3], 18));
  console.log('Total Tickets:', info[4].toString());
  console.log('State:', ['OPEN', 'FINALIZED'][Number(info[8])]);
  
  const rollover = await lottery.rolloverReserve();
  console.log('\nRollover Reserve:', ethers.formatUnits(rollover, 18), 'MORBIUS');
  
  const megaBank = await lottery.megaMorbiusBank();
  console.log('MegaMorbius Bank:', ethers.formatUnits(megaBank, 18), 'MORBIUS');
  
  const currentRoundTotal = await lottery.currentRoundTotalMorbius();
  console.log('Current Round Total MORBIUS:', ethers.formatUnits(currentRoundTotal, 18), 'MORBIUS');
}

main().catch(console.error);
