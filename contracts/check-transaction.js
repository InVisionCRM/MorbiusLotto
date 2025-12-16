const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');

const RPC_URL = 'https://rpc.pulsechain.com';
const TX_HASH = '0x03fb6077a3a7ca6218c4f13bc565c8bcf6fb07a318eab5c6f829159370a8d205';
const LOTTERY_ADDRESS = '0x6A63CF27ecE3ce050932780f6357Bfa856060B7e';

const artifact = JSON.parse(fs.readFileSync('../abi/lottery6of55-v2.json', 'utf8'));
const ABI = Array.isArray(artifact) ? artifact : artifact.abi;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const lottery = new ethers.Contract(LOTTERY_ADDRESS, ABI, provider);

  console.log('=== TRANSACTION ANALYSIS ===\n');
  console.log('TX Hash:', TX_HASH);
  console.log('');

  const tx = await provider.getTransaction(TX_HASH);
  const receipt = await provider.getTransactionReceipt(TX_HASH);

  console.log('Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
  console.log('Block:', receipt.blockNumber);
  console.log('From:', tx.from);
  console.log('To:', tx.to);
  console.log('Value:', ethers.formatEther(tx.value), 'PLS');
  console.log('');

  // Decode the function call
  const iface = new ethers.Interface(ABI);
  try {
    const decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
    console.log('Function Called:', decoded.name);
    console.log('Arguments:');
    console.log('  ', JSON.stringify(decoded.args, null, 2));
    console.log('');
  } catch (e) {
    console.log('Could not decode function call');
    console.log('Data:', tx.data.substring(0, 100) + '...');
    console.log('');
  }

  // Check events
  console.log('Events emitted:');
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === LOTTERY_ADDRESS.toLowerCase()) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        console.log('  -', parsed.name);
        console.log('    ', JSON.stringify(parsed.args, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        , 2));
      } catch (e) {
        // Not from lottery contract or unrecognized event
      }
    }
  }
}

main().catch(console.error);
