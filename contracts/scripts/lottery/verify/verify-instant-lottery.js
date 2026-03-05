/**
 * Verify InstantLottery6of55 on PulseScan.
 * Reads constructor args from the deployed contract, then runs Hardhat verify.
 *
 * Usage: cd contracts && npx hardhat run scripts/lottery/verify/verify-instant-lottery.js --network pulsechain
 * Optional: INSTANT_LOTTERY_INSTANT_ADDRESS=0x... (default from lib/contracts.ts)
 */
const hre = require("hardhat");

const DEFAULT_ADDRESS = "0x884843787be5c0387F38722d9e4F2ab1E93c25D8";

async function main() {
  const address = process.env.INSTANT_LOTTERY_INSTANT_ADDRESS || DEFAULT_ADDRESS;
  console.log("Verifying InstantLottery6of55 at", address, "\n");

  const lottery = await hre.ethers.getContractAt("InstantLottery6of55", address);

  const [
    morbiusToken,
    wplsToken,
    pulseXRouter,
    minWager,
    maxWager,
    plsTreasury,
    distributionRecipient,
    burnAddress,
    platformFeeRecipient,
    lpDistributionRecipient,
  ] = await Promise.all([
    lottery.MORBIUS_TOKEN(),
    lottery.WPLS_TOKEN(),
    lottery.pulseXRouter(),
    lottery.minWager(),
    lottery.maxWager(),
    lottery.plsTreasury(),
    lottery.distributionRecipient(),
    lottery.burnAddress(),
    lottery.platformFeeRecipient(),
    lottery.lpDistributionRecipient(),
  ]);

  // Resolve addresses (immutables may be returned as Contract in ethers)
  const addr = (v) => (typeof v === "string" ? v : v?.target ?? v?.address ?? String(v));

  const constructorArgs = [
    addr(morbiusToken),
    addr(wplsToken),
    addr(pulseXRouter),
    minWager,
    maxWager,
    plsTreasury,
    distributionRecipient,
    burnAddress,
    platformFeeRecipient,
    lpDistributionRecipient,
  ];

  console.log("Constructor args:");
  constructorArgs.forEach((a, i) => console.log("  [" + i + "]:", typeof a === "bigint" ? a.toString() : a));

  const contractFQN = "contracts/InstantLottery6of55.sol:InstantLottery6of55";

  console.log("\nAttempting verification (PulseScan then Sourcify)...");
  try {
    await hre.run("verify:verify", {
      network: hre.network.name,
      address,
      constructorArguments: constructorArgs,
      contract: contractFQN,
    });
    console.log("\n✅ Verified:", address);
    return;
  } catch (err) {
    if (err.message?.includes("Already Verified")) {
      console.log("\n✅ Contract is already verified.");
      return;
    }
    console.error("\nPulseScan verification failed:", err.message);
    // PulseScan (Blockscout) cannot verify contracts compiled with via_ir (see README-Verification.md)
    console.log("\nNote: PulseScan (Blockscout) does not support contracts built with via_ir.");
    console.log("This repo compiles with viaIR: true, so PulseScan often reports bytecode mismatch.");
    console.log("Trying Sourcify (repo.sourcify.dev) ...");
    try {
      await hre.run("verify:sourcify", {
        address,
        contract: contractFQN,
      });
      console.log("\n✅ Verified on Sourcify:", address);
      return;
    } catch (sourcifyErr) {
      console.error("Sourcify verification failed:", sourcifyErr.message);
    }
    console.log("\nManual PulseScan verify command (if explorer adds via_ir support):");
    const args = constructorArgs.map((a) => (typeof a === "bigint" ? a.toString() : `"${a}"`)).join(" ");
    console.log(`  npx hardhat verify --network pulsechain ${address} ${args}`);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
