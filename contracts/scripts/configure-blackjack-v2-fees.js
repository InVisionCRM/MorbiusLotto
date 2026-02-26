import hre from "hardhat";

const DISTRIBUTION_RECIPIENT = process.env.MERKLE_CLAIM_MORBIUS_ADDRESS || "0x3807f417617E53d4c5C7D7A825a5ce4D105A75d2";

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
  const distBps = process.env.BLACKJACK_DISTRIBUTION_FEE_BPS || "250";
  console.log("\nSetting distribution fee to", distBps, "bps (max 2000)...");
  let tx = await blackjack.setDistributionFee(Number(distBps), { gasLimit: 100000 });
  await tx.wait();
  console.log("✅ setDistributionFee tx:", tx.hash);

  console.log("Setting distribution recipient to", DISTRIBUTION_RECIPIENT, "...");
  tx = await blackjack.setDistributionRecipient(DISTRIBUTION_RECIPIENT, { gasLimit: 100000 });
  await tx.wait();
  console.log("✅ setDistributionRecipient tx:", tx.hash);

  // Platform fee (0–2000 bps), recipient
  const platformBps = process.env.BLACKJACK_PLATFORM_FEE_BPS || "250";
  const platformRecipient = process.env.PLATFORM_FEE_WALLET || owner.address;
  console.log("\nSetting platform fee to", platformBps, "bps (max 2000)...");
  tx = await blackjack.setPlatformFee(Number(platformBps), { gasLimit: 100000 });
  await tx.wait();
  console.log("✅ setPlatformFee tx:", tx.hash);

  console.log("Setting platform fee recipient to", platformRecipient, "...");
  tx = await blackjack.setPlatformFeeRecipient(platformRecipient, { gasLimit: 100000 });
  await tx.wait();
  console.log("✅ setPlatformFeeRecipient tx:", tx.hash);

  // PLS deposit fee (0–2000 bps), recipient
  const plsDepositBps = process.env.BLACKJACK_PLS_DEPOSIT_FEE_BPS || "150";
  const plsDepositRecipient = process.env.PLATFORM_FEE_WALLET || owner.address;
  console.log("\nSetting PLS deposit fee to", plsDepositBps, "bps (max 2000)...");
  tx = await blackjack.setPlsDepositFee(Number(plsDepositBps), { gasLimit: 100000 });
  await tx.wait();
  console.log("✅ setPlsDepositFee tx:", tx.hash);

  console.log("Setting PLS deposit fee recipient to", plsDepositRecipient, "...");
  tx = await blackjack.setPlsDepositFeeRecipient(plsDepositRecipient, { gasLimit: 100000 });
  await tx.wait();
  console.log("✅ setPlsDepositFeeRecipient tx:", tx.hash);

  console.log("\nVerification:");
  console.log("  distributionFeeBps:", (await blackjack.distributionFeeBps()).toString());
  console.log("  distributionRecipient:", await blackjack.distributionRecipient());
  console.log("  platformFeeBps:", (await blackjack.platformFeeBps()).toString());
  console.log("  platformFeeRecipient:", await blackjack.platformFeeRecipient());
  console.log("  plsDepositFeeBps:", (await blackjack.plsDepositFeeBps()).toString());
  console.log("  plsDepositFeeRecipient:", await blackjack.plsDepositFeeRecipient());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
