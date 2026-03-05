import hre from "hardhat";

async function main() {
  console.log("Deploying KenoStats to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  const KENO_ADDRESS = process.env.KENO_ADDRESS || "0x734A1460b4131F8cFE4950894Be89d1a852c957A";

  console.log("\nConfig:");
  console.log("KENO_ADDRESS:", KENO_ADDRESS);

  const KenoStats = await hre.ethers.getContractFactory("KenoStats");
  console.log("\nDeploying KenoStats...");
  const gasPrice = hre.ethers.parseUnits("400000", "gwei");
  const kenoStats = await KenoStats.deploy(KENO_ADDRESS, {
    gasLimit: 10000000,
    gasPrice,
  });

  const deploymentTx = kenoStats.deploymentTransaction();
  console.log("Deploy tx hash:", deploymentTx?.hash);
  const receipt = await kenoStats.deploymentTransaction().wait();
  const addr = await kenoStats.getAddress();
  console.log("\n✅ KenoStats deployed at:", addr);
  console.log("Tx hash:", deploymentTx?.hash);
  console.log("Block number:", receipt?.blockNumber?.toString?.() ?? "unknown");

  console.log("\nVerify:");
  console.log(`  npx hardhat verify --network ${hre.network.name} ${addr} "${KENO_ADDRESS}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
