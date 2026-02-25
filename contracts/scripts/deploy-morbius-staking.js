import hre from "hardhat";

async function main() {
  console.log("Deploying MorbiusStaking to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  const MORBIUS_TOKEN = process.env.BLACKJACK_MORBIUS_TOKEN || process.env.MORBIUS_TOKEN_ADDRESS || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const PLATFORM_FEE_WALLET = process.env.LP_STAKING_REWARD_POOL || "0x6Ae7E27CF0eE10516737D7416Ef3178Cb09d89cF";

  console.log("\nConfig:");
  console.log("MORBIUS_TOKEN:", MORBIUS_TOKEN);
  console.log("PLATFORM_FEE_WALLET:", PLATFORM_FEE_WALLET);

  const MorbiusStaking = await hre.ethers.getContractFactory("MorbiusStaking");
  console.log("\nDeploying MorbiusStaking…");
  const staking = await MorbiusStaking.deploy(MORBIUS_TOKEN, PLATFORM_FEE_WALLET);

  const deploymentTx = staking.deploymentTransaction();
  if (deploymentTx) {
    console.log("Deploy tx hash:", deploymentTx.hash);
    const receipt = await deploymentTx.wait();
    console.log("Block number:", receipt?.blockNumber?.toString?.() ?? "unknown");
  }
  const addr = await staking.getAddress();
  console.log("\nMorbiusStaking deployed at:", addr);

  console.log("\nVerify with:");
  console.log(`npx hardhat verify --network ${hre.network.name} ${addr} "${MORBIUS_TOKEN}" "${PLATFORM_FEE_WALLET}"`);

  console.log("\nPost-deployment steps:");
  console.log("1. Update MORBIUS_STAKING_ADDRESS in lib/contracts.ts");
  console.log("2. Send MORBIUS rewards to the contract address");
  console.log("3. Users approve + stake MORBIUS to earn rewards");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
