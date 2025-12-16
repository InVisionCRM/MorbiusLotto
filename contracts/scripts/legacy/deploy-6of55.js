const hre = require("hardhat");

async function main() {
  console.log("Deploying SuperStakeLottery6of55...");

  // Contract constructor parameters
  const PSSH_TOKEN_ADDRESS = "0x9977e170C9B6E544302E8DB0Cf01D12D55555289"; // SuperStake token
  const INITIAL_ROUND_DURATION = 259200; // 3 days in seconds (or 600 for testing = 10 minutes)

  console.log("\nDeployment Parameters:");
  console.log("- pSSH Token Address:", PSSH_TOKEN_ADDRESS);
  console.log("- Initial Round Duration:", INITIAL_ROUND_DURATION, "seconds");
  console.log("");

  // Deploy the contract
  const SuperStakeLottery6of55 = await hre.ethers.getContractFactory("SuperStakeLottery6of55");
  const lottery = await SuperStakeLottery6of55.deploy(
    PSSH_TOKEN_ADDRESS,
    INITIAL_ROUND_DURATION
  );

  await lottery.waitForDeployment();

  const address = await lottery.getAddress();

  console.log("✅ SuperStakeLottery6of55 deployed to:", address);
  console.log("\n📋 Next Steps:");
  console.log("1. Update LOTTERY_ADDRESS in lib/contracts.ts to:", address);
  console.log("2. Verify contract on PulseScan:");
  console.log(`   npx hardhat verify --network pulsechain ${address} "${PSSH_TOKEN_ADDRESS}" ${INITIAL_ROUND_DURATION}`);
  console.log("\n3. Save this deployment info!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
