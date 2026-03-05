import hre from "hardhat";

async function main() {
  console.log("Deploying MorbiusLPStaking to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  // Morbius/WPLS PulseX V1 LP token (pair contract = LP token on Uniswap V2 forks)
  const PLP_TOKEN = "0x81acd0AA872675678A25fbB154992A2baD4F6CEF";
  const MORBIUS_TOKEN = process.env.BLACKJACK_MORBIUS_TOKEN || process.env.MORBIUS_TOKEN_ADDRESS || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";

  console.log("\nConfig:");
  console.log("PLP_TOKEN (Morbius/WPLS LP):", PLP_TOKEN);
  console.log("MORBIUS_TOKEN:", MORBIUS_TOKEN);

  const MorbiusLPStaking = await hre.ethers.getContractFactory("MorbiusLPStaking");
  console.log("\nDeploying MorbiusLPStaking…");
  const staking = await MorbiusLPStaking.deploy(PLP_TOKEN, MORBIUS_TOKEN);

  const deploymentTx = staking.deploymentTransaction();
  if (deploymentTx) {
    console.log("Deploy tx hash:", deploymentTx.hash);
    const receipt = await deploymentTx.wait();
    console.log("Block number:", receipt?.blockNumber?.toString?.() ?? "unknown");
  }
  const addr = await staking.getAddress();
  console.log("\nMorbiusLPStaking deployed at:", addr);

  console.log("\nVerify with:");
  console.log(`npx hardhat verify --network ${hre.network.name} ${addr} "${PLP_TOKEN}" "${MORBIUS_TOKEN}"`);

  console.log("\nPost-deployment steps:");
  console.log("1. Update MORBIUS_LP_STAKING_ADDRESS in lib/contracts.ts");
  console.log("2. Send MORBIUS rewards to the contract address");
  console.log("3. Users approve PLP token + stake to earn MORBIUS rewards");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
