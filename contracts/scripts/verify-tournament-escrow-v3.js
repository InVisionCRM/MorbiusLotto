/**
 * Verify TournamentPrizeEscrowV3 on PulseScan.
 * Usage: cd contracts && npx hardhat run scripts/verify-tournament-escrow-v3.js --network pulsechain
 * Optional: TOURNAMENT_PRIZE_ESCROW_V3_ADDRESS=0x... (default from deploy output)
 */
import hre from "hardhat";

const DEFAULT_ADDRESS = "0xa114a8974D4478b09FE9d2E2bf1BdCF28dE5bd25";

async function main() {
  const address = process.env.TOURNAMENT_PRIZE_ESCROW_V3_ADDRESS || DEFAULT_ADDRESS;
  console.log("Verifying TournamentPrizeEscrowV3 at", address, "\n");

  // Read constructor arg from deployed contract
  const escrow = await hre.ethers.getContractAt("TournamentPrizeEscrowV3", address);
  const authorizedServer = await escrow.authorizedServer();

  console.log("Constructor arg: authorizedServer =", authorizedServer);

  const constructorArgs = [authorizedServer];

  console.log("\nAttempting verification...");
  try {
    await hre.run("verify:verify", {
      network: hre.network.name,
      address,
      constructorArguments: constructorArgs,
      contract: "contracts/TournamentPrizeEscrowV3.sol:TournamentPrizeEscrowV3",
    });
    console.log("\n✅ Verified:", address);
  } catch (err) {
    if (err.message?.includes("Already Verified")) {
      console.log("\n✅ Contract is already verified.");
      return;
    }
    console.error("\nVerification failed:", err.message);
    console.log("\nManual verify command:");
    console.log(`  npx hardhat verify --network pulsechain ${address} "${authorizedServer}"`);
    console.log("\nIf bytecode doesn't match, try:");
    console.log("  1. npx hardhat clean && npx hardhat compile");
    console.log("  2. Re-run this script");
    console.log("  3. Or temporarily set viaIR: false in hardhat.config.cjs, compile, then verify");
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
