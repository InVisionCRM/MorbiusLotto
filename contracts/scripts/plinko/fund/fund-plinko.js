import hre from "hardhat";

async function main() {
  console.log("Funding Plinko contract with MORBIUS tokens…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("PLS Balance:", hre.ethers.formatEther(balance), "PLS");

  // Gas config: fetch base fee and add a priority tip
  const feeData = await hre.ethers.provider.getFeeData();
  const baseFee = feeData.gasPrice ?? hre.ethers.parseUnits("1500000", "gwei");
  const maxFeePerGas = baseFee * 2n;
  const maxPriorityFeePerGas = hre.ethers.parseUnits("500000", "gwei"); // 0.5M gwei tip
  const gasOverrides = { maxFeePerGas, maxPriorityFeePerGas };
  console.log("Gas config:");
  console.log("  Base fee:", hre.ethers.formatUnits(baseFee, "gwei"), "gwei");
  console.log("  Max fee:", hre.ethers.formatUnits(maxFeePerGas, "gwei"), "gwei");
  console.log("  Priority tip:", hre.ethers.formatUnits(maxPriorityFeePerGas, "gwei"), "gwei");

  // Config - Get from command line or use defaults
  const args = process.argv.slice(2);
  const amountArg = args.find(arg => arg.startsWith('--amount='));
  const networkArg = args.find(arg => arg.startsWith('--network='));

  const PLINKO_ADDRESS = process.env.PLINKO_ADDRESS || "0xfE8D58174d26cc2C60103120cBceB8F75DfdcDaC";
  const MORBIUS_TOKEN = "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const FUNDING_AMOUNT = amountArg
    ? hre.ethers.parseEther(amountArg.split('=')[1])
    : hre.ethers.parseEther("1000000"); // Default 90,000 MORBIUS

  console.log("\nConfig:");
  console.log("PLINKO_ADDRESS    :", PLINKO_ADDRESS);
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

  // Approve MORBIUS transfer to Plinko contract
  console.log("\nApproving MORBIUS transfer…");
  const approveTx = await MORBIUS.approve(PLINKO_ADDRESS, FUNDING_AMOUNT, gasOverrides);
  await approveTx.wait();
  console.log("✅ MORBIUS approved");

  // Check contract state first
  console.log("\nChecking Plinko contract state…");
  const Plinko = await hre.ethers.getContractAt("Plinko", PLINKO_ADDRESS);

  try {
    // Check if contract exists and is accessible
    const owner = await Plinko.owner();
    console.log("Contract owner:", owner);

    const isPaused = await Plinko.paused();
    console.log("Contract paused:", isPaused);

    const currentReserve = await Plinko.getContractReserve();
    console.log("Current contract reserve:", hre.ethers.formatEther(currentReserve), "MORBIUS");

    // Check allowance
    const allowance = await MORBIUS.allowance(deployer.address, PLINKO_ADDRESS);
    console.log("Allowance for Plinko:", hre.ethers.formatEther(allowance), "MORBIUS");

    if (allowance < FUNDING_AMOUNT) {
      console.log("❌ Allowance is insufficient, re-approving…");
      const approveTx = await MORBIUS.approve(PLINKO_ADDRESS, FUNDING_AMOUNT, gasOverrides);
      await approveTx.wait();
      console.log("✅ MORBIUS re-approved");

      // Check allowance again
      const newAllowance = await MORBIUS.allowance(deployer.address, PLINKO_ADDRESS);
      console.log("New allowance:", hre.ethers.formatEther(newAllowance), "MORBIUS");
    }
  } catch (error) {
    console.log("❌ Error checking contract state:", error.message);
    console.log("This might indicate the contract address is wrong or contract is not deployed");
    process.exit(1);
  }

  // Fund the contract
  console.log("\nFunding Plinko contract…");
  const fundTx = await Plinko.fundContract(FUNDING_AMOUNT, gasOverrides);
  const receipt = await fundTx.wait();

  console.log("✅ Plinko contract funded!");
  console.log("Tx hash:", fundTx.hash);
  console.log("Block number:", receipt.blockNumber);

  // Check contract balance
  const contractReserve = await Plinko.getContractReserve();
  console.log("Contract reserve:", hre.ethers.formatEther(contractReserve), "MORBIUS");

  console.log("\n🎉 Plinko contract is now funded and ready for testing!");
  console.log("💰 Contract can now handle up to", hre.ethers.formatEther(contractReserve), "MORBIUS in payouts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
