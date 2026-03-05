const { ethers } = require('ethers');

async function main() {
  const RPC_URL = 'https://rpc.pulsechain.com';
  const TX_HASH = '0x60ed370f29d300a37d903e124f75dc9747fe82275a2f745d47502c79d36de0fc';

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  console.log('Analyzing Transaction\n');
  console.log('TX Hash:', TX_HASH);

  const receipt = await provider.getTransactionReceipt(TX_HASH);

  if (!receipt) {
    console.log('Transaction not found');
    return;
  }

  console.log('Block:', receipt.blockNumber);
  console.log('Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
  console.log('\nLogs Count:', receipt.logs.length);

  const BALL_DROPPED_TOPIC = ethers.id('BallDropped(address,uint8,uint256,uint256,uint8)');

  const ballDroppedLogs = receipt.logs.filter(log =>
    log.topics[0] === BALL_DROPPED_TOPIC
  );

  console.log('\nBallDropped Events Found:', ballDroppedLogs.length);

  if (ballDroppedLogs.length > 0) {
    console.log('\nRESULTS:\n');

    const iface = new ethers.Interface([
      'event BallDropped(address indexed player, uint8 bucket, uint256 multiplier, uint256 payout, uint8 riskLevel)'
    ]);

    ballDroppedLogs.forEach((log, idx) => {
      try {
        const decoded = iface.parseLog({
          topics: log.topics,
          data: log.data
        });

        console.log('Ball', idx + 1);
        console.log('  Bucket:', decoded.args.bucket.toString());
        console.log('  Multiplier:', Number(decoded.args.multiplier) / 100, 'x');
        console.log('  Payout:', ethers.formatEther(decoded.args.payout), 'MORBIUS');
        console.log('  Risk:', ['LOW', 'MEDIUM', 'HIGH'][Number(decoded.args.riskLevel)]);
        console.log('');
      } catch (e) {
        console.log('  Could not decode:', e.message);
      }
    });

    const buckets = ballDroppedLogs.map(log => {
      const decoded = iface.parseLog({ topics: log.topics, data: log.data });
      return Number(decoded.args.bucket);
    });

    const uniqueBuckets = [...new Set(buckets)];
    console.log('\nAnalysis:');
    console.log('  Total Balls:', buckets.length);
    console.log('  Unique Buckets:', uniqueBuckets.length);
    console.log('  Buckets Hit:', uniqueBuckets.join(', '));
    
    if (uniqueBuckets.length === 1) {
      console.log('  WARNING: ALL BALLS LANDED IN SAME BUCKET', uniqueBuckets[0]);
      console.log('  This indicates an RNG problem in the contract!');
    }
  }
}

main().catch(console.error);
