const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = 'https://rpc.pulsechain.com';
const LOTTERY_ADDRESS = '0xbC21f1228f3D2cb3867Ea504D4007C3ce2dc5CE2';
const MORBIUS_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const morbiusToken = new ethers.Contract(MORBIUS_ADDRESS, ERC20_ABI, provider);
  
  const balance = await morbiusToken.balanceOf(LOTTERY_ADDRESS);
  const decimals = await morbiusToken.decimals();
  
  console.log('Lottery Contract:', LOTTERY_ADDRESS);
  console.log('MORBIUS Balance:', ethers.formatUnits(balance, decimals), 'MORBIUS');
  console.log('Raw Balance:', balance.toString());
  
  // Check if it has enough for 1 ticket (1000 MORBIUS)
  const oneTicket = ethers.parseUnits('1000', decimals);
  console.log('\nNeeds for 1 ticket (1000 MORBIUS):', ethers.formatUnits(oneTicket, decimals));
  console.log('Has enough?', balance >= oneTicket);
}

main().catch(console.error);
