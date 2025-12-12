const hre = require("hardhat");

async function main() {
  console.log("Deploying SuperStakeLottery6of55 V2 to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  // Contract parameters
  const MORBIUS_TOKEN_ADDRESS = "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1"; // Morbius token on PulseChain
  const WPLS_TOKEN_ADDRESS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27"; // Wrapped PLS on PulseChain
  const PULSEX_ROUTER_ADDRESS = "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02"; // PulseX V1 Router (align with Keno)

  // Wallet addresses (keeper receives 5% of ticket sales, deployer receives 5%)
  const KEEPER_WALLET = process.env.KEEPER_WALLET || deployer.address; // Defaults to deployer
  const DEPLOYER_WALLET = process.env.DEPLOYER_WALLET || deployer.address; // Defaults to deployer

  // Round duration and MegaMorbius interval
  let ROUND_DURATION;
  const MEGA_MORBIUS_INTERVAL = 20; // every 20 rounds
  if (hre.network.name === "pulsechainTestnet") {
    ROUND_DURATION = 3600; // 1 hour for testnet
    console.log("Testnet detected - using 1 hour rounds");
  } else if (hre.network.name === "pulsechain") {
    ROUND_DURATION = 3600; // 1 hour for mainnet
    console.log("Mainnet detected - using 1 hour rounds");
  } else {
    ROUND_DURATION = 3600; // 1 hour default
    console.log("Local network detected - using 1 hour rounds");
  }

  console.log("\nConfig:");
  console.log("MORBIUS_TOKEN_ADDR  :", MORBIUS_TOKEN_ADDRESS);
  console.log("WPLS_TOKEN_ADDRESS  :", WPLS_TOKEN_ADDRESS);
  console.log("PULSEX_ROUTER       :", PULSEX_ROUTER_ADDRESS);
  console.log("KEEPER_WALLET       :", KEEPER_WALLET);
  console.log("DEPLOYER_WALLET     :", DEPLOYER_WALLET);
  console.log("ROUND_DURATION      :", ROUND_DURATION, "seconds");
  console.log("MEGA_MORBIUS_INTERVAL:", MEGA_MORBIUS_INTERVAL, "rounds");

  // Deploy contract (use fully qualified name to avoid ambiguity)
  const SuperStakeLottery6of55 = await hre.ethers.getContractFactory("contracts/SuperStakeLottery6of55V2.sol:SuperStakeLottery6of55");
  console.log("\nDeploying…");

  // Use increased gas price for reliable deployment
  const gasPrice = hre.ethers.parseUnits("400000", "gwei");

  console.log("Using gas price:", hre.ethers.formatUnits(gasPrice, "gwei"), "Gwei");

  const lottery = await SuperStakeLottery6of55.deploy(
    MORBIUS_TOKEN_ADDRESS,
    WPLS_TOKEN_ADDRESS,
    PULSEX_ROUTER_ADDRESS,
    ROUND_DURATION,
    MEGA_MORBIUS_INTERVAL,
    KEEPER_WALLET,
    DEPLOYER_WALLET,
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
  console.log("- Morbius Token:", await lottery.MORBIUS_TOKEN());
  console.log("- WPLS Token:", await lottery.WPLS_TOKEN());
  console.log("- PulseX Router:", await lottery.pulseXRouter());

  // Display key parameters
  console.log("\n⚙️  Key Parameters (V2 Changes):");
  console.log("- Ticket Price (Morbius):", (await lottery.ticketPriceMorbius()).toString(), "wei");
  console.log("- Ticket Price (PLS beats):", (await lottery.ticketPricePls()).toString(), "wei");
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
  console.log("- Unclaimed brackets: 70% to next round winners, 15% burn, 15% MegaMorbius");

  console.log("\n💰 WPLS Payment:");
  console.log("- Auto-swap WPLS → Morbius via PulseX");
  console.log("- Accounts for 5.5% Morbius tax + 5% slippage");
  console.log("- Buffer:", (await lottery.WPLS_SWAP_BUFFER_PCT()).toString(), "bps (11.1%)");

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    contractAddress: lotteryAddress,
    deploymentBlock: deploymentBlock,
    deployer: deployer.address,
    morbiusToken: MORBIUS_TOKEN_ADDRESS,
    wplsToken: WPLS_TOKEN_ADDRESS,
    pulseXRouter: PULSEX_ROUTER_ADDRESS,
    keeperWallet: KEEPER_WALLET,
    deployerWallet: DEPLOYER_WALLET,
    roundDuration: ROUND_DURATION,
    megaMorbiusInterval: MEGA_MORBIUS_INTERVAL,
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
  console.log("2. ABI already regenerated: abi/lottery6of55-v2.json");
  console.log("");
  console.log("3. Verify contract on PulseScan:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${lotteryAddress} "${MORBIUS_TOKEN_ADDRESS}" "${WPLS_TOKEN_ADDRESS}" "${PULSEX_ROUTER_ADDRESS}" ${ROUND_DURATION} ${MEGA_MORBIUS_INTERVAL} "${KEEPER_WALLET}" "${DEPLOYER_WALLET}"`);
  console.log("");
  console.log("4. Start the keeper bot:");
  console.log(`   node scripts/lottery-keeper.js`);
  console.log("");
  console.log("5. Test the contract:");
  console.log("   - Buy tickets with Morbius (buyTickets)");
  console.log("   - Buy tickets with WPLS (buyTicketsWithWPLS)");
  console.log("   - Wait for round to expire");
  console.log("   - Keeper calls finalizeRound() (Step 1: Locks round)");
  console.log("   - Wait 10 blocks (~50 seconds)");
  console.log("   - Keeper calls drawNumbers() (Step 2: Draws winning numbers)");
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
