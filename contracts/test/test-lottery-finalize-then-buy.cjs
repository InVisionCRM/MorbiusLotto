const { ethers } = require('hardhat');

async function main() {
  const LOTTERY_INSTANT_ADDRESS = '0xD66b4489fbfF99A8d62f969203899840F2ec69c5';
  const WPLS_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
  const MORBIUS_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';

  const lotteryABI = require('../../abi/lottery6of55-v2.json');
  const lottery = await ethers.getContractAt(lotteryABI, LOTTERY_INSTANT_ADDRESS);

  console.log('\n📊 Testing finalize + buy sequence...\n');

  // Check current round
  let currentRound = await lottery.getCurrentRoundInfo();
  console.log('Current Round:', currentRound.roundId.toString());
  console.log('Round state BEFORE:', currentRound.state === 0 ? 'OPEN' : 'FINALIZED');

  if (currentRound.state === 1) {
    console.log('\n🔄 Round is finalized, simulating finalizeRound() call...');

    try {
      await lottery.finalizeRound.staticCall();
      console.log('✅ finalizeRound() would succeed');

      // Check what state would be after
      console.log('\n🧪 Testing if buy would work AFTER finalize...');

      // Note: We can't actually test this without executing the finalize
      // because staticCall doesn't change state for subsequent calls
      console.log('⚠️ Cannot test post-finalize state with staticCall');
      console.log('   Would need to execute finalize in a local fork to test');

    } catch (error) {
      console.log('❌ finalizeRound() would fail:', error.message.split('\n')[0]);
    }
  } else {
    console.log('✅ Round is already OPEN');
  }

  // Test parameters
  const ticket1 = [1, 2, 3, 4, 5, 6];
  const ticket2 = [7, 8, 9, 10, 11, 12];
  const ticketGroups = [[ticket1, ticket2]];
  const offsets = [0];

  const totalMORBIUSRequired = ethers.parseEther('200'); // 2 tickets × 100 MORBIUS

  // Get PLS quote
  const routerABI = [
    {
      name: 'getAmountsIn',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: 'amountOut', type: 'uint256' },
        { name: 'path', type: 'address[]' },
      ],
      outputs: [{ name: 'amounts', type: 'uint256[]' }],
    },
  ];
  const PULSEX_ROUTER = '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02';
  const router = await ethers.getContractAt(routerABI, PULSEX_ROUTER);

  const path = [WPLS_ADDRESS, MORBIUS_ADDRESS];
  const amountsIn = await router.getAmountsIn(totalMORBIUSRequired, path);
  const basePlsCost = amountsIn[0];
  const taxedAmount = (basePlsCost * 15000n) / 10000n;
  const totalPlsRequired = (taxedAmount * 12000n) / 10000n;

  console.log('\n💰 Attempting buy with current state...');
  console.log('PLS required:', ethers.formatEther(totalPlsRequired));

  try {
    await lottery.buyTicketsWithPLSForRounds.staticCall(
      ticketGroups,
      offsets,
      { value: totalPlsRequired }
    );
    console.log('✅ Buy would succeed');
  } catch (error) {
    console.log('❌ Buy would fail:', error.message.split('\n')[0]);

    // Check if it's the round state issue
    if (error.message.includes('Round not open') || error.message.includes('execution reverted')) {
      console.log('\n💡 DIAGNOSIS: Round needs to be finalized first!');
      console.log('   The buyTicketsWithPLSForRounds function is missing the auto-finalize check.');
      console.log('   Other functions have:');
      console.log('     if (_isRoundExpired()) {');
      console.log('         _finalizeRound();');
      console.log('         _startNewRound();');
      console.log('     }');
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
