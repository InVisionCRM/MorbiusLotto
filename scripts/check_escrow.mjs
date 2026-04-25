import { createPublicClient, http, keccak256, stringToHex } from 'viem';
import { pulsechain } from 'viem/chains';

const ESCROW = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';
const ABI = [{
  inputs: [{ name: 'tournamentId', type: 'bytes32' }],
  name: 'getPool',
  outputs: [
    { name: 'token', type: 'address' },
    { name: 'depositor', type: 'address' },
    { name: 'totalDeposited', type: 'uint256' },
    { name: 'amountPaidOut', type: 'uint256' },
    { name: 'depositedAt', type: 'uint256' },
    { name: 'cancelled', type: 'bool' },
    { name: 'active', type: 'bool' },
  ],
  stateMutability: 'view',
  type: 'function',
}];

const uuid = process.argv[2];
if (!uuid) { console.error('Usage: node check_escrow.mjs <uuid>'); process.exit(1); }

const bytes32 = keccak256(stringToHex(uuid));
console.log('UUID:    ', uuid);
console.log('bytes32: ', bytes32);

const client = createPublicClient({ chain: pulsechain, transport: http('https://rpc.pulsechain.com') });
const result = await client.readContract({ address: ESCROW, abi: ABI, functionName: 'getPool', args: [bytes32] });
console.log('On-chain pool:');
console.log('  token:           ', result[0]);
console.log('  depositor:       ', result[1]);
console.log('  totalDeposited:  ', result[2].toString());
console.log('  amountPaidOut:   ', result[3].toString());
console.log('  depositedAt:     ', result[4].toString(), '(', new Date(Number(result[4]) * 1000).toISOString(), ')');
console.log('  cancelled:       ', result[5]);
console.log('  active:          ', result[6]);
