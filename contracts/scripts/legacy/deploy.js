const hre = require("hardhat");

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error(
      "Missing PRIVATE_KEY. Add it to contracts/.env or export it before running the deploy script."
    );
  }

  console.log("Deploying SuperStakeLottery to PulseChain...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "PLS");

  // Configuration
  const SUPERSTAKE_TOKEN_ADDRESS = "0x9977e170C9B6E544302E8DB0Cf01D12D55555289";
  const INITIAL_ROUND_DURATION = 10 * 60; // 10 minutes for testing
  // For production, use: 3 * 24 * 60 * 60 (3 days)

  console.log("\nDeployment Configuration:");
  console.log("- SuperStake Token:", SUPERSTAKE_TOKEN_ADDRESS);
  console.log("- Round Duration:", INITIAL_ROUND_DURATION, "seconds");
  console.log("- Prize Distribution: 60% winner, 20% rollover, 20% burn");

  // Get contract factory
  const SuperStakeLottery = await hre.ethers.getContractFactory("SuperStakeLottery");

  // Deploy
  console.log("\nDeploying contract...");
  const lottery = await SuperStakeLottery.deploy(
    SUPERSTAKE_TOKEN_ADDRESS,
    INITIAL_ROUND_DURATION
  );

  await lottery.waitForDeployment();
  const lotteryAddress = await lottery.getAddress();

  console.log("\n✅ SuperStakeLottery deployed successfully!");
  console.log("Contract Address:", lotteryAddress);

  // Get deployment info
  const roundInfo = await lottery.getRoundInfo();
  console.log("\nInitial Round Info:");
  console.log("- Round ID:", roundInfo.roundId.toString());
  console.log("- Start Time:", new Date(Number(roundInfo.startTime) * 1000).toISOString());
  console.log("- End Time:", new Date(Number(roundInfo.endTime) * 1000).toISOString());

  console.log("\n⚠️  IMPORTANT NEXT STEPS:");
  console.log("1. Save the contract address:", lotteryAddress);
  console.log("2. Verify contract on PulseScan:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${lotteryAddress} "${SUPERSTAKE_TOKEN_ADDRESS}" ${INITIAL_ROUND_DURATION}`);
  console.log("3. Update frontend with contract address in lib/contracts.ts");
  console.log("4. Test buying tickets on testnet before mainnet deployment");

  // Save deployment info to file
  const fs = require("fs");
  const deploymentInfo = {
    network: hre.network.name,
    contractAddress: lotteryAddress,
    deployer: deployer.address,
    superstakeToken: SUPERSTAKE_TOKEN_ADDRESS,
    roundDuration: INITIAL_ROUND_DURATION,
    deployedAt: new Date().toISOString(),
    blockNumber: await hre.ethers.provider.getBlockNumber(),
  };

  const filename = `deployment-${hre.network.name}-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n📝 Deployment info saved to: ${filename}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
