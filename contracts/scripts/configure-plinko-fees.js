import hre from "hardhat";

const DISTRIBUTION_RECIPIENT = process.env.MERKLE_CLAIM_MORBIUS_ADDRESS || "0x3807f417617E53d4c5C7D7A825a5ce4D105A75d2";

async function main() {
  const CONTRACT_ADDRESS = process.env.PLINKO_ADDRESS || "0xa6585d334bb737d64eCE7abCA5acC087dd46E99e";

  // Use default hardhat signer (matches hardhat.config.cjs accounts)
  const [owner] = await hre.ethers.getSigners();
  console.log("Caller (owner):", owner.address);
  console.log("Contract:", CONTRACT_ADDRESS);

  const artifact = await hre.artifacts.readArtifact("Plinko");
  const plinko = new hre.ethers.Contract(CONTRACT_ADDRESS, artifact.abi, owner);

  // Distribution fee (0–2000 bps = 0–20%), recipient
  const distBps = process.env.PLINKO_DISTRIBUTION_FEE_BPS || "250";
  console.log("\nSetting distribution fee to", distBps, "bps (max 2000)...");
  let tx = await plinko.setDistributionFee(Number(distBps), { gasLimit: 100000 });
  await tx.wait();
  console.log("✅ setDistributionFee tx:", tx.hash);

  console.log("Setting distribution recipient to", DISTRIBUTION_RECIPIENT, "...");
  tx = await plinko.setDistributionRecipient(DISTRIBUTION_RECIPIENT, { gasLimit: 100000 });
  await tx.wait();
  console.log("✅ setDistributionRecipient tx:", tx.hash);

  console.log("\nVerification:");
  console.log("  distributionFeeBps:", (await plinko.distributionFeeBps()).toString());
  console.log("  distributionRecipient:", await plinko.distributionRecipient());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
