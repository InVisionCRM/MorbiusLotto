import hre from "hardhat";

async function main() {
  console.log("Deploying CryptoKeno (Quick Play) to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  // Config (env overrides)
  const TOKEN_ADDRESS = process.env.KENO_TOKEN_ADDRESS || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const MAX_SPOT = parseInt(process.env.KENO_MAX_SPOT || "10", 10);
  const WPLS_ADDRESS = process.env.KENO_WPLS_ADDRESS || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
  const ROUTER_ADDRESS = process.env.KENO_ROUTER_ADDRESS || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";
  const PLS_TREASURY = process.env.PLS_TREASURY;
  const DISTRIBUTION_RECIPIENT = process.env.DISTRIBUTION_RECIPIENT;
  const BURN_ADDRESS = process.env.BURN_ADDRESS || "0x000000000000000000000000000000000000dEaD";
  const PLATFORM_FEE_RECIPIENT = process.env.PLATFORM_FEE_RECIPIENT;
  const LP_DISTRIBUTION_RECIPIENT = process.env.LP_DISTRIBUTION_RECIPIENT;

  if (!PLS_TREASURY) {
    throw new Error("PLS_TREASURY is not set in .env — set it to the wallet that receives PLS and holds MORBIUS for PLS-purchased games");
  }
  if (!DISTRIBUTION_RECIPIENT) {
    throw new Error("DISTRIBUTION_RECIPIENT is not set in .env — set it to the wallet that receives the 1.25% MORBIUS holder distribution fee on payouts");
  }
  if (!PLATFORM_FEE_RECIPIENT) {
    throw new Error("PLATFORM_FEE_RECIPIENT is not set in .env — set it to the wallet that receives the 1.75% platform fee on payouts");
  }
  if (!LP_DISTRIBUTION_RECIPIENT) {
    throw new Error("LP_DISTRIBUTION_RECIPIENT is not set in .env — set it to the contract/wallet that receives the 1.5% LP holder distribution fee on payouts");
  }

  console.log("\nConfig:");
  console.log("TOKEN_ADDRESS             :", TOKEN_ADDRESS);
  console.log("MAX_SPOT                  :", MAX_SPOT);
  console.log("WPLS_ADDRESS              :", WPLS_ADDRESS);
  console.log("ROUTER_ADDRESS            :", ROUTER_ADDRESS);
  console.log("PLS_TREASURY              :", PLS_TREASURY);
  console.log("DISTRIBUTION_RECIPIENT    :", DISTRIBUTION_RECIPIENT, "(1.25% MORBIUS holders fee)");
  console.log("BURN_ADDRESS              :", BURN_ADDRESS, "(0.5% burn fee)");
  console.log("PLATFORM_FEE_RECIPIENT    :", PLATFORM_FEE_RECIPIENT, "(1.75% platform fee)");
  console.log("LP_DISTRIBUTION_RECIPIENT :", LP_DISTRIBUTION_RECIPIENT, "(1.5% LP holders fee)");
  console.log("MAX_WAGER_PER_DRAW        : 100,000 MORBIUS (set in constructor)");

  const CryptoKeno = await hre.ethers.getContractFactory("CryptoKeno");
  console.log("\nDeploying…");

  // Gas config: fetch base fee and add a priority tip
  const feeData = await hre.ethers.provider.getFeeData();
  const baseFee = feeData.gasPrice ?? hre.ethers.parseUnits("1500000", "gwei");
  const maxFeePerGas = baseFee * 2n;
  const maxPriorityFeePerGas = hre.ethers.parseUnits("500000", "gwei"); // 0.5M gwei tip
  console.log("Gas config:");
  console.log("  Base fee:", hre.ethers.formatUnits(baseFee, "gwei"), "gwei");
  console.log("  Max fee:", hre.ethers.formatUnits(maxFeePerGas, "gwei"), "gwei");
  console.log("  Priority tip:", hre.ethers.formatUnits(maxPriorityFeePerGas, "gwei"), "gwei");

  const overrides = { gasLimit: 6000000, maxFeePerGas, maxPriorityFeePerGas };
  // Optional: pass DEPLOY_NONCE=<n> env var to replace a stuck TX at that nonce
  if (process.env.DEPLOY_NONCE) {
    overrides.nonce = parseInt(process.env.DEPLOY_NONCE, 10);
    console.log("Using nonce override:", overrides.nonce);
  }

  const keno = await CryptoKeno.deploy(
    TOKEN_ADDRESS,
    MAX_SPOT,
    WPLS_ADDRESS,
    ROUTER_ADDRESS,
    PLS_TREASURY,
    DISTRIBUTION_RECIPIENT,
    BURN_ADDRESS,
    PLATFORM_FEE_RECIPIENT,
    LP_DISTRIBUTION_RECIPIENT,
    overrides
  );

  const deploymentTx = keno.deploymentTransaction();
  console.log("Deploy tx hash:", deploymentTx?.hash);
  const receipt = await keno.deploymentTransaction().wait();
  const addr = await keno.getAddress();
  console.log("\n✅ CryptoKeno (Quick Play) deployed at:", addr);
  console.log("Tx hash:", deploymentTx?.hash);
  console.log("Block number:", receipt?.blockNumber?.toString?.() ?? "unknown");

  console.log("\n⚠️  IMPORTANT - Fund the Contract:");
  console.log("The contract needs initial liquidity to pay winners. Call fundContract(amount) on the contract.");
  console.log("Recommended initial funding: 100,000+ MORBIUS");

  console.log("\n✅ Next steps:");
  console.log("1. Fund the contract with MORBIUS tokens (call fundContract)");
  console.log("2. Update KENO_ADDRESS in lib/contracts.ts:");
  console.log(`   export const KENO_ADDRESS = '${addr}' as const`);
  console.log("3. Generate and update ABI in abi/");
  console.log("4. Verify contract:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${addr} "${TOKEN_ADDRESS}" ${MAX_SPOT} "${WPLS_ADDRESS}" "${ROUTER_ADDRESS}" "${PLS_TREASURY}" "${DISTRIBUTION_RECIPIENT}" "${BURN_ADDRESS}" "${PLATFORM_FEE_RECIPIENT}" "${LP_DISTRIBUTION_RECIPIENT}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
