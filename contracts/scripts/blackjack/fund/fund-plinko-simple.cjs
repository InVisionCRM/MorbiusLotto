const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
  console.log('🎰 Funding PLINKO Contract with MORBIUS');
  console.log('========================================\n');

  // Config
  const RPC_URL = 'https://rpc.pulsechain.com';
  const PLINKO_ADDRESS = '0x37B1db8F06870BFFeFed862C06535BEFc4383ff8';
  const MORBIUS_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
  const FUNDING_AMOUNT = ethers.parseEther('10000'); // 10,000 MORBIUS
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not found in .env');
    process.exit(1);
  }

  // Connect to PulseChain
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('Wallet:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('PLS Balance:', ethers.formatEther(balance), 'PLS\n');

  // MORBIUS Token ABI (minimal)
  const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transfer(address to, uint256 amount) returns (bool)'
  ];

  // PLINKO Contract ABI (minimal)
  const PLINKO_ABI = [
    'function fundContract(uint256 amount) external',
    'function getContractReserve() view returns (uint256)',
    'function owner() view returns (address)',
    'function paused() view returns (bool)'
  ];

  // Connect to contracts
  const morbius = new ethers.Contract(MORBIUS_ADDRESS, ERC20_ABI, wallet);
  const plinko = new ethers.Contract(PLINKO_ADDRESS, PLINKO_ABI, wallet);

  // Check MORBIUS balance
  const morbiusBalance = await morbius.balanceOf(wallet.address);
  console.log('Your MORBIUS:', ethers.formatEther(morbiusBalance));

  if (morbiusBalance < FUNDING_AMOUNT) {
    console.error('❌ Insufficient MORBIUS!');
    console.error('Required:', ethers.formatEther(FUNDING_AMOUNT));
    console.error('Available:', ethers.formatEther(morbiusBalance));
    process.exit(1);
  }

  // Check contract state
  console.log('\n📊 Contract State:');
  const owner = await plinko.owner();
  console.log('Owner:', owner);
  const isPaused = await plinko.paused();
  console.log('Paused:', isPaused);
  const currentReserve = await plinko.getContractReserve();
  console.log('Current Reserve:', ethers.formatEther(currentReserve), 'MORBIUS\n');

  // Approve MORBIUS
  console.log('📝 Approving MORBIUS...');
  const approveTx = await morbius.approve(PLINKO_ADDRESS, FUNDING_AMOUNT);
  console.log('Approval TX:', approveTx.hash);
  await approveTx.wait();
  console.log('✅ Approved!\n');

  // Fund contract
  console.log('💰 Funding contract...');
  const fundTx = await plinko.fundContract(FUNDING_AMOUNT);
  console.log('Fund TX:', fundTx.hash);
  const receipt = await fundTx.wait();
  console.log('✅ Funded!\n');

  // Check new balance
  const newReserve = await plinko.getContractReserve();
  console.log('🎉 SUCCESS!');
  console.log('New Reserve:', ethers.formatEther(newReserve), 'MORBIUS');
  console.log('Block:', receipt.blockNumber);
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
