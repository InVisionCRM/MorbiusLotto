import hre from "hardhat";

/**
 * Verify which functions are available on the deployed Blackjack contract
 * This helps identify if the deployed contract matches the current ABI
 */
async function main() {
  console.log("Verifying Blackjack contract functions...\n");

  const CONTRACT_ADDRESS = process.env.BLACKJACK_ADDRESS || "0x0ab9C51d0e8d4C983D5051c8fe89A9e9A7f4BB76";
  
  console.log("Contract Address:", CONTRACT_ADDRESS);
  console.log("Network:", hre.network.name);
  console.log("\n" + "=".repeat(60) + "\n");

  // Get contract instance
  const blackjack = await hre.ethers.getContractAt("Blackjack", CONTRACT_ADDRESS);

  // List of functions that should exist (from current contract code)
  const expectedFunctions = [
    'deposit',
    'depositMORBIUS',
    'withdraw',
    'getPlayerReserve',
    'totalReserves',
    'emergencyPaused',
    'getDailyWithdrawalInfo',
    'revealServerSeed',
    'settleGame',
    'pause',
    'unpause',
    'setAuthorizedServer',
    'setEmergencyAdmin',
    'setEmergencyPause',
    'owner',
    'authorizedServer',
    'emergencyAdmin',
    'paused',
    'playerReserves',
    'totalReserves',
    'isSeedRevealed',
    'MORBIUS_TOKEN',
    'WPLS_TOKEN',
    'pulseXRouter',
    'MIN_DEPOSIT',
    'MIN_WITHDRAWAL',
    'MAX_DAILY_WITHDRAWAL',
    'HOUSE_EDGE_BPS',
    'BPS_DENOMINATOR'
  ];

  console.log("Checking expected functions:\n");
  
  const missingFunctions = [];
  const availableFunctions = [];

  for (const funcName of expectedFunctions) {
    try {
      // Try to get the function
      const func = blackjack.interface.getFunction(funcName);
      if (func) {
        availableFunctions.push(funcName);
        console.log(`✅ ${funcName}`);
      }
    } catch (error) {
      missingFunctions.push(funcName);
      console.log(`❌ ${funcName} - NOT FOUND`);
    }
  }

  console.log("\n" + "=".repeat(60) + "\n");
  console.log(`Summary:`);
  console.log(`  Available: ${availableFunctions.length}/${expectedFunctions.length}`);
  console.log(`  Missing: ${missingFunctions.length}/${expectedFunctions.length}`);

  if (missingFunctions.length > 0) {
    console.log("\n⚠️  MISSING FUNCTIONS:");
    missingFunctions.forEach(func => console.log(`  - ${func}`));
    console.log("\n💡 RECOMMENDATION:");
    console.log("  The deployed contract appears to be missing some functions.");
    console.log("  You may need to redeploy the contract with the latest code.");
    console.log("\n  To redeploy:");
    console.log("  npx hardhat run scripts/deploy-blackjack.js --network pulsechain");
  } else {
    console.log("\n✅ All expected functions are available!");
  }

  // Try to call some key functions to verify they work
  console.log("\n" + "=".repeat(60) + "\n");
  console.log("Testing key functions:\n");

  try {
    const owner = await blackjack.owner();
    console.log(`✅ owner(): ${owner}`);
  } catch (error) {
    console.log(`❌ owner(): ${error.message}`);
  }

  try {
    const authorizedServer = await blackjack.authorizedServer();
    console.log(`✅ authorizedServer(): ${authorizedServer}`);
  } catch (error) {
    console.log(`❌ authorizedServer(): ${error.message}`);
  }

  try {
    const minDeposit = await blackjack.MIN_DEPOSIT();
    console.log(`✅ MIN_DEPOSIT(): ${hre.ethers.formatEther(minDeposit)} MORBIUS`);
  } catch (error) {
    console.log(`❌ MIN_DEPOSIT(): ${error.message}`);
  }

  // Check if depositMORBIUS exists
  try {
    const hasDepositMORBIUS = blackjack.interface.hasFunction("depositMORBIUS");
    if (hasDepositMORBIUS) {
      console.log(`✅ depositMORBIUS function EXISTS in contract interface`);
    } else {
      console.log(`❌ depositMORBIUS function NOT FOUND in contract interface`);
      console.log(`\n⚠️  CRITICAL: depositMORBIUS is missing from deployed contract!`);
      console.log(`   This function is required for direct MORBIUS deposits.`);
      console.log(`   You MUST redeploy the contract to use this feature.`);
    }
  } catch (error) {
    console.log(`❌ Error checking depositMORBIUS: ${error.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
