import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = 'https://rpc.pulsechain.com';
const LOTTERY_INSTANT_ADDRESS = '0xD66b4489fbfF99A8d62f969203899840F2ec69c5';

async function main() {
  console.log('🔍 Testing direct contract call to lottery...\n');

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // Load ABI
  const abiPath = './abi/lottery6of55-v2.json';
  const artifact = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
  const ABI = Array.isArray(artifact) ? artifact : artifact.abi;

  const lottery = new ethers.Contract(LOTTERY_INSTANT_ADDRESS, ABI, provider);

  try {
    console.log('Calling getCurrentRoundInfo()...');
    const info = await lottery.getCurrentRoundInfo();
    console.log('✅ SUCCESS!');
    console.log('Round ID:', info[0].toString());
    console.log('State:', info[7] === 0n ? 'OPEN' : 'FINALIZED');
    console.log('Total Tickets:', info[4].toString());
    console.log('Time Remaining:', info[6].toString(), 'seconds');
  } catch (err) {
    console.error('❌ FAILED:', err.message);
    console.error('Error code:', err.code);
  }

  try {
    console.log('\nCalling currentRoundId()...');
    const roundId = await lottery.currentRoundId();
    console.log('✅ SUCCESS! Round:', roundId.toString());
  } catch (err) {
    console.error('❌ FAILED:', err.message);
  }

  try {
    console.log('\nTesting ticketPriceMORBIUS()...');
    const price = await lottery.ticketPriceMORBIUS();
    console.log('✅ SUCCESS! Price:', ethers.formatUnits(price, 18), 'MORBIUS');
  } catch (err) {
    console.error('❌ FAILED:', err.message);
  }
}

main().catch(console.error);
