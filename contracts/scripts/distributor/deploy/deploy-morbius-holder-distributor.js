import hre from "hardhat";

async function main() {
  console.log("Deploying MorbiusHolderDistributor to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  const MORBIUS_TOKEN = process.env.BLACKJACK_MORBIUS_TOKEN || process.env.MORBIUS_TOKEN_ADDRESS || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";

  console.log("\nConfig (burn/LP/excluded contracts are hardcoded in contract):");
  console.log("MORBIUS_TOKEN      :", MORBIUS_TOKEN);

  const MorbiusHolderDistributor = await hre.ethers.getContractFactory("MorbiusHolderDistributor");
  console.log("\nDeploying MorbiusHolderDistributor…");
  const distributor = await MorbiusHolderDistributor.deploy(MORBIUS_TOKEN);

  const deploymentTx = distributor.deploymentTransaction();
  if (deploymentTx) {
    console.log("Deploy tx hash:", deploymentTx.hash);
    const receipt = await deploymentTx.wait();
    console.log("Block number:", receipt?.blockNumber?.toString?.() ?? "unknown");
  }
  const addr = await distributor.getAddress();
  console.log("\nMorbiusHolderDistributor deployed at:", addr);

  console.log("\nVerify with:");
  console.log(`npx hardhat verify --network ${hre.network.name} ${addr} "${MORBIUS_TOKEN}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
