import { createPublicClient, http, parseAbiItem } from 'viem';
import { pulsechain } from 'viem/chains';

const ESCROW = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';
const winner = process.argv[2];

const client = createPublicClient({ chain: pulsechain, transport: http('https://rpc.pulsechain.com') });

const latest = await client.getBlockNumber();
console.log('Latest block:', latest.toString());

// Look at last ~50k blocks (~5 days). Payout(bytes32 indexed tournamentId, address indexed winner, uint256 amount)
const fromBlock = latest - 50000n;
const logs = await client.getLogs({
  address: ESCROW,
  event: parseAbiItem('event Payout(bytes32 indexed tournamentId, address indexed winner, uint256 amount)'),
  args: { winner },
  fromBlock,
  toBlock: latest,
});
console.log(`\nPayout events to ${winner} since block ${fromBlock}:`);
console.log(`Found: ${logs.length}`);
for (const log of logs) {
  console.log(`  block ${log.blockNumber} | tournament ${log.args.tournamentId} | amount ${log.args.amount?.toString()} (${Number(log.args.amount ?? 0n) / 1e18})`);
  console.log(`    tx: ${log.transactionHash}`);
}

// Also look for ALL Payout events from the escrow recently — is the server paying out at all?
const allPayouts = await client.getLogs({
  address: ESCROW,
  event: parseAbiItem('event Payout(bytes32 indexed tournamentId, address indexed winner, uint256 amount)'),
  fromBlock,
  toBlock: latest,
});
console.log(`\nALL Payout events from this escrow in last 50k blocks: ${allPayouts.length}`);
for (const log of allPayouts.slice(-5)) {
  console.log(`  block ${log.blockNumber} | winner ${log.args.winner} | amount ${log.args.amount?.toString()}`);
}
