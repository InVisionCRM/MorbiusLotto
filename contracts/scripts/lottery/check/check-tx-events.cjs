const { ethers } = require('ethers');

async function main() {
  const RPC_URL = 'https://rpc.pulsechain.com';
  const TX_HASH = '0x2e161e3cc4ad335fa6dd03ed3b72ec5939f21a822cb5b4495635b81ad65ab8a2';

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  console.log('📋 Checking Transaction Events\n');
  console.log('TX Hash:', TX_HASH);

  const receipt = await provider.getTransactionReceipt(TX_HASH);

  if (!receipt) {
    console.log('❌ Transaction not found');
    return;
  }

  console.log('Block:', receipt.blockNumber);
  console.log('Status:', receipt.status === 1 ? '✅ SUCCESS' : '❌ FAILED');
  console.log('Gas Used:', receipt.gasUsed.toString());
  console.log('\nLogs Count:', receipt.logs.length);

  // BallDropped event signature
  const BALL_DROPPED_TOPIC = ethers.id('BallDropped(address,uint8,uint256,uint256,uint8)');
  console.log('\nLooking for BallDropped events...');
  console.log('Expected Topic:', BALL_DROPPED_TOPIC);

  const ballDroppedLogs = receipt.logs.filter(log =>
    log.topics[0] === BALL_DROPPED_TOPIC
  );

  console.log('\n🎰 BallDropped Events Found:', ballDroppedLogs.length);

  if (ballDroppedLogs.length === 0) {
    console.log('\n❌ NO BallDropped EVENTS FOUND!');
    console.log('This means either:');
    console.log('  1. Wrong event signature in contract');
    console.log('  2. Events not being emitted');
    console.log('  3. Wrong contract address');

    console.log('\nAll topics in this transaction:');
    receipt.logs.forEach((log, idx) => {
      console.log(`  Log ${idx}: ${log.topics[0]}`);
    });
  } else {
    console.log('\n✅ Events were emitted! Details:');

    ballDroppedLogs.forEach((log, idx) => {
      console.log(`\nBall ${idx + 1}:`);
      console.log('  Topics:', log.topics.length);
      console.log('  Data:', log.data);

      // Decode the event
      const iface = new ethers.Interface([
        'event BallDropped(address indexed player, uint8 bucket, uint256 multiplier, uint256 payout, uint8 riskLevel)'
      ]);

      try {
        const decoded = iface.parseLog({
          topics: log.topics,
          data: log.data
        });

        console.log('  Player:', decoded.args.player);
        console.log('  Bucket:', decoded.args.bucket.toString());
        console.log('  Multiplier:', decoded.args.multiplier.toString());
        console.log('  Payout:', ethers.formatEther(decoded.args.payout), 'MORBIUS');
        console.log('  Risk:', ['LOW', 'MEDIUM', 'HIGH'][Number(decoded.args.riskLevel)]);
      } catch (e) {
        console.log('  ❌ Could not decode:', e.message);
      }
    });
  }
}

main().catch(console.error);
