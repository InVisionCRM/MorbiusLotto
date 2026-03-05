import hre from "hardhat";

async function main() {
  console.log("Funding Big Wheel contract with MORBIUS tokens…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("PLS Balance:", hre.ethers.formatEther(balance), "PLS");

  // Config - Get from command line or use defaults
  const args = process.argv.slice(2);
  const amountArg = args.find(arg => arg.startsWith('--amount='));

  const BIGWHEEL_ADDRESS = "0x53331B63ef24904Ea470Cf07b924c7C13A699d8F"; // Latest deployment
  const MORBIUS_TOKEN = "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const FUNDING_AMOUNT = amountArg
    ? hre.ethers.parseEther(amountArg.split('=')[1])
    : hre.ethers.parseEther("10000"); // Default 10,000 MORBIUS

  console.log("\nConfig:");
  console.log("BIGWHEEL_ADDRESS  :", BIGWHEEL_ADDRESS);
  console.log("MORBIUS_TOKEN     :", MORBIUS_TOKEN);
  console.log("FUNDING_AMOUNT    :", hre.ethers.formatEther(FUNDING_AMOUNT), "MORBIUS");

  // Get MORBIUS contract
  const MORBIUS = await hre.ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", MORBIUS_TOKEN);

  // Check MORBIUS balance
  const morbiusBalance = await MORBIUS.balanceOf(deployer.address);
  console.log("Your MORBIUS balance:", hre.ethers.formatEther(morbiusBalance));

  if (morbiusBalance < FUNDING_AMOUNT) {
    console.log("\n❌ Insufficient MORBIUS balance!");
    console.log("Required:", hre.ethers.formatEther(FUNDING_AMOUNT));
    console.log("Available:", hre.ethers.formatEther(morbiusBalance));
    process.exit(1);
  }

  // Approve MORBIUS transfer to Big Wheel contract
  console.log("\nApproving MORBIUS transfer…");
  const approveTx = await MORBIUS.approve(BIGWHEEL_ADDRESS, FUNDING_AMOUNT);
  await approveTx.wait();
  console.log("✅ MORBIUS approved");

  // Check contract state first
  console.log("\nChecking Big Wheel contract state…");
  const BigWheel = await hre.ethers.getContractAt("BigWheel", BIGWHEEL_ADDRESS);

  try {
    // Check if contract exists and is accessible
    const owner = await BigWheel.owner();
    console.log("Contract owner:", owner);

    const isPaused = await BigWheel.paused();
    console.log("Contract paused:", isPaused);

    const currentReserve = await BigWheel.contractReserve();
    console.log("Current contract reserve:", hre.ethers.formatEther(currentReserve), "MORBIUS");

    // Check allowance
    const allowance = await MORBIUS.allowance(deployer.address, BIGWHEEL_ADDRESS);
    console.log("Allowance for Big Wheel:", hre.ethers.formatEther(allowance), "MORBIUS");

    if (allowance < FUNDING_AMOUNT) {
      console.log("❌ Allowance is insufficient, re-approving…");
      const approveTx = await MORBIUS.approve(BIGWHEEL_ADDRESS, FUNDING_AMOUNT);
      await approveTx.wait();
      console.log("✅ MORBIUS re-approved");

      // Check allowance again
      const newAllowance = await MORBIUS.allowance(deployer.address, BIGWHEEL_ADDRESS);
      console.log("New allowance:", hre.ethers.formatEther(newAllowance), "MORBIUS");
    }
  } catch (error) {
    console.log("❌ Error checking contract state:", error.message);
    console.log("This might indicate the contract address is wrong or contract is not deployed");
    process.exit(1);
  }

  // Fund the contract by transferring MORBIUS directly
  console.log("\nFunding Big Wheel contract…");
  const fundTx = await MORBIUS.transfer(BIGWHEEL_ADDRESS, FUNDING_AMOUNT);
  const receipt = await fundTx.wait();

  console.log("✅ Big Wheel contract funded!");
  console.log("Tx hash:", fundTx.hash);
  console.log("Block number:", receipt.blockNumber);

  // Check contract MORBIUS balance
  const contractMorbiusBalance = await MORBIUS.balanceOf(BIGWHEEL_ADDRESS);
  console.log("Contract MORBIUS balance:", hre.ethers.formatEther(contractMorbiusBalance));

  // Check contract reserve (this should be updated after funding)
  try {
    const contractReserve = await BigWheel.contractReserve();
    console.log("Contract reserve:", hre.ethers.formatEther(contractReserve), "MORBIUS");
  } catch (error) {
    console.log("Note: Contract reserve may not be immediately updated until first bet");
    console.log("The contract balance shows:", hre.ethers.formatEther(contractMorbiusBalance), "MORBIUS available");
  }

  console.log("\n🎉 Big Wheel contract is now funded and ready for testing!");
  console.log("💰 Contract has", hre.ethers.formatEther(contractMorbiusBalance), "MORBIUS available for payouts");
  console.log("\n🎰 SEGMENT DISTRIBUTION (7 total, proportional size):");

  try {
    const counts = await BigWheel.getSegmentCounts();
    const betTypes = ["ONE (1x)", "TWO (2x)", "FIVE (5x)", "TEN (10x)", "TWENTY (20x)", "JOKER (40x)", "MORBIUS (40x)"];
    const wheelPercentages = [44.4, 27.8, 13.0, 7.4, 3.7, 1.9, 1.9]; // Based on original 54-segment distribution

    for (let i = 0; i < counts.length; i++) {
      console.log(`  ${betTypes[i]}: ${counts[i]} segment (${wheelPercentages[i]}% of wheel)`);
    }
  } catch (error) {
    console.log("❌ Could not get segment distribution:", error.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});