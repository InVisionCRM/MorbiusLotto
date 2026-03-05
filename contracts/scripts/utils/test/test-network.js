const hre = require("hardhat");

async function main() {
  console.log("Testing PulseChain network connection...\n");

  try {
    // Test 1: Get network info
    const network = await hre.ethers.provider.getNetwork();
    console.log("✅ Network connected:");
    console.log("   Chain ID:", network.chainId.toString());
    console.log("   Name:", network.name);

    // Test 2: Get block number
    const blockNumber = await hre.ethers.provider.getBlockNumber();
    console.log("\n✅ Current block number:", blockNumber);

    // Test 3: Get signer
    const [signer] = await hre.ethers.getSigners();
    console.log("\n✅ Signer loaded:");
    console.log("   Address:", signer.address);

    // Test 4: Get balance
    const balance = await hre.ethers.provider.getBalance(signer.address);
    console.log("   Balance:", hre.ethers.formatEther(balance), "PLS");

    // Test 5: Estimate gas for a simple transaction
    console.log("\n✅ Testing gas estimation...");
    const gasPrice = await hre.ethers.provider.getFeeData();
    console.log("   Gas Price:", hre.ethers.formatUnits(gasPrice.gasPrice || 0n, "gwei"), "gwei");
    console.log("   Max Fee:", hre.ethers.formatUnits(gasPrice.maxFeePerGas || 0n, "gwei"), "gwei");

    console.log("\n✅ All network tests passed! Network is operational.");

  } catch (error) {
    console.error("\n❌ Network test failed:");
    console.error(error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
