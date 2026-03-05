const { ethers } = require('hardhat');

async function main() {
  // Contract addresses
  const LOTTERY_INSTANT_ADDRESS = '0xD66b4489fbfF99A8d62f969203899840F2ec69c5';
  const PULSEX_ROUTER = '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02';
  const WPLS_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
  const MORBIUS_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';

  // Get the lottery contract
  const lotteryABI = require('../../abi/lottery6of55-v2.json');
  const lottery = await ethers.getContractAt(lotteryABI, LOTTERY_INSTANT_ADDRESS);

  // Get router for price quote
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
  const router = await ethers.getContractAt(routerABI, PULSEX_ROUTER);

  // Test parameters: 2 tickets, 5 rounds
  const ticket1 = [1, 2, 3, 4, 5, 6];
  const ticket2 = [7, 8, 9, 10, 11, 12];
  const ticketGroups = [
    [ticket1, ticket2],
    [ticket1, ticket2],
    [ticket1, ticket2],
    [ticket1, ticket2],
    [ticket1, ticket2],
  ];
  const offsets = [0, 1, 2, 3, 4];

  // Calculate costs
  const totalTickets = 10; // 2 tickets × 5 rounds
  const ticketPrice = ethers.parseEther('100'); // 100 MORBIUS per ticket
  const totalMORBIUSRequired = BigInt(totalTickets) * ticketPrice;

  console.log('\n📊 Test Parameters:');
  console.log('Total tickets:', totalTickets);
  console.log('Total MORBIUS required:', ethers.formatEther(totalMORBIUSRequired), 'MORBIUS');

  // Get PLS quote from router
  const path = [WPLS_ADDRESS, MORBIUS_ADDRESS];
  const amountsIn = await router.getAmountsIn(totalMORBIUSRequired, path);
  const basePlsCost = amountsIn[0];

  console.log('\n💰 Price Calculation:');
  console.log('Base PLS cost (from router):', ethers.formatEther(basePlsCost), 'PLS');

  // Apply same calculation as contract
  const taxedAmount = (basePlsCost * 15000n) / 10000n; // 50% tax
  const totalPlsRequired = (taxedAmount * 12000n) / 10000n; // 20% buffer

  console.log('After 50% tax:', ethers.formatEther(taxedAmount), 'PLS');
  console.log('After 20% buffer:', ethers.formatEther(totalPlsRequired), 'PLS');

  // Get current round info
  const currentRound = await lottery.getCurrentRoundInfo();
  console.log('\n📅 Current Round:', currentRound.roundId.toString());
  console.log('Round state:', currentRound.state === 0 ? 'OPEN' : 'FINALIZED');

  // Check keeper wallet
  const keeperWallet = await lottery.keeperWallet();
  console.log('\n👤 Keeper wallet:', keeperWallet);

  // Try to simulate the call
  console.log('\n🧪 Simulating transaction...');
  try {
    const [signer] = await ethers.getSigners();

    // Attempt the call with static call first to get revert reason
    await lottery.buyTicketsWithPLSForRounds.staticCall(
      ticketGroups,
      offsets,
      { value: totalPlsRequired }
    );

    console.log('✅ Static call succeeded! Transaction should work.');
  } catch (error) {
    console.log('❌ Static call failed!');
    console.log('Error:', error.message);

    // Try to extract revert reason
    if (error.data) {
      console.log('Revert data:', error.data);
    }

    // Try different PLS amounts to debug
    console.log('\n🔍 Testing with different PLS amounts:');

    // Try with 10% more
    const testAmount1 = (totalPlsRequired * 11000n) / 10000n;
    try {
      await lottery.buyTicketsWithPLSForRounds.staticCall(
        ticketGroups,
        offsets,
        { value: testAmount1 }
      );
      console.log(`✅ Works with +10%: ${ethers.formatEther(testAmount1)} PLS`);
    } catch (e) {
      console.log(`❌ Fails with +10%: ${e.message.split('\n')[0]}`);
    }

    // Try with 50% more
    const testAmount2 = (totalPlsRequired * 15000n) / 10000n;
    try {
      await lottery.buyTicketsWithPLSForRounds.staticCall(
        ticketGroups,
        offsets,
        { value: testAmount2 }
      );
      console.log(`✅ Works with +50%: ${ethers.formatEther(testAmount2)} PLS`);
    } catch (e) {
      console.log(`❌ Fails with +50%: ${e.message.split('\n')[0]}`);
    }

    // Try with 100% more
    const testAmount3 = totalPlsRequired * 2n;
    try {
      await lottery.buyTicketsWithPLSForRounds.staticCall(
        ticketGroups,
        offsets,
        { value: testAmount3 }
      );
      console.log(`✅ Works with +100%: ${ethers.formatEther(testAmount3)} PLS`);
    } catch (e) {
      console.log(`❌ Fails with +100%: ${e.message.split('\n')[0]}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
