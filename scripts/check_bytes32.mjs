import { createPublicClient, http, encodeFunctionData } from 'viem';
import { pulsechain } from 'viem/chains';
const ESCROW = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';
const bytes32 = process.argv[2];
const client = createPublicClient({ chain: pulsechain, transport: http('https://rpc.pulsechain.com') });
const data = encodeFunctionData({
  abi: [{ name: 'getPool', inputs: [{ type: 'bytes32' }], outputs: [], stateMutability: 'view', type: 'function' }],
  functionName: 'getPool', args: [bytes32],
});
const raw = await client.call({ to: ESCROW, data });
const hex = raw.data.slice(2);
const numFields = hex.length / 64;
console.log('# of 32-byte words:', numFields);
const fields = ['token', 'depositor', 'totalDeposited', 'amountPaidOut', 'depositedAt', 'cancelled', 'active'];
for (let i = 0; i < numFields; i++) {
  const word = hex.slice(i * 64, (i + 1) * 64);
  const asBig = BigInt('0x' + word);
  console.log(`  [${i}] ${fields[i] ?? '?'}: 0x${word}  (${asBig.toString()})`);
}
