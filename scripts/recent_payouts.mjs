import { createPublicClient, http, parseAbiItem } from 'viem';
import { pulsechain } from 'viem/chains';
const ESCROW = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';
const client = createPublicClient({ chain: pulsechain, transport: http('https://rpc.pulsechain.com') });
const latest = await client.getBlockNumber();
console.log('Latest block:', latest.toString());
const logs = await client.getLogs({
  address: ESCROW,
  event: parseAbiItem('event Payout(bytes32 indexed tournamentId, address indexed winner, uint256 amount)'),
  fromBlock: latest - 200n,
  toBlock: latest,
});
console.log('Recent Payout events (last 200 blocks):', logs.length);
for (const log of logs) {
  console.log(`  block ${log.blockNumber} | tx ${log.transactionHash}`);
  console.log(`    tournament: ${log.args.tournamentId}`);
  console.log(`    winner:     ${log.args.winner}`);
  console.log(`    amount:     ${log.args.amount?.toString()}`);
}
