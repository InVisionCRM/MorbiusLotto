import { ethers } from './node_modules/ethers/lib.commonjs/index.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = 'https://rpc.pulsechain.com';
const LOTTERY_INSTANT_ADDRESS = '0xD66b4489fbfF99A8d62f969203899840F2ec69c5';

async function main() {
  console.log('🔍 Checking Round State...\n');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const abiPath = './abi/lottery6of55-v2.json';
  const artifact = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
  const ABI = Array.isArray(artifact) ? artifact : artifact.abi;

  const lottery = new ethers.Contract(LOTTERY_INSTANT_ADDRESS, ABI, provider);

  const info = await lottery.getCurrentRoundInfo();
  const roundId = info[0];
  const startTime = Number(info[1]);
  const endTime = Number(info[2]);
  const totalTickets = Number(info[4]);
  const timeRemaining = Number(info[6]);
  const state = info[7];

  console.log('Current Round:', roundId.toString());
  console.log('State:', state === 0n ? 'OPEN' : 'FINALIZED');
  console.log('Start Time:', new Date(startTime * 1000).toLocaleString());
  console.log('End Time:', new Date(endTime * 1000).toLocaleString());
  console.log('Time Remaining:', timeRemaining, 'seconds');
  console.log('Total Tickets:', totalTickets);

  const now = Math.floor(Date.now() / 1000);
  const isExpired = now > endTime;

  console.log('\nCurrent Time:', new Date(now * 1000).toLocaleString());
  console.log('Is Expired:', isExpired);

  if (isExpired && state === 0n) {
    console.log('\n⚠️  Round is EXPIRED but still OPEN - needs to be finalized!');
    console.log('Attempting to finalize round...');

    try {
      const lotteryWithSigner = lottery.connect(wallet);
      const tx = await lotteryWithSigner.finalizeRound({
        gasLimit: 5000000
      });
      console.log('Transaction:', tx.hash);
      const receipt = await tx.wait();
      console.log('✅ Round finalized in block:', receipt.blockNumber);

      // Check new state
      const newInfo = await lottery.getCurrentRoundInfo();
      console.log('\nNew Round:', newInfo[0].toString());
      console.log('New State:', newInfo[7] === 0n ? 'OPEN' : 'FINALIZED');
    } catch (err) {
      console.error('❌ Failed to finalize:', err.message);
    }
  } else {
    console.log('\n✅ Round is in correct state');
  }
}

main().catch(console.error);
