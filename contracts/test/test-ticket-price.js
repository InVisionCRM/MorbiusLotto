import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = 'https://rpc.pulsechain.com';
const LOTTERY_INSTANT_ADDRESS = '0xD66b4489fbfF99A8d62f969203899840F2ec69c5';

async function main() {
  console.log('🔍 Testing ticketPriceMORBIUS() function...\n');

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const abiPath = './abi/lottery6of55-v2.json';
  const artifact = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
  const ABI = Array.isArray(artifact) ? artifact : artifact.abi;

  const lottery = new ethers.Contract(LOTTERY_INSTANT_ADDRESS, ABI, provider);

  // Find the function in ABI
  const ticketPriceFunc = ABI.find(f => f.name === 'ticketPriceMORBIUS');
  console.log('Function found in ABI:', !!ticketPriceFunc);
  if (ticketPriceFunc) {
    console.log('Function signature:', ticketPriceFunc.name, ticketPriceFunc.type);
    console.log('Inputs:', ticketPriceFunc.inputs);
    console.log('Outputs:', ticketPriceFunc.outputs);
  }

  console.log('\nAttempting to call ticketPriceMORBIUS()...');
  try {
    const price = await lottery.ticketPriceMORBIUS();
    console.log('✅ SUCCESS! Price:', ethers.formatUnits(price, 18), 'MORBIUS');
  } catch (err) {
    console.error('❌ FAILED!');
    console.error('Error:', err.message);
    console.error('Code:', err.code);
    console.error('Data:', err.data);
  }

  // Try with a static call
  console.log('\nTrying with staticCall...');
  try {
    const price = await lottery.ticketPriceMORBIUS.staticCall();
    console.log('✅ SUCCESS! Price:', ethers.formatUnits(price, 18), 'MORBIUS');
  } catch (err) {
    console.error('❌ FAILED:', err.message);
  }

  // Try calling with explicit parameters
  console.log('\nTrying raw call...');
  try {
    const funcSelector = ethers.id('ticketPriceMORBIUS()').slice(0, 10);
    console.log('Function selector:', funcSelector);
    const result = await provider.call({
      to: LOTTERY_INSTANT_ADDRESS,
      data: funcSelector
    });
    console.log('✅ SUCCESS! Raw result:', result);
    console.log('Decoded:', ethers.formatUnits(result, 18), 'MORBIUS');
  } catch (err) {
    console.error('❌ FAILED:', err.message);
  }
}

main().catch(console.error);
