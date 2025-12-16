const hre = require("hardhat");

async function main() {
  console.log("Deploying CryptoKeno to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  // Config (env overrides). WPLS default for PulseChain.
  const TOKEN_ADDRESS = process.env.KENO_TOKEN_ADDRESS || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const MAX_SPOT = parseInt(process.env.KENO_MAX_SPOT || "10", 10);
  const ROUND_DURATION = parseInt(process.env.KENO_ROUND_DURATION || "180", 10); // constructor currently sets 180s; kept for signature compatibility
  const FEE_BPS = parseInt(process.env.KENO_FEE_BPS || "0", 10);
  const FEE_RECIPIENT = process.env.KENO_FEE_RECIPIENT || deployer.address;
  const PROGRESSIVE_BASE_SEED = 0; // ignored by contract, placeholder for signature compatibility
  const WPLS_ADDRESS = process.env.KENO_WPLS_ADDRESS || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
  const ROUTER_ADDRESS = process.env.KENO_ROUTER_ADDRESS || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";

  console.log("\nConfig:");
  console.log("TOKEN_ADDRESS       :", TOKEN_ADDRESS);
  console.log("MAX_SPOT            :", MAX_SPOT);
  console.log("ROUND_DURATION(arg) :", ROUND_DURATION, "(constructor default 180 seconds)");
  console.log("FEE_BPS             :", FEE_BPS);
  console.log("FEE_RECIPIENT       :", FEE_RECIPIENT);
  console.log("MAX_WAGER_PER_DRAW  : 0.01 (hardcoded in contract, 18-dec token assumed)");
  console.log("WPLS_ADDRESS        :", WPLS_ADDRESS);
  console.log("ROUTER_ADDRESS      :", ROUTER_ADDRESS);

  const CryptoKeno = await hre.ethers.getContractFactory("CryptoKeno");
  console.log("\nDeploying…");
  const gasPrice = hre.ethers.parseUnits("400000", "gwei");
  const keno = await CryptoKeno.deploy(
    TOKEN_ADDRESS,
    MAX_SPOT,
    ROUND_DURATION,
    FEE_BPS,
    FEE_RECIPIENT,
    PROGRESSIVE_BASE_SEED,
    WPLS_ADDRESS,
    ROUTER_ADDRESS,
    {
      // Higher limit to avoid constructor OOG on mainnet RPCs
      gasLimit: 10_000_000,
      gasPrice,
    }
  );

  const deploymentTx = keno.deploymentTransaction();
  console.log("Deploy tx hash:", deploymentTx?.hash);
  const receipt = await keno.deploymentTransaction().wait();
  const addr = await keno.getAddress();
  console.log("\n✅ CryptoKeno deployed at:", addr);
  console.log("Tx hash:", deploymentTx?.hash);
  console.log("Block number:", receipt?.blockNumber?.toString?.() ?? "unknown");

  console.log("\nNext steps:");
  console.log("- Fund the contract with WPLS to cover payouts (top multiplier 100,000× wager).");
  console.log("- Optionally call setMaxWagerPerDraw if you want a different cap than 0.01.");
  console.log("- Verify:");
  console.log(`  npx hardhat verify --network ${hre.network.name} ${addr} "${TOKEN_ADDRESS}" ${MAX_SPOT} ${ROUND_DURATION} ${FEE_BPS} "${FEE_RECIPIENT}" ${PROGRESSIVE_BASE_SEED}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
