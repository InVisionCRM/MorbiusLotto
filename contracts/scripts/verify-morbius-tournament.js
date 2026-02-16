/**
 * Verify MorbiusTournament on PulseScan.
 * Usage: cd contracts && npx hardhat run scripts/verify-morbius-tournament.js --network pulsechain
 * Optional: MORBIUS_TOURNAMENT_ADDRESS=0x... (default from deploy output)
 */
import hre from "hardhat";

const DEFAULT_ADDRESS = "0x1F30Aa16B4Da0124308E33b8650C351BBCA70704";

async function main() {
  const address = process.env.MORBIUS_TOURNAMENT_ADDRESS || DEFAULT_ADDRESS;
  console.log("Verifying MorbiusTournament at", address, "\n");

  // Read constructor args from deployed contract
  const tournament = await hre.ethers.getContractAt("MorbiusTournament", address);
  const [morbiusToken, authorizedServer, platformFeeWallet] = await Promise.all([
    tournament.MORBIUS_TOKEN(),
    tournament.authorizedServer(),
    tournament.platformFeeWallet(),
  ]);

  console.log("Constructor args:");
  console.log("  morbiusToken:", morbiusToken);
  console.log("  authorizedServer:", authorizedServer);
  console.log("  platformFeeWallet:", platformFeeWallet);

  const constructorArgs = [morbiusToken, authorizedServer, platformFeeWallet];

  console.log("\nAttempting verification...");
  try {
    await hre.run("verify:verify", {
      network: hre.network.name,
      address,
      constructorArguments: constructorArgs,
      contract: "contracts/MorbiusTournament.sol:MorbiusTournament",
    });
    console.log("\n✅ Verified:", address);
  } catch (err) {
    if (err.message?.includes("Already Verified")) {
      console.log("\n✅ Contract is already verified.");
      return;
    }
    console.error("\nVerification failed:", err.message);
    console.log("\nManual verify command:");
    console.log(`  npx hardhat verify --network pulsechain ${address} "${morbiusToken}" "${authorizedServer}" "${platformFeeWallet}"`);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
