const { ethers } = require('hardhat');

async function main() {
  console.log('🔍 Diagnosing PLS Ticket Purchase\n');

  // Use public RPC instead of Hardhat's
  const provider = new ethers.JsonRpcProvider('https://rpc.pulsechain.com');
  const [signer] = await ethers.getSigners();
  const signerWithProvider = signer.connect(provider);

  const KENO_ADDR = '0x5E9d1e962b006B3BAbF31fCc61C05dD9aD6045b3';
  const ROUTER_ADDR = '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02';
  const WPLS_ADDR = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
  const MORBIUS_ADDR = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';

  const keno = await ethers.getContractAt('CryptoKeno', KENO_ADDR, signerWithProvider);
  const router = await ethers.getContractAt(
    ['function getAmountsIn(uint amountOut, address[] memory path) view returns (uint[] memory)'],
    ROUTER_ADDR,
    signerWithProvider
  );

  // Test parameters
  const numbers = [1, 2, 3, 4, 5];
  const spotSize = 5;
  const draws = 1;
  const wagerPerDraw = ethers.parseEther('1'); // 1 MORBIUS

  console.log('Test Parameters:');
  console.log('  Numbers:', numbers);
  console.log('  Spot Size:', spotSize);
  console.log('  Draws:', draws);
  console.log('  Wager per Draw:', ethers.formatEther(wagerPerDraw), 'MORBIUS\n');

  try {
    // Step 1: Get current round
    const currentRound = await keno.currentRoundId();
    console.log('✅ Step 1: Current Round ID:', currentRound.toString());

    // Step 2: Get router quote
    const path = [WPLS_ADDR, MORBIUS_ADDR];
    const gross = wagerPerDraw * BigInt(draws);
    const amounts = await router.getAmountsIn(gross, path);
    const basePlsCost = amounts[0];
    console.log('✅ Step 2: Router Quote');
    console.log('   Base PLS cost:', ethers.formatEther(basePlsCost), 'PLS');

    // Step 3: Calculate with tax and buffer
    const taxedAmount = (basePlsCost * BigInt(15000)) / BigInt(10000);
    const wplsNeeded = (taxedAmount * BigInt(12000)) / BigInt(10000);
    console.log('✅ Step 3: Calculated PLS needed');
    console.log('   After 50% tax:', ethers.formatEther(taxedAmount), 'PLS');
    console.log('   With 20% buffer:', ethers.formatEther(wplsNeeded), 'PLS\n');

    // Step 4: Check user balance
    const userBalance = await provider.getBalance(signerWithProvider.address);
    console.log('✅ Step 4: User PLS Balance:', ethers.formatEther(userBalance), 'PLS');

    if (userBalance < wplsNeeded) {
      console.log('❌ ISSUE: Insufficient PLS balance!');
      console.log('   Need:', ethers.formatEther(wplsNeeded), 'PLS');
      console.log('   Have:', ethers.formatEther(userBalance), 'PLS\n');
      return;
    }

    // Step 5: Estimate gas
    console.log('\n⏳ Step 5: Estimating gas...');
    const gasEstimate = await keno.buyTicketWithPLS.estimateGas(
      currentRound,
      numbers,
      spotSize,
      draws,
      wagerPerDraw,
      { value: wplsNeeded }
    );
    console.log('✅ Gas estimate:', gasEstimate.toString());

    console.log('\n✅ ALL CHECKS PASSED! Transaction should work.');
    console.log('\nTo execute:');
    console.log('const tx = await keno.buyTicketWithPLS(');
    console.log(`  ${currentRound},`);
    console.log(`  ${JSON.stringify(numbers)},`);
    console.log(`  ${spotSize},`);
    console.log(`  ${draws},`);
    console.log(`  "${wagerPerDraw.toString()}",`);
    console.log(`  { value: "${wplsNeeded.toString()}" }`);
    console.log(')');

  } catch (error) {
    console.log('\n❌ ERROR FOUND:');
    console.log('Message:', error.message);
    if (error.reason) console.log('Reason:', error.reason);
    if (error.code) console.log('Code:', error.code);
    if (error.data) {
      console.log('Data:', error.data);
      // Try to decode revert reason
      try {
        const iface = new ethers.Interface([
          'error InsufficientPLS()',
          'error WagerTooLow()',
          'error WagerTooHigh()',
          'error InvalidSpotSize()',
          'error RoundNotOpen()'
        ]);
        const decoded = iface.parseError(error.data);
        console.log('Decoded error:', decoded.name);
      } catch (e) {
        // Can't decode
      }
    }
  }
}

main().catch(console.error);
