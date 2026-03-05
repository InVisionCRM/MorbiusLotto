/**
 * Verify CryptoKeno on PulseScan.
 * Reads constructor args from the deployed contract, then runs Hardhat verify.
 *
 * Usage: cd contracts && npx hardhat run scripts/keno/verify/verify-keno.js --network pulsechain
 * Optional: KENO_ADDRESS=0x... (default from lib/contracts.ts)
 */
const hre = require("hardhat");

const DEFAULT_ADDRESS = "0xC6E0F71199A7713f5618773627a8478D02444922";

async function main() {
  const address = process.env.KENO_ADDRESS || DEFAULT_ADDRESS;
  console.log("Verifying CryptoKeno at", address, "\n");

  const keno = await hre.ethers.getContractAt("CryptoKeno", address);

  const [
    token,
    maxSpot,
    wrappedPulse,
    pulseXRouter,
    plsTreasury,
    distributionRecipient,
    burnAddress,
    platformFeeRecipient,
    lpDistributionRecipient,
  ] = await Promise.all([
    keno.token(),
    keno.maxSpot(),
    keno.wrappedPulse(),
    keno.pulseXRouter(),
    keno.plsTreasury(),
    keno.distributionRecipient(),
    keno.burnAddress(),
    keno.platformFeeRecipient(),
    keno.lpDistributionRecipient(),
  ]);

  const addr = (v) => (typeof v === "string" ? v : v?.target ?? v?.address ?? String(v));

  const constructorArgs = [
    addr(token),
    Number(maxSpot),
    addr(wrappedPulse),
    addr(pulseXRouter),
    plsTreasury,
    distributionRecipient,
    burnAddress,
    platformFeeRecipient,
    lpDistributionRecipient,
  ];

  console.log("Constructor args:");
  constructorArgs.forEach((a, i) => console.log("  [" + i + "]:", a));

  const contractFQN = "contracts/CryptoKeno.sol:CryptoKeno";

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
    const args = constructorArgs.map((a) => (typeof a === "number" ? a : `"${a}"`)).join(" ");
    console.log(`  npx hardhat verify --network pulsechain ${address} ${args}`);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
