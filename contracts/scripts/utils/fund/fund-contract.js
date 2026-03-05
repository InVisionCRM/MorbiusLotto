const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = 'https://rpc.pulsechain.com';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PLINKO_ADDRESS = '0x37B1db8F06870BFFeFed862C06535BEFc4383ff8';
const MORBIUS_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const MORBIUSToken = new ethers.Contract(MORBIUS_ADDRESS, ERC20_ABI, wallet);
  
  // Need to send at least 1467 MORBIUS, let's send 2000 to be safe
  const amount = ethers.parseUnits('2000', 18);
  
  console.log('Sender:', wallet.address);
  const senderBalance = await MORBIUSToken.balanceOf(wallet.address);
  console.log('Sender Balance:', ethers.formatUnits(senderBalance, 18), 'MORBIUS');
  console.log('Amount to send:', ethers.formatUnits(amount, 18), 'MORBIUS');
  console.log('\nSending MORBIUS to lottery contract...');
  
  const tx = await MORBIUSToken.transfer(LOTTERY_INSTANT_ADDRESS, amount);
  console.log('TX Hash:', tx.hash);
  console.log('Waiting for confirmation...');
  
  const receipt = await tx.wait();
  console.log('✅ Confirmed in block:', receipt.blockNumber);
  
  const newBalance = await MORBIUSToken.balanceOf(LOTTERY_INSTANT_ADDRESS);
  console.log('New lottery balance:', ethers.formatUnits(newBalance, 18), 'MORBIUS');
}

main().catch(console.error);
