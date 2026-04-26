import { createPublicClient, http } from 'viem';
import { pulsechain } from 'viem/chains';
const client = createPublicClient({ chain: pulsechain, transport: http('https://rpc.pulsechain.com') });
const hash = process.argv[2];
const r = await client.getTransactionReceipt({ hash });
console.log('status:', r.status);
console.log('block:', r.blockNumber.toString());
console.log('logs:', r.logs.length);
for (const l of r.logs.slice(0, 5)) console.log(' ', l.address, l.topics?.[0]);
