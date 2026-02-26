import hre from "hardhat";

async function main() {
  console.log("Deploying Plinko to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  // Config (env overrides)
  const MORBIUS_TOKEN = process.env.PLINKO_MORBIUS_TOKEN || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const WPLS_TOKEN = process.env.PLINKO_WPLS_TOKEN || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
  const PULSEX_ROUTER = process.env.PLINKO_ROUTER || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";
  const MIN_WAGER = process.env.PLINKO_MIN_WAGER || hre.ethers.parseEther("10"); // 10 MORBIUS
  const MAX_WAGER = process.env.PLINKO_MAX_WAGER || hre.ethers.parseEther("10000"); // 10,000 MORBIUS
  const PLS_TREASURY = process.env.PLS_TREASURY;
  const DISTRIBUTION_RECIPIENT = process.env.DISTRIBUTION_RECIPIENT;
  const PLATFORM_FEE_RECIPIENT = process.env.PLATFORM_FEE_RECIPIENT;

  if (!PLS_TREASURY) {
    throw new Error("PLS_TREASURY is not set in .env — set it to the wallet that receives PLS and holds MORBIUS for PLS-purchased games");
  }
  if (!DISTRIBUTION_RECIPIENT) {
    throw new Error("DISTRIBUTION_RECIPIENT is not set in .env — set it to the wallet that receives the 2.5% distribution fee on payouts");
  }
  if (!PLATFORM_FEE_RECIPIENT) {
    throw new Error("PLATFORM_FEE_RECIPIENT is not set in .env — set it to the wallet that receives the 2.5% platform fee on payouts");
  }

  console.log("\nConfig:");
  console.log("MORBIUS_TOKEN          :", MORBIUS_TOKEN);
  console.log("WPLS_TOKEN             :", WPLS_TOKEN);
  console.log("PULSEX_ROUTER          :", PULSEX_ROUTER);
  console.log("MIN_WAGER_PER_BALL     :", hre.ethers.formatEther(MIN_WAGER), "MORBIUS");
  console.log("MAX_WAGER_PER_BALL     :", hre.ethers.formatEther(MAX_WAGER), "MORBIUS");
  console.log("PLS_TREASURY           :", PLS_TREASURY);
  console.log("DISTRIBUTION_RECIPIENT :", DISTRIBUTION_RECIPIENT, "(2.5% payout fee)");
  console.log("PLATFORM_FEE_RECIPIENT :", PLATFORM_FEE_RECIPIENT, "(2.5% payout fee)");

  const Plinko = await hre.ethers.getContractFactory("Plinko");
  console.log("\nDeploying…");

  // Use 1.3× current gas price (enough buffer without blowing the PLS budget)
  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = (feeData.gasPrice ?? hre.ethers.parseUnits("1500000", "gwei")) * 13n / 10n;
  console.log("Gas price:", hre.ethers.formatUnits(gasPrice, "gwei"), "gwei");

  const overrides = { gasLimit: 6000000, gasPrice };
  // Optional: pass DEPLOY_NONCE=<n> env var to replace a stuck TX at that nonce
  if (process.env.DEPLOY_NONCE) {
    overrides.nonce = parseInt(process.env.DEPLOY_NONCE, 10);
    console.log("Using nonce override:", overrides.nonce);
  }

  const plinko = await Plinko.deploy(
    MORBIUS_TOKEN,
    WPLS_TOKEN,
    PULSEX_ROUTER,
    MIN_WAGER,
    MAX_WAGER,
    PLS_TREASURY,
    DISTRIBUTION_RECIPIENT,
    PLATFORM_FEE_RECIPIENT,
    overrides
  );

  const deploymentTx = plinko.deploymentTransaction();
  console.log("Deploy tx hash:", deploymentTx?.hash);
  const receipt = await plinko.deploymentTransaction().wait();
  const addr = await plinko.getAddress();
  console.log("\n✅ Plinko deployed at:", addr);
  console.log("Tx hash:", deploymentTx?.hash);
  console.log("Block number:", receipt?.blockNumber?.toString?.() ?? "unknown");

  console.log("\n⚠️  IMPORTANT - Fund the Contract:");
  console.log("The contract needs initial liquidity to pay winners. Fund it with:");
  console.log(`  npx hardhat run scripts/fund-plinko.js --network ${hre.network.name}`);
  console.log("Or manually call fundContract(amount) on the contract.");
  console.log("\nRecommended initial funding: 100,000+ MORBIUS");

  console.log("\n✅ Next steps:");
  console.log("1. Fund the contract with MORBIUS tokens (see above)");
  console.log("2. Update PLINKO_ADDRESS in lib/contracts.ts:");
  console.log(`   export const PLINKO_ADDRESS = '${addr}' as const`);
  console.log("3. Generate and update ABI in abi/plinko.ts and abi/plinko.json");
  console.log("4. Update frontend to use dropMultipleBalls(count, riskLevel)");
  console.log("5. Verify contract:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${addr} "${MORBIUS_TOKEN}" "${WPLS_TOKEN}" "${PULSEX_ROUTER}" "${MIN_WAGER}" "${MAX_WAGER}" "${PLS_TREASURY}" "${DISTRIBUTION_RECIPIENT}" "${PLATFORM_FEE_RECIPIENT}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
