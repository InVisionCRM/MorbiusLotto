import { createPublicClient, http, keccak256, stringToHex, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';

const ESCROW = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';
const PAYOUT_ABI = [{ name: 'payout', inputs: [{type: 'bytes32'}, {type: 'address'}, {type: 'uint256'}], outputs: [], stateMutability: 'nonpayable', type: 'function' }];

const KEY = process.argv[2];
const acct = privateKeyToAccount(KEY);
console.log('Caller:', acct.address);

const tournamentId = '9ac323c7-baeb-4a33-bd6f-d3c1d3abfd1d';
const bytes32 = keccak256(stringToHex(tournamentId));
console.log('bytes32:', bytes32);

const winner = '0xedee8515897281ccf27999a121a90d76e3cde016';
const amount = 475000000000000000000n;

const client = createPublicClient({ chain: pulsechain, transport: http('https://rpc.pulsechain.com') });

// Simulate the call (eth_call) to see if it would revert and why
try {
  const data = encodeFunctionData({ abi: PAYOUT_ABI, functionName: 'payout', args: [bytes32, winner, amount] });
  const result = await client.call({ from: acct.address, to: ESCROW, data });
  console.log('SIMULATION SUCCESS — call would succeed. Returned:', result);
} catch (e) {
  console.log('SIMULATION FAILED:');
  console.log('  shortMessage:', e.shortMessage ?? e.message);
  console.log('  cause:       ', e.cause?.shortMessage ?? e.cause?.message ?? '(none)');
  if (e.cause?.data) console.log('  revert data: ', e.cause.data);
  if (e.cause?.reason) console.log('  reason:      ', e.cause.reason);
}
