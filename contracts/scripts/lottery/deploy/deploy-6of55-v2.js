import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("Deploying MegaMORBIUSLottery to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  // Contract parameters
  const MORBIUS_TOKEN_ADDRESS = "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1"; // MORBIUS token on PulseChain
  const WPLS_TOKEN_ADDRESS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27"; // Wrapped PLS on PulseChain
  const PULSEX_ROUTER_ADDRESS = "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02"; // PulseX V1 Router (align with Keno)

  // Wallet addresses (keeper receives 10% of ticket sales)
  const KEEPER_WALLET = process.env.KEEPER_WALLET || deployer.address; // Defaults to deployer
  const DEPLOYER_WALLET = deployer.address; // Not used anymore, kept for constructor compatibility

  // Round duration
  let ROUND_DURATION;
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
  console.log("MORBIUS_TOKEN_ADDR  :", MORBIUS_TOKEN_ADDRESS);
  console.log("WPLS_TOKEN_ADDRESS  :", WPLS_TOKEN_ADDRESS);
  console.log("PULSEX_ROUTER       :", PULSEX_ROUTER_ADDRESS);
  console.log("KEEPER_WALLET       :", KEEPER_WALLET);
  console.log("DEPLOYER_WALLET     :", DEPLOYER_WALLET);
  console.log("ROUND_DURATION      :", ROUND_DURATION, "seconds");

  // Deploy contract
  const MegaMORBIUSLottery = await hre.ethers.getContractFactory("MegaMorbiusLottery");
  console.log("\nDeploying…");

  // Use increased gas price for reliable deployment
  const gasPrice = hre.ethers.parseUnits("400000", "gwei");

  console.log("Using gas price:", hre.ethers.formatUnits(gasPrice, "gwei"), "Gwei");

  const lottery = await MegaMORBIUSLottery.deploy(
    MORBIUS_TOKEN_ADDRESS,
    WPLS_TOKEN_ADDRESS,
    PULSEX_ROUTER_ADDRESS,
    ROUND_DURATION,
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
  console.log("\n✅ MegaMORBIUSLottery deployed at:", lotteryAddress);
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
  console.log("MegaMORBIUS Bank:", (await lottery.getMegaMORBIUSBank()).toString());

  // Display important addresses
  console.log("\n📋 Important Addresses:");
  console.log("- Lottery Contract:", lotteryAddress);
  console.log("- MORBIUS Token:", await lottery.MORBIUS_TOKEN());
  console.log("- WPLS Token:", await lottery.WPLS_TOKEN());
  console.log("- PulseX Router:", await lottery.pulseXRouter());

  // Display key parameters
  console.log("\n⚙️  Key Parameters (V2 Changes):");
  console.log("- Ticket Price (MORBIUS):", (await lottery.ticketPriceMORBIUS()).toString(), "wei");
  console.log("- Ticket Price (PLS beats):", (await lottery.ticketPricePls()).toString(), "wei");
  console.log("- Numbers Per Ticket:", await lottery.NUMBERS_PER_TICKET());
  console.log("- Number Range:", await lottery.MIN_NUMBER(), "-", await lottery.MAX_NUMBER());
  console.log("- Keeper Fee:", (await lottery.KEEPER_FEE_PCT()).toString(), "bps (5%)");
  console.log("- Deployer Fee:", (await lottery.DEPLOYER_FEE_PCT()).toString(), "bps (5%)");
  console.log("- Winners Pool:", (await lottery.WINNERS_POOL_PCT()).toString(), "bps (70%)");
  console.log("- Burn:", (await lottery.BURN_PCT()).toString(), "bps (10%)");
  console.log("- Mega Bank:", (await lottery.MEGA_BANK_PCT()).toString(), "bps (10%)");

  // Display fixed bracket amounts
  console.log("\n🎯 Fixed Prize Brackets:");
  for (let i = 0; i < 6; i++) {
    const amount = await lottery.BRACKET_AMOUNTS(i);
    console.log(`- Bracket ${i + 1} (${i + 1} matches): ${amount.toString()} MORBIUS (${Number(amount) / 1e18} MOR)`);
  }

  console.log("\n🔄 Rollover Logic:");
  console.log("- Unclaimed brackets: 100% to next round winners pool");

  console.log("\n🎰 MegaMORBIUS Progressive Jackpot:");
  console.log("- Accumulates 10% of all ticket purchases");
  console.log("- Distributes immediately when 5/6 match winners appear");
  console.log("- Distribution: 35% to 5-match winners, 65% to 6-match winners");

  console.log("\n💰 WPLS Payment:");
  console.log("- Auto-swap WPLS → MORBIUS via PulseX");
  console.log("- Accounts for 5.5% MORBIUS tax + 5% slippage");
  console.log("- Buffer:", (await lottery.WPLS_SWAP_BUFFER_PCT()).toString(), "bps (11.1%)");

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    contractAddress: lotteryAddress,
    deploymentBlock: deploymentBlock,
    deployer: deployer.address,
    MORBIUSToken: MORBIUS_TOKEN_ADDRESS,
    wplsToken: WPLS_TOKEN_ADDRESS,
    pulseXRouter: PULSEX_ROUTER_ADDRESS,
    keeperWallet: KEEPER_WALLET,
    deployerWallet: DEPLOYER_WALLET,
    roundDuration: ROUND_DURATION,
    version: "V2-FixedPrizes",
    timestamp: new Date().toISOString(),
  };

  console.log("\n💾 Deployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Instructions
  console.log("\n📝 Next Steps:");
  console.log("1. Update frontend contract address in lib/contracts.ts:");
  console.log(`   export const LOTTERY_INSTANT_ADDRESS = '${lotteryAddress}'`);
  console.log(`   export const LOTTERY_DEPLOY_BLOCK = ${deploymentBlock}`);
  console.log("");
  console.log("2. ABI already regenerated: abi/lottery6of55-v2.json");
  console.log("");
  console.log("3. Verify contract on PulseScan:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${lotteryAddress} "${MORBIUS_TOKEN_ADDRESS}" "${WPLS_TOKEN_ADDRESS}" "${PULSEX_ROUTER_ADDRESS}" ${ROUND_DURATION} "${KEEPER_WALLET}" "${DEPLOYER_WALLET}"`);
  console.log("");
  console.log("4. Start the keeper bot:");
  console.log(`   node scripts/lottery-keeper.js`);
  console.log("");
  console.log("5. Test the contract:");
  console.log("   - Buy tickets with MORBIUS (buyTickets)");
  console.log("   - Buy tickets with WPLS (buyTicketsWithWPLS)");
  console.log("   - Wait for round to expire (2 minutes)");
  console.log("   - Keeper calls finalizeRound() (draws numbers immediately)");
  console.log("   - Check winning numbers and claim prizes");

  // Export deployment info to file
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
