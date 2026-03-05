const { ethers } = require('hardhat');

async function main() {
  const LOTTERY_INSTANT_ADDRESS = '0xD66b4489fbfF99A8d62f969203899840F2ec69c5';

  const lotteryJSON = require('./abi/lottery6of55-v2.json');
  const lotteryABI = lotteryJSON.abi || lotteryJSON;
  const lottery = await ethers.getContractAt(lotteryABI, LOTTERY_INSTANT_ADDRESS);

  console.log('\n🔍 Debugging Contract State Variables:\n');

  // Read individual state variables
  const currentRoundId = await lottery.currentRoundId();
  const currentRoundState = await lottery.currentRoundState();
  const currentRoundStartTime = await lottery.currentRoundStartTime();
  const currentRoundTotalMORBIUS = await lottery.currentRoundTotalMORBIUS();
  const currentRoundTotalTickets = await lottery.currentRoundTotalTickets();
  const roundDuration = await lottery.roundDuration();

  console.log('currentRoundId:', currentRoundId.toString());
  console.log('currentRoundState:', currentRoundState, '(0=OPEN, 1=FINALIZED)');
  console.log('currentRoundStartTime:', currentRoundStartTime.toString(), new Date(Number(currentRoundStartTime) * 1000).toLocaleString());
  console.log('currentRoundTotalMORBIUS:', ethers.formatEther(currentRoundTotalMORBIUS), 'MORBIUS');
  console.log('currentRoundTotalTickets:', currentRoundTotalTickets.toString());
  console.log('roundDuration:', roundDuration.toString(), 'seconds');

  const endTime = Number(currentRoundStartTime) + Number(roundDuration);
  const now = Math.floor(Date.now() / 1000);
  console.log('\nCalculated end time:', endTime, new Date(endTime * 1000).toLocaleString());
  console.log('Current time:', now, new Date(now * 1000).toLocaleString());
  console.log('Time until end:', endTime - now, 'seconds');
  console.log('Is expired?:', now >= endTime);

  // Check round 2 stored data
  console.log('\n📋 Round 2 stored data:');
  try {
    const round2 = await lottery.getRound(2);
    console.log('Round 2 state:', round2.state, '(0=OPEN, 1=FINALIZED)');
    console.log('Round 2 roundId:', round2.roundId.toString());
    console.log('Round 2 totalTickets:', round2.totalTickets.toString());
  } catch (error) {
    console.log('Round 2 not found or error:', error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
