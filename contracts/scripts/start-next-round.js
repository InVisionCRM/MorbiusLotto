const hre = require("hardhat");

const KENO_ADDRESS = "0x84E6c6192c5D72f2EC9B1bE57B8295BE6A298517";

async function main() {
  console.log("🎮 Starting new CryptoKeno round...\n");

  const [signer] = await hre.ethers.getSigners();
  console.log("Using account:", signer.address);
  console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(signer.address)), "PLS\n");

  // Get contract instance
  const keno = await hre.ethers.getContractAt("CryptoKeno", KENO_ADDRESS);

  // Check current round before
  try {
    const currentRoundId = await keno.currentRoundId();
    console.log("Current Round ID (before):", currentRoundId.toString());

    const roundDataBefore = await keno.getRound(currentRoundId);
    console.log("Current Round Start Time:", new Date(Number(roundDataBefore.startTime) * 1000).toISOString());
    console.log("Current Round End Time:", new Date(Number(roundDataBefore.endTime) * 1000).toISOString());
    console.log("Current Round State:", getStateName(roundDataBefore.state));
    console.log("---\n");
  } catch (error) {
    console.log("Could not read current round (may not exist yet)\n");
  }

  // Call startNextRound
  console.log("📞 Calling startNextRound()...");

  try {
    const tx = await keno.startNextRound({
      gasLimit: 1000000, // 1M gas should be plenty
    });

    console.log("Transaction sent:", tx.hash);
    console.log("Waiting for confirmation...\n");

    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed!");
    console.log("Block:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());
    console.log("---\n");

    // Check new round
    const newRoundId = await keno.currentRoundId();
    console.log("🎯 New Round ID:", newRoundId.toString());

    const roundDataAfter = await keno.getRound(newRoundId);
    console.log("New Round Start Time:", new Date(Number(roundDataAfter.startTime) * 1000).toISOString());
    console.log("New Round End Time:", new Date(Number(roundDataAfter.endTime) * 1000).toISOString());
    console.log("New Round State:", getStateName(roundDataAfter.state));
    console.log("New Round Duration:", (Number(roundDataAfter.endTime) - Number(roundDataAfter.startTime)) / 60, "minutes");

    const now = Math.floor(Date.now() / 1000);
    const timeUntilEnd = Number(roundDataAfter.endTime) - now;
    console.log("\n⏰ Time until round ends:", (timeUntilEnd / 60).toFixed(2), "minutes");
    console.log("\n✨ Success! The new round is now active and ready for players!");
    console.log("🌐 Check the Keno page - the timer should now show ~15:00");

  } catch (error) {
    console.error("\n❌ Error starting round:");

    if (error.message.includes("Ownable")) {
      console.error("→ You are not the contract owner!");
      console.error("→ Only the owner can start new rounds");
      console.error("→ Current signer:", signer.address);
    } else if (error.message.includes("insufficient funds")) {
      console.error("→ Insufficient PLS balance for gas");
    } else if (error.message.includes("Pausable")) {
      console.error("→ Contract is paused");
    } else {
      console.error("→", error.message);
    }

    process.exit(1);
  }
}

function getStateName(state) {
  const states = ['Pending', 'Active', 'Drawing', 'Finalized'];
  return `${state} (${states[state] || 'Unknown'})`;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
