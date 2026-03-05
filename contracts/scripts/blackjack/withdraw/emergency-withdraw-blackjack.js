/**
 * Pull non-reserve MORBIUS from an old Blackjack contract.
 *
 * Requirements:
 * - You must be owner or emergencyAdmin of the contract.
 * - Contract will be emergency-paused (setEmergencyPause(true)) before withdraw.
 * - Withdrawn tokens are sent to the emergencyAdmin address.
 *
 * Usage (from contracts folder; .env must have PRIVATE_KEY = owner or emergencyAdmin key):
 *   BLACKJACK_LEGACY_ADDRESS=0x... npx hardhat run scripts/emergency-withdraw-blackjack.js --network pulsechain
 *
 * Or set BLACKJACK_LEGACY_ADDRESS in contracts/.env and run:
 *   npx hardhat run scripts/emergency-withdraw-blackjack.js --network pulsechain
 *
 * Optional: DRY_RUN=1 to only show withdrawable amount and exit without sending tx.
 * Optional: BACKUP_PRIVATE_KEY=0x... to use a different key (e.g. owner/admin) instead of PRIVATE_KEY.
 */

import hre from "hardhat";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function symbol() view returns (string)",
];

async function main() {
  const contractAddress = process.env.BLACKJACK_LEGACY_ADDRESS || null;

  if (!contractAddress || !contractAddress.startsWith("0x")) {
    console.error("Set BLACKJACK_LEGACY_ADDRESS in .env to the old Blackjack contract address.");
    console.error(
      "Example: BLACKJACK_LEGACY_ADDRESS=0x32435e633EB691f7039EB73107FD15EF13125703 npx hardhat run scripts/emergency-withdraw-blackjack.js --network pulsechain"
    );
    process.exit(1);
  }

  let signer;
  if (process.env.BACKUP_PRIVATE_KEY) {
    const provider = hre.ethers.provider;
    signer = new hre.ethers.Wallet(process.env.BACKUP_PRIVATE_KEY.trim(), provider);
    console.log("Using signer from BACKUP_PRIVATE_KEY");
  } else {
    [signer] = await hre.ethers.getSigners();
  }
  console.log("Signer (must be owner or emergencyAdmin):", signer.address);
  console.log("Contract:", contractAddress);

  const blackjack = await hre.ethers.getContractAt("BlackjackV2", contractAddress);

  const owner = await blackjack.owner();
  const emergencyAdmin = await blackjack.emergencyAdmin();
  const isAuthorized =
    signer.address.toLowerCase() === owner.toLowerCase() ||
    signer.address.toLowerCase() === emergencyAdmin.toLowerCase();
  if (!isAuthorized) {
    console.error("Signer is not owner or emergencyAdmin of this contract. Aborting.");
    process.exit(1);
  }

  const morbiusTokenAddress = await blackjack.MORBIUS_TOKEN();
  const morbius = new hre.ethers.Contract(morbiusTokenAddress, ERC20_ABI, signer);
  const contractBalance = await morbius.balanceOf(contractAddress);
  const totalReserves = await blackjack.totalReserves();
  const withdrawable =
    contractBalance >= totalReserves ? contractBalance - totalReserves : 0n;

  console.log("\n--- Contract state ---");
  console.log("MORBIUS contract balance:", hre.ethers.formatEther(contractBalance));
  console.log("totalReserves (player reserves):", hre.ethers.formatEther(totalReserves));
  console.log("Withdrawable (non-reserve):", hre.ethers.formatEther(withdrawable));
  console.log("Recipient (emergencyAdmin):", emergencyAdmin);

  if (withdrawable === 0n) {
    console.log("\nNothing to withdraw. Exiting.");
    return;
  }

  if (process.env.DRY_RUN === "1") {
    console.log("\nDRY_RUN=1: not sending transactions. Remove DRY_RUN to execute.");
    return;
  }

  const emergencyPaused = await blackjack.emergencyPaused();
  if (!emergencyPaused) {
    console.log("\nSetting emergency pause...");
    const txPause = await blackjack.setEmergencyPause(true);
    await txPause.wait();
    console.log("  Tx:", txPause.hash);
  }

  console.log("\nCalling emergencyWithdraw(", withdrawable.toString(), ")...");
  const tx = await blackjack.emergencyWithdraw(withdrawable);
  await tx.wait();
  console.log("  Tx:", tx.hash);
  console.log("\nDone. Non-reserve MORBIUS sent to emergencyAdmin:", emergencyAdmin);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
