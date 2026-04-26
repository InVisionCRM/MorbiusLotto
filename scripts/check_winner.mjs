import { createPublicClient, http } from 'viem';
import { pulsechain } from 'viem/chains';

const TOKEN = '0xfc3307067E629Dd194180bA7fC66e4e3e87eDe38'; // FLOWT
const ESCROW = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';
const winner = process.argv[2];

const ERC20 = [
  { name: 'balanceOf', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
];

const client = createPublicClient({ chain: pulsechain, transport: http('https://rpc.pulsechain.com') });
const sym = await client.readContract({ address: TOKEN, abi: ERC20, functionName: 'symbol' });
const winnerBal = await client.readContract({ address: TOKEN, abi: ERC20, functionName: 'balanceOf', args: [winner] });
const escrowBal = await client.readContract({ address: TOKEN, abi: ERC20, functionName: 'balanceOf', args: [ESCROW] });
console.log(`Token: ${sym} (${TOKEN})`);
console.log(`Winner ${winner}:`);
console.log(`  Balance: ${winnerBal.toString()} (${Number(winnerBal) / 1e18})`);
console.log(`Escrow ${ESCROW}:`);
console.log(`  Balance: ${escrowBal.toString()} (${Number(escrowBal) / 1e18})`);
