const hre = require("hardhat");

async function main() {
  console.log("Deploying SuperStakeLottery6of55 V2 to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  // Contract parameters
  const PSSH_TOKEN_ADDRESS = "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1"; // Morbius token on PulseChain
  const WPLS_TOKEN_ADDRESS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27"; // Wrapped PLS on PulseChain
  const PULSEX_ROUTER_ADDRESS = "0x165C3410fC91EF562C50559f7d2289fEbed552d9"; // PulseX V2 Router

  // Round duration and MegaMorbius interval
  let ROUND_DURATION;
  const MEGA_MORBIUS_INTERVAL = 5; // default to every 5 rounds
  if (hre.network.name === "pulsechainTestnet") {
    ROUND_DURATION = 300; // 5 minutes for testnet
    console.log("Testnet detected - using 5 minute rounds");
  } else if (hre.network.name === "pulsechain") {
    ROUND_DURATION = 300; // 5 minutes for mainnet
    console.log("Mainnet detected - using 5 minute rounds");
  } else {
    ROUND_DURATION = 300; // 5 minutes default
    console.log("Local network detected - using 5 minute rounds");
  }

  console.log("\nConfig:");
  console.log("PSSH_TOKEN_ADDRESS  :", PSSH_TOKEN_ADDRESS);
  console.log("WPLS_TOKEN_ADDRESS  :", WPLS_TOKEN_ADDRESS);
  console.log("PULSEX_ROUTER       :", PULSEX_ROUTER_ADDRESS);
  console.log("ROUND_DURATION      :", ROUND_DURATION, "seconds");
  console.log("MEGA_MORBIUS_INTERVAL:", MEGA_MORBIUS_INTERVAL, "rounds");

  // Deploy contract (use fully qualified name to avoid ambiguity)
  const SuperStakeLottery6of55 = await hre.ethers.getContractFactory("contracts/SuperStakeLottery6of55V2.sol:SuperStakeLottery6of55");
  console.log("\nDeploying…");

  // Use network fee data; fallback to a modest value if provider returns nulls
  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || hre.ethers.parseUnits("50", "gwei");

  console.log("Using gas price:", hre.ethers.formatUnits(gasPrice, "gwei"), "Gwei");

  const lottery = await SuperStakeLottery6of55.deploy(
    PSSH_TOKEN_ADDRESS,
    WPLS_TOKEN_ADDRESS,
    PULSEX_ROUTER_ADDRESS,
    ROUND_DURATION,
    MEGA_MORBIUS_INTERVAL,
    {
      gasLimit: 8_000_000,
      gasPrice: gasPrice,
    }
  );

  const deploymentTx = lottery.deploymentTransaction();
  const receipt = await lottery.deploymentTransaction().wait();
  const lotteryAddress = await lottery.getAddress();
  console.log("\n✅ SuperStakeLottery6of55 V2 deployed at:", lotteryAddress);
  console.log("Tx hash:", deploymentTx?.hash);
  console.log("Block number:", receipt?.blockNumber?.toString?.() ?? "unknown");

  const deploymentBlock = receipt?.blockNumber || 0;

  // Wait a few blocks for contract to be fully initialized
  console.log("\n⏳ Waiting for contract initialization...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Verify initial state
  console.log("\n🔍 Verifying initial state...");
  const roundInfo = await lottery.getCurrentRoundInfo();
  console.log("Current Round ID:", roundInfo.roundId.toString());
  console.log("Round Duration:", (await lottery.roundDuration()).toString(), "seconds");
  console.log("MegaMorbius Bank:", (await lottery.getMegaMillionsBank()).toString());

  // Display important addresses
  console.log("\n📋 Important Addresses:");
  console.log("- Lottery Contract:", lotteryAddress);
  console.log("- pSSH Token:", await lottery.pSSH_TOKEN());
  console.log("- WPLS Token:", await lottery.WPLS_TOKEN());
  console.log("- PulseX Router:", await lottery.pulseXRouter());

  // Display key parameters
  console.log("\n⚙️  Key Parameters (V2 Changes):");
  console.log("- Ticket Price:", (await lottery.TICKET_PRICE()).toString(), "wei (1e18 = 1 Morbius)");
  console.log("- Numbers Per Ticket:", await lottery.NUMBERS_PER_TICKET());
  console.log("- Number Range:", await lottery.MIN_NUMBER(), "-", await lottery.MAX_NUMBER());
  console.log("- MegaMorbius Interval:", (await lottery.megaMillionsInterval()).toString(), "rounds");
  console.log("- Winners Pool:", (await lottery.WINNERS_POOL_PCT()).toString(), "bps (60%)");
  console.log("- Burn:", (await lottery.BURN_PCT()).toString(), "bps (20%)");
  console.log("- Mega Bank:", (await lottery.MEGA_BANK_PCT()).toString(), "bps (20%)");

  // Display bracket percentages
  console.log("\n🎯 Bracket Percentages (REBALANCED):");
  for (let i = 0; i < 6; i++) {
    const pct = await lottery.BRACKET_PERCENTAGES(i);
    console.log(`- Bracket ${i + 1} (${i + 1} matches): ${pct} bps (${Number(pct) / 100}%)`);
  }

  console.log("\n🔄 Rollover Logic:");
  console.log("- Brackets 1-4 unclaimed → 100% to MegaMillions");
  console.log("- Bracket 5 unclaimed → 60% to Bracket 6, 40% to MegaMillions");
  console.log("- Bracket 6 unclaimed → 60% to Bracket 5, 40% to MegaMillions");

  console.log("\n💰 WPLS Payment:");
  console.log("- Auto-swap WPLS → pSSH via PulseX");
  console.log("- Accounts for 5.5% pSSH tax + 5% slippage");
  console.log("- Buffer:", (await lottery.WPLS_SWAP_BUFFER_PCT()).toString(), "bps (11.1%)");

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    contractAddress: lotteryAddress,
    deploymentBlock: deploymentBlock,
    deployer: deployer.address,
    psshToken: PSSH_TOKEN_ADDRESS,
    wplsToken: WPLS_TOKEN_ADDRESS,
    pulseXRouter: PULSEX_ROUTER_ADDRESS,
    roundDuration: ROUND_DURATION,
    version: "V2",
    timestamp: new Date().toISOString(),
  };

  console.log("\n💾 Deployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Instructions
  console.log("\n📝 Next Steps:");
  console.log("1. Update frontend contract address in lib/contracts.ts:");
  console.log(`   export const LOTTERY_ADDRESS = '${lotteryAddress}'`);
  console.log(`   export const LOTTERY_DEPLOY_BLOCK = ${deploymentBlock}`);
  console.log("");
  console.log("2. Generate and update ABI in abi/lottery.ts");
  console.log("");
  console.log("3. Verify contract on PulseScan:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${lotteryAddress} "${PSSH_TOKEN_ADDRESS}" "${WPLS_TOKEN_ADDRESS}" "${PULSEX_ROUTER_ADDRESS}" ${ROUND_DURATION}`);
  console.log("");
  console.log("4. Test the contract:");
  console.log("   - Buy tickets with pSSH (buyTickets)");
  console.log("   - Buy tickets with WPLS (buyTicketsWithWPLS)");
  console.log("   - Wait for round to expire");
  console.log("   - Call finalizeRound()");
  console.log("   - Check winning numbers and claim prizes");

  // Export deployment info to file
  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "../deployments");

  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `${hre.network.name}-v2-${Date.now()}.json`;
  const filepath = path.join(deploymentsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n✅ Deployment info saved to: ${filepath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
