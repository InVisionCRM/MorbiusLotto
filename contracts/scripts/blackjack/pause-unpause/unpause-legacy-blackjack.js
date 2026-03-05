/**
 * Unpause the legacy Blackjack contract so players can call withdraw() again.
 * Only emergencyAdmin can call setEmergencyPause(false).
 *
 * If you ran emergency-withdraw-blackjack.js, the contract was left paused;
 * run this to re-enable player withdrawals.
 *
 * Usage (from contracts folder):
 *   npx hardhat run scripts/unpause-legacy-blackjack.js --network pulsechain
 *
 * Set BLACKJACK_LEGACY_ADDRESS in .env. Uses PRIVATE_KEY or BACKUP_PRIVATE_KEY (must be emergencyAdmin).
 */

import hre from "hardhat";

async function main() {
  const contractAddress = process.env.BLACKJACK_LEGACY_ADDRESS || null;
  if (!contractAddress || !contractAddress.startsWith("0x")) {
    console.error("Set BLACKJACK_LEGACY_ADDRESS in .env to the legacy Blackjack contract.");
    process.exit(1);
  }

  let signer;
  if (process.env.BACKUP_PRIVATE_KEY) {
    signer = new hre.ethers.Wallet(process.env.BACKUP_PRIVATE_KEY.trim(), hre.ethers.provider);
  } else {
    const [s] = await hre.ethers.getSigners();
    signer = s;
  }

  const blackjack = await hre.ethers.getContractAt("Blackjack", contractAddress, signer);
  const paused = await blackjack.emergencyPaused();
  if (!paused) {
    console.log("Contract is already unpaused. No action needed.");
    return;
  }
  console.log("Contract is paused. Calling setEmergencyPause(false)...");
  const tx = await blackjack.setEmergencyPause(false);
  await tx.wait();
  console.log("Tx:", tx.hash);
  console.log("Done. Players can withdraw from the legacy contract again.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
