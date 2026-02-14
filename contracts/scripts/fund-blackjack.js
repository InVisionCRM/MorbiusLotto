import hre from "hardhat";

async function main() {
  console.log("Funding Blackjack contract with MORBIUS tokens…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("PLS Balance:", hre.ethers.formatEther(balance), "PLS");

  // Config - Get from command line or use defaults
  const args = process.argv.slice(2);
  const amountArg = args.find(arg => arg.startsWith('--amount='));

  const BLACKJACK_ADDRESS = process.env.BLACKJACK_ADDRESS || "0xFCE49ab8b53366C397A0205c4c0CF42aE2B658A8"; // BlackjackV2
  const MORBIUS_TOKEN = "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const FUNDING_AMOUNT = amountArg
    ? hre.ethers.parseEther(amountArg.split('=')[1])
    : hre.ethers.parseEther("10000"); // Default 10,000 MORBIUS

  console.log("\nConfig:");
  console.log("BLACKJACK_ADDRESS :", BLACKJACK_ADDRESS);
  console.log("MORBIUS_TOKEN     :", MORBIUS_TOKEN);
  console.log("FUNDING_AMOUNT    :", hre.ethers.formatEther(FUNDING_AMOUNT), "MORBIUS");

  // Validate contract address
  if (BLACKJACK_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.log("\n❌ ERROR: Blackjack contract address not set!");
    console.log("Please update BLACKJACK_ADDRESS in this script after deploying the contract.");
    console.log("You can find the deployed address in the deploy script output.");
    process.exit(1);
  }

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

  // Approve MORBIUS transfer to Blackjack contract
  console.log("\nApproving MORBIUS transfer…");
  const approveTx = await MORBIUS.approve(BLACKJACK_ADDRESS, FUNDING_AMOUNT);
  await approveTx.wait();
  console.log("✅ MORBIUS approved");

  // Check contract state (BlackjackV2: totalReserves; V1: contractReserve)
  console.log("\nChecking Blackjack contract state…");
  let totalReserves = 0n;
  try {
    const BlackjackV2 = await hre.ethers.getContractAt("BlackjackV2", BLACKJACK_ADDRESS);
    const owner = await BlackjackV2.owner();
    console.log("Contract owner:", owner);
    const isPaused = await BlackjackV2.paused();
    console.log("Contract paused:", isPaused);
    totalReserves = await BlackjackV2.totalReserves();
    console.log("Total reserves (player balances):", hre.ethers.formatEther(totalReserves), "MORBIUS");
  } catch (e) {
    try {
      const Blackjack = await hre.ethers.getContractAt("Blackjack", BLACKJACK_ADDRESS);
      const owner = await Blackjack.owner();
      console.log("Contract owner:", owner);
      totalReserves = await Blackjack.contractReserve?.() ?? 0n;
      console.log("Contract reserve:", hre.ethers.formatEther(totalReserves), "MORBIUS");
    } catch (err) {
      console.log("❌ Error reading contract:", err.message);
      process.exit(1);
    }
  }

  const allowance = await MORBIUS.allowance(deployer.address, BLACKJACK_ADDRESS);
  console.log("Allowance for Blackjack:", hre.ethers.formatEther(allowance), "MORBIUS");
  if (allowance < FUNDING_AMOUNT) {
    console.log("Re-approving…");
    await (await MORBIUS.approve(BLACKJACK_ADDRESS, FUNDING_AMOUNT)).wait();
    console.log("✅ MORBIUS re-approved");
  }

  // Fund the contract by transferring MORBIUS directly
  console.log("\nFunding Blackjack contract…");
  const fundTx = await MORBIUS.transfer(BLACKJACK_ADDRESS, FUNDING_AMOUNT);
  const receipt = await fundTx.wait();

  console.log("✅ Blackjack contract funded!");
  console.log("Tx hash:", fundTx.hash);
  console.log("Block number:", receipt.blockNumber);

  const contractMorbiusBalance = await MORBIUS.balanceOf(BLACKJACK_ADDRESS);
  console.log("Contract MORBIUS balance:", hre.ethers.formatEther(contractMorbiusBalance), "MORBIUS");

  console.log("\n🎉 Blackjack contract funded!");
  console.log("💰 Contract has", hre.ethers.formatEther(contractMorbiusBalance), "MORBIUS available for payouts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});