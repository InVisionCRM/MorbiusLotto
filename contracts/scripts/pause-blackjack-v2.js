/**
 * Pause BlackjackV2 (OpenZeppelin Pausable). Only the contract owner can call pause().
 *
 * Usage (from contracts folder):
 *   npx hardhat run scripts/pause-blackjack-v2.js --network pulsechain
 *
 * Optional: set BLACKJACK_V2_ADDRESS in .env to override default.
 * Requires: BACKUP_PRIVATE_KEY (BlackjackV2 owner).
 */

import hre from "hardhat";

const DEFAULT_BLACKJACK_V2 = "0x1b38626A12085547C35bD80455d054950AD72Cde";

async function main() {
  const contractAddress = (process.env.BLACKJACK_V2_ADDRESS || DEFAULT_BLACKJACK_V2).trim();
  const ownerKey = process.env.BACKUP_PRIVATE_KEY;
  if (!ownerKey) throw new Error("BACKUP_PRIVATE_KEY not set in .env");

  const owner = new hre.ethers.Wallet(ownerKey, hre.ethers.provider);
  console.log("Caller (owner):", owner.address);
  console.log("Contract:       ", contractAddress);

  const artifact = await hre.artifacts.readArtifact("BlackjackV2");
  const blackjack = new hre.ethers.Contract(contractAddress, artifact.abi, owner);

  const paused = await blackjack.paused();
  if (paused) {
    console.log("Contract is already paused. No action needed.");
    return;
  }

  console.log("Calling pause()...");
  const tx = await blackjack.pause({ gasLimit: 100000 });
  console.log("Tx submitted:", tx.hash);
  await tx.wait();
  console.log("Done — BlackjackV2 is paused.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
