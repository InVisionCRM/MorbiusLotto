const { ethers } = require('hardhat');

async function main() {
  const LOTTERY_INSTANT_ADDRESS = '0xD66b4489fbfF99A8d62f969203899840F2ec69c5';

  console.log('\n🔍 Checking new lottery contract state...\n');

  const lotteryJSON = require('./abi/lottery6of55-v2.json');
  const lotteryABI = lotteryJSON.abi || lotteryJSON;
  const lottery = await ethers.getContractAt(lotteryABI, LOTTERY_INSTANT_ADDRESS);

  try {
    // Test getCurrentRoundInfo
    const roundInfo = await lottery.getCurrentRoundInfo();
    console.log('✅ getCurrentRoundInfo() works');
    console.log('Round ID:', roundInfo[0].toString());
    console.log('Start Time:', roundInfo[1].toString());
    console.log('End Time:', roundInfo[2].toString());
    console.log('Time Remaining:', roundInfo[6].toString(), 'seconds');
    console.log('State:', roundInfo[7] === 0 ? 'OPEN' : 'FINALIZED');

    // Check if round is expired
    const now = Math.floor(Date.now() / 1000);
    const endTime = Number(roundInfo[2]);
    console.log('\nCurrent time:', now);
    console.log('End time:', endTime);
    console.log('Is expired?:', now > endTime);

  } catch (error) {
    console.error('❌ getCurrentRoundInfo() failed:', error.message);
  }

  try {
    // Test other view functions
    const roundId = await lottery.currentRoundId();
    console.log('\n✅ currentRoundId():', roundId.toString());
  } catch (error) {
    console.error('❌ currentRoundId() failed:', error.message);
  }

  try {
    const megaBank = await lottery.getMegaMORBIUSBank();
    console.log('✅ getMegaMORBIUSBank():', ethers.formatEther(megaBank), 'MORBIUS');
  } catch (error) {
    console.error('❌ getMegaMORBIUSBank() failed:', error.message);
  }

  try {
    const state = await lottery.currentRoundState();
    console.log('✅ currentRoundState():', state === 0 ? 'OPEN' : 'FINALIZED');
  } catch (error) {
    console.error('❌ currentRoundState() failed:', error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
