const hre = require("hardhat");

async function main() {
  try {
    console.log("=== VERBOSE DEPLOYMENT TEST ===\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer:", deployer.address);

    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Balance:", hre.ethers.formatEther(balance), "PLS\n");

    const PSSH_TOKEN_ADDRESS = "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
    const WPLS_TOKEN_ADDRESS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
    const PULSEX_ROUTER_ADDRESS = "0x165C3410fC91EF562C50559f7d2289fEbed552d9";
    const ROUND_DURATION = 300;
    const MEGA_MORBIUS_INTERVAL = 5;

    console.log("Getting contract factory...");
    const SuperStakeLottery6of55 = await hre.ethers.getContractFactory(
      "contracts/SuperStakeLottery6of55V2.sol:SuperStakeLottery6of55"
    );
    console.log("✓ Contract factory loaded\n");

    console.log("Estimating gas...");
    const deployTx = await SuperStakeLottery6of55.getDeployTransaction(
      PSSH_TOKEN_ADDRESS,
      WPLS_TOKEN_ADDRESS,
      PULSEX_ROUTER_ADDRESS,
      ROUND_DURATION,
      MEGA_MORBIUS_INTERVAL
    );

    try {
      const gasEstimate = await deployer.estimateGas(deployTx);
      console.log("✓ Gas estimate:", gasEstimate.toString());
    } catch (gasError) {
      console.log("✗ Gas estimation failed:");
      console.log(gasError.message);
      if (gasError.data) {
        console.log("Error data:", gasError.data);
      }
      throw gasError;
    }

    console.log("\nGetting fee data...");
    const feeData = await hre.ethers.provider.getFeeData();
    const gasPrice = feeData.gasPrice || hre.ethers.parseUnits("50", "gwei");
    console.log("Gas price:", hre.ethers.formatUnits(gasPrice, "gwei"), "Gwei\n");

    const gasCost = 8_000_000n * gasPrice;
    console.log("Max deployment cost:", hre.ethers.formatEther(gasCost), "PLS");
    console.log("Can afford:", balance > gasCost ? "YES ✅" : "NO ❌\n");

    if (balance <= gasCost) {
      throw new Error("Insufficient balance for deployment");
    }

    console.log("Deploying contract...");
    const lottery = await SuperStakeLottery6of55.deploy(
      PSSH_TOKEN_ADDRESS,
      WPLS_TOKEN_ADDRESS,
      PULSEX_ROUTER_ADDRESS,
      ROUND_DURATION,
      MEGA_MORBIUS_INTERVAL,
      {
        gasLimit: 8_000_000,
        gasPrice: gasPrice,
      }
    );

    console.log("Waiting for deployment...");
    const receipt = await lottery.deploymentTransaction().wait();
    const address = await lottery.getAddress();

    console.log("\n✅ SUCCESS!");
    console.log("Contract address:", address);
    console.log("Block:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());

  } catch (error) {
    console.error("\n❌ DEPLOYMENT FAILED:");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);

    if (error.code) console.error("Error code:", error.code);
    if (error.reason) console.error("Reason:", error.reason);
    if (error.data) console.error("Data:", error.data);
    if (error.transaction) console.error("Transaction:", JSON.stringify(error.transaction, null, 2));

    console.error("\nFull error:");
    console.error(error);

    process.exit(1);
  }
}

main();
