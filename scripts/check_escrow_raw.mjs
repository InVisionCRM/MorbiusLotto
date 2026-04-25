import { createPublicClient, http, keccak256, stringToHex, encodeFunctionData } from 'viem';
import { pulsechain } from 'viem/chains';

const ESCROW = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';
const uuid = process.argv[2];
const bytes32 = keccak256(stringToHex(uuid));

const client = createPublicClient({ chain: pulsechain, transport: http('https://rpc.pulsechain.com') });
const data = encodeFunctionData({
  abi: [{ name: 'getPool', inputs: [{ type: 'bytes32' }], outputs: [], stateMutability: 'view', type: 'function' }],
  functionName: 'getPool',
  args: [bytes32],
});
const raw = await client.call({ to: ESCROW, data });
console.log('UUID:    ', uuid);
console.log('bytes32: ', bytes32);
console.log('raw return data (', (raw.data.length - 2) / 2, 'bytes):');
const hex = raw.data.slice(2);
const numFields = hex.length / 64;
console.log('# of 32-byte words:', numFields);
for (let i = 0; i < numFields; i++) {
  console.log(`  [${i}]`, '0x' + hex.slice(i * 64, (i + 1) * 64));
}
