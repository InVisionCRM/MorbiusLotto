import hre from "hardhat";

const DISTRIBUTION_RECIPIENT = "0x011eE5F4658c5183FB9f8cd72e264ca5DBd404ab";
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

async function main() {
  const CONTRACT_ADDRESS = process.env.BLACKJACK_ADDRESS || "0xFCE49ab8b53366C397A0205c4c0CF42aE2B658A8";

  const ownerKey = process.env.BACKUP_PRIVATE_KEY;
  if (!ownerKey) throw new Error("BACKUP_PRIVATE_KEY not set in .env");
  const owner = new hre.ethers.Wallet(ownerKey, hre.ethers.provider);
  console.log("Caller (owner):", owner.address);
  console.log("Contract:", CONTRACT_ADDRESS);

  const artifact = await hre.artifacts.readArtifact("BlackjackV2");
  const blackjack = new hre.ethers.Contract(CONTRACT_ADDRESS, artifact.abi, owner);

  // Distribution fee (0–2000 bps = 0–20%), recipient
  const distBps = process.env.BLACKJACK_DISTRIBUTION_FEE_BPS || "100";
  console.log("\nSetting distribution fee to", distBps, "bps (max 2000)...");
  let tx = await blackjack.setDistributionFee(Number(distBps), { gasLimit: 100000 });
  await tx.wait();
  console.log("✅ setDistributionFee tx:", tx.hash);

  console.log("Setting distribution recipient to", DISTRIBUTION_RECIPIENT, "...");
  tx = await blackjack.setDistributionRecipient(DISTRIBUTION_RECIPIENT, { gasLimit: 100000 });
  await tx.wait();
  console.log("✅ setDistributionRecipient tx:", tx.hash);

  // Burn fee (0–2000 bps), burn address
  const burnBps = process.env.BLACKJACK_BURN_FEE_BPS || "100";
  console.log("\nSetting burn fee to", burnBps, "bps (max 2000)...");
  tx = await blackjack.setBurnFee(Number(burnBps), { gasLimit: 100000 });
  await tx.wait();
  console.log("✅ setBurnFee tx:", tx.hash);

  console.log("Setting burn address to", BURN_ADDRESS, "...");
  tx = await blackjack.setBurnAddress(BURN_ADDRESS, { gasLimit: 100000 });
  await tx.wait();
  console.log("✅ setBurnAddress tx:", tx.hash);

  console.log("\nVerification:");
  console.log("  distributionFeeBps:", (await blackjack.distributionFeeBps()).toString());
  console.log("  distributionRecipient:", await blackjack.distributionRecipient());
  console.log("  burnFeeBps:", (await blackjack.burnFeeBps()).toString());
  console.log("  burnAddress:", await blackjack.burnAddress());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
