const { ethers } = require('ethers');

const RPC_URL = 'https://rpc.pulsechain.com';
const USER_ADDRESS = '0xA025371822fbd956576235b1a89B0ab4a7Fb4e99';

// Common Morbius token addresses on PulseChain
const POSSIBLE_TOKENS = [
  { name: 'Contract Address', address: '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1' },
  { name: 'PSSH (old)', address: '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1' },
];

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  console.log('🔍 Checking all possible token balances for:', USER_ADDRESS);
  console.log('═'.repeat(80));
  
  for (const token of POSSIBLE_TOKENS) {
    try {
      const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
      const [balance, decimals, symbol, name] = await Promise.all([
        contract.balanceOf(USER_ADDRESS),
        contract.decimals(),
        contract.symbol(),
        contract.name()
      ]);
      
      console.log(`\n${token.name}:`);
      console.log(`  Address: ${token.address}`);
      console.log(`  Name: ${name}`);
      console.log(`  Symbol: ${symbol}`);
      console.log(`  Decimals: ${decimals}`);
      console.log(`  Balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
      console.log(`  Raw: ${balance.toString()}`);
    } catch (err) {
      console.log(`\n${token.name}: ERROR - ${err.message}`);
    }
  }
  
  // Check PLS balance too
  console.log('\n' + '═'.repeat(80));
  const plsBalance = await provider.getBalance(USER_ADDRESS);
  console.log(`\nNative PLS Balance: ${ethers.formatEther(plsBalance)} PLS`);
}

main().catch(console.error);
