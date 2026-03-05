const { ethers } = require('hardhat');

async function main() {
  const LOTTERY_INSTANT_ADDRESS = '0xD66b4489fbfF99A8d62f969203899840F2ec69c5';

  console.log('\n🎲 Finalizing Round 1 and starting Round 2...\n');

  const lotteryJSON = require('../../abi/lottery6of55-v2.json');
  const lotteryABI = lotteryJSON.abi || lotteryJSON;
  const lottery = await ethers.getContractAt(lotteryABI, LOTTERY_INSTANT_ADDRESS);

  const [signer] = await ethers.getSigners();
  console.log('Signer:', signer.address);

  // Check current state
  const before = await lottery.getCurrentRoundInfo();
  console.log('Before:');
  console.log('  Round ID:', before[0].toString());
  console.log('  State:', before[7] === 0 ? 'OPEN' : 'FINALIZED');
  console.log('  Time Remaining:', before[6].toString(), 'seconds');

  // Call finalizeRound
  console.log('\n📋 Calling finalizeRound()...');
  const tx = await lottery.finalizeRound({
    gasLimit: 5_000_000,
  });
  console.log('Transaction hash:', tx.hash);

  console.log('⏳ Waiting for confirmation...');
  const receipt = await tx.wait();
  console.log('✅ Confirmed in block:', receipt.blockNumber);

  // Check new state
  const after = await lottery.getCurrentRoundInfo();
  console.log('\n After:');
  console.log('  Round ID:', after[0].toString());
  console.log('  State:', after[7] === 0 ? 'OPEN' : 'FINALIZED');
  console.log('  Time Remaining:', after[6].toString(), 'seconds');
  console.log('  End Time:', new Date(Number(after[2]) * 1000).toLocaleString());

  console.log('\n🎉 Success! Round 2 is now active and frontend should work correctly.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
