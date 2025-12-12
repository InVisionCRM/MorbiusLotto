const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = 'https://rpc.pulsechain.com';
const USER_ADDRESS = process.env.USER_ADDRESS || '0x2775dD8242C4f589536113475B7C80F42ab4A70A'; // Your keeper address
const MORBIUS_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const morbiusToken = new ethers.Contract(MORBIUS_ADDRESS, ERC20_ABI, provider);
  
  const balance = await morbiusToken.balanceOf(USER_ADDRESS);
  const decimals = await morbiusToken.decimals();
  const symbol = await morbiusToken.symbol();
  
  console.log('=== USER BALANCE CHECK ===');
  console.log('User Address:', USER_ADDRESS);
  console.log('Token Address:', MORBIUS_ADDRESS);
  console.log('Token Symbol:', symbol);
  console.log('Decimals:', decimals);
  console.log('Raw Balance:', balance.toString());
  console.log('Formatted Balance:', ethers.formatUnits(balance, decimals), symbol);
}

main().catch(console.error);
