const { ethers } = require('ethers');

async function main() {
  const RPC_URL = 'https://rpc.pulsechain.com';
  const PLINKO_ADDRESS = '0x37B1db8F06870BFFeFed862C06535BEFc4383ff8';
  const ROUTER_ADDRESS = '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02'; // PulseX Router V2
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const ROUTER_ABI = [
    'function getAmountsIn(uint amountOut, address[] memory path) view returns (uint[] memory amounts)'
  ];

  const PLINKO_ABI = [
    'function getBallPrice() view returns (uint256)',
    'function WPLS_SWAP_BUFFER_PCT() view returns (uint256)',
    'function BPS_DENOMINATOR() view returns (uint256)',
    'function WPLS_TOKEN() view returns (address)',
    'function MORBIUS_TOKEN() view returns (address)'
  ];

  const plinko = new ethers.Contract(PLINKO_ADDRESS, PLINKO_ABI, provider);
  
  console.log('=== CHECKING PLS REQUIREMENT ===\n');
  
  const ballPrice = await plinko.getBallPrice();
  console.log('Ball Price:', ethers.formatEther(ballPrice), 'MORBIUS');
  
  const bufferPct = await plinko.WPLS_SWAP_BUFFER_PCT();
  const bpsDenom = await plinko.BPS_DENOMINATOR();
  console.log('Buffer Percent:', (Number(bufferPct) * 100 / Number(bpsDenom)).toFixed(2) + '%');
  
  const wpls = await plinko.WPLS_TOKEN();
  const morbius = await plinko.MORBIUS_TOKEN();
  console.log('WPLS:', wpls);
  console.log('MORBIUS:', morbius);
  
  // Calculate for 10 balls
  const ballCount = 10;
  const morbiusNeeded = ballPrice * BigInt(ballCount);
  console.log('\nFor', ballCount, 'balls:');
  console.log('MORBIUS Needed:', ethers.formatEther(morbiusNeeded));
  
  // Get amounts from router
  const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);
  try {
    const path = [wpls, morbius];
    const amounts = await router.getAmountsIn(morbiusNeeded, path);
    const wplsRequired = amounts[0];
    const wplsWithBuffer = (wplsRequired * bufferPct) / bpsDenom;
    
    console.log('WPLS Required (raw):', ethers.formatEther(wplsRequired));
    console.log('WPLS With Buffer:', ethers.formatEther(wplsWithBuffer));
    console.log('\n✅ YOU MUST SEND AT LEAST:', ethers.formatEther(wplsWithBuffer), 'PLS');
  } catch (error) {
    console.error('Error calling router:', error.message);
  }
}

main().catch(console.error);
