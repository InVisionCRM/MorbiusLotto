const { ethers } = require('ethers');

async function main() {
  const RPC_URL = 'https://rpc.pulsechain.com';
  const PLINKO_ADDRESS = '0x37B1db8F06870BFFeFed862C06535BEFc4383ff8';
  const MORBIUS_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
  const USER_ADDRESS = '0x70444750eedF1B2c9b777cbF096a5919A14895e5'; // Replace with your wallet

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const MORBIUS_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)'
  ];

  const PLINKO_ABI = [
    'function getWagerLimits() view returns (uint256 min, uint256 max)',
    'function getContractReserve() view returns (uint256)',
    'function paused() view returns (bool)',
    'function deployerRecipient() view returns (address)',
    'function DEPLOYER_FEE_BPS() view returns (uint256)'
  ];

  const morbius = new ethers.Contract(MORBIUS_ADDRESS, MORBIUS_ABI, provider);
  const plinko = new ethers.Contract(PLINKO_ADDRESS, PLINKO_ABI, provider);

  console.log('=== PLINKO STATE ===\n');
  
  const wagerLimits = await plinko.getWagerLimits();
  console.log('Min Wager per Ball:', ethers.formatEther(wagerLimits.min), 'MORBIUS');
  console.log('Max Wager per Ball:', ethers.formatEther(wagerLimits.max), 'MORBIUS');
  
  const reserve = await plinko.getContractReserve();
  console.log('Contract Reserve:', ethers.formatEther(reserve), 'MORBIUS');
  
  const isPaused = await plinko.paused();
  console.log('Paused:', isPaused);
  
  const deployerRecipient = await plinko.deployerRecipient();
  console.log('Deployer Recipient:', deployerRecipient);
  
  const feeBps = await plinko.DEPLOYER_FEE_BPS();
  console.log('Deployer Fee:', (Number(feeBps) / 100).toFixed(2) + '%');
  
  console.log('\n=== USER STATE ===\n');
  
  const morbiusBalance = await morbius.balanceOf(USER_ADDRESS);
  console.log('MORBIUS Balance:', ethers.formatEther(morbiusBalance));
  
  const allowance = await morbius.allowance(USER_ADDRESS, PLINKO_ADDRESS);
  console.log('Allowance for PLINKO:', ethers.formatEther(allowance));
  
  console.log('\n=== TRANSACTION SIMULATION ===\n');
  console.log('For 1 ball purchase (using min wager):');
  const wagerAmount = wagerLimits.min; // Use minimum wager for simulation
  const cost = wagerAmount * 1n;
  const fee = (cost * feeBps) / 10000n;
  const toContract = cost - fee;
  console.log('  Wager Amount:', ethers.formatEther(wagerAmount), 'MORBIUS');
  console.log('  Total Cost:', ethers.formatEther(cost), 'MORBIUS');
  console.log('  Deployer Fee (5%):', ethers.formatEther(fee), 'MORBIUS');
  console.log('  To Contract:', ethers.formatEther(toContract), 'MORBIUS');
  console.log('  Approval Needed:', ethers.formatEther(cost), 'MORBIUS');
  console.log('  Current Allowance:', ethers.formatEther(allowance), 'MORBIUS');
  
  if (allowance >= cost) {
    console.log('  ✅ Sufficient allowance');
  } else {
    console.log('  ❌ INSUFFICIENT ALLOWANCE!');
  }
  
  if (morbiusBalance >= cost) {
    console.log('  ✅ Sufficient balance');
  } else {
    console.log('  ❌ INSUFFICIENT BALANCE!');
  }
}

main().catch(console.error);
