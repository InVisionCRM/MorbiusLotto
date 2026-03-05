const { createPublicClient, http } = require('viem');
const { pulsechain } = require('viem/chains');

const LOTTERY_INSTANT_ADDRESS = '0xD66b4489fbfF99A8d62f969203899840F2ec69c5';
const KENO_ADDRESS = '0x5E9d1e962b006B3BAbF31fCc61C05dD9aD6045b3';

const client = createPublicClient({
  chain: pulsechain,
  transport: http('https://rpc.pulsechain.com'),
});

async function testLotteryStatus() {
  console.log('\n=== TESTING LOTTERY STATUS DETECTION ===\n');

  // Test round 45 (should be finalized since we're at round 70-80)
  const roundId = 45;

  try {
    const lotteryABI = require('../../abi/lottery6of55-v2.json').abi;

    const roundData = await client.readContract({
      address: LOTTERY_INSTANT_ADDRESS,
      abi: lotteryABI,
      functionName: 'getRound',
      args: [BigInt(roundId)],
    });

    console.log(`Round ${roundId} data:`, {
      roundId: roundData.roundId?.toString(),
      startTime: roundData.startTime?.toString(),
      endTime: roundData.endTime?.toString(),
      state: roundData.state,
      stateType: typeof roundData.state,
      winningNumbers: roundData.winningNumbers,
      totalMORBIUS: roundData.totalMORBIUSCollected?.toString(),
      totalTickets: roundData.totalTickets?.toString(),
    });

    console.log('\n✅ getRound() is working!');
    console.log(`State value: ${roundData.state} (0 = OPEN, 1 = FINALIZED)`);

    // Check current round to compare
    const currentRoundId = await client.readContract({
      address: LOTTERY_INSTANT_ADDRESS,
      abi: lotteryABI,
      functionName: 'currentRoundId',
      args: [],
    });

    console.log(`\nCurrent round: ${currentRoundId}`);
    console.log(`Round ${roundId} state: ${roundData.state === 0 ? 'OPEN' : roundData.state === 1 ? 'FINALIZED' : 'UNKNOWN'}`);

  } catch (error) {
    console.error('❌ Error testing lottery:', error.message);
  }
}

async function testKenoStatus() {
  console.log('\n=== TESTING KENO STATUS DETECTION ===\n');

  // Test with a ticket ID (you'll need to provide a real one)
  const ticketId = 1; // Replace with actual ticket ID

  try {
    // Load Keno ABI from JSON (compiled artifact)
    const fs = require('fs');
    const kenoArtifacts = JSON.parse(fs.readFileSync('./artifacts/contracts/contracts/CryptoKeno.sol/CryptoKeno.json', 'utf8'));
    const kenoABI = kenoArtifacts.abi;

    // Check current round first
    const currentRoundId = await client.readContract({
      address: KENO_ADDRESS,
      abi: kenoABI,
      functionName: 'currentRoundId',
      args: [],
    });

    console.log(`Current Keno round: ${currentRoundId}`);

    const ticketData = await client.readContract({
      address: KENO_ADDRESS,
      abi: kenoABI,
      functionName: 'getTicket',
      args: [BigInt(ticketId)],
    });

    console.log(`\nTicket ${ticketId} data:`, {
      player: ticketData.player,
      firstRoundId: ticketData.firstRoundId?.toString(),
      draws: ticketData.draws,
      drawsRemaining: ticketData.drawsRemaining,
      spotSize: ticketData.spotSize,
      numbersBitmap: ticketData.numbersBitmap?.toString(),
    });

    console.log('\n✅ getTicket() is working!');
    console.log(`Draws remaining: ${ticketData.drawsRemaining} (0 = expired)`);

    const expectedEnd = Number(ticketData.firstRoundId) + Number(ticketData.draws) - 1;
    console.log(`Ticket covers rounds ${ticketData.firstRoundId} to ${expectedEnd}`);
    console.log(`Status: ${ticketData.drawsRemaining === 0 ? 'EXPIRED ✅' : `IN-PLAY (${ticketData.drawsRemaining} draws left)`}`);

  } catch (error) {
    console.error('❌ Error testing keno:', error.message);
  }
}

async function main() {
  await testLotteryStatus();
  await testKenoStatus();
}

main().catch(console.error);
