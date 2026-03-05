const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
  console.log('🔐 Approving MORBIUS for PLINKO Contract\n');

  const RPC_URL = 'https://rpc.pulsechain.com';
  const PLINKO_ADDRESS = '0x37B1db8F06870BFFeFed862C06535BEFc4383ff8';
  const MORBIUS_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not found in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('Wallet:', wallet.address);

  const ERC20_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)'
  ];

  const morbius = new ethers.Contract(MORBIUS_ADDRESS, ERC20_ABI, wallet);

  // Check current allowance
  const currentAllowance = await morbius.allowance(wallet.address, PLINKO_ADDRESS);
  console.log('Current Allowance:', ethers.formatEther(currentAllowance), 'MORBIUS\n');

  if (currentAllowance > 0) {
    console.log('✅ Already approved!');
    console.log('You can now buy balls with MORBIUS in the UI');
    return;
  }

  // Approve infinite amount (standard practice)
  const MAX_UINT256 = ethers.MaxUint256;
  console.log('Approving infinite MORBIUS...');

  const tx = await morbius.approve(PLINKO_ADDRESS, MAX_UINT256);
  console.log('TX:', tx.hash);
  console.log('Waiting for confirmation...');

  await tx.wait();

  console.log('\n✅ APPROVED!');
  console.log('You can now buy balls with MORBIUS in the UI');
}

main().catch(console.error);
