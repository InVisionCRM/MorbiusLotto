const { ethers } = require('hardhat');

async function main() {
  const LOTTERY_INSTANT_ADDRESS = '0xD66b4489fbfF99A8d62f969203899840F2ec69c5';

  const lotteryJSON = require('../../abi/lottery6of55-v2.json');
  const lotteryABI = lotteryJSON.abi || lotteryJSON;
  const lottery = await ethers.getContractAt(lotteryABI, LOTTERY_INSTANT_ADDRESS);

  console.log('\n🧪 Testing getCurrentRoundInfo() return value:\n');

  const result = await lottery.getCurrentRoundInfo();

  console.log('Raw result:', result);
  console.log('\nTypeof result:', typeof result);
  console.log('Is array?:', Array.isArray(result));
  console.log('Result length:', result.length);

  console.log('\nIndexed access:');
  for (let i = 0; i < result.length; i++) {
    console.log(`  [${i}]:`, result[i], `(${typeof result[i]})`);
  }

  console.log('\nNamed access (if struct):');
  console.log('  roundId:', result.roundId);
  console.log('  state:', result.state);

  console.log('\nState value analysis:');
  console.log('  result[7]:', result[7]);
  console.log('  result[7] === 0:', result[7] === 0);
  console.log('  result[7] === 0n:', result[7] === 0n);
  console.log('  result[7] === 1:', result[7] === 1);
  console.log('  Number(result[7]):', Number(result[7]));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
