import hre from "hardhat";

async function main() {
  console.log("Setting Plinko max wager to 1000 MORBIUS…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("PLS Balance:", hre.ethers.formatEther(balance), "PLS");

  // Config
  const PLINKO_ADDRESS = "0x37B1db8F06870BFFeFed862C06535BEFc4383ff8"; // Latest deployment

  // 1000 MORBIUS in wei (18 decimals)
  const NEW_MAX_WAGER = hre.ethers.parseEther("1000");

  console.log("\nConfig:");
  console.log("PLINKO_ADDRESS    :", PLINKO_ADDRESS);
  console.log("NEW_MAX_WAGER     :", hre.ethers.formatEther(NEW_MAX_WAGER), "MORBIUS");

  // Get Plinko contract
  const Plinko = await hre.ethers.getContractAt("Plinko", PLINKO_ADDRESS);

  try {
    // Check current values
    console.log("\nChecking current wager limits…");
    const [minWager, maxWager] = await Plinko.getWagerLimits();
    console.log("Current min wager:", hre.ethers.formatEther(minWager), "MORBIUS");
    console.log("Current max wager:", hre.ethers.formatEther(maxWager), "MORBIUS");

    // Check if caller is owner
    const owner = await Plinko.owner();
    console.log("Contract owner:", owner);

    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      console.log("❌ You are not the contract owner!");
      console.log("Owner:", owner);
      console.log("You:  ", deployer.address);
      process.exit(1);
    }

    // Validate new max is > current min
    if (NEW_MAX_WAGER <= minWager) {
      console.log("❌ New max wager must be greater than current min wager!");
      console.log("Current min:", hre.ethers.formatEther(minWager), "MORBIUS");
      console.log("New max:   ", hre.ethers.formatEther(NEW_MAX_WAGER), "MORBIUS");
      process.exit(1);
    }

  } catch (error) {
    console.log("❌ Error checking contract state:", error.message);
    console.log("This might indicate the contract address is wrong or contract is not deployed");
    process.exit(1);
  }

  // Set new max wager
  console.log("\nSetting new max wager…");
  try {
    const tx = await Plinko.setMaxWager(NEW_MAX_WAGER);
    const receipt = await tx.wait();

    console.log("✅ Max wager updated!");
    console.log("Tx hash:", tx.hash);
    console.log("Block number:", receipt.blockNumber);

    // Verify the change
    const [newMinWager, newMaxWager] = await Plinko.getWagerLimits();
    console.log("\nVerification:");
    console.log("New min wager:", hre.ethers.formatEther(newMinWager), "MORBIUS");
    console.log("New max wager:", hre.ethers.formatEther(newMaxWager), "MORBIUS");

    if (newMaxWager.toString() === NEW_MAX_WAGER.toString()) {
      console.log("\n🎉 Max wager successfully set to 1000 MORBIUS!");
    } else {
      console.log("\n❌ Verification failed - max wager not updated correctly");
    }

  } catch (error) {
    console.log("❌ Error setting max wager:", error.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});