import hre from "hardhat";

async function main() {
  const CONTRACT_ADDRESS = "0x69771cE8C2eC5a78Cf87b0a21ad801E74a3EED09";
  const FEE_BPS = 200; // 2%
  const FEE_RECIPIENT = "0x2775dD8242C4f589536113475B7C80F42ab4A70A";

  // Use BACKUP_PRIVATE_KEY (owner wallet) instead of default deployer
  const ownerKey = process.env.BACKUP_PRIVATE_KEY;
  if (!ownerKey) throw new Error("BACKUP_PRIVATE_KEY not set in .env");
  const owner = new hre.ethers.Wallet(ownerKey, hre.ethers.provider);
  console.log("Caller (owner):", owner.address);

  const artifact = await hre.artifacts.readArtifact("BlackjackV2");
  const blackjack = new hre.ethers.Contract(CONTRACT_ADDRESS, artifact.abi, owner);

  console.log("\nSetting bet fee to 2% (200 bps)...");
  const tx1 = await blackjack.setBetFee(FEE_BPS, { gasLimit: 100000 });
  await tx1.wait();
  console.log("✅ setBetFee tx:", tx1.hash);

  console.log(`\nSetting fee recipient to ${FEE_RECIPIENT}...`);
  const tx2 = await blackjack.setFeeRecipient(FEE_RECIPIENT, { gasLimit: 100000 });
  await tx2.wait();
  console.log("✅ setFeeRecipient tx:", tx2.hash);

  // Verify
  const feeBps = await blackjack.betFeeBps();
  const recipient = await blackjack.feeRecipient();
  console.log("\nVerification:");
  console.log("  betFeeBps:", feeBps.toString(), `(${Number(feeBps) / 100}%)`);
  console.log("  feeRecipient:", recipient);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
