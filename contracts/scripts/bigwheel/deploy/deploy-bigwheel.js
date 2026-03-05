import hre from "hardhat";

async function main() {
  console.log("Deploying BigWheel to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  // Config (env overrides)
  const INITIAL_OWNER = process.env.BIGWHEEL_INITIAL_OWNER || deployer.address;
  const MORBIUS_TOKEN = process.env.BIGWHEEL_MORBIUS_TOKEN || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const WPLS_TOKEN = process.env.BIGWHEEL_WPLS_TOKEN || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
  const PULSEX_ROUTER = process.env.BIGWHEEL_ROUTER || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";
  console.log("\nConfig:");
  console.log("INITIAL_OWNER      :", INITIAL_OWNER);
  console.log("MORBIUS_TOKEN      :", MORBIUS_TOKEN);
  console.log("WPLS_TOKEN         :", WPLS_TOKEN);
  console.log("PULSEX_ROUTER      :", PULSEX_ROUTER);

  const BigWheel = await hre.ethers.getContractFactory("BigWheel");
  console.log("\nDeploying…");
  const gasPrice = hre.ethers.parseUnits("400000", "gwei");
  const bigWheel = await BigWheel.deploy(
    INITIAL_OWNER,
    MORBIUS_TOKEN,
    WPLS_TOKEN,
    PULSEX_ROUTER,
    {
      gasLimit: 10000000,
      gasPrice,
    }
  );

  const deploymentTx = bigWheel.deploymentTransaction();
  console.log("Deploy tx hash:", deploymentTx?.hash);
  const receipt = await bigWheel.deploymentTransaction().wait();
  const addr = await bigWheel.getAddress();
  console.log("\n✅ BigWheel deployed at:", addr);
  console.log("Tx hash:", deploymentTx?.hash);
  console.log("Block number:", receipt?.blockNumber?.toString?.() ?? "unknown");

  // Verify contract configuration
  console.log("\n📊 Configuration:");
  console.log("- Total Segments: 7");
  console.log("- Min Bet: 1 MORBIUS");
  console.log("- Max Bet: 10,000 MORBIUS");
  console.log("- Fee Distribution: 10% burn, 90% to contract reserve");

  console.log("\n🎰 SEGMENT DISTRIBUTION (7 total, proportional size):");
  const counts = await bigWheel.getSegmentCounts();
  const multipliers = await bigWheel.getMultipliers();
  const betTypes = ["ONE (1x)", "TWO (2x)", "FIVE (5x)", "TEN (10x)", "TWENTY (20x)", "JOKER (40x)", "MORBIUS (40x)"];
  const wheelPercentages = [44.4, 27.8, 13.0, 7.4, 3.7, 1.9, 1.9]; // Based on original 54-segment distribution

  for (let i = 0; i < counts.length; i++) {
    console.log(`  ${betTypes[i]}: ${counts[i]} segment (${wheelPercentages[i]}% of wheel)`);
  }

  console.log("\n💰 ECONOMICS:");
  console.log("- Players bet on multipliers: 1x, 2x, 5x, 10x, 20x, 40x (Joker), 40x (Morbius)");
  console.log("- Win when wheel lands on chosen multiplier segment");
  console.log("- Fee Split: 10% burn to dead address, 90% to contract reserve");
  console.log("- MORBIUS deflationary tokenomics with every bet");
  console.log("- RTP varies by bet choice (higher multipliers = higher risk/reward)");

  console.log("\n⚠️  IMPORTANT - Set up the contract:");
  console.log("1. Fund the contract reserve with initial MORBIUS liquidity");
  console.log("2. Update BIGWHEEL_ADDRESS in lib/contracts.ts:");
  console.log(`   export const BIGWHEEL_ADDRESS = '${addr}' as const`);
  console.log("3. Generate and update ABI in abi/bigwheel.ts and abi/bigwheel.json");
  console.log("4. Verify contract:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${addr} "${INITIAL_OWNER}" "${MORBIUS_TOKEN}" "${WPLS_TOKEN}" "${PULSEX_ROUTER}"`);

  console.log("\n🎯 TESTING:");
  console.log("Test with small bets first to ensure proper payouts.");
  console.log("Verify 10% MORBIUS burning to dead address.");
  console.log("Confirm instant payouts from contract balance.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});