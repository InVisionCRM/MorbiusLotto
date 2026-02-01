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

  const BLACKJACK_ADDRESS = process.env.BLACKJACK_ADDRESS || "0x9A6A0f1DccF7CC4d98E2d690588e52Bb8F0A86ED"; // Deployed Blackjack contract
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

  // Check contract state first
  console.log("\nChecking Blackjack contract state…");
  const Blackjack = await hre.ethers.getContractAt("Blackjack", BLACKJACK_ADDRESS);

  try {
    // Check if contract exists and is accessible
    const owner = await Blackjack.owner();
    console.log("Contract owner:", owner);

    const isPaused = await Blackjack.paused();
    console.log("Contract paused:", isPaused);

    const currentReserve = await Blackjack.contractReserve();
    console.log("Current contract reserve:", hre.ethers.formatEther(currentReserve), "MORBIUS");

    const minBet = await Blackjack.minBetAmount();
    const maxBet = await Blackjack.maxBetAmount();
    console.log("Bet limits: min", hre.ethers.formatEther(minBet), "MORBIUS, max", hre.ethers.formatEther(maxBet), "MORBIUS");

    // Check allowance
    const allowance = await MORBIUS.allowance(deployer.address, BLACKJACK_ADDRESS);
    console.log("Allowance for Blackjack:", hre.ethers.formatEther(allowance), "MORBIUS");

    if (allowance < FUNDING_AMOUNT) {
      console.log("❌ Allowance is insufficient, re-approving…");
      const approveTx = await MORBIUS.approve(BLACKJACK_ADDRESS, FUNDING_AMOUNT);
      await approveTx.wait();
      console.log("✅ MORBIUS re-approved");

      // Check allowance again
      const newAllowance = await MORBIUS.allowance(deployer.address, BLACKJACK_ADDRESS);
      console.log("New allowance:", hre.ethers.formatEther(newAllowance), "MORBIUS");
    }
  } catch (error) {
    console.log("❌ Error checking contract state:", error.message);
    console.log("This might indicate the contract address is wrong or contract is not deployed");
    process.exit(1);
  }

  // Fund the contract by transferring MORBIUS directly
  console.log("\nFunding Blackjack contract…");
  const fundTx = await MORBIUS.transfer(BLACKJACK_ADDRESS, FUNDING_AMOUNT);
  const receipt = await fundTx.wait();

  console.log("✅ Blackjack contract funded!");
  console.log("Tx hash:", fundTx.hash);
  console.log("Block number:", receipt.blockNumber);

  // Check contract MORBIUS balance
  const contractMorbiusBalance = await MORBIUS.balanceOf(BLACKJACK_ADDRESS);
  console.log("Contract MORBIUS balance:", hre.ethers.formatEther(contractMorbiusBalance));

  // Check contract reserve (this should be updated after funding)
  try {
    const contractReserve = await Blackjack.contractReserve();
    console.log("Contract reserve:", hre.ethers.formatEther(contractReserve), "MORBIUS");
  } catch (error) {
    console.log("Note: Contract reserve may not be immediately updated until first bet");
    console.log("The contract balance shows:", hre.ethers.formatEther(contractMorbiusBalance), "MORBIUS available");
  }

  console.log("\n🎉 Blackjack contract is now funded and ready for testing!");
  console.log("💰 Contract has", hre.ethers.formatEther(contractMorbiusBalance), "MORBIUS available for payouts");

  // Blackjack specific information
  console.log("\n🃏 BLACKJACK CONTRACT INFO:");
  console.log("- 6 decks (312 cards total)");
  console.log("- 3:2 blackjack payout");
  console.log("- Dealer hits on soft 17");
  console.log("- Provably fair with HMAC-SHA256");
  console.log("- Fee Distribution: 10% burn, 90% distribution pool");

  try {
    const totalGames = await Blackjack.totalGames();
    const totalVolume = await Blackjack.totalVolume();
    const totalPayouts = await Blackjack.totalPayouts();
    const serverSeedHash = await Blackjack.serverSeedHash();

    console.log("\n📊 Contract Statistics:");
    console.log("- Total games played:", totalGames.toString());
    console.log("- Total volume:", hre.ethers.formatEther(totalVolume), "MORBIUS");
    console.log("- Total payouts:", hre.ethers.formatEther(totalPayouts), "MORBIUS");
    console.log("- Server seed hash:", serverSeedHash);
  } catch (error) {
    console.log("Note: Could not read contract statistics (this is normal for a new contract)");
  }

  console.log("\n🎮 TESTING:");
  console.log("Test with small bets first to ensure proper payouts.");
  console.log("Verify provably fair shuffling works correctly.");
  console.log("Test both MORBIUS and PLS payments.");
  console.log("Confirm 3:2 blackjack payouts and proper fee distribution.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});