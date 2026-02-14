/**
 * Read constructor args from a deployed Blackjack (V1) contract and verify on PulseScan.
 * Usage: npx hardhat run scripts/verify-legacy-blackjack.js --network pulsechain
 * Optional: LEGACY_ADDRESS=0x... (default 0xDe2c7a18de8a9d889E18874EA90A42f84FbaA080)
 */
import hre from "hardhat";

const DEFAULT_ADDRESS = "0xDe2c7a18de8a9d889E18874EA90A42f84FbaA080";

async function main() {
  const address = process.env.LEGACY_ADDRESS || DEFAULT_ADDRESS;
  console.log("Reading constructor args from", address, "\n");

  const blackjack = await hre.ethers.getContractAt("Blackjack", address);
  const [owner, morbiusToken, wplsToken, pulseXRouter, authorizedServer, emergencyAdmin] = await Promise.all([
    blackjack.owner(),
    blackjack.MORBIUS_TOKEN(),
    blackjack.WPLS_TOKEN(),
    blackjack.pulseXRouter(),
    blackjack.authorizedServer(),
    blackjack.emergencyAdmin(),
  ]);

  console.log("Constructor args:");
  console.log("  owner:", owner);
  console.log("  morbiusToken:", morbiusToken);
  console.log("  wplsToken:", wplsToken);
  console.log("  pulseXRouter:", pulseXRouter);
  console.log("  authorizedServer:", authorizedServer);
  console.log("  emergencyAdmin:", emergencyAdmin);

  const args = [owner, morbiusToken, wplsToken, pulseXRouter, authorizedServer, emergencyAdmin];
  const argsStr = args.map((a) => `"${a}"`).join(" ");

  console.log("\nManual verify (if script fails due to bytecode mismatch):");
  console.log(`  npx hardhat verify --network pulsechain ${address} ${argsStr}\n`);
  console.log("If bytecode doesn't match, the contract may have been built with different compiler settings (e.g. without viaIR). Try compiling with viaIR: false in hardhat.config then verify.\n");

  console.log("Running Hardhat verify...");
  await hre.run("verify:verify", {
    network: hre.network.name,
    address,
    constructorArguments: args,
    contract: "contracts/Blackjack.sol:Blackjack",
  });
  console.log("\n✅ Verified:", address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
