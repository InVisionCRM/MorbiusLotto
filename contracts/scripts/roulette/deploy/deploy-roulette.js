import hre from "hardhat";

async function main() {
  console.log("Deploying Roulette (European single-zero) to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  // Config (env overrides)
  const TOKEN_ADDRESS         = process.env.ROULETTE_TOKEN_ADDRESS    || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const WPLS_ADDRESS          = process.env.ROULETTE_WPLS_ADDRESS     || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
  const ROUTER_ADDRESS        = process.env.ROULETTE_ROUTER_ADDRESS   || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";
  const PLS_TREASURY          = process.env.PLS_TREASURY;
  const DISTRIBUTION_RECIPIENT    = process.env.DISTRIBUTION_RECIPIENT;
  const BURN_ADDRESS              = process.env.BURN_ADDRESS || "0x000000000000000000000000000000000000dEaD";
  const PLATFORM_FEE_RECIPIENT    = process.env.PLATFORM_FEE_RECIPIENT;
  const LP_DISTRIBUTION_RECIPIENT = process.env.LP_DISTRIBUTION_RECIPIENT;

  if (!PLS_TREASURY)           throw new Error("PLS_TREASURY env var required");
  if (!DISTRIBUTION_RECIPIENT) throw new Error("DISTRIBUTION_RECIPIENT env var required");
  if (!PLATFORM_FEE_RECIPIENT) throw new Error("PLATFORM_FEE_RECIPIENT env var required");
  if (!LP_DISTRIBUTION_RECIPIENT) throw new Error("LP_DISTRIBUTION_RECIPIENT env var required");

  console.log("\nConfig:");
  console.log("TOKEN_ADDRESS             :", TOKEN_ADDRESS);
  console.log("WPLS_ADDRESS              :", WPLS_ADDRESS);
  console.log("ROUTER_ADDRESS            :", ROUTER_ADDRESS);
  console.log("PLS_TREASURY              :", PLS_TREASURY);
  console.log("DISTRIBUTION_RECIPIENT    :", DISTRIBUTION_RECIPIENT, "(1.25% MORBIUS holders fee)");
  console.log("BURN_ADDRESS              :", BURN_ADDRESS, "(0.5% burn fee)");
  console.log("PLATFORM_FEE_RECIPIENT    :", PLATFORM_FEE_RECIPIENT, "(1.75% platform fee)");
  console.log("LP_DISTRIBUTION_RECIPIENT :", LP_DISTRIBUTION_RECIPIENT, "(1.5% LP holders fee)");
  console.log("MAX_BET_PER_SPIN          : 500,000 MORBIUS (set in constructor)");

  const Roulette = await hre.ethers.getContractFactory("Roulette");
  console.log("\nDeploying…");

  const feeData = await hre.ethers.provider.getFeeData();
  const baseFee = feeData.gasPrice ?? hre.ethers.parseUnits("1500000", "gwei");
  // Use baseFee + 20% buffer rather than 2x to keep cost down
  const maxFeePerGas = (baseFee * 12n) / 10n;
  const maxPriorityFeePerGas = hre.ethers.parseUnits("100000", "gwei");
  console.log("Gas config:");
  console.log("  Base fee     :", hre.ethers.formatUnits(baseFee, "gwei"), "gwei");
  console.log("  Max fee      :", hre.ethers.formatUnits(maxFeePerGas, "gwei"), "gwei");
  console.log("  Priority tip :", hre.ethers.formatUnits(maxPriorityFeePerGas, "gwei"), "gwei");

  const overrides = { gasLimit: 3_500_000, maxFeePerGas, maxPriorityFeePerGas };
  if (process.env.DEPLOY_NONCE) {
    overrides.nonce = parseInt(process.env.DEPLOY_NONCE, 10);
    console.log("Using nonce override:", overrides.nonce);
  }

  const roulette = await Roulette.deploy(
    TOKEN_ADDRESS,
    WPLS_ADDRESS,
    ROUTER_ADDRESS,
    PLS_TREASURY,
    DISTRIBUTION_RECIPIENT,
    BURN_ADDRESS,
    PLATFORM_FEE_RECIPIENT,
    LP_DISTRIBUTION_RECIPIENT,
    overrides
  );

  const deploymentTx = roulette.deploymentTransaction();
  console.log("Deploy tx hash:", deploymentTx?.hash);
  const receipt = await deploymentTx.wait();
  const addr = await roulette.getAddress();

  console.log("\n✅ Roulette deployed at:", addr);
  console.log("Tx hash     :", deploymentTx?.hash);
  console.log("Block number:", receipt?.blockNumber?.toString?.() ?? "unknown");

  console.log("\n⚠️  IMPORTANT — update the following after deployment:");
  console.log("1. Update ROULETTE_ADDRESS in lib/contracts.ts:");
  console.log(`   export const ROULETTE_ADDRESS = '${addr}' as const`);
  console.log("2. Update ROULETTE_DEPLOY_BLOCK in lib/contracts.ts:");
  console.log(`   export const ROULETTE_DEPLOY_BLOCK = ${receipt?.blockNumber}`);
  console.log("3. Fund the contract reserve with MORBIUS (call fund(amount))");
  console.log("4. Verify contract:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${addr} "${TOKEN_ADDRESS}" "${WPLS_ADDRESS}" "${ROUTER_ADDRESS}" "${PLS_TREASURY}" "${DISTRIBUTION_RECIPIENT}" "${BURN_ADDRESS}" "${PLATFORM_FEE_RECIPIENT}" "${LP_DISTRIBUTION_RECIPIENT}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
